/**
 * 瓦片源工厂 — 请求生命周期管理
 *
 * 从 useTileSourceFactory.ts 拆分。
 * 负责瓦片请求优先级控制、错误标记、中断管理、后端代理兜底。
 *
 * 核心机制：
 * - 每个源绑定一个 AbortController，tileLoadFunction 通过 fetch() + signal 加载瓦片
 * - controller 每次加载时从 source 动态读取（避免闭包锁死旧 controller）
 * - abort() 会真正中断浏览器底层 TCP 连接（而非仅标记）
 * - epoch 在请求开始时写入 tile，异步回调完成后再对比 source 最新 epoch
 * - 外部瓦片直连失败时自动走后端 /proxy/{host+path} 代理（fallback 模式）
 * - 支持 VITE_TILE_PROXY_MODE=always 强制所有外部瓦片走代理
 * - 代理真正加载成功时才弹 toast（5s 防抖去重）
 * - prioritizeTileSourceRequest 幂等：重复包装只补齐 controller
 */

import { TILE_STATE_ERROR, TILE_REQUEST_TIMEOUT_MS } from './types';
import { useMessage } from '@common/shell/useMessage';
import { extractTileErrorDetail, notifyTileRateLimited } from '@common/utils/tileRateLimitNotify';
import {
    buildOsmMirrorUrl,
    isOsmBlockedTileBlob,
    isOsmTileUrl,
} from '@common/basemap/osmTileFallback';
import { TILE_PROXY_BASE_URL, TILE_PROXY_MODE, tileProxyUrl } from '@/config/publicRuntime';

// ==================== 代理通知（去重防抖） ====================

const LIFECYCLE_PRIORITY_MARK = 'tileLifecyclePriority';

let lastProxyNotifyAt = 0;
const PROXY_NOTIFY_DEBOUNCE_MS = 5000;

/**
 * 直连失败 → 后端代理兜底成功时弹出提示
 * 5s 防抖：快速切换底图时只弹一次，不打断用户操作
 */
function notifyProxyFallback(): void {
    const now = Date.now();
    if (now - lastProxyNotifyAt < PROXY_NOTIFY_DEBOUNCE_MS) return;
    lastProxyNotifyAt = now;
    try {
        const { info } = useMessage();
        info('部分瓦片直连失败，已自动切换至后端代理加速加载', { duration: 4000 });
    } catch {
        // 非 Vue 上下文（SSR/测试）静默
    }
}

/**
 * always 模式下首次请求成功时弹出提示
 */
function notifyAlwaysProxy(): void {
    const now = Date.now();
    if (now - lastProxyNotifyAt < PROXY_NOTIFY_DEBOUNCE_MS) return;
    lastProxyNotifyAt = now;
    try {
        const { info } = useMessage();
        info('已启用后端代理模式，所有瓦片请求将通过后端转发', { duration: 4000 });
    } catch {
        // 非 Vue 上下文（SSR/测试）静默
    }
}

// ==================== 层级上限学习（图源元数据不可信时的兜底） ====================

/** 该图源实际可服务的最高层级（学习结果，挂在 source 上） */
const MAX_SERVED_LEVEL_KEY = 'maxServedLevel';
/** 各层级「确定性缺瓦」计数（挂在 source 上） */
const LEVEL_MISS_COUNTER_KEY = 'levelMissCounter';

/**
 * 判定「该层级整层不可用」所需的累计缺瓦次数。
 *
 * 只认 400 / 410：这两者是服务端明确声明「该请求不合法/已消失」，
 * 例如 ArcGIS 对超出缓存层级的瓦片直接返回 400，可安全推断整层不存在。
 *
 * 刻意排除 404：稀疏数据集（如仅覆盖某省、某市的瓦片）在无数据区域会大量 404，
 * 若据此降级会把「该层存在但此处无数据」误判成「该层不存在」，造成错误限级。
 */
const LEVEL_MISS_THRESHOLD_BY_STATUS: Record<number, number> = {
    400: 1,
    410: 2,
};

