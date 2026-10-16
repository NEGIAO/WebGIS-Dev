import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Z_BAND } from '../zIndexBands';
import { useFeatureStyleStore } from '@ol/stores/useFeatureStyleStore';
import { getFeatureIdFromFeature } from '@common/data-protocol/featureKey';

// WebGL 渲染阈值：当要素数量超过此值时自动使用 WebGL 渲染
const WEBGL_RENDER_THRESHOLD = 5000;

// WebGL 默认样式（与 Canvas 样式兼容）
const WEBGL_DEFAULT_STYLE = {
    'fill-color': 'rgba(14, 119, 184, 0.3)',
    'stroke-color': '#0e77b8',
    'stroke-width': 1,
};

/**
 * [Phase 19]: Managed Vector Layer Creation Composable
 *
 * 提取创建托管矢量图层的生命周期逻辑
 * 职责：图层创建、要素规范化、样式应用、数据登记
 *
 * 架构说明：
 * - 数据层：DataManager 管理所有数据（GeoJSON），支持导出/查询
 * - 渲染层：OL VectorLayer/WebGLVectorLayer 负责可视化
 * - TOC 管理：基于 DataManager，不依赖渲染方式
 *
 * @param {Object} config - Configuration object
 * @param {Ref} config.mapInstanceRef - Map instance reference
 * @param {Array} config.userDataLayers - User data layers registry
 * @param {Object} config.styleHelpers - Style processing functions
 * @param {Object} config.featureHelpers - Feature serialization functions
 * @param {Object} config.metadataHelpers - Metadata normalization functions
 * @param {Object} config.registryHelpers - Layer registry functions
 * @param {Object} config.styleTemplates - Predefined style templates
 * @param {Object} [config.dataManager] - DataManager instance (optional, for data/render separation)
 * @returns {Object} Contains createManagedVectorLayer function
 */
