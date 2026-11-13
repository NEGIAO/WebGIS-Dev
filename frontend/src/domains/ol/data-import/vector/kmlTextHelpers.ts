/**
 * KML 文本预处理（从 useLayerDataImport 拆出）
 *
 * KML/KMZ 在交给 OpenLayers 前需要三步修正：命名空间归一、按 Folder 顺序
 * 计算绘制层级、解析为要素后套用样式。三步都只处理文本与要素，不接触图层树。
 */

import KML from 'ol/format/KML';
import { applyKmlStylesToFeatures } from '@common/data-import/parsers/kmlStyleParser';
import { detectProjectionFromKmlText } from '@common/map-view/geo/index';

export interface KmlTextHelperDeps {
    /** 消息实例（解析告警用） */
    message: any;
    /** 投影识别（含人工声明），用于 KML 无 srsName 时推断 */
    resolveSupportedProjection: (...args: any[]) => Promise<any>;
}

/**
 * 创建 KML 文本工具集
 * @param deps 依赖注入（见 KmlTextHelperDeps）
 * @returns 命名空间归一 / 绘制顺序 / 样式套用 / 文本转要素
 */
export function createKmlTextHelpers({ message, resolveSupportedProjection }: KmlTextHelperDeps) {
    function normalizeKmlNamespace(kmlText) {
        if (/<\s*\/?\s*kml:/i.test(kmlText)) {
            return String(kmlText)
                .replace(/<(\/?)(\s*)kml:/gi, '<$1$2')
                .replace(/\s+xmlns:kml\s*=\s*(['"]).*?\1/gi, '');
        }
        return kmlText;
    }

    /**
     * KML 按 Folder 分组设定绘制序号（对标 QGIS/GDAL 行为）：
     * QGIS 把每个 Folder 读成独立图层，文档在前的 Folder 图层在上；
     * 我们把整包合并进一个 OL 图层，而 OL VectorSource 迭代是 RBush 空间序
     *（getFeatures 文档注明 random order），数组顺序对渲染无效——
     * 因此按“最内层 Folder”分组，文档末组序号 0（先画垫底），文档首组序号最大
     *（后画压顶），序号经图层 renderOrder 生效（见 useCreateManagedVectorLayer）。
     * 序号存为要素对象自有属性（不在 getProperties 内），不污染属性表与导出数据。
     * 无 Folder 的普通 KML 或结构异常时返回 -1（不设定）。
     */
    function applyKmlDrawOrder(kmlText, features) {
        if (!Array.isArray(features) || features.length < 2) return -1;
        try {
            const tokenRe = /<(\/?)(Folder|Placemark)[\s>/]/g;
            const folderStack = [];
            const owner = [];
            let m;
            while ((m = tokenRe.exec(kmlText))) {
                const closing = m[1] === '/';
                if (m[2] === 'Folder') {
                    if (!closing) folderStack.push(m.index);
                    else folderStack.pop();
                } else if (!closing) {
                    owner.push(folderStack.length ? folderStack[folderStack.length - 1] : -1);
                }
            }
            if (owner.length !== features.length) return -1;
            // 组按 Folder 起始位置倒序：文档末组 rank 0（先画垫底），文档首组 rank 最大
            const groupOrder = [...new Set(owner)].sort((a, b) => b - a);
            if (groupOrder.length < 2) return -1;
            const byGroup = new Map();
            owner.forEach((group, index) => {
                if (!byGroup.has(group)) byGroup.set(group, []);
                byGroup.get(group).push(features[index]);
            });
            const next = [];
            groupOrder.forEach((group, rank) => {
                for (const feature of byGroup.get(group)) {
                    try {
                        Object.defineProperty(feature, '_drawRank', {
                            value: rank,
                            writable: true,
                            configurable: true,
                        });
                    } catch {
                        /* ignore */
                    }
                    next.push(feature);
                }
            });
            if (next.length !== features.length) return -1;
            for (let i = 0; i < next.length; i++) features[i] = next[i];
            return groupOrder.length;
        } catch {
            return -1;
        }
    }

    /**
     * 对已解析的 features 应用 KML 样式（PolyStyle、LineStyle、IconStyle）
     * 并清除 extractStyles:false 产生的无效样式（空数组、undefined 等）
     * @param {Array} features - OL Feature 数组
     * @param {string} kmlTextForStyle - 用于样式解析的 KML 文本
     * @param {string} label - 日志标签
     */
    function applyKmlStylesAndCleanup(features, kmlTextForStyle, label = 'KML') {
        if (!features || features.length === 0) return;

        try {
            const styleResult = applyKmlStylesToFeatures(features, kmlTextForStyle);
            if (styleResult.successCount > 0) {
                console.warn(
                    `[${label}样式] 成功应用 ${styleResult.successCount}/${features.length} 个特征的样式`
                );
            }
            if (styleResult.errors.length > 0) {
                console.warn(`[${label}样式] 部分样式应用失败:`, styleResult.errors);
            }
        } catch (_err) {
            // 样式应用异常不阻断图层加载,以 warning 提示用户
            message.warning(`[${label}样式] 样式应用异常，已回退默认样式`);
        }

        // 兜底：清除 extractStyles:false 产生的无效样式，确保图层样式函数能正确接管渲染
        for (const feature of features) {
            const s = feature.getStyle();
            if (!s || (Array.isArray(s) && s.length === 0)) {
                feature.setStyle(null);
            }
        }
    }

    /**
     * 解析 KML 文本为 features，并应用 KML 中定义的样式
     * 支持 PolyStyle、LineStyle、IconStyle 等样式元素
     *
     * @param {string} kmlText - KML 文本内容
     * @param {string} label - 日志标签（默认 'KML'）
     * @param {string|null} explicitProjection - 显式指定的数据投影，null 则自动检测
     * @returns {Promise<Array>} OL Feature 数组
     */
    async function parseKmlTextToFeatures(kmlText, label = 'KML', explicitProjection = null) {
        const rawProjection = explicitProjection || detectProjectionFromKmlText(kmlText);
        const dataProjection = await resolveSupportedProjection(
            rawProjection,
            'EPSG:4326',
            label,
        );
        const kmlFormat = new KML({ extractStyles: false });
        let features = kmlFormat.readFeatures(kmlText, {
            dataProjection,
            featureProjection: 'EPSG:3857',
        });

        // 归一化 kml: 前缀，仅在首次解析失败时用归一化文本重试
        let kmlTextForStyle = kmlText;
        if (/<\s*\/?\s*kml:/i.test(kmlText)) {
            kmlTextForStyle = normalizeKmlNamespace(kmlText);
            if (!features || !features.length) {
                features = kmlFormat.readFeatures(kmlTextForStyle, {
                    dataProjection,
                    featureProjection: 'EPSG:3857',
                });
            }
        }

        applyKmlStylesAndCleanup(features, kmlTextForStyle, label);
        // 对标 QGIS：文档在前的 Folder 在上层（组内保持文档顺序），
        // 序号经图层 renderOrder 生效（数组顺序对 OL 渲染无效，见函数注释）
        const folderGroups = applyKmlDrawOrder(kmlTextForStyle, features);
        if (folderGroups > 0) {
            console.warn(
                `[数据导入] ${label}已按 Folder 分组设定绘制顺序（文档在前者在上），` +
                    `${folderGroups} 组，共 ${features.length} 个要素`,
            );
        }
        return features;
    }

    /**
     * 解析直传的单个文件（非文件夹/压缩包主链路）。
     *
     * 返回值从「要素数组」升级为「要素 + 源几何快照」：重设坐标系需要重投影**之前**
     * 的原始数值，而这里正是唯一还能拿到它的地方。KML 例外 —— 其坐标在解析期即由
     * srsName 决定并完成重投影，没有「原始数值另有归属」的问题，故快照为 null。
     *
     * @returns {Promise<{features: Array, snapshot: null|{geojson: any, sourceCrs: string}}>}
     */
    return {
        normalizeKmlNamespace,
        applyKmlDrawOrder,
        applyKmlStylesAndCleanup,
        parseKmlTextToFeatures,
    };
}
