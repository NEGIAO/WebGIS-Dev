/**
 * 51.la 访客数据（第三方口径）—— 取数与格式化的**纯函数**，不持有任何状态。
 *
 * 数据源：CF Worker `https://api.negiao.cn/api/51la`
 * （实现见 NEGIAO.github.io/workers/github-stats 的 handle51laStats）。
 * Worker 已经把上游脚本解析成结构化 JSON，前端不该再包一层「store」：
 * 组件各自 fetch、各自持有 ref、各自决定渲染，本模块只保留真正跨组件复用的三件事 ——
 * 接口地址、数字格式、更新时间格式（否则各处会各自硬编码 URL 与格式化规则，迟早不一致）。
 */

/** 接口地址（Worker 侧边缘缓存 300s，响应里带 meta 可判断新鲜度） */
export const VISITOR_STATS_URL = 'https://api.negiao.cn/api/51la';

/** 指标键，与 Worker 返回的 metrics 字段一一对应 */
export type VisitorStatKey =
    | 'activeRecent'
    | 'todayUsers'
    | 'todayPv'
    | 'yesterdayUsers'
    | 'yesterdayPv'
    | 'monthPv'
    | 'totalPv';

/** 接口返回的 metrics 形状 */
export type VisitorMetrics = Partial<Record<VisitorStatKey, number>>;

/** 一次取数的结果：指标值 + Worker 回源抓取时间 */
export interface VisitorStatsSnapshot {
    /** 指标值（缺失的键不出现） */
    metrics: VisitorMetrics;
    /**
     * Worker 最近一次向上游抓取的时间，ISO 8601 带时区（如 `2026-10-28T11:21:20.488+08:00`）。
     * 与 `meta.fetchedAt` 同值；Worker 缓存 300s，故该时间最多比「此刻」早 5 分钟。
     * 上游未返回或格式异常时为 null，调用方按「不展示时间」处理。
     */
    updatedAt: string | null;
}

/**
 * 功能：取回指标值与更新时间。
 * 参数：无。
 * 返回：成功为 `{ metrics, updatedAt }`；失败（网络 / 非 2xx / 结构不符）为 null。
 * 说明：8s 超时 —— 装饰性数据不该让页脚长期处于未决状态；失败不抛错，
 * 由调用方按「无数据」处理（模板 v-if 直接不渲染），不打扰页面其余部分。
 */
export async function fetchVisitorStats(): Promise<VisitorStatsSnapshot | null> {
    try {
        const res = await fetch(VISITOR_STATS_URL, {
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const metrics = data && data.metrics;
        if (!metrics || typeof metrics !== 'object') return null;
        return {
            metrics: metrics as VisitorMetrics,
            updatedAt: typeof data.updatedAt === 'string' && data.updatedAt ? data.updatedAt : null,
        };
    } catch {
        return null;
    }
}

/**
 * 功能：数字格式化。
 * 参数：value —— 数值。
 * 返回：千分位字符串；过亿按「x.xx亿」降级（与 51.la 后台展示口径一致）。
 */
export function formatVisitorNumber(value: number): string {
    if (!Number.isFinite(value)) return '-';
    if (value >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
    return String(value).replace(/\d{1,3}(?=(\d{3})+$)/g, '$&,');
}

/**
 * 功能：更新时间格式化。
 * 参数：iso —— 接口返回的 `updatedAt`（ISO 8601，带 +08:00 偏移）。
 * 返回：`MM-DD HH:mm`；入参为空或不可解析时返回空串（调用方据此隐藏整段时间）。
 * 说明：用本地时区渲染 —— 接口时间固定为北京时间，海外用户应按自己的时钟阅读，
 * 因此不做「强制显示 +08:00」处理。数据本身最多滞后一个 Worker 缓存周期（300s），
 * 跨天/跨年的歧义可忽略，故省略年份。
 */
export function formatUpdatedAt(iso: string | null | undefined): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