/**
 * 属于「确定性缺瓦」的状态码：代理重试同样拿不到，不应触发兜底。
 * 404 虽不参与层级学习，但同样没有代理价值（代理只会再拿一次 404）。
 */
const DEFINITIVE_MISS_STATUS = new Set([400, 404, 410]);

let lastLevelCapNotifyAt = 0;
const LEVEL_CAP_NOTIFY_DEBOUNCE_MS = 8000;

/** 通知用户该图源已被自动限级（8s 防抖，避免每块瓦片都弹一次） */
function notifyLevelCap(maxLevel: number): void {
    const now = Date.now();
    if (now - lastLevelCapNotifyAt < LEVEL_CAP_NOTIFY_DEBOUNCE_MS) return;
    lastLevelCapNotifyAt = now;
    try {
        const { warning } = useMessage();
        warning(`该图源最高仅支持 ${maxLevel} 级，已停止请求更高层级瓦片，请缩小地图查看`, {
            duration: 5000,
        });
    } catch {
        // 非 Vue 上下文（SSR/测试）静默
    }
}

/** 读取已学习到的层级上限；未学习到返回 null */
function getLearnedMaxLevel(source: any): number | null {
    const raw = Number(source?.get?.(MAX_SERVED_LEVEL_KEY));
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

/**
 * 记录一次确定性缺瓦；命中阈值时下调该源的层级上限并提示用户。
 * 只认 400/404/410 —— 5xx 与网络错误属瞬时故障，不参与学习。
 */
function recordDefinitiveMiss(source: any, level: number, status: number): void {
    const threshold = LEVEL_MISS_THRESHOLD_BY_STATUS[status];
    if (!threshold || !Number.isFinite(level) || level <= 0) return;
    if (!source || typeof source.get !== 'function' || typeof source.set !== 'function') return;

    const counters = (source.get(LEVEL_MISS_COUNTER_KEY) as Map<number, number>) || new Map<number, number>();
    const next = (counters.get(level) || 0) + 1;
    counters.set(level, next);
    source.set(LEVEL_MISS_COUNTER_KEY, counters);

    if (next < threshold) return;

    const inferred = level - 1;
    const current = getLearnedMaxLevel(source);
    if (current !== null && inferred >= current) return;

    source.set(MAX_SERVED_LEVEL_KEY, inferred);
    notifyLevelCap(inferred);
}

// ==================== 内部工具函数 ====================

function markTileAsError(tile: any): void {
    if (tile && typeof tile.setState === 'function') {
        tile.setState(TILE_STATE_ERROR);
    }
}

function markAllSourceTilesAsError(source: any): void {
    if (!source || typeof source.getTileCache !== 'function') return;
    const cache = source.getTileCache();
    if (!cache) return;

    const keys: string[] = [];
    try {
        cache.forEach((_value: any, key: string) => {
            keys.push(key);
        });
    } catch {
        // 某些 OL 版本的 tileCache 不支持 forEach（如 ol <7 的 LRUCache）
    }

    for (const key of keys) {
        try {
            const tile = cache.get(key);
            markTileAsError(tile);
        } catch {
            // best-effort
        }
    }
}

function getSourceEpoch(source: any): number {
    if (source && typeof source.get === 'function') {
        return Number(source.get('abortEpoch') || 0);
    }
    return 0;
}

function getTileEpoch(tile: any): number {
    if (!tile) return 0;
    if (typeof tile.get === 'function') {
        return Number(tile.get('epoch') || 0);
    }
    return Number(tile.epoch || 0);
}

function stampTileEpoch(tile: any, epoch: number): void {
    if (!tile) return;
    if (typeof tile.set === 'function') {
        tile.set('epoch', epoch);
        return;
    }
    tile.epoch = epoch;
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function canProxyTileUrl(srcUrl: string): boolean {
    if (TILE_PROXY_MODE === 'off') return false;
    if (!isHttpUrl(srcUrl)) return false;

    try {
        const tileUrl = new URL(srcUrl);
        // TILE_PROXY_BASE_URL 可能为相对路径（同源部署）；解析失败时不按 origin 排除
        try {
            const backendUrl = new URL(TILE_PROXY_BASE_URL, window.location?.href || undefined);
            if (tileUrl.origin === backendUrl.origin) return false;
        } catch {
            // 忽略基址解析失败，继续其余检查
        }
        if (typeof window !== 'undefined' && tileUrl.origin === window.location.origin) return false;
        if (tileUrl.pathname.startsWith('/proxy/') || tileUrl.pathname.startsWith('/tiles/')) {
            return false;
        }
    } catch {
        return false;
    }

    return true;
}

/**
 * 复用后端 /proxy/{host+path}（与 publicRuntime.tileProxyUrl 契约一致：不带协议）。
 * 仅在 fallback/always 模式下处理第三方 CORS/网络问题。
 */
function buildTileProxyUrl(srcUrl: string): string | null {
    if (!canProxyTileUrl(srcUrl)) return null;
    try {
        const url = new URL(srcUrl);
        const hostAndPath = `${url.host}${url.pathname}${url.search}`;
        // SSOT：与 SidePanel/新闻等共用 publicRuntime.tileProxyUrl
        return tileProxyUrl(hostAndPath);
    } catch {
        return null;
    }
}

/**
 * 通用请求代理地址构造器（点查等非瓦片 JSON 请求与瓦片共用同一兜底通道）。
 * 代理关闭（off）或目标不可代理时返回 null，调用方按直连失败处理。
 */
export function buildRequestProxyUrl(srcUrl: string): string | null {
    return buildTileProxyUrl(srcUrl);
}

/** 每瓦片独立超时：到点主动 abort，释放浏览器并发槽位 */
function createTileTimeout(timeoutMs: number): {
    signal: AbortSignal;
    cleanup: () => void;
} {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timer),
    };
}

