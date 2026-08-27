/**
 * capabilitiesProxy.js — Capabilities/元数据拉取的后端代理兜底注入器（SSOT）
 *
 * 背景：内网 ArcGIS/WMTS 服务常见两类可达性问题——自签证书、无 CORS 头。
 * 瓦片已有后端 /proxy/{url} 兜底通道；能力文档（GetCapabilities / f=json）
 * 同样需要该通道才能完成「注册进 TOC」的第一步。
 *
 * 分层约定：common 层不反向依赖 @ol / @cesium-domain，
 * 由各引擎在启动时以 owner 键调用 setCapabilitiesProxyBuilder 注入构造器：
 * - OL：buildRequestProxyUrl（tile-source/tileLifecycle，与瓦片同通道，MapContainer 常驻）
 * - Cesium：backendBaseUrl + '/proxy/' 拼接（随 3D 引擎挂载/卸载注册/注销）
 *
 * 按 owner 注册表而非单例覆盖：Cesium 卸载只摘除自己的键，
 * 自动回落到常驻 OL 构造器，避免「进过一次 3D 后代理门控失效」。
 */

type ProxyBuilder = (url: string) => string | null;

const builders = new Map<string, ProxyBuilder>();

/** 注册直连失败时的代理地址构造器（传 null 注销该 owner）；幂等 */
export function setCapabilitiesProxyBuilder(
    fn: ProxyBuilder | null,
    owner = 'default',
): void {
    if (typeof fn === 'function') builders.set(owner, fn);
    else builders.delete(owner);
}

/**
 * 读取合成构造器：按注册顺序逐个尝试，返回首个非空结果；无任何注册返回 null。
 * OL 先注册且自带门控（TILE_PROXY_MODE=off 返回 null / 同源排除），天然优先。
 */
export function getCapabilitiesProxyBuilder(): ProxyBuilder | null {
    if (!builders.size) return null;
    const chain = [...builders.values()];
    return (url: string) => {
        for (const build of chain) {
            const proxied = build(url);
            if (proxied) return proxied;
        }
        return null;
    };
}
