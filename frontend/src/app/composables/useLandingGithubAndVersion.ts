/**
 * 功能名称：落地页 GitHub 开源指标、Star 趋势图与 README 版本号拉取/本地缓存能力层
 * 说    明：从 LandingView.ts 抽离 GitHub Stars/Forks/UpdatedAt、Worker 边缘代理竞速、
 *           Star History 趋势图降级兜底及 README 正式版本号解析与 localStorage 缓存。
 */
import { computed, ref, type Ref } from 'vue';
import { GITHUB_STATS_WORKER_URL } from '../../config/publicRuntime';

const GITHUB_REPO = 'NEGIAO/WebGIS-Dev';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_CACHE_KEY = 'webgis-github-stats-v1';
const GITHUB_CACHE_TTL_MS = 10 * 60 * 1000;
export const GITHUB_PAGE_URL = `https://github.com/${GITHUB_REPO}`;

/** GitHub 官方 mark path（16×16 viewBox），五处复用同一份 */
export const GITHUB_MARK_PATH =
    'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z';

export const STAR_HISTORY_PAGE_URL =
    'https://www.star-history.com/?repos=NEGIAO%2FWebGIS-Dev&type=timeline&legend=top-left';

const STAR_CHART_URL = GITHUB_STATS_WORKER_URL
    ? ''
    : 'https://api.star-history.com/chart?repos=NEGIAO/WebGIS-Dev&type=timeline&legend=top-left&sealed_token=B5ReoH7FL9EMbjs7rJJ3APlIoYZwGKo3g2gC_4_0LxIrQ--e5uhUrYXR7UEBcnb3CU48BAX9--IyzI-TxTszy8HrMJ3oVSVvfowMjrMOxY8n477EUd4_Ip6F8EMaHsKX6H5b1JjudmBoRUn3HxJ1R6zxt3lO1CKGidFnlqFb2W_TXYy_sTk3AS3rn8v8';

const WORKER_STATS_URL = GITHUB_STATS_WORKER_URL ? `${GITHUB_STATS_WORKER_URL}/api/stats` : '';
const WORKER_CHART_URL = GITHUB_STATS_WORKER_URL ? `${GITHUB_STATS_WORKER_URL}/api/chart` : '';
const WORKER_TIMEOUT_MS = 8000;

const README_URL = 'https://raw.githubusercontent.com/NEGIAO/WebGIS-Dev/main/README.md';
const VERSION_CACHE_KEY = 'webgis-app-version-v1';

export interface UseLandingGithubAndVersionOptions {
    language: Ref<string>;
    t: (key: string, params?: Record<string, any>) => string;
}

