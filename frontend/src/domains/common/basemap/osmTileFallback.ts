/**
 * OSM 官方瓦片源的反拦截策略与降级工具（OL / Cesium 双引擎共用）
 *
 * 背景（2026-11-14 定位）：
 *   站点响应头下发 `Referrer-Policy: same-origin`，浏览器据此**不向跨源子资源发送 Referer**。
 *   OSM 的 Tile Usage Policy 把「无可识别 Referer 的程序化瓦片请求」判定为未授权抓取，
 *   直接返回 403「Access blocked」。两个引擎若各自实现一套策略，就会出现
 *   「修好一个引擎、另一个引擎被拦」的跷跷板——故此处收敛为唯一真源。
 *
 * 约束：本模块只做纯字符串 / Blob 判定，不引入任何引擎域依赖（common → ol/cesium 必须为 0）。
 */

/** OSM 官方瓦片模板（单一真源，避免各引擎重复字面量） */
export const OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** OSM 官方瓦片 host */
export const OSM_TILE_HOST = 'tile.openstreetmap.org';

/** 德国社区合规镜像 origin（OSM 官方文档认可的社区镜像之一） */
export const OSM_DE_MIRROR_ORIGIN = 'https://tile.openstreetmap.de';

/**
 * OSM 拦截占位图的字节数特征。
 * OSM 对被封禁来源返回 HTTP 200 + 固定内容的「403 Access blocked」提示图，
 * 仅靠 resp.ok 无法识别，必须按字节特征丢弃，否则会把拦截图当正常瓦片贴到地图上。
 */
export const OSM_BLOCKED_TILE_BYTES = 6987;

/**
 * 判断 URL 是否指向 OSM 官方瓦片。
 * 兼容直连 URL 与 `{proxyBase}/proxy/tile.openstreetmap.org/...` 形式的代理 URL。
 */
export function isOsmTileUrl(url: string): boolean {
    return typeof url === 'string' && url.toLowerCase().includes(OSM_TILE_HOST);
}

/**
 * 把 OSM 官方瓦片 URL 改写到德国社区镜像。
 * @param url 已解析完成的瓦片 URL（不含 {z}/{x}/{y} 占位符）
 * @returns 镜像 URL；非 OSM 官方 host 返回 null
 */
export function buildOsmMirrorUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== OSM_TILE_HOST) return null;
        return `${OSM_DE_MIRROR_ORIGIN}${parsed.pathname}${parsed.search}`;
    } catch {
        // 非法/相对 URL 不做改写，交由调用方按普通失败处理
        return null;
    }
}

/** 判断二进制响应是否为 OSM 拦截占位图 */
export function isOsmBlockedTileBlob(blob: Blob): boolean {
    return !!blob && blob.size === OSM_BLOCKED_TILE_BYTES;
}
