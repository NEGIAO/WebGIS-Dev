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

/** 保证以 / 结尾；保留 './' 相对形态，供静态资源相对解析（子路径部署兼容） */
function withTrailingSlash(value: string): string {
    const v = String(value || '');
    return v.endsWith('/') ? v : `${v}/`;
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

/**
 * 应用基础路径（Vite BASE_URL，即 vite.config.js 的 base 配置）。
 * 用于拼接静态资源路径（如 ShareData/、cloud-atmosphere/、Cesium 自托管资源等）。
 * 保留原始形态（'./' 保持相对），保证根域名与子路径多处部署均可正确解析；
 * 业务代码不得散落 import.meta.env.BASE_URL，统一从本模块取值。
 */
export const ASSET_BASE_URL: string = withTrailingSlash(String(import.meta.env.BASE_URL || './'));

/**
 * Cesium 静态资源候选链（本地自托管，不走公共 CDN）：
 * public/cesium/ 由 node_modules/cesium 的 Build/Cesium 拷贝而来，随站点一同部署
 * （GitHub Pages + Cloudflare 边缘缓存，同源无 CORS 问题）。
 * 默认跟随 ASSET_BASE_URL（'./' → './cesium/'），相对解析兼容多处部署；
 * Workers/Assets/Widgets 子资源由 window.CESIUM_BASE_URL 跟随实际生效的候选基址解析。
 * 如需覆写（含临时回退公共 CDN），通过 VITE_CESIUM_ASSET_BASE_URLS 传入完整候选链即可。
 */
export const CESIUM_ASSET_BASE_URLS: string[] = csvEnv('VITE_CESIUM_ASSET_BASE_URLS', [
    `${ASSET_BASE_URL}cesium/`,
]);
export const CESIUM_ASSET_ATTEMPT_TIMEOUT_MS: number = positiveNumberEnv('VITE_CESIUM_ASSET_ATTEMPT_TIMEOUT_MS', 10000);

/** 公开第三方服务默认端点 */
export const TIANDITU_API_BASE_URL: string = stripTrailingSlash(String(import.meta.env.VITE_TIANDITU_API_BASE_URL || 'https://api.tianditu.gov.cn'));
export const TIANDITU_SEARCH_DEFAULT_BOUND: string = String(import.meta.env.VITE_TIANDITU_SEARCH_DEFAULT_BOUND || '73.5,18.2,135.0,53.5');
export const DISTRICT_BOUNDARY_BASE_URL: string = stripTrailingSlash(String(import.meta.env.VITE_DISTRICT_BOUNDARY_BASE_URL || 'https://geo.datav.aliyun.com/areas_v3/bound'));



/** Google OAuth Client ID（公开，供 One Tap / GIS 初始化；空则跳过） */
export const GOOGLE_OAUTH_CLIENT_ID: string = String(
    import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID || '',
).trim();

/** 游客账号密码（从环境变量读取，避免前端硬编码） */
export const GUEST_PASSWORD: string = String(import.meta.env.VITE_GUEST_PASSWORD || '').trim();

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
 *
 * ⚠️ 索引契约：gcj2wgs/wgs2gcj 的 {x}/{y}/{z} 均为「标准 XYZ 网格」索引（客户端地图工作网格）。
 */
export function gcj2wgsProxyUrl(upstreamUrl: string): string {
    return `${TILE_PROXY_BASE_URL}/proxy/gcj2wgs/${upstreamUrl}`;
}

/**
 * 拼接百度 BD-09 → WGS84 纠偏代理 URL（/proxy/bd2wgs/{完整上游URL} 形式）
 * @param upstreamUrl 完整上游百度瓦片 URL（含协议），如 https://maponline{s}.bdimg.com/tile/?qt=vtile&x={x}&y={y}&z={z}&styles=pl&scaler=1&from=jsapi2_0
 *
 * ⚠️ 索引契约：
 *   - bd2wgs：{x}/{y}/{z} 为「标准 XYZ 网格」索引——前端按普通 XYZ 底图使用（推荐路径）；
 *   - wgs2bd：{x}/{y}/{z} 为「百度网格」索引（居中原点、Y 轴向上、res=2^(18-z)），仅当客户端
 *     工作在百度坐标/网格空间（如原生加载百度底图叠加 WGS 图源）时才使用。
 *   {s} 子域占位符仅用于原始上游 URL；走到 bd2wgs 时由 OL/Cesium 在请求前替换为具体子域数字。
 */
export function bd2wgsProxyUrl(upstreamUrl: string): string {
    return `${TILE_PROXY_BASE_URL}/proxy/bd2wgs/${upstreamUrl}`;
}

/**
 * 拼接后端自托管瓦片 URL（/tiles/* 形式）
 * @param path tiles 下的路径，如 ships66/{z}/{x}/{y}.png
 */
export function backendTilesUrl(path: string): string {
    return `${TILE_PROXY_BASE_URL}/tiles/${path.replace(/^\/+/, '')}`;
}
