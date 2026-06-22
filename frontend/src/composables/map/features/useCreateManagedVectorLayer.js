import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { useFeatureStyleStore } from '../../../stores/useFeatureStyleStore';
import { getFeatureIdFromFeature } from '../../../utils/map/featureKey';

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
    const { normalizeStyleConfig, buildManagedLayerStyle } = styleHelpers;

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
     * @param {boolean} params.autoLabel - Whether to enable auto labels
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
        autoLabel = false,
        metadata = null,
        fitView = false,
    }) {
        if (!mapInstanceRef.value || !features?.length) return null;

        // 1. 规范化样式配置
        const normalizedStyle = normalizeStyleConfig(styleConfig || styleTemplates.classic);
        const labelVisible = !!autoLabel;

        // 2. 规范化元数据
        const normalizedMetadata = normalizeLayerMetadata(metadata, features);

        // 3. 构建样式应用函数
        const managedLayerState = {
            name,
            autoLabel: !!autoLabel,
            labelVisible,
            metadata: normalizedMetadata,
            styleConfig: normalizedStyle,
            labelStyleCache: new globalThis.Map(),
        };

        const id = createManagedLayerId();
        features.forEach((feature, index) => ensureFeatureId(feature, name, index));

        // 4. 清除要素上的残留样式（如 KML 解析器设置的空数组/透明样式），
        //    确保图层的 buildManagedLayerStyle 样式函数生效
        // ★ 改造（2026-06-21）：先备份原始样式到 useFeatureStyleStore，
        //    避免后续 setStyle(null) 后 KML/自定义样式永久丢失
        try {
            const featureStyleStore = useFeatureStyleStore();
            if (featureStyleStore && typeof featureStyleStore.saveOriginalStyle === 'function') {
                features.forEach((f) => {
                    const featureId = getFeatureIdFromFeature(f);
                    if (featureId) {
                        const s = f.getStyle();
                        featureStyleStore.saveOriginalStyle(id, featureId, s ?? null);
                    }
                });
            }
        } catch (error) {
            console.warn('[useCreateManagedVectorLayer] saveOriginalStyle failed:', error);
        }

        features.forEach((f) => {
            const s = f.getStyle();
            // 清除：undefined、null、空数组、Function（让图层样式函数接管）
            if (!s || (Array.isArray(s) && s.length === 0) || typeof s === 'function') {
                f.setStyle(null);
            }
        });

        // 5. 创建 VectorLayer（根据要素数量选择 Canvas 或 WebGL 渲染）
        const useWebGL = features.length > WEBGL_RENDER_THRESHOLD;
        let layer;

        if (useWebGL) {
            // WebGL 渲染：性能更好，适合大数据量
            const { default: WebGLVectorLayer } = await import('ol/layer/WebGLVector');
            layer = new WebGLVectorLayer({
                source: new VectorSource({ features }),
                zIndex: 120,
                style: WEBGL_DEFAULT_STYLE,
                properties: { name, _useWebGL: true },
            });
        } else {
            // Canvas 渲染：功能完整，适合小数据量
            layer = new VectorLayer({
                source: new VectorSource({ features }),
                zIndex: 120,
                style: buildManagedLayerStyle(managedLayerState),
                properties: { name },
            });
        }

        // 6. 序列化要素并应用 ID
        const serializedFeatures = serializeManagedFeatures(features, name);

        // 7. 将图层添加到地图

        // 8. 创建及登记层数据记录
        layer.set?.('managedLayerId', id);
        layer.set?.('sourceType', sourceType);
        mapInstanceRef.value.addLayer(layer);

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
            labelVisible,
            metadata: normalizedMetadata,
            styleConfig: normalizedStyle,
            labelStyleCache: managedLayerState.labelStyleCache,
            layer,
            dataManagerId, // 保存 DataManager 的 ID，用于数据操作
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