/**
 * 组合 source 级 abort 与单瓦片超时 signal。
 * 任一方 abort 时组合 signal 同步 abort。
 */
function createCombinedSignal(
    sourceSignal: AbortSignal,
    timeoutSignal: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();

    const abortFromSource = () => controller.abort(sourceSignal.reason);
    const abortFromTimeout = () => controller.abort(timeoutSignal.reason);

    if (sourceSignal.aborted || timeoutSignal.aborted) {
        controller.abort();
    } else {
        sourceSignal.addEventListener('abort', abortFromSource, { once: true });
        timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true });
    }

    return {
        signal: controller.signal,
        cleanup: () => {
            sourceSignal.removeEventListener('abort', abortFromSource);
            timeoutSignal.removeEventListener('abort', abortFromTimeout);
        },
    };
}

/** 动态取当前 AbortController；缺失或已 abort 时补齐新实例 */
function resolveSourceAbortController(source: any): AbortController {
    let controller = source?.get?.('abortController');
    if (!(controller instanceof AbortController) || controller.signal.aborted) {
        controller = new AbortController();
        if (source && typeof source.set === 'function') {
            source.set('abortController', controller);
        }
    }
    return controller;
}

/**
 * 跨源瓦片统一显式声明 Referer 策略。
 *
 * 站点响应头下发 `Referrer-Policy: same-origin`，`fetch()` 未显式指定时会**继承文档策略**，
 * 导致跨源瓦片请求完全不带 Referer —— OSM 据此判定为「未遵循 Tile Usage Policy」并返回 403。
 * 显式覆盖为 `origin-when-cross-origin`（浏览器对 https→https 的默认行为），
 * 让双引擎的 Referer 语义保持一致，不受页面级策略摆动影响。
 */
const TILE_FETCH_REFERRER_POLICY: ReferrerPolicy = 'origin-when-cross-origin';

/** 单次瓦片请求的结果：成功时携带 blob URL，失败时携带 HTTP 状态（0 = 传输层失败） */
interface TileFetchOutcome {
    blobUrl: string | null;
    status: number;
    /** OSM 拦截占位图（HTTP 200 但内容是 403 拦截图） */
    blocked: boolean;
}

