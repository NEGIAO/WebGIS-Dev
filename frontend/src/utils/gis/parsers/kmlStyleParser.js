/**
 * KML 样式解析与转换模块
 * 职责：解析 KML 中的 PolyStyle、LineStyle、IconStyle 等样式定义，
 * 并转换为 OpenLayers 兼容的 Style 对象。
 * 
 * 支持特性：
 * - PolyStyle: fill、outline、color 转换
 * - LineStyle: color、width 转换
 * - IconStyle: href、scale 转换
 * - 内联样式与 styleUrl 引用的解析
 * - KML color 格式（AABBGGRR）转换为 CSS 格式（#RRGGBB）
 * - 鲁棒性处理：降级方案、默认值、错误捕获
 */

import { Fill, Stroke, Style, Icon, Circle as CircleStyle } from 'ol/style';

/**
 * KML color 格式转换器
 * KML 使用 AABBGGRR 格式（alpha + BGR）
 * 需转换为 RGBA 十进制格式用于 CSS
 * 
 * @param {string} kmlColor - KML 格式颜色（如 "7D0080FF"）
 * @returns {object|null} { r, g, b, a, css, hex } 或 null（无效输入）
 */
export function parseKmlColor(kmlColor) {
    if (!kmlColor || typeof kmlColor !== 'string') {
        return null;
    }

    const hex = String(kmlColor).trim().toUpperCase();
    
    // KML color 应为 8 位十六进制（AABBGGRR）
    if (!/^[0-9A-F]{8}$/.test(hex)) {
        return null;
    }

    try {
        // 提取各分量
        const alpha = parseInt(hex.substring(0, 2), 16); // AA
        const blue = parseInt(hex.substring(2, 4), 16);  // BB
        const green = parseInt(hex.substring(4, 6), 16); // GG
        const red = parseInt(hex.substring(6, 8), 16);   // RR

        // 转换为 0-1 范围的 alpha 值
        const alphaDecimal = alpha / 255;

        // CSS hex 格式（#RRGGBB）
        const cssHex = `#${String(red).padStart(2, '0')}${String(green).padStart(2, '0')}${String(blue).padStart(2, '0')}`.toUpperCase();

        // RGBA CSS 字符串
        const cssRgba = `rgba(${red}, ${green}, ${blue}, ${alphaDecimal.toFixed(2)})`;

        return {
            r: red,
            g: green,
            b: blue,
            a: alphaDecimal,
            css: cssRgba,
            hex: cssHex,
            kml: kmlColor,
        };
    } catch (err) {
        console.warn(`[kmlStyleParser] KML 颜色解析失败: ${kmlColor}`, err);
        return null;
    }
}

/**
 * 移除 KML 默认命名空间，确保 querySelectorAll 能正确匹配元素
 * 当 KML 声明 xmlns="http://www.opengis.net/kml/2.2" 时，
 * CSS 选择器无法匹配命名空间内的元素，需先移除默认命名空间
 *
 * @param {string} kmlText - 原始 KML 文本
 * @returns {string} 移除默认命名空间后的 KML 文本
 */
