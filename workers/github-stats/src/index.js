/**
 * WebGIS-Dev GitHub 开源数据边缘 API（Cloudflare Worker）
 *
 * 为什么需要它：
 * - api.github.com / raw.githubusercontent.com 在国内直连不稳定，且匿名限流 60 次/小时/IP；
 * - Worker 跑在 Cloudflare 边缘，境外抓 GitHub 极稳，结果再缓存 10 分钟，
 *   前端只跟自己的 Worker 通信（workers.dev 或自有域名，国内连通性好得多）。
 *
 * 路由（均为 GET，公开只读）：
 *   /api/stats  → { stars, forks, updatedAt, version, repo, fetchedAt }（JSON，边缘缓存 10 分钟）
 *   /api/chart  → star-history 趋势图 SVG 代理（边缘缓存 6 小时，每日更新足够）
 *   /api/snake /api/snake-dark → GitHub 贡献贪吃蛇动画 SVG 代理（供 NEGIAO.github.io 首页，
 *     上游由 Platane/snk 每日重新生成，边缘缓存 6 小时）
 *
 * 部署（本目录执行，需要一个 Cloudflare 账号，免费计划即可）：
 *   npx wrangler login
 *   npx wrangler deploy
 *   # 可选（推荐）：GitHub API 限额 60/h → 5000/h
 *   npx wrangler secret put GITHUB_TOKEN
 *   # 可选：轮换 star-history 授权（默认内置 README 里已公开的那个，不设也能用）
 *   npx wrangler secret put STAR_HISTORY_SEALED_TOKEN
 * 部署成功后，把输出的 https://xxx.workers.dev 填到 deploy/.env 的
 * VITE_GITHUB_STATS_WORKER_URL，重建前端即可（push main 自动部署）。
 */

const REPO = 'NEGIAO/WebGIS-Dev';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}`;
const README_RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/README.md`;
// README 唯一版本源：三档解析与前端 LandingView.parseVersionFromReadme 保持一致。
const STATS_CACHE_TTL = 600; // 秒：Stars / Forks / 版本号边缘缓存
const CHART_CACHE_TTL = 6 * 3600; // 秒：趋势图边缘缓存（每日更新足够）
const SNAKE_CACHE_TTL = 6 * 3600; // 秒：贪吃蛇动画边缘缓存（上游每日重新生成）
// 贪吃蛇贡献动画固定上游（NEGIAO 主页画像仓 output 分支）：固定地址，非开放代理
const SNAKE_BASE_URL = 'https://raw.githubusercontent.com/NEGIAO/NEGIAO/output';
// 已在 README 公开的 sealed_token：内置仅为开箱即用，安全等级与公开无异；
// 如需轮换，用 wrangler secret put STAR_HISTORY_SEALED_TOKEN 覆盖，无需改代码。
const DEFAULT_SEALED_TOKEN =
    'B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8';

// 边缘缓存统一 key（fetch / scheduled 共用，保证定时暖缓存能被用户请求命中）
const statsCacheKey = () => new Request('https://webgis-stats.internal/api/stats');
const chartCacheKey = () => new Request('https://webgis-stats.internal/api/chart');
const snakeCacheKey = (variant) => new Request(`https://webgis-stats.internal/api/${variant}`);

function parseVersionFromReadme(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';
    const declared = markdown.match(/当前版本\s*[Vv]?(\d+\.\d+(?:\.\d+)?)/);
    if (declared) return `V${declared[1]}`;
    // 版本演进表按最新在前排序，取首行（避免误命中正文里的历史版本号，如 Docker 镜像旧版本）
    const tableRow = markdown.match(/\|\s*\*\*V(\d+\.\d+\.\d+)\*\*\s*\|/);
    if (tableRow) return `V${tableRow[1]}`;
    const footer = markdown.match(/<sub>V(\d+\.\d+\.\d+)/);
    if (footer) return `V${footer[1]}`;
    return '';
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...corsHeaders(),
            ...extraHeaders,
        },
    });
}

async function fetchUpstream(url, { token, accept } = {}) {
    const headers = {
        'User-Agent': 'WebGIS-Dev-stats-worker/1.0',
        Accept: accept || 'application/vnd.github+json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`upstream ${url} -> HTTP ${res.status}`);
    return res;
}

async function buildStats(env) {
    const [repoRes, readmeRes] = await Promise.all([
        fetchUpstream(GITHUB_API_URL, { token: env.GITHUB_TOKEN }),
        fetchUpstream(README_RAW_URL, { accept: 'text/plain' }),
    ]);
    const repo = await repoRes.json();
    return {
        stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,
        forks: typeof repo.forks_count === 'number' ? repo.forks_count : null,
        updatedAt: repo.pushed_at || repo.updated_at || '',
        version: parseVersionFromReadme(await readmeRes.text()),
        repo: REPO,
        fetchedAt: new Date().toISOString(),
    };
}

async function cachedResponse(cacheKey, cacheStatus) {
    try {
        const cached = await caches.default.match(cacheKey);
        if (!cached) return null;
        const hit = new Response(cached.body, cached);
        hit.headers.set('X-Cache-Status', cacheStatus);
        return hit;
    } catch {
        return null; // 缓存不可用时降级为直接回源，绝不因此 500
    }
}

function putCache(cacheKey, response, ctx) {
    try {
        ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch(() => {}));
    } catch {
        /* 无 ctx（如极端环境）则跳过缓存 */
    }
}