export function useCreateManagedVectorLayer({
    mapInstanceRef,
    userDataLayers,
    styleHelpers,
    featureHelpers,
    metadataHelpers,
    registryHelpers,
    styleTemplates,
    dataManager = null, // 可选的 DataManager 实例
}) {
    const {
        normalizeStyleConfig,
        buildManagedLayerStyle,
        buildGeometryStyle,
        buildLabelOnlyStyle,
    } = styleHelpers;
    // 防御：调用方未注入拆分样式时，回落单层样式，避免导入数据整批失败
    const geometryStyleBuilder = typeof buildGeometryStyle === 'function'
        ? buildGeometryStyle
        : buildManagedLayerStyle;
    const labelStyleBuilder = typeof buildLabelOnlyStyle === 'function'
        ? buildLabelOnlyStyle
        : () => () => undefined;

    const { serializeManagedFeatures, ensureFeatureId } = featureHelpers;

    const { normalizeLayerMetadata } = metadataHelpers;

    const {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
    } = registryHelpers;

    /**
     * 创建并登记托管矢量图层
     *
     * [流程]:
     * 1. 验证 map 实例和要素数据
     * 2. 规范化样式配置和元数据
     * 3. 创建 VectorLayer 和 VectorSource（大数据量自动使用 WebGL）
     * 4. 序列化要素并注册 ID
     * 5. 将图层添加到地图
     * 6. 创建层数据记录并登记到 userDataLayers
     * 7. 刷新 zIndex 索引
     * 8. 触发外部事件同步（UI 面板）
     * 9. 可选执行 fitView 操作
     *
     * @param {Object} params - Layer creation parameters
     * @param {string} params.name - Layer display name
     * @param {string} params.type - Layer type (e.g., 'shape', 'route')
     * @param {string} params.sourceType - Data source type
     * @param {Array} params.features - OL Feature array
     * @param {Object} params.styleConfig - Style configuration
     * @param {boolean} [params.autoLabel=true] - Whether to enable label capability (menu toggle availability)
     * @param {boolean} [params.labelVisible=false] - Label initial visibility (default off, manual open)
     * @param {Object} params.metadata - Layer metadata
     * @param {boolean} params.fitView - Whether to fit map view to layer extent
     * @returns {Promise<string|null>} Layer ID if created, null if creation failed
     */
    async function createManagedVectorLayer({
        name,
        type,
        sourceType,
        features,
        styleConfig,
        autoLabel = true,
        labelVisible = false,
        metadata = null,
        fitView = false,
    }) {
        if (!mapInstanceRef.value || !features?.length) return null;

        // 1. 规范化样式配置
        const normalizedStyle = normalizeStyleConfig(styleConfig || styleTemplates.classic);
        // 标注能力（autoLabel）与初始可见（labelVisible）解耦：
        // 默认能力开（保证 TOC 菜单可手动打开）、默认不可见（首屏无压盖）
        const initialLabelVisible = !!labelVisible;

        // 2. 规范化元数据
        const normalizedMetadata = normalizeLayerMetadata(metadata, features);

        // 3. 构建样式应用函数
        const managedLayerState = {
            name,
            autoLabel: !!autoLabel,
            labelVisible: initialLabelVisible,
            metadata: normalizedMetadata,
            styleConfig: normalizedStyle,
            labelStyleCache: new globalThis.Map(),
        };

        const id = createManagedLayerId();
        features.forEach((feature, index) => ensureFeatureId(feature, name, index));

        // 4. 备份 feature 级样式 → 再 setStyle(null)
        //    OL：feature 有具体 Style 时会**绕过** layer style，导致标注层永不绘制。
        //    备份进 WeakMap + FeatureStyleStore，几何层再还原「去文字」的原样式。
        const originalFeatureStyles = new WeakMap();
        try {
            const featureStyleStore = useFeatureStyleStore();
            features.forEach((f) => {
                const featureId = getFeatureIdFromFeature(f);
                const s = f.getStyle?.() ?? null;
                if (s && !(Array.isArray(s) && s.length === 0) && typeof s !== 'function') {
                    originalFeatureStyles.set(f, s);
                }
                if (featureStyleStore && typeof featureStyleStore.saveOriginalStyle === 'function' && featureId) {
                    featureStyleStore.saveOriginalStyle(id, featureId, s ?? null);
                }
                try {
                    f.setStyle(null);
                } catch {
                    /* ignore */
                }
            });
        } catch (error) {
            console.warn('[useCreateManagedVectorLayer] backup/clear feature styles failed:', error);
            features.forEach((f) => {
                try {
                    f.setStyle(null);
                } catch {
                    /* ignore */
                }
            });
        }

        managedLayerState.originalFeatureStyles = originalFeatureStyles;

        // 5. 创建双层：几何层（DATA）+ 标注层（DATA_LABEL）——夹心：数据几何 < 瓦片标注 < 数据标注
        // 绘制顺序：OL VectorSource 迭代是 RBush 空间序（getFeatures 注明 random order），
        // 数组顺序对 Canvas 渲染无效；KML 导入会在要素上写 _drawRank（对象自有属性，
        // 不进 getProperties），此处经 renderOrder 生效（序号小先画垫底）。无序号图层
        // 保持 undefined，走默认 RBush 顺序（现状不变）。
        const rankOf = (feature) => {
            const rank = feature?._drawRank;
            return typeof rank === 'number' && Number.isFinite(rank)
                ? rank
                : Number.MAX_SAFE_INTEGER;
        };
        const drawRankComparator =
            features.some((feature) => Number.isFinite(feature?._drawRank))
                ? (first, second) => rankOf(first) - rankOf(second)
                : undefined;
        if (drawRankComparator) {
            console.warn(
                `[图层创建] "${name}" 已启用绘制顺序（${features.length} 个要素，序号小先画）`,
            );
        }
        const useWebGL = features.length > WEBGL_RENDER_THRESHOLD;
        let layer;
        let labelLayer = null;

        if (useWebGL) {
            const { default: WebGLVectorLayer } = await import('ol/layer/WebGLVector');
            // WebGL 路径：无法拆标注，几何+文字同层，z 取 DATA
            layer = new WebGLVectorLayer({
                source: new VectorSource({ features }),
                zIndex: Z_BAND.DATA,
                style: WEBGL_DEFAULT_STYLE,
                properties: { name, _useWebGL: true },
            });
        } else {
            const sharedSource = new VectorSource({ features });
            layer = new VectorLayer({
                source: sharedSource,
                zIndex: Z_BAND.DATA,
                // 几何层：还原备份的 KML 样式（去 Text）
                style: geometryStyleBuilder(managedLayerState),
                properties: { name },
                ...(drawRankComparator ? { renderOrder: drawRankComparator } : null),
            });
            labelLayer = new VectorLayer({
                source: sharedSource,
                zIndex: Z_BAND.DATA_LABEL,
                style: labelStyleBuilder(managedLayerState),
                properties: { name: `${name} · 标注`, isLabelLayer: true },
                ...(drawRankComparator ? { renderOrder: drawRankComparator } : null),
            });
        }

        // 6. 序列化要素并应用 ID
        const serializedFeatures = serializeManagedFeatures(features, name);

        // 7. 将图层添加到地图
        layer.set?.('managedLayerId', id);
        layer.set?.('sourceType', sourceType);
        mapInstanceRef.value.addLayer(layer);
        if (labelLayer) {
            labelLayer.set?.('managedLayerId', id);
            labelLayer.set?.('sourceType', sourceType);
            labelLayer.setVisible?.(initialLabelVisible);
            mapInstanceRef.value.addLayer(labelLayer);
        }

        // 同时更新 DataManager（数据与渲染分离架构）
        let dataManagerId = null;
        if (dataManager) {
            dataManagerId = dataManager.addLayer({
                name,
                type,
                sourceType,
                features,
                metadata: normalizedMetadata,
            });
        }

        userDataLayers.push({
            id,
            name,
            type,
            sourceType,
            order: userDataLayers.length,
            visible: true,
            opacity: 1,
            featureCount: features.length,
            features: serializedFeatures,
            autoLabel: managedLayerState.autoLabel,
            labelVisible: initialLabelVisible,
            metadata: normalizedMetadata,
            styleConfig: normalizedStyle,
            labelStyleCache: managedLayerState.labelStyleCache,
            /** feature → 导入时备份的原 Style（几何层还原 KML 样式用） */
            originalFeatureStyles,
            layer,
            /** 数据标注层（DATA_LABEL 带）；WebGL 大数据路径为 null */
            labelLayer,
            dataManagerId,
        });

        // 8. 触发层索引刷新和外部事件
        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();

        // 9. 可选执行视图适配
        if (fitView) {
            mapInstanceRef.value.getView().fit(layer.getSource().getExtent(), {
                padding: [50, 50, 50, 50],
                duration: 1000,
            });
        }

        return id;
    }

    return {
        createManagedVectorLayer,
    };
}