async function requestTileAsBlobUrl(
    requestUrl: string,
    signal: AbortSignal,
    { osm = false }: { osm?: boolean } = {},
): Promise<TileFetchOutcome> {
    try {
        const resp = await fetch(requestUrl, {
            signal,
            mode: 'cors',
            credentials: 'omit',
            referrerPolicy: TILE_FETCH_REFERRER_POLICY,
        });
        // 429：代理限流或上游限流 — 解析 body 后 toast，再按失败处理
        if (resp.status === 429) {
            const detail = await extractTileErrorDetail(resp);
            notifyTileRateLimited(detail);
            return { blobUrl: null, status: 429, blocked: false };
        }
        if (!resp.ok) return { blobUrl: null, status: resp.status, blocked: false };
        const blob = await resp.blob();
        // OSM 拦截占位图：HTTP 200 但内容为固定字节的「403 Access blocked」提示图，
        // resp.ok 无法识别，必须显式丢弃，否则会被当作正常瓦片渲染到地图上。
        if (osm && isOsmBlockedTileBlob(blob)) {
            return { blobUrl: null, status: resp.status, blocked: true };
        }
        return { blobUrl: URL.createObjectURL(blob), status: resp.status, blocked: false };
    } catch {
        // AbortError / TypeError(CORS) / 网络错误 → 状态记 0
        return { blobUrl: null, status: 0, blocked: false };
    }
}

/**
 * OSM 专项降级：改写为德国社区镜像后重试一次。
 * 仅当直连命中 403 / 拦截占位图时调用，其它图源不经过此路径。
 */
async function requestOsmMirrorAsBlobUrl(
    srcUrl: string,
    signal: AbortSignal,
): Promise<TileFetchOutcome> {
    const mirrorUrl = buildOsmMirrorUrl(srcUrl);
    if (!mirrorUrl || signal.aborted) return { blobUrl: null, status: 0, blocked: false };
    return requestTileAsBlobUrl(mirrorUrl, signal);
}

/** 瓦片加载结果：missStatus > 0 表示「确定性缺瓦」，可用于学习该源的层级上限 */
interface TileLoadOutcome {
    blobUrl: string | null;
    missStatus: number;
}

/**
 * 用 fetch() 加载图片并绑定 AbortSignal，使 abort() 能真正中断 TCP 连接。
 * 成功时返回 blob URL，失败/中断时返回 null。
 *
 * 为什么不用 img.src？
 * - 浏览器对 <img> 的 HTTP 请求由内核管理，JS 无法中途取消
 * - 被墙的源会阻塞 30-60 秒占据并发连接槽位
 * - fetch() + AbortController 可以立即释放底层连接
 *
 * OSM 专用链路顺序：直连 → 德国社区镜像 → 自建代理。
 * 镜像排在代理之前的原因：代理出口 IP 历史上曾被 OSM 封禁（返回 200 假图），
 * 把已知更可能失败的链路放到后面，可少浪费一次往返。
 */
