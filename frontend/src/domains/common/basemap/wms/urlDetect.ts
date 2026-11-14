/**
 * WMS / ArcGIS 服务 URL 形态识别与查询参数工具
 *
 * 纯字符串与 URL 运算，不发任何请求：服务编排、候选端点探测、底图 URL 预判共用。
 */

/**
 * 判断 URL 是否为 WMS 服务特征
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isWmsServiceUrl(rawUrl: string): boolean {
    const source = String(rawUrl || '').trim();
    if (!source) return false;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const parsed = new URL(source, base);
        const queryValue = (name: string): string => {
            for (const [key, value] of parsed.searchParams.entries()) {
                if (key.toUpperCase() === name) return String(value || '').toUpperCase();
            }
            return '';
        };
        if (queryValue('SERVICE') === 'WMS') return true;
        const request = queryValue('REQUEST');
        if (request === 'GETMAP' || request === 'GETCAPABILITIES') return true;
        return /wms/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

/**
 * 识别 ArcGIS REST 地图服务端点（…/MapServer）
 * 用户通常只粘贴 REST 地址，WMS 端点需要探测换算
 *
 * @returns {{origin: string, servicePath: string} | null} servicePath 已剥离查询参数与尾斜杠
 */
export function matchArcgisRestServiceUrl(rawUrl: string): { origin: string; servicePath: string } | null {
    const source = String(rawUrl || '').trim();
    if (!source) return null;
    try {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
        const urlObj = new URL(source, base);
        if (!/^https?:$/i.test(urlObj.protocol)) return null;
        const cleanPath = urlObj.pathname.replace(/\/+$/, '');
        if (!/\/mapserver\/?$/i.test(cleanPath)) return null;
        return { origin: urlObj.origin, servicePath: cleanPath };
    } catch {
        return null;
    }
}

/** 是否为可解析出 WMS 图源的 URL（标准 WMS 特征 或 ArcGIS REST 服务端点） */
export function looksLikeWmsSourceUrl(rawUrl: string): boolean {
    return isWmsServiceUrl(rawUrl) || Boolean(matchArcgisRestServiceUrl(rawUrl));
}

/**
 * 由 REST 地址生成候选探测路径（含 /rest/ 段缺失时的标准变体）：
 * 1. 原样路径（可能已是完整 REST 路径，或站点把 REST 直接挂在 /services 上）
 * 2. 未含 /rest/ 段时插入：/arcgis/services/X → /arcgis/rest/services/X
 *    （ArcGIS Site 标准目录形态，用户粘贴的地址常省略 rest 段）
 */
export function buildArcgisProbePaths(servicePath: string): string[] {
    const paths = [servicePath];
    const restVariant = servicePath.replace(/\/services\//i, '/rest/services/');
    if (restVariant !== servicePath) paths.push(restVariant);
    return paths;
}

/**
 * 由 REST 地址生成候选 WMS 端点（按命中率排序）：
 * 1. <ctx>/rest/services/X/MapServer → <ctx>services/X/MapServer/WmsServer（Esri 规范路径）
 * 2. 原地址 + /WMSServer、+ /WmsServer
 * 3. 缺 /rest/ 段时补插 rest 变体后再追加（覆盖 /arcgis/services/X 粘贴形态）
 */
export function buildArcgisWmsCandidates(servicePath: string): string[] {
    const paths = [];
    const restMatch = servicePath.match(/^(.*\/)rest\/(services\/.+)$/i);
    if (restMatch) {
        return [
            `${restMatch[1]}${restMatch[2]}/WmsServer`,
            `${servicePath}/WMSServer`,
            `${servicePath}/WmsServer`,
        ];
    }
    paths.push(`${servicePath}/WmsServer`, `${servicePath}/WMSServer`);
    const restVariant = servicePath.replace(/\/services\//i, '/rest/services/');
    if (restVariant !== servicePath) {
        paths.push(`${restVariant}/WmsServer`, `${restVariant}/WMSServer`);
    }
    return paths;
}

export function appendCapabilitiesParams(urlStr: string): string {
    try {
        const parsed = new URL(urlStr);
        setParamIgnoreCase(parsed.searchParams, 'SERVICE', 'WMS');
        setParamIgnoreCase(parsed.searchParams, 'REQUEST', 'GetCapabilities');
        return parsed.toString();
    } catch {
        return urlStr;
    }
}

/** 粗校验响应确为 WMS Capabilities，而非 HTML 错误页 */
export function looksLikeCapabilitiesXml(xmlText: string): boolean {
    return /<(WMS_Capabilities|WMT_MS_Capabilities)[\s>]/i.test(String(xmlText || '').slice(0, 500));
}

export function queryValueIgnoreCase(urlObj: URL, name: string): string {
    for (const [key, value] of urlObj.searchParams.entries()) {
        if (key.toUpperCase() === name) return String(value || '').trim();
    }
    return '';
}

export function setParamIgnoreCase(searchParams: URLSearchParams, name: string, value: string): void {
    const existing = [...searchParams.keys()].find(
        (key) => key.toUpperCase() === name.toUpperCase(),
    );
    if (existing) searchParams.set(existing, value);
    else searchParams.set(name, value);
}