async function handleStats(_request, env, ctx) {
    const key = statsCacheKey();
    const hit = await cachedResponse(key, 'HIT');
    if (hit) return hit;
    try {
        const stats = await buildStats(env);
        const res = jsonResponse(stats, 200, {
            'Cache-Control': `public, max-age=${STATS_CACHE_TTL}`,
            'X-Cache-Status': 'MISS',
        });
        putCache(key, res, ctx);
        return res;
    } catch (error) {
        return jsonResponse(
            { error: 'upstream unavailable', detail: String((error && error.message) || error) },
            502,
            { 'Cache-Control': 'no-store', 'X-Cache-Status': 'ERROR' },
        );
    }
}

async function handleChart(_request, env, ctx) {
    const sealedToken = env.STAR_HISTORY_SEALED_TOKEN || DEFAULT_SEALED_TOKEN;
    const chartUrl =
        `https://api.star-history.com/chart?repos=${REPO}` +
        `&type=timeline&legend=top-left&sealed_token=${sealedToken}`;
    return fetchImageCached(chartCacheKey(), chartUrl, CHART_CACHE_TTL, 'chart', ctx);
}

async function handleSnake(variant, _request, _env, ctx) {
    const upstreamUrl =
        variant === 'snake-dark' ? `${SNAKE_BASE_URL}/snake-dark.svg` : `${SNAKE_BASE_URL}/snake.svg`;
    return fetchImageCached(snakeCacheKey(variant), upstreamUrl, SNAKE_CACHE_TTL, 'snake', ctx);
}

// 通用图片代理（固定上游 + 边缘缓存）：chart / snake 共用
async function fetchImageCached(cacheKey, upstreamUrl, ttlSeconds, label, ctx) {
    const hit = await cachedResponse(cacheKey, 'HIT');
    if (hit) return hit;
    try {
        const upstream = await fetch(upstreamUrl, {
            headers: { 'User-Agent': 'WebGIS-Dev-stats-worker/1.0' },
        });
        if (!upstream.ok) throw new Error(`${label} upstream -> HTTP ${upstream.status}`);
        const res = new Response(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': upstream.headers.get('Content-Type') || 'image/svg+xml',
                'Cache-Control': `public, max-age=${ttlSeconds}`,
                ...corsHeaders(),
                'X-Cache-Status': 'MISS',
            },
        });
        putCache(cacheKey, res, ctx);
        return res;
    } catch (error) {
        return jsonResponse(
            { error: `${label} upstream unavailable`, detail: String((error && error.message) || error) },
            502,
            { 'Cache-Control': 'no-store', 'X-Cache-Status': 'ERROR' },
        );
    }
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders() });
        }
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/api/stats') {
            return handleStats(request, env, ctx);
        }
        if (request.method === 'GET' && (url.pathname === '/api/chart' || url.pathname === '/chart')) {
            return handleChart(request, env, ctx);
        }
        if (request.method === 'GET' && (url.pathname === '/api/snake' || url.pathname === '/api/snake-dark')) {
            return handleSnake(url.pathname.slice(5), request, env, ctx); // 'snake' / 'snake-dark'
        }
        return jsonResponse(
            { error: 'Not found', usage: ['GET /api/stats', 'GET /api/chart', 'GET /api/snake', 'GET /api/snake-dark'] },
            404,
            { 'Cache-Control': 'no-store' },
        );
    },

    // 定时暖缓存（wrangler.toml crons）：保证用户永远命中热缓存，面试展示零等待
    async scheduled(_event, env, ctx) {
        ctx.waitUntil(
            (async () => {
                try {
                    const stats = await buildStats(env);
                    await caches.default.put(
                        statsCacheKey(),
                        jsonResponse(stats, 200, {
                            'Cache-Control': `public, max-age=${STATS_CACHE_TTL}`,
                            'X-Cache-Status': 'WARMED',
                        }),
                    );
                } catch (error) {
                    console.log(`scheduled warm failed: ${(error && error.message) || error}`);
                }
            })(),
        );
    },
};