export function useLandingGithubAndVersion({ language, t }: UseLandingGithubAndVersionOptions) {
    const githubStars = ref<number | null>(null);
    const githubForks = ref<number | null>(null);
    const githubUpdatedAt = ref('');
    const githubIsLive = ref(false);
    const chartUseFallback = ref(false);
    const chartDead = ref(false);
    const appVersion = ref('');

    const formatCount = (value: number | null) => {
        if (value == null) return '—';
        try {
            return Number(value).toLocaleString(language.value === 'zh-CN' ? 'zh-CN' : 'en-US');
        } catch {
            return String(value);
        }
    };

    const formattedStars = computed(() => formatCount(githubStars.value));
    const formattedForks = computed(() => formatCount(githubForks.value));

    const starChartSrc = computed(() => {
        if (chartUseFallback.value) return STAR_CHART_URL;
        return WORKER_CHART_URL || STAR_CHART_URL;
    });

    const githubUpdatedParts = computed(() => {
        if (!githubUpdatedAt.value) return null;
        try {
            const date = new Date(githubUpdatedAt.value);
            if (Number.isNaN(date.getTime())) return null;
            const pad = (value: number) => String(value).padStart(2, '0');
            return {
                day: pad(date.getDate()),
                ym: `${date.getFullYear()}.${pad(date.getMonth() + 1)}`,
            };
        } catch {
            return null;
        }
    });

    const ossOriginText = computed(() =>
        appVersion.value
            ? t('landing.ossOrigin', { version: appVersion.value })
            : t('landing.ossOriginFallback'),
    );

    const onChartError = () => {
        if (!chartUseFallback.value && WORKER_CHART_URL) chartUseFallback.value = true;
        else chartDead.value = true;
    };

    function readGithubCache(): any {
        try {
            const raw = localStorage.getItem(GITHUB_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (
                !parsed ||
                typeof parsed !== 'object' ||
                typeof parsed.stars !== 'number' ||
                typeof parsed.forks !== 'number'
            ) {
                return null;
            }
            if (Date.now() - Number(parsed.fetchedAt || 0) > GITHUB_CACHE_TTL_MS * 6) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    const fetchGithubStats = async () => {
        try {
            const response = await fetch(GITHUB_API_URL, {
                headers: { Accept: 'application/vnd.github+json' },
            });
            if (!response.ok) throw new Error(`GitHub API ${response.status}`);
            const data: any = await response.json();
            if (typeof data.stargazers_count === 'number') githubStars.value = data.stargazers_count;
            if (typeof data.forks_count === 'number') githubForks.value = data.forks_count;
            githubUpdatedAt.value = data.pushed_at || data.updated_at || '';
            githubIsLive.value = true;
            try {
                localStorage.setItem(
                    GITHUB_CACHE_KEY,
                    JSON.stringify({
                        stars: githubStars.value,
                        forks: githubForks.value,
                        updatedAt: githubUpdatedAt.value,
                        fetchedAt: Date.now(),
                    }),
                );
            } catch {
                /* 隐私模式无存储也照常展示实时值 */
            }
        } catch (error) {
            console.warn('[Landing] GitHub stats fetch failed, keep cache/fallback:', error);
        }
    };

    const parseVersionFromReadme = (markdown: string) => {
        if (!markdown || typeof markdown !== 'string') return '';
        const declared = markdown.match(/当前版本\s*[Vv]?(\d+\.\d+(?:\.\d+)?)/);
        if (declared) return `V${declared[1]}`;
        const tableRow = markdown.match(/\|\s*\*\*V(\d+\.\d+\.\d+)\*\*\s*\|/);
        if (tableRow) return `V${tableRow[1]}`;
        const footer = markdown.match(/<sub>V(\d+\.\d+\.\d+)/);
        if (footer) return `V${footer[1]}`;
        return '';
    };

    const fetchAppVersion = async () => {
        try {
            const cached = localStorage.getItem(VERSION_CACHE_KEY);
            if (cached) appVersion.value = String(cached);
        } catch {
            /* 隐私模式无存储则直接走网络 */
        }
        try {
            const response = await fetch(README_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`README ${response.status}`);
            const version = parseVersionFromReadme(await response.text());
            if (version) {
                appVersion.value = version;
                try {
                    localStorage.setItem(VERSION_CACHE_KEY, version);
                } catch {
                    /* 隐私模式无存储也照常展示本次解析值 */
                }
            }
        } catch (error) {
            console.warn('[Landing] README version fetch failed, keep cache/fallback:', error);
        }
    };

    async function fetchJsonWithTimeout(url: string, timeoutMs = WORKER_TIMEOUT_MS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timer);
        }
    }

    const applyLocalCaches = () => {
        const cached = readGithubCache();
        if (cached) {
            githubStars.value = cached.stars;
            githubForks.value = cached.forks;
            githubUpdatedAt.value = cached.updatedAt || '';
        }
        try {
            const version = localStorage.getItem(VERSION_CACHE_KEY);
            if (version) appVersion.value = String(version);
        } catch {
            /* 隐私模式无存储则等待网络 */
        }
    };

    function persistLocalCaches() {
        try {
            localStorage.setItem(
                GITHUB_CACHE_KEY,
                JSON.stringify({
                    stars: githubStars.value,
                    forks: githubForks.value,
                    updatedAt: githubUpdatedAt.value,
                    fetchedAt: Date.now(),
                }),
            );
        } catch {
            /* 隐私模式无存储也照常展示本次值 */
        }
        try {
            if (appVersion.value) localStorage.setItem(VERSION_CACHE_KEY, appVersion.value);
        } catch {
            /* 同上 */
        }
    }

    const fetchViaWorker = async () => {
        if (!WORKER_STATS_URL) return false;
        try {
            const data: any = await fetchJsonWithTimeout(WORKER_STATS_URL);
            if (!data || typeof data !== 'object') return false;
            let useful = false;
            if (typeof data.stars === 'number') {
                githubStars.value = data.stars;
                githubIsLive.value = true;
                useful = true;
            }
            if (typeof data.forks === 'number') {
                githubForks.value = data.forks;
                useful = true;
            }
            if (data.updatedAt) githubUpdatedAt.value = data.updatedAt;
            if (data.version) {
                appVersion.value = data.version;
                useful = true;
            }
            if (!useful) return false;
            persistLocalCaches();
            return true;
        } catch (error) {
            console.warn('[Landing] Worker stats failed, fallback to direct GitHub:', error);
            return false;
        }
    };

    return {
        githubStars,
        githubForks,
        githubUpdatedAt,
        githubIsLive,
        chartUseFallback,
        chartDead,
        appVersion,
        formatCount,
        formattedStars,
        formattedForks,
        starChartSrc,
        githubUpdatedParts,
        ossOriginText,
        onChartError,
        fetchGithubStats,
        parseVersionFromReadme,
        fetchAppVersion,
        applyLocalCaches,
        fetchViaWorker,
    };
}
