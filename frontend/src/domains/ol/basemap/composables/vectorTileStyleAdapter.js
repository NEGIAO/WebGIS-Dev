/**
 * vectorTileStyleAdapter.js
 *
 * [作用] 矢量瓦片服务端样式适配器：将 ArcGIS VectorTileServer 下发的 Mapbox 样式
 *        （resources/styles/root.json）编译为 OpenLayers StyleFunction。
 * [特点] 零依赖轻量实现；解析期一次性编译缓存样式对象，渲染期仅做 filter 求值。
 * [边界] 支持 line / fill / circle 三类基础 paint 属性与简单 filter 表达式；
 *        symbol / text（需 sprite + glyphs 字体管线）与 paint 表达式（interpolate 等）
 *        不支持——对应样式条目跳过、要素回退通用兜底样式，保证不丢要素。
 *        line-offset（OL Stroke 无对应能力）忽略。
 *
 * [适用] 系统当前唯一矢量瓦片：HENU 边界（vector_henu_border_pbf）。
 *        未来接入复杂样式服务时建议引入 ol-mapbox-style。
 */

import { Stroke, Fill, Style, Circle as CircleStyle } from 'ol/style';

/** 样式请求超时（ms）：超时/失败一律静默回退兜底样式 */
const STYLE_FETCH_TIMEOUT_MS = 8000;

/**
 * 从瓦片 URL 模板推导 ArcGIS VectorTileServer 的样式地址。
 *
 * ArcGIS 约定：`.../VectorTileServer/tile/{z}/{y}/{x}.pbf`
 *           → `.../VectorTileServer/resources/styles/root.json`
 *
 * @param {string} tileUrlTemplate - 矢量瓦片 URL 模板
 * @returns {string|null} 样式 root.json 地址；非 VectorTileServer 模板返回 null
 */
export function deriveArcgisVectorTileStyleUrl(tileUrlTemplate) {
    const url = String(tileUrlTemplate || '');
    const marker = /VectorTileServer/i.exec(url);
    if (!marker) return null;
    return `${url.slice(0, marker.index + marker[0].length)}/resources/styles/root.json`;
}

/**
 * 宽松相等：MVT 二进制瓦片中属性常以 string 编码（如 _symbol: "0"），而样式 JSON 中
 * filter 多为数值字面量；类型不同但字符串化相等时视为命中，对齐 Mapbox legacy filter
 * 的宽松语义，避免类型编码差异导致样式不命中。
 * 刻意不用 JS `==`（规避 `0 == ""` 陷阱）：仅做字符串化比较，null/undefined 不参与。
 *
 * @param {unknown} a - 要素属性值
 * @param {unknown} b - filter 字面量
 * @returns {boolean} 是否宽松相等
 */
function looseEquals(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

/**
 * 最小化 Mapbox filter 表达式求值。
 *
 * 支持：== / != / < / <= / > / >= / all / any / none；
 * 未知操作符宽松放行（返回 true），避免因表达式增强导致要素整体消失。
 *
 * @param {Array} filter - Mapbox filter 表达式，如 ["==", "_symbol", 0]
 * @param {Object} props - 要素属性集
 * @returns {boolean} 要素是否命中该样式条目
 */
export function matchesMapboxFilter(filter, props) {
    if (!Array.isArray(filter) || filter.length === 0) return true;
    const [op, ...args] = filter;

    switch (op) {
        case '==':
            return looseEquals(props[args[0]], args[1]);
        case '!=':
            return !looseEquals(props[args[0]], args[1]);
        case '<':
        case '<=':
        case '>':
        case '>=': {
            const a = Number(props[args[0]]);
            const b = Number(args[1]);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
            if (op === '<') return a < b;
            if (op === '<=') return a <= b;
            if (op === '>') return a > b;
            return a >= b;
        }
        case 'all':
            return args.every((sub) => matchesMapboxFilter(sub, props));
        case 'any':
            return args.some((sub) => matchesMapboxFilter(sub, props));
        case 'none':
            return !args.some((sub) => matchesMapboxFilter(sub, props));
        default:
            // 未知操作符（如 in / has 等）宽松放行，交由兜底样式保证可见性
            return true;
    }
}

/**
 * 解析 paint 常量值；表达式（数组形式，如 interpolate/step）不支持时返回 null。
 *
 * @param {unknown} value - paint 属性原始值
 * @returns {unknown|null} 常量值；表达式返回 null
 */
function constantPaintValue(value) {
    if (Array.isArray(value)) return null; // 表达式不支持
    return value ?? null;
}

/**
 * 将 '#rrggbb' 颜色与不透明度合成为 rgba 字符串（fill-opacity 需要）。
 *
 * @param {string} color - 十六进制颜色
 * @param {number} opacity - 不透明度 0~1
 * @returns {string} rgba 颜色串
 */
function withOpacity(color, opacity) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(color || '').trim());
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

