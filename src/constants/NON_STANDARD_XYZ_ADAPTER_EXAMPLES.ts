/**
 * 非标准 XYZ 图源适配示例全集。
 *
 * 目标：把“目录分级 / TMS / QuadKey / 百度 / 动态 API / GCJ-02”这类非标准图源
 * 统一转成可在 OpenLayers tileUrlFunction 中直接调用的方案。
 */

export type YMode = 'auto' | 'direct' | 'invert-tms' | 'ol-negative';

export interface NormalizedTileContext {
    z: number;
    x: number;
    y: number;
    rawY: number;
}

/**
 * 标准化 tileCoord。
 * OpenLayers 的 tileUrlFunction 入参是 [z, x, rawY]，rawY 在不同服务里语义可能不同。
 */
export function normalizeTileContext(tileCoord: number[], yMode: YMode = 'auto'): NormalizedTileContext {
    const z = tileCoord[0];
    const x = tileCoord[1];
    const rawY = tileCoord[2];

    let y = rawY;
    if (yMode === 'invert-tms') y = (1 << z) - 1 - rawY;
    else if (yMode === 'ol-negative') y = -rawY - 1;
    else if (yMode === 'auto') y = rawY < 0 ? (-rawY - 1) : rawY;

    return { z, x, y, rawY };
}

/** QuadKey 编码（Bing 常用）。 */
export function toQuadKey(x: number, y: number, z: number): string {
    let quadKey = '';
    for (let i = z; i > 0; i--) {
        let digit = 0;
        const mask = 1 << (i - 1);
        if ((x & mask) !== 0) digit += 1;
        if ((y & mask) !== 0) digit += 2;
        quadKey += digit.toString();
    }
    return quadKey;
}

/**
 * 百度瓦片常见偏移（示意）：
 * - 以中心为原点，x/y 需要平移到百度内部坐标。
 * - 不同百度服务参数可能略有差异，需以实际服务文档为准。
 */
export function toBaiduTileXY(x: number, y: number, z: number): { x: number; y: number } {
    const offset = 1 << (z - 1);
    return {
        x: x - offset,
        y: offset - y - 1
    };
}

export interface NonStandardRecipe {
    type: 'directory-structured' | 'tms' | 'quadkey' | 'baidu' | 'dynamic-api' | 'gcj-02';
    title: string;
    keyPoints: string[];
    buildUrl: (tileCoord: number[]) => string;
}

/**
 * 1) 目录分级型（Maps-for-free 等）
 * URL 示例：.../z{z}/row{y}/{z}_{x}-{y}.jpg
 */
const directoryStructuredRecipe: NonStandardRecipe = {
    type: 'directory-structured',
    title: '目录分级型（Directory Structured）',
    keyPoints: [
        '不能依赖 {x}-{y} 模板推断，建议统一用 tileUrlFunction 拼接。',
        '优先输出日志确认 z/x/y 与请求 URL 一致。',
        '必要时增加 row 偏移量做局部校正。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'auto');
        return `https://maps-for-free.com/layer/relief/z${z}/row${y}/${z}_${x}-${y}.jpg`;
    }
};

/** 2) TMS 规范型：y 轴反转。 */
const tmsRecipe: NonStandardRecipe = {
    type: 'tms',
    title: 'TMS 规范型（OSGeo Standard）',
    keyPoints: [
        '典型现象是地图上下颠倒。',
        '核心转换：y = (2^z - 1) - y。',
        '注意先确认当前 rawY 是哪种语义，再决定是否反转。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'invert-tms');
        return `https://example-tms.server/tiles/${z}/${x}/${y}.png`;
    }
};

/** 3) QuadKey 编码型：Bing。 */
const quadKeyRecipe: NonStandardRecipe = {
    type: 'quadkey',
    title: 'QuadKey 编码型（Bing）',
    keyPoints: [
        'URL 不再是 z/x/y，而是单一 quadkey。',
        '必须先拿到标准 xyz，再编码。',
        '多子域时可用 x+y 做散列。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'auto');
        const qk = toQuadKey(x, y, z);
        return `https://t0.tiles.virtualearth.net/tiles/a${qk}.jpeg?g=1`;
    }
};

/** 4) 百度特殊切片。 */
const baiduRecipe: NonStandardRecipe = {
    type: 'baidu',
    title: '百度地图特殊切片（Baidu Scheme）',
    keyPoints: [
        '百度与标准 Web Mercator 网格不兼容。',
        '通常需自定义 TileGrid 与 resolutions。',
        'x/y 往往还要做中心偏移。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'auto');
        const bd = toBaiduTileXY(x, y, z);
        return `https://online0.map.bdimg.com/onlinelabel/?qt=tile&x=${bd.x}&y=${bd.y}&z=${z}&styles=pl&scaler=1&p=1`;
    }
};

/** 5) 动态参数/API 请求型。 */
const dynamicApiRecipe: NonStandardRecipe = {
    type: 'dynamic-api',
    title: '动态参数/API 请求型（Amap/GeoQ 等）',
    keyPoints: [
        '参数顺序、签名、token 可能影响返回。',
        '建议统一在 URLSearchParams 中构造。',
        '必要时加入随机因子或时间戳。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'auto');
        const params = new URLSearchParams({
            style: '8',
            x: String(x),
            y: String(y),
            z: String(z)
        });
        return `https://webrd01.is.autonavi.com/appmaptile?${params.toString()}`;
    }
};

/**
 * 6) GCJ-02 切片适配（策略型，不是单一 URL 模式）。
 * 核心问题是坐标基准不一致，而不是路径模板。
 */
const gcj02Recipe: NonStandardRecipe = {
    type: 'gcj-02',
    title: 'GCJ-02 切片适配（中国偏移系）',
    keyPoints: [
        '底图在 GCJ-02，矢量在 WGS84 时会整体错位。',
        '方案A：矢量实时 WGS84->GCJ-02 再叠加。',
        '方案B：服务端重切片/纠偏，输出 WGS84 对齐瓦片。',
        '方案C：全链路统一到 GCJ-02（底图+叠加数据）。'
    ],
    buildUrl: (tileCoord) => {
        const { z, x, y } = normalizeTileContext(tileCoord, 'auto');
        return `https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`;
    }
};

export const NON_STANDARD_XYZ_SOLUTION_EXAMPLES: Record<string, NonStandardRecipe> = {
    directoryStructuredRecipe,
    tmsRecipe,
    quadKeyRecipe,
    baiduRecipe,
    dynamicApiRecipe,
    gcj02Recipe
};

/**
 * 标准 XYZ 基线：
 * url = https://host/{z}/{x}/{y}.png
 *
 * 在 OpenLayers 中：
 * new XYZ({ url: 'https://host/{z}/{x}/{y}.png' })
 *
 * 非标准时：
 * new XYZ({ tileUrlFunction: (tileCoord) => customUrl })
 */