async function fetchTileAsBlobUrl(
    srcUrl: string,
    signal: AbortSignal,
): Promise<TileLoadOutcome> {
    const isOsm = isOsmTileUrl(srcUrl);
    const proxyUrl = buildTileProxyUrl(srcUrl);

    // always 模式：所有可代理的瓦片统一走后端
    if (TILE_PROXY_MODE === 'always' && proxyUrl) {
        const proxied = await requestTileAsBlobUrl(proxyUrl, signal, { osm: isOsm });
        if (proxied.blobUrl) {
            notifyAlwaysProxy();
            return { blobUrl: proxied.blobUrl, missStatus: 0 };
        }
        if (isOsm) {
            const mirrored = await requestOsmMirrorAsBlobUrl(srcUrl, signal);
            return { blobUrl: mirrored.blobUrl, missStatus: 0 };
        }
        // always 模式下失败状态来自代理本身，不能作为「上游该层不存在」的证据
        return { blobUrl: null, missStatus: 0 };
    }

    // fallback 模式：直连优先
    const direct = await requestTileAsBlobUrl(srcUrl, signal, { osm: isOsm });
    if (direct.blobUrl) return { blobUrl: direct.blobUrl, missStatus: 0 };
    if (signal.aborted) return { blobUrl: null, missStatus: 0 };

    // OSM 直连被策略拦截 → 先走社区镜像，再退回自建代理
    if (isOsm) {
        const mirrored = await requestOsmMirrorAsBlobUrl(srcUrl, signal);
        if (mirrored.blobUrl) return { blobUrl: mirrored.blobUrl, missStatus: 0 };
        if (signal.aborted) return { blobUrl: null, missStatus: 0 };
    }

    // 确定性缺瓦（400/404/410）与拦截假图：代理重试结果相同，
    // 直接放弃可省掉一次必败的往返，也避免 4xx 在控制台连刷。
    if (direct.blocked || DEFINITIVE_MISS_STATUS.has(direct.status)) {
        return { blobUrl: null, missStatus: direct.status };
    }

    if (TILE_PROXY_MODE === 'off' || !proxyUrl || signal.aborted) {
        return { blobUrl: null, missStatus: 0 };
    }

    const proxied = await requestTileAsBlobUrl(proxyUrl, signal, { osm: isOsm });
    // 代理真正成功再提示，避免「已切换」但瓦片仍失败的误导
    if (proxied.blobUrl) {
        notifyProxyFallback();
        return { blobUrl: proxied.blobUrl, missStatus: 0 };
    }
    // 代理失败可能源于代理自身（目标改写、限流），不作为层级证据
    return { blobUrl: null, missStatus: 0 };
}

function revokeBlobUrl(url: string | null): void {
    if (url) URL.revokeObjectURL(url);
}

// ==================== 公开 API ====================

/**
 * 给瓦片源的 tileLoadFunction 注入 AbortController，
 * 通过 fetch() + signal 实现真正的网络级中断。
 *
 * 工作流程：
 * 1. 动态读取 source 当前 AbortController（缺失/已 abort 时补齐）
 * 2. 请求开始时把当前 abortEpoch 写入 tile
 * 3. 用 fetch() + 组合 signal（source abort + 单瓦片超时）加载图片
 * 4. 成功后创建 blob URL 赋给 img.src；回调时再对比 epoch
 */