function stripKmlDefaultNamespace(kmlText) {
    return String(kmlText)
        .replace(/\s+xmlns\s*=\s*(['"])http:\/\/www\.opengis\.net\/kml\/2\.2\1/gi, '')
        .replace(/\s+xmlns:gx\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\s+xmlns:xsi\s*=\s*(['"]).*?\1/gi, '')
        .replace(/\s+xsi:schemaLocation\s*=\s*(['"]).*?\1/gi, '');
}

/**
 * 从 KML XML 文本中提取样式定义
 * 支持两种方式：
 * 1. 内联样式 (<Placemark><Style>...</Style></Placemark>)
 * 2. 引用样式 (<Placemark><styleUrl>#styleName</styleUrl></Placemark>)
 *
 * @param {string} kmlText - KML 内容
 * @returns {Map<string, object>} styleId -> styleDefinition 的映射表
 */
export function extractKmlStyleDefinitions(kmlText) {
    const styleMap = new Map();

    if (!kmlText || typeof kmlText !== 'string') {
        return styleMap;
    }

    try {
        const normalizedKml = stripKmlDefaultNamespace(kmlText);
        const xmlDoc = new DOMParser().parseFromString(normalizedKml, 'text/xml');

        // 检查解析错误
        if (xmlDoc.documentElement.tagName === 'parsererror') {
            console.warn('[kmlStyleParser] KML XML 解析失败');
            return styleMap;
        }

        // 提取全局 Style 定义 (<Style id="..."></Style>)
        const styleElements = xmlDoc.querySelectorAll('Style[id], [id] > Style');
        styleElements.forEach((styleEl) => {
            const styleId = styleEl.getAttribute('id') || styleEl.parentElement?.getAttribute('id');
            if (!styleId) return;

            const styleDef = parseKmlStyleElement(styleEl);
            if (styleDef) {
                styleMap.set(styleId, styleDef);
            }
        });

        // 提取 StyleMap 定义 (<StyleMap id="..."><Pair>...</Pair></StyleMap>)
        const styleMapElements = xmlDoc.querySelectorAll('StyleMap[id]');
        styleMapElements.forEach((smEl) => {
            const smId = smEl.getAttribute('id');
            if (!smId) return;

            // StyleMap 的 normal pair 优先
            const normalPair = smEl.querySelector('Pair[key="normal"]') || smEl.querySelector('Pair');
            if (normalPair) {
                const styleUrl = normalPair.querySelector('styleUrl');
                if (styleUrl) {
                    const refId = String(styleUrl.textContent || '').trim().replace(/^#/, '');
                    if (refId && styleMap.has(refId)) {
                        styleMap.set(smId, styleMap.get(refId));
                        return;
                    }
                }
                const inlineStyle = normalPair.querySelector('Style');
                if (inlineStyle) {
                    const styleDef = parseKmlStyleElement(inlineStyle);
                    if (styleDef) {
                        styleMap.set(smId, styleDef);
                    }
                }
            }
        });

    } catch (err) {
        console.warn('[kmlStyleParser] 样式定义提取失败', err);
    }

    return styleMap;
}

/**
 * 解析单个 Style 元素
 * 提取 PolyStyle、LineStyle、IconStyle 等
 * 
 * @param {Element} styleEl - Style DOM 元素
 * @returns {object|null} 样式定义对象
 */
function parseKmlStyleElement(styleEl) {
    if (!styleEl || styleEl.nodeType !== Node.ELEMENT_NODE) {
        return null;
    }

    try {
        const styleDef = {
            poly: parseKmlPolyStyle(styleEl.querySelector('PolyStyle')),
            line: parseKmlLineStyle(styleEl.querySelector('LineStyle')),
            icon: parseKmlIconStyle(styleEl.querySelector('IconStyle')),
        };

        // 只有至少包含一个有效样式定义才返回
        return styleDef.poly || styleDef.line || styleDef.icon ? styleDef : null;
    } catch (err) {
        console.warn('[kmlStyleParser] Style 元素解析异常', err);
        return null;
    }
}

/**
 * 解析 PolyStyle 元素
 * 提取 fill、outline、color 属性
 * 
 * @param {Element} polyEl - PolyStyle 元素
 * @returns {object|null} { fill, outline, color, colorParsed }
 */
function parseKmlPolyStyle(polyEl) {
    if (!polyEl) return null;

    try {
        const fill = polyEl.querySelector('fill')?.textContent?.trim();
        const outline = polyEl.querySelector('outline')?.textContent?.trim();
        const colorText = polyEl.querySelector('color')?.textContent?.trim();

        const colorParsed = colorText ? parseKmlColor(colorText) : null;

        return {
            fill: fill === '1' || fill === 'true',
            outline: outline !== '0' && outline !== 'false', // 默认 true
            color: colorText || null,
            colorParsed,
        };
    } catch (err) {
        console.warn('[kmlStyleParser] PolyStyle 解析失败', err);
        return null;
    }
}

/**
 * 解析 LineStyle 元素
 * 提取 color、width 属性
 * 
 * @param {Element} lineEl - LineStyle 元素
 * @returns {object|null} { color, colorParsed, width }
 */
function parseKmlLineStyle(lineEl) {
    if (!lineEl) return null;

    try {
        const colorText = lineEl.querySelector('color')?.textContent?.trim();
        const widthText = lineEl.querySelector('width')?.textContent?.trim();

        const colorParsed = colorText ? parseKmlColor(colorText) : null;
        const width = widthText ? Math.max(0.5, parseFloat(widthText)) : 1;

        return {
            color: colorText || null,
            colorParsed,
            width: Number.isFinite(width) ? width : 1,
        };
    } catch (err) {
        console.warn('[kmlStyleParser] LineStyle 解析失败', err);
        return null;
    }
}

/**
 * 解析 IconStyle 元素
 * 提取 href、scale 属性
 * 
 * @param {Element} iconEl - IconStyle 元素
 * @returns {object|null} { href, scale }
 */
function parseKmlIconStyle(iconEl) {
    if (!iconEl) return null;

    try {
        const iconHref = iconEl.querySelector('Icon href')?.textContent?.trim() ||
                        iconEl.querySelector('Icon > href')?.textContent?.trim();
        const scaleText = iconEl.querySelector('scale')?.textContent?.trim();

        const scale = scaleText ? Math.max(0.1, parseFloat(scaleText)) : 1;

        return {
            href: iconHref || null,
            scale: Number.isFinite(scale) ? scale : 1,
        };
    } catch (err) {
        console.warn('[kmlStyleParser] IconStyle 解析失败', err);
        return null;
    }
}

/**
 * 从 Placemark 中提取内联样式或 styleUrl 引用
 * 
 * @param {Element} placemarkEl - Placemark 元素
 * @param {Map} globalStyles - 全局样式映射表
 * @returns {object|null} 样式定义或 null
 */
export function extractPlacemarkStyle(placemarkEl, globalStyles = new Map()) {
    if (!placemarkEl) return null;

    try {
        // 优先尝试内联样式
        const inlineStyle = placemarkEl.querySelector('Style');
        if (inlineStyle) {
            const styleDef = parseKmlStyleElement(inlineStyle);
            if (styleDef) return styleDef;
        }

        // 其次尝试 styleUrl 引用
        const styleUrlEl = placemarkEl.querySelector('styleUrl');
        if (styleUrlEl) {
            let styleUrl = String(styleUrlEl.textContent || '').trim();
            // 移除 URL fragment (#)
            styleUrl = styleUrl.replace(/^#/, '');
            
            if (styleUrl && globalStyles.has(styleUrl)) {
                return globalStyles.get(styleUrl);
            }
        }

        return null;
    } catch (err) {
        console.warn('[kmlStyleParser] Placemark 样式提取失败', err);
        return null;
    }
}

/**
 * 将 KML 样式定义转换为 OpenLayers Style 对象
 * 支持多边形（填充+描边）、线（描边）、点（圆形）的可视化
 * 
 * @param {object} styleDef - KML 样式定义
 * @param {object} options - 转换选项
 *   - {string} featureGeometry - 几何类型（'Polygon', 'LineString', 'Point'）
 *   - {object} defaultFill - 默认填充配置
 *   - {object} defaultStroke - 默认描边配置
 * @returns {Style|null} OpenLayers Style 对象或 null
 */
export function convertKmlStyleToOlStyle(styleDef, options = {}) {
    if (!styleDef) return null;

    const {
        featureGeometry = 'Polygon',
        defaultFill = { color: 'rgba(95, 191, 122, 0.24)' },
        defaultStroke = { color: '#2f7d3c', width: 2 },
    } = options;

    try {
        let fill = null;
        let stroke = null;
        let image = null;

        // 处理 PolyStyle（填充与描边）
        if (styleDef.poly) {
            const polyStyle = styleDef.poly;

            // 提取填充颜色
            if (polyStyle.fill && polyStyle.colorParsed) {
                fill = new Fill({
                    color: polyStyle.colorParsed.css,
                });
            } else if (polyStyle.fill && !polyStyle.colorParsed && defaultFill) {
                fill = new Fill(defaultFill);
            }

            // 提取描边
            if (polyStyle.outline) {
                const outlineColor = polyStyle.colorParsed?.hex || defaultStroke.color;
                stroke = new Stroke({
                    color: outlineColor,
                    width: defaultStroke.width || 1,
                });
            }
        }

        // 处理 LineStyle（线条）
        if (styleDef.line && !stroke) {
            const lineStyle = styleDef.line;
            const lineColor = lineStyle.colorParsed?.css || lineStyle.color || defaultStroke.color;
            stroke = new Stroke({
                color: lineColor,
                width: Math.max(0.5, lineStyle.width || 1),
            });
        }

        // 处理 IconStyle（点图标）
        if (styleDef.icon && styleDef.icon.href) {
            const iconStyle = styleDef.icon;
            try {
                image = new Icon({
                    src: iconStyle.href,
                    scale: Math.max(0.1, iconStyle.scale || 1),
                    // 容错处理：如果图标加载失败，回退到圆形
                    onLoad: (img) => {
                        // 图标成功加载
                    },
                    onError: () => {
                        console.warn(`[kmlStyleParser] 图标加载失败: ${iconStyle.href}`);
                        // 图标加载失败时的处理由使用端决定
                    },
                });
            } catch (err) {
                console.warn('[kmlStyleParser] Icon 转换失败', err);
                // 继续处理其他样式
            }
        }

        // 点图标未加载时，使用圆形点
        if (!image && ['Point', 'MultiPoint'].includes(featureGeometry)) {
            const pointRadius = 6;
            const pointFill = styleDef.poly?.colorParsed 
                ? new Fill({ color: styleDef.poly.colorParsed.hex })
                : (fill || new Fill({ color: '#5fbf7a' }));
            
            image = new CircleStyle({
                radius: pointRadius,
                fill: pointFill,
                stroke: stroke || new Stroke({ color: '#2f7d3c', width: 1 }),
            });
        }

        // 至少需要有一个有效样式
        if (!fill && !stroke && !image) {
            return null;
        }

        return new Style({
            fill: fill || undefined,
            stroke: stroke || undefined,
            image: image || undefined,
        });
    } catch (err) {
        console.warn('[kmlStyleParser] 样式转换异常', err);
        return null;
    }
}

/**
 * 为 OpenLayers feature 应用 KML 样式
 * 根据 feature 的几何类型智能选择样式配置
 * 
 * @param {Feature} feature - OpenLayers Feature 对象
 * @param {object} styleDef - KML 样式定义
 * @returns {boolean} 是否成功应用样式
 */
export function applyKmlStyleToFeature(feature, styleDef) {
    if (!feature || !styleDef) return false;

    try {
        const geometry = feature.getGeometry();
        if (!geometry) return false;

        const geometryType = geometry.getType();
        
        const olStyle = convertKmlStyleToOlStyle(styleDef, {
            featureGeometry: geometryType,
        });

        if (olStyle) {
            feature.setStyle(olStyle);
            return true;
        }

        return false;
    } catch (err) {
        console.warn('[kmlStyleParser] 样式应用失败', err);
        return false;
    }
}

/**
 * 批量处理 features，为其应用 KML 样式
 * 
 * @param {Feature[]} features - features 数组
 * @param {string} kmlText - KML 完整文本（用于提取样式定义和内联样式）
 * @returns {object} { successCount, failureCount, errors }
 */
export function applyKmlStylesToFeatures(features, kmlText) {
    const result = {
        successCount: 0,
        failureCount: 0,
        errors: [],
    };

    if (!Array.isArray(features) || !features.length) {
        return result;
    }

    try {
        // 第一步：提取全局样式定义
        const globalStyles = extractKmlStyleDefinitions(kmlText);

        // 第二步：解析 XML 获得 Placemark 元素映射（需移除命名空间以确保 querySelectorAll 正常工作）
        const normalizedKml = stripKmlDefaultNamespace(kmlText);
        const xmlDoc = new DOMParser().parseFromString(normalizedKml, 'text/xml');
        if (xmlDoc.documentElement.tagName === 'parsererror') {
            result.errors.push('KML XML 解析失败');
            return result;
        }

        const placemarks = xmlDoc.querySelectorAll('Placemark');

        // 第三步：为每个 feature 应用样式
        features.forEach((feature, index) => {
            try {
                // 尽量找到对应的 Placemark 元素（通过索引或 ID）
                let correspondingPlacemark = null;
                
                if (index < placemarks.length) {
                    correspondingPlacemark = placemarks[index];
                } else if (feature.getId) {
                    const featureId = feature.getId();
                    if (featureId) {
                        correspondingPlacemark = xmlDoc.querySelector(
                            `Placemark[id="${featureId}"], Placemark > name:contains("${featureId}")`
                        );
                    }
                }

                if (!correspondingPlacemark && index < placemarks.length) {
                    correspondingPlacemark = placemarks[index];
                }

                if (correspondingPlacemark) {
                    const styleDef = extractPlacemarkStyle(correspondingPlacemark, globalStyles);
                    if (styleDef && applyKmlStyleToFeature(feature, styleDef)) {
                        result.successCount += 1;
                        return;
                    }
                }

                result.failureCount += 1;
            } catch (err) {
                result.failureCount += 1;
                result.errors.push(`Feature ${index}: ${err.message}`);
            }
        });

    } catch (err) {
        console.error('[kmlStyleParser] 批量样式应用异常', err);
        result.errors.push(err.message);
    }

    return result;
}