/**
 * 将单条样式图层编译为 OL Style 对象数组（通常 1 条；解析失败返回空数组并跳过）。
 *
 * @param {Object} styleLayer - root.json layers 数组条目
 * @returns {Array<import('ol/style/Style').default>} 编译产物
 */
function compileStyleLayer(styleLayer) {
    const paint = styleLayer?.paint || {};
    const layout = styleLayer?.layout || {};
    const styles = [];

    if (styleLayer.type === 'line') {
        const color = constantPaintValue(paint['line-color']);
        const width = constantPaintValue(paint['line-width']);
        // line-dasharray 本身就是数组常量（非表达式），不能走 constantPaintValue 的数组过滤；
        // 但需排除表达式形态（嵌套数组/非数值元素），否则 map(Number) 产出 NaN 污染 Stroke.lineDash
        const dashRaw = paint['line-dasharray'];
        const dash =
            Array.isArray(dashRaw) &&
            dashRaw.length > 0 &&
            dashRaw.every((v) => !Array.isArray(v) && Number.isFinite(Number(v)))
                ? dashRaw.map(Number)
                : undefined;
        if (color == null || width == null) return [];
        styles.push(
            new Style({
                stroke: new Stroke({
                    color: String(color),
                    width: Number(width),
                    lineDash: dash,
                    lineCap: layout['line-cap'] === 'round' ? 'round' : 'butt',
                    lineJoin: layout['line-join'] === 'round' ? 'round' : 'miter',
                    // 注：line-offset OL Stroke 无对应能力，忽略（晕线改为居中绘制）
                }),
            }),
        );
        return styles;
    }

    if (styleLayer.type === 'fill') {
        const color = constantPaintValue(paint['fill-color']);
        const opacity = constantPaintValue(paint['fill-opacity']);
        if (color == null) return [];
        const finalColor =
            typeof opacity === 'number' ? withOpacity(String(color), opacity) : String(color);
        styles.push(new Style({ fill: new Fill({ color: finalColor }) }));
        return styles;
    }

    if (styleLayer.type === 'circle') {
        const radius = constantPaintValue(paint['circle-radius']);
        const color = constantPaintValue(paint['circle-color']);
        const strokeColor = constantPaintValue(paint['circle-stroke-color']);
        const strokeWidth = constantPaintValue(paint['circle-stroke-width']);
        if (radius == null && color == null) return [];
        styles.push(
            new Style({
                image: new CircleStyle({
                    radius: radius == null ? 4 : Number(radius),
                    fill: color != null ? new Fill({ color: String(color) }) : undefined,
                    stroke:
                        strokeColor != null
                            ? new Stroke({
                                  color: String(strokeColor),
                                  width: strokeWidth == null ? 1 : Number(strokeWidth),
                              })
                            : undefined,
                }),
            }),
        );
        return styles;
    }

    // symbol / background / raster / fill-extrusion：不支持，返回空跳过
    // （symbol 需 sprite 精灵图 + glyphs 字体 pbf 管线，超出轻量适配器边界）
    return [];
}