export function prioritizeTileSourceRequest<T>(source: T): T {
    // OpenLayers tile source 内部接口（set/get 动态属性）
    interface TileSourceWithInternals {
        set(key: string, value: unknown): void;
        get(key: string): unknown;
        getTileLoadFunction?(): unknown;
        setTileLoadFunction?(fn: (tile: any, srcUrl: string) => void): void;
    }
    const src = source as TileSourceWithInternals;
    if (!src || typeof src.set !== 'function' || typeof src.get !== 'function') return source;

    // 幂等：已包装过只补齐 controller，避免叠加 setTileLoadFunction
    if (src.get(LIFECYCLE_PRIORITY_MARK)) {
        resolveSourceAbortController(src);
        return source;
    }

    src.set(LIFECYCLE_PRIORITY_MARK, true);
    resolveSourceAbortController(src);

    const originalTileLoadFn = src.getTileLoadFunction?.();
    if (typeof originalTileLoadFn === 'function') {
        src.setTileLoadFunction?.((tile: any, srcUrl: string) => {
            const controller = resolveSourceAbortController(src);
            const sourceSignal = controller.signal;

            const currentEpoch = getSourceEpoch(src);
            stampTileEpoch(tile, currentEpoch);

            // 层级上限守卫：已学习到该源的实际最高层级时，超出部分直接判错，
            // 不发请求、不走代理，从源头消除 4xx 与无效代理往返。
            const tileCoord = typeof tile?.getTileCoord === 'function' ? tile.getTileCoord() : null;
            const tileZoom = Array.isArray(tileCoord) ? Number(tileCoord[0]) : NaN;
            const learnedMaxLevel = getLearnedMaxLevel(src);
            if (learnedMaxLevel !== null && Number.isFinite(tileZoom) && tileZoom > learnedMaxLevel) {
                markTileAsError(tile);
                return;
            }

            const img = tile.getImage?.();
            if (img instanceof HTMLImageElement) {
                let blobUrl: string | null = null;
                const timeout = createTileTimeout(TILE_REQUEST_TIMEOUT_MS);
                const combined = createCombinedSignal(sourceSignal, timeout.signal);

                const cleanupListeners = () => {
                    combined.cleanup();
                    timeout.cleanup();
                };

                const onAbort = () => {
                    revokeBlobUrl(blobUrl);
                    blobUrl = null;
                    markTileAsError(tile);
                };
                combined.signal.addEventListener('abort', onAbort, { once: true });

                if (combined.signal.aborted) {
                    cleanupListeners();
                    markTileAsError(tile);
                    return;
                }

                fetchTileAsBlobUrl(srcUrl, combined.signal)
                    .then((outcome) => {
                        cleanupListeners();
                        combined.signal.removeEventListener('abort', onAbort);

                        // 回调时再比 epoch：fetch 期间可能已 abort / 换源
                        const latestEpoch = getSourceEpoch(src);
                        const tileEpochNow = getTileEpoch(tile);
                        if (tileEpochNow < latestEpoch || combined.signal.aborted) {
                            revokeBlobUrl(outcome.blobUrl);
                            markTileAsError(tile);
                            return;
                        }

                        if (outcome.blobUrl) {
                            const url = outcome.blobUrl;
                            blobUrl = url;
                            // 成功加载后立即 revoke：图片数据已解码进 img 元素
                            img.addEventListener('load', () => {
                                URL.revokeObjectURL(url);
                            }, { once: true });
                            img.addEventListener('error', () => {
                                markTileAsError(tile);
                                URL.revokeObjectURL(url);
                            }, { once: true });
                            img.src = url;
                        } else {
                            // 确定性缺瓦：累计判定该层级不可用，命中后自动限级并提示用户
                            if (outcome.missStatus > 0) {
                                recordDefinitiveMiss(src, tileZoom, outcome.missStatus);
                            }
                            markTileAsError(tile);
                        }
                    })
                    .catch(() => {
                        cleanupListeners();
                        combined.signal.removeEventListener('abort', onAbort);
                        revokeBlobUrl(blobUrl);
                        markTileAsError(tile);
                    });
            } else {
                // 非 HTMLImageElement（如 Canvas）回退到原始 loadFunction
                originalTileLoadFn(tile, srcUrl);
            }
        });
    }

    return source;
}

/**
 * 阻断该图源所有正在进行的网络请求
 *
 * 四层级联释放：
 *   1. epoch++：所有进行中的 tileLoadFunction 在 fetch 回调时发现 epoch 过期，丢弃结果
 *   2. controller.abort()：中断所有正在进行的 fetch() 请求，立即释放 TCP 连接
 *   3. 标记所有缓存 tile 为 ERROR 状态
 *   4. source.clear()：清空 OL 内部瓦片缓存
 */
export function abortTileSourceRequests(source: any): void {
    if (!source || typeof source.get !== 'function') return;

    // ① epoch 递增：使进行中的异步回调失效
    const currentEpoch = getSourceEpoch(source);
    if (typeof source.set === 'function') {
        source.set('abortEpoch', currentEpoch + 1);
    }

    // ② AbortController：中断所有 fetch() 请求，释放 TCP 连接，并换新实例
    const controller = source.get('abortController');
    if (controller instanceof AbortController) {
        controller.abort('tile-source-aborted');
    }
    if (typeof source.set === 'function') {
        source.set('abortController', new AbortController());
    }

    // ③ 标记缓存 tile 为错误
    try {
        markAllSourceTilesAsError(source);
    } catch {
        // best-effort
    }

    // ④ 清空源缓存
    if (typeof source.clear === 'function') {
        try {
            source.clear();
        } catch {
            // ignore
        }
    }
}
