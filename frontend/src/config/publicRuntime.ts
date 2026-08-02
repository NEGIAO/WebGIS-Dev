/**
 * 前端公开运行时配置（单点基址派生）
 *
 * 双 env 文件架构（两个文件都提交 git，L1 不涉密）：
 *   .env       → 部署环境（npm run build 由 Vite 读取）
 *   .env.local → 本地开发（npm run dev 由 Vite 读取）
 *
 * Vite 配置（vite.config.js）通过 selectiveEnvPlugin 实现按 mode 二选一：
 *   mode=production（npm run build）→ 只读 .env
 *   mode=development（npm run dev）→ 只读 .env.local
 *
 * 规则：业务代码不得再硬编码后端域名，
 * 也不要散落 import.meta.env 读取——统一从本模块取值/拼接。
 *
 * 输入（构建期 env）：
 * - VITE_BACKEND_URL           后端 API 基址
 * - VITE_TILE_PROXY_BASE_URL   瓦片代理基址（缺省同 VITE_BACKEND_URL）
 * - VITE_TILE_PROXY_MODE       fallback | always | off（缺省 fallback）
 * - VITE_*_TIMEOUT_MS          公开请求超时与 CDN 加载超时
 * - VITE_*_BASE_URL(S)         公开第三方服务端点 / CDN 候选链
 */

/** 去除尾部斜杠，保证拼接时不出现双斜杠 */
function stripTrailingSlash(value: string): string {
    return String(value || '').replace(/\/+$/, '');
}

function positiveNumberEnv(name: string, fallback: number): number {
    const value = Number(import.meta.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function csvEnv(name: string, fallback: string[]): string[] {
    const raw = String(import.meta.env[name] || '').trim();
    const values = raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
    return values.length ? values : fallback;
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
export const DOWNLOAD_REQUEST_TIMEOUT_MS: number = positiveNumberEnv('VITE_DOWNLOAD_REQUEST_TIMEOUT', 2000000);

/** 普通后端 API 请求超时（ms） */
export const BACKEND_REQUEST_TIMEOUT_MS: number = positiveNumberEnv('VITE_BACKEND_REQUEST_TIMEOUT_MS', 20000);

/** Agent 对话请求超时（ms） */
export const AGENT_REQUEST_TIMEOUT_MS: number = positiveNumberEnv('VITE_AGENT_REQUEST_TIMEOUT_MS', 60000);

/** 空间分析请求超时（ms） */
export const SPATIAL_ANALYSIS_TIMEOUT_MS: number = positiveNumberEnv('VITE_SPATIAL_ANALYSIS_TIMEOUT_MS', 30000);

/** 瓦片能力探测与请求超时（ms） */
export const TILE_CAPABILITIES_TIMEOUT_MS: number = positiveNumberEnv('VITE_TILE_CAPABILITIES_TIMEOUT_MS', 10000);
export const TILE_REQUEST_TIMEOUT_MS: number = positiveNumberEnv('VITE_TILE_REQUEST_TIMEOUT_MS', 15000);

/** Cesium CDN 候选链与单源加载超时 */
export const CESIUM_CDN_BASE_URLS: string[] = csvEnv('VITE_CESIUM_CDN_BASE_URLS', [
    'https://cdn.jsdelivr.net/npm/cesium@1.132/Build/Cesium/',
    'https://cdn.bootcdn.net/ajax/libs/cesium/1.132.0/',
    'https://unpkg.com/cesium@1.132.0/Build/Cesium/',
]);
export const CESIUM_CDN_ATTEMPT_TIMEOUT_MS: number = positiveNumberEnv('VITE_CESIUM_CDN_ATTEMPT_TIMEOUT_MS', 10000);

/** 公开第三方服务默认端点 */
export const TIANDITU_API_BASE_URL: string = stripTrailingSlash(String(import.meta.env.VITE_TIANDITU_API_BASE_URL || 'https://api.tianditu.gov.cn'));
export const TIANDITU_SEARCH_DEFAULT_BOUND: string = String(import.meta.env.VITE_TIANDITU_SEARCH_DEFAULT_BOUND || '73.5,18.2,135.0,53.5');
export const DISTRICT_BOUNDARY_BASE_URL: string = stripTrailingSlash(String(import.meta.env.VITE_DISTRICT_BOUNDARY_BASE_URL || 'https://geo.datav.aliyun.com/areas_v3/bound'));

/** 公开浏览器侧地图服务 token：为空时调用方应禁用/降级对应 provider */
export const MAPBOX_ACCESS_TOKEN: string = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
export const MAPTILER_KEY: string = String(import.meta.env.VITE_MAPTILER_KEY || '').trim();
export const GEOVISEARTH_TOKEN: string = String(import.meta.env.VITE_GEOVISEARTH_TOKEN || '').trim();

/** Google OAuth Client ID（公开，供 One Tap / GIS 初始化；空则跳过） */
export const GOOGLE_OAUTH_CLIENT_ID: string = String(
    import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '',
).trim();

/** 游客账号密码（从环境变量读取，避免前端硬编码） */
export const GUEST_PASSWORD: string = String(import.meta.env.VITE_GUEST_PASSWORD || '').trim();

/**
 * 应用基础路径（Vite BASE_URL，即 vite.config.js 的 base 配置）。
 * 用于拼接静态资源路径（如 ShareData/、CDN 资源等）。
 * 业务代码不得散落 import.meta.env.BASE_URL，统一从本模块取值。
 */
export const ASSET_BASE_URL: string = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';

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