/**
 * 将服务端样式 JSON 编译为 OL StyleFunction。
 *
 * 编译期：按 source-layer 分组缓存各条目的 { filter, styles }；
 * 渲染期：要素按其 'layer' 属性（OL MVT 默认 source-layer 存储键）查找条目，
 *        依序求值 filter，命中即收集样式（多条叠加，还原 Mapbox 的叠层绘制次序）；
 *        未命中任何条目的要素回退通用兜底样式，保证不丢要素。
 *
 * @param {Object} styleJson - root.json 解析对象
 * @param {Function} [fallbackStyleFn] - 未命中要素的兜底样式函数
 * @returns {Function|null} OL 样式函数；样式 JSON 非法时返回 null
 */
export function createVectorTileStyleFunction(styleJson, fallbackStyleFn) {
    const styleLayers = Array.isArray(styleJson?.layers) ? styleJson.layers : [];

    // 按 source-layer 分组的编译缓存（依序叠加，与 Mapbox 绘制次序一致）
    const entriesBySourceLayer = new Map();
    for (const sl of styleLayers) {
        const sourceLayer = sl?.['source-layer'];
        if (!sourceLayer) continue; // background 等无 source-layer 条目跳过
        const styles = compileStyleLayer(sl);
        if (!styles.length) continue; // 不支持类型/表达式，编译期剔除
        if (!entriesBySourceLayer.has(sourceLayer)) {
            entriesBySourceLayer.set(sourceLayer, []);
        }
        entriesBySourceLayer.get(sourceLayer).push({ filter: sl.filter, styles });
    }

    return function vectorTileStyleFn(feature) {
        const props = typeof feature?.getProperties === 'function' ? feature.getProperties() : {};
        const sourceLayer = props.layer;
        const entries = sourceLayer != null ? entriesBySourceLayer.get(sourceLayer) : null;

        if (entries && entries.length) {
            const matched = [];
            for (const entry of entries) {
                if (matchesMapboxFilter(entry.filter, props)) {
                    matched.push(...entry.styles);
                }
            }
            if (matched.length) return matched;
        }

        // 未命中（source-layer 不在样式内 / filter 全不中）→ 通用兜底样式保证可见
        return typeof fallbackStyleFn === 'function' ? fallbackStyleFn(feature) : null;
    };
}

/**
 * 异步拉取矢量瓦片服务端样式并应用到图层（渐进增强）。
 *
 * 流程：从 source 的瓦片 URL 模板推导 root.json 地址 → 带超时 fetch →
 *       编译为 StyleFunction → layer.setStyle()。
 * 任何异常（非 ArcGIS 服务 / 网络失败 / JSON 解析失败 / 超时）均静默降级：
 * 图层保持创建时的通用兜底样式，不影响可用性。
 *
 * @param {import('ol/layer/VectorTile').default} layer - 目标矢量瓦片图层
 * @param {import('ol/source/VectorTile').default} source - 图层 source（取 URL 模板用）
 * @param {Function} fallbackStyleFn - 兜底样式函数（未命中要素的回退）
 */
export function applyVectorTileServerStyleAsync(layer, source, fallbackStyleFn) {
    const urls = typeof source?.getUrls === 'function' ? source.getUrls() : [];
    const styleUrl = deriveArcgisVectorTileStyleUrl(urls[0] || '');
    if (!styleUrl) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STYLE_FETCH_TIMEOUT_MS);

    fetch(styleUrl, { signal: controller.signal, credentials: 'omit' })
        .then((resp) => {
            if (!resp.ok) throw new Error(`style http ${resp.status}`);
            return resp.json();
        })
        .then((styleJson) => {
            const styleFn = createVectorTileStyleFunction(styleJson, fallbackStyleFn);
            if (styleFn) layer.setStyle(styleFn);
        })
        .catch(() => {
            // 静默降级：保持兜底样式
        })
        .finally(() => {
            clearTimeout(timeoutId);
        });
}
