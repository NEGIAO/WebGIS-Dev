import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

/**
 * [Phase 19]: Managed Vector Layer Creation Composable
 * 
 * 提取创建托管矢量图层的生命周期逻辑
 * 职责：图层创建、要素规范化、样式应用、数据登记
 * 
 * @param {Object} config - Configuration object
 * @param {Ref} config.mapInstanceRef - Map instance reference
 * @param {Array} config.userDataLayers - User data layers registry
 * @param {Object} config.styleHelpers - Style processing functions
 * @param {Object} config.featureHelpers - Feature serialization functions
 * @param {Object} config.metadataHelpers - Metadata normalization functions
 * @param {Object} config.registryHelpers - Layer registry functions
 * @param {Object} config.styleTemplates - Predefined style templates
 * @returns {Object} Contains createManagedVectorLayer function
 */
export function useCreateManagedVectorLayer({
    mapInstanceRef,
    userDataLayers,
    styleHelpers,
    featureHelpers,
    metadataHelpers,
    registryHelpers,
    styleTemplates
}) {
    const {
        normalizeStyleConfig,
        buildManagedLayerStyle
    } = styleHelpers;

    const {
        serializeManagedFeatures,
        ensureFeatureId
    } = featureHelpers;

    const {
        normalizeLayerMetadata
    } = metadataHelpers;

    const {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex
    } = registryHelpers;

    /**
     * 创建并登记托管矢量图层
     * 
     * [流程]:
     * 1. 验证 map 实例和要素数据
     * 2. 规范化样式配置和元数据
     * 3. 创建 VectorLayer 和 VectorSource
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
     * @returns {string|null} Layer ID if created, null if creation failed
     */
    function createManagedVectorLayer({
        name,
        type,
        sourceType,
        features,
        styleConfig,
        autoLabel = false,
        metadata = null,
        fitView = false
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
            labelStyleCache: new globalThis.Map()
        };

        // 4. 创建 VectorLayer
        const layer = new VectorLayer({
            source: new VectorSource({ features }),
            zIndex: 120,
            style: buildManagedLayerStyle(managedLayerState),
            properties: { name }
        });

        // 5. 序列化要素并应用 ID
        const serializedFeatures = serializeManagedFeatures(features, name);
        features.forEach((feature, index) => ensureFeatureId(feature, name, index));

        // 6. 将图层添加到地图
        mapInstanceRef.value.addLayer(layer);

        // 7. 创建及登记层数据记录
        const id = createManagedLayerId();
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
            layer
        });

        // 8. 触发层索引刷新和外部事件
        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();

        // 9. 可选执行视图适配
        if (fitView) {
            mapInstanceRef.value.getView().fit(layer.getSource().getExtent(), {
                padding: [50, 50, 50, 50],
                duration: 1000
            });
        }

        return id;
    }

    return {
        createManagedVectorLayer
    };
}
