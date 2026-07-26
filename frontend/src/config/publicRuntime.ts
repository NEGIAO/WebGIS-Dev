/**
 * 前端公开运行时配置（单点基址派生）
 *
 * 三层配置模型的 L1 前端段（见根目录 .env.example）：
 * env 已统一收敛到仓库根目录（vite.config.js envDir=仓库根）——
 * - 本地开发：根目录 .env（git 忽略）
 * - 生产构建：根目录 .env.production（clone 用户改成自己的后端域名）
 *
 * 规则：业务代码不得再硬编码后端域名（原作者 HF Space 域名等），
 * 也不要散落 import.meta.env 读取——统一从本模块取值/拼接。
 *
 * 输入（构建期 env）：
 * - VITE_BACKEND_URL           后端 API 基址（缺省 http://localhost:7860）
 * - VITE_TILE_PROXY_BASE_URL   瓦片代理基址（缺省同 VITE_BACKEND_URL）
 * - VITE_TILE_PROXY_MODE       fallback | always | off（缺省 fallback）
 */

/** 去除尾部斜杠，保证拼接时不出现双斜杠 */
function stripTrailingSlash(value: string): string {
    return String(value || '').replace(/\/+$/, '');
}

/** 后端 API 基址（axios client、鉴权、runtime-config 等均以此为准） */
export const BACKEND_BASE_URL: string = stripTrailingSlash(
    String(import.meta.env.VITE_BACKEND_URL || 'http://localhost:7860'),
);

/** 瓦片代理基址（/proxy/*、/proxy/gcj2wgs/*、/tiles/* 等瓦片类服务） */
export const TILE_PROXY_BASE_URL: string = stripTrailingSlash(
    String(import.meta.env.VITE_TILE_PROXY_BASE_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:7860'),
);

/** 瓦片代理模式：fallback（直连失败才代理）| always（全部走代理）| off */
export const TILE_PROXY_MODE: string = String(
    import.meta.env.VITE_TILE_PROXY_MODE || 'fallback',
).toLowerCase();

/** 大文件下载请求超时（ms）：远长于全局 8s，GeoTIFF 流式传输耗时久（缺省 2000000ms ≈ 33 分钟） */
export const DOWNLOAD_REQUEST_TIMEOUT_MS: number =
    Number(import.meta.env.VITE_DOWNLOAD_REQUEST_TIMEOUT) > 0
        ? Number(import.meta.env.VITE_DOWNLOAD_REQUEST_TIMEOUT)
        : 2000000;

/**
 * 拼接后端 API URL
 * @param path 以 / 开头的路径，如 /api/config/public
 */
export function backendUrl(path: string): string {
    return `${BACKEND_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * 拼接瓦片代理 URL（通用 /proxy/{host+path} 形式）
 * @param hostAndPath 上游 host+path（不带协议），如 mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}
 */
export function tileProxyUrl(hostAndPath: string): string {
    return `${TILE_PROXY_BASE_URL}/proxy/${hostAndPath}`;
}

/**
 * 拼接 GCJ-02 纠偏代理 URL（/proxy/gcj2wgs/{完整上游URL} 形式）
 * @param upstreamUrl 完整上游 URL（含协议），如 http://webst01.is.autonavi.com/appmaptile?...
 */
export function gcj2wgsProxyUrl(upstreamUrl: string): string {
    return `${TILE_PROXY_BASE_URL}/proxy/gcj2wgs/${upstreamUrl}`;
}

/**
 * 拼接后端自托管瓦片 URL（/tiles/* 形式）
 * @param path tiles 下的路径，如 ships66/{z}/{x}/{y}.png
 */
export function backendTilesUrl(path: string): string {
    return `${TILE_PROXY_BASE_URL}/tiles/${path.replace(/^\/+/, '')}`;
}
