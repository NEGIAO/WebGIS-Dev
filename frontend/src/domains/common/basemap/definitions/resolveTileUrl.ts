/**
 * 瓦片 URL 解析（V3.7.16 层定义驱动重构）
 *
 * 纯字符串函数，双引擎共用；零引擎依赖，不 import ol / cesium。
 * 代理基址只用调用方传入的 TILE_PROXY_BASE_URL（来自 publicRuntime，
 * 环境变量 VITE_TILE_PROXY_BASE_URL），定义里永不硬编码 vpn.negiao.cn/proxy。
 *
 * 规则（与旧 createSource 逐条比对一致，见 scripts/check-basemap-migration.mjs）：
 * 1. 占位符替换：{tiandituTk} / {ovitalTdtkey} / {customUrl} / {normBase}
 *    由运行时上下文注入（空值替换为空串，与旧 OL buildTiandituUrl/buildOvitalUrl
 *    总是追加 `tk=` / `tdtkey=` 的行为一致）；
 * 2. correction 与 proxy 正交：纠偏决定走哪个代理子路径，代理决定走不走 VPS；
 *    纠偏只能在 VPS 上做，所以 correction != 'none' 时强制走代理
 *    （proxy:'direct' + correction != 'none' 属非法组合，见 validate.ts）；
 * 3. proxy:'proxy' 的拼装遵循 tile-proxy 路由契约 /proxy/{target_url:path}：
 *    只剥离 `https://` 默认协议前缀，`http://` 保留——船舶网（ships66）上游
 *    只服务 http，旧调用特意写成 /proxy/http://g3.ships66.com/...（V3.6.27），
 *    若剥掉协议代理会默认按 https 取源而失败。
 */

import type {
    CoordCorrection,
    ProxyMode,
    TileLayerContext,
    TileLayerDefinition,
} from './types';

/** 解析 URL 所需的全部输入：定义 + 运行时上下文 + 代理配置 */
export type TileUrlContext = TileLayerContext & {
    /** 瓦片代理基址（publicRuntime.TILE_PROXY_BASE_URL），不带尾部斜杠 */
    tileProxyBaseUrl: string;
};

// 注意：代理模式（TILE_PROXY_MODE）不进入本层。定义层只做「声明驱动的静态拼装」，
// 运行时全量代理（always）与容灾回退（TILE_AUTO_PROXY_ENABLED）由引擎侧读取全局配置处理。

/**
 * 纠偏代理子路径段（/proxy/{segment}/{完整上游URL} 路由契约）。
 *
 * ⚠️ 索引契约（自 V3.7.16 起唯一权威出处，原 publicRuntime helper 注释迁入）：
 *   - gcj2wgs / wgs2gcj：{x}/{y}/{z} 均为「标准 XYZ 网格」索引（客户端地图工作网格）；
 *   - bd2wgs：{x}/{y}/{z} 为「标准 XYZ 网格」索引——前端按普通 XYZ 底图使用（推荐路径）；
 *   - wgs2bd：{x}/{y}/{z} 为「百度网格」索引（居中原点、Y 轴向上、res=2^(18-z)），仅当客户端
 *     工作在百度坐标/网格空间（如原生加载百度底图叠加 WGS 图源）时才使用。
 *   {s} 子域占位符仅用于原始上游 URL；走到纠偏代理时由 OL/Cesium 在请求前替换为具体子域数字。
 */
const CORRECTION_PROXY_SEGMENT: Record<Exclude<CoordCorrection, 'none'>, string> = {
    gcj2wgs: 'gcj2wgs',
    wgs2gcj: 'wgs2gcj',
    bd2wgs: 'bd2wgs',
    wgs2bd: 'wgs2bd',
};

/** 替换 URL 模板中的运行时占位符（空值替换为空串，不保留字面量） */
export function resolveContextPlaceholders(
    url: string,
    ctx: TileLayerContext,
): string {
    return String(url || '')
        .replace(/\{tiandituTk\}/g, ctx.tiandituTk || '')
        .replace(/\{ovitalTdtkey\}/g, ctx.ovitalTdtkey || '')
        .replace(/\{customUrl\}/g, ctx.customUrl || '')
        .replace(/\{normBase\}/g, ctx.normBase || '');
}

/**
 * 解析一条图层定义的最终瓦片 URL 模板（仍含 {x}/{y}/{z}/{s}，由引擎展开）
 * @param definition 图层定义（只读原始上游 URL + method/correction/proxy）
 * @param ctx 运行时上下文 + 代理配置
 * @returns 最终 URL 模板；method='custom' 时返回 ''（custom 由引擎直接取 ctx.customUrl）
 */
export function resolveTileUrl(
    definition: TileLayerDefinition,
    ctx: TileUrlContext,
): string {
    const correction: CoordCorrection = definition.correction || 'none';
    const proxy: ProxyMode = definition.proxy || 'auto';

    // custom 服务无固定上游 URL：旧 createSource 直接用 ctx.customUrl 建源
    if (definition.method === 'custom') return '';

    const rawUrl = resolveContextPlaceholders(definition.url, ctx);

    // 纠偏只能在 VPS 上做：correction != 'none' 时强制走代理，不论 proxy 取值
    if (correction !== 'none') {
        return `${ctx.tileProxyBaseUrl}/proxy/${CORRECTION_PROXY_SEGMENT[correction]}/${rawUrl}`;
    }

    if (proxy === 'proxy') {
        // 通用代理 /proxy/{target_url}：只剥 https:// 前缀，http:// 保留（见文件头）
        const target = rawUrl.replace(/^https:\/\//i, '');
        return `${ctx.tileProxyBaseUrl}/proxy/${target}`;
    }

    // direct / auto：返回原始 URL；auto 的直连失败回退由引擎侧
    //（OL prioritizeTileSourceRequest / Cesium wrapProviderWithFetchFallback）
    // 按 TILE_PROXY_MODE 自行处理，与旧行为一致
    return rawUrl;
}
