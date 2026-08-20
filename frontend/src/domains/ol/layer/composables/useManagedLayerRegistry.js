import { Z_BAND } from '../zIndexBands';

export function useManagedLayerRegistry({ emit, userDataLayers, drawSource, styleTemplates }) {
    let userLayerSeed = 1;

    /**
     * 图层内容修订戳（layerId → { featuresRef, featureCount, name, revision }）。
     *
     * 契约：所有内容级变更（几何编辑/坐标转换/搜索聚合/路线等）都会整体重新赋值
     * item.features 数组（serializeManagedFeatures 返回新数组），因此在唯一出站漏斗
     * emitUserLayersChange 处比较「features 引用 + featureCount + name」即可单点判定
     * 内容是否变化，变化则 revision 递增。下游（属性表 attrStore 等）据此跳过
     * 未变图层的全量快照重建。
     *
     * 注意：若未来新增"就地修改 feature 属性而不重建数组"的逻辑，必须改为重新赋值
     * features 数组（或在此扩展比较维度），否则修订号不会递增、下游将读到旧数据。
     */
    const layerContentStamps = new Map();

    function resolveLayerRevision(item) {
        const id = String(item?.id || '');
        if (!id) return 0;
        const featuresRef = Array.isArray(item.features) ? item.features : null;
        const featureCount = Number(item.featureCount) || 0;
        const name = String(item.name || '');
        const prev = layerContentStamps.get(id);
        if (!prev) {
            layerContentStamps.set(id, { featuresRef, featureCount, name, revision: 0 });
            return 0;
        }
        if (
            prev.featuresRef !== featuresRef ||
            prev.featureCount !== featureCount ||
            prev.name !== name
        ) {
            prev.featuresRef = featuresRef;
            prev.featureCount = featureCount;
            prev.name = name;
            prev.revision += 1;
        }
        return prev.revision;
    }

    /** 清理已移除图层的修订戳，防止 Map 随会话增长 */
    function pruneLayerContentStamps() {
        const liveIds = new Set(userDataLayers.map((item) => String(item?.id || '')));
        layerContentStamps.forEach((_value, id) => {
            if (!liveIds.has(id)) layerContentStamps.delete(id);
        });
    }

    function normalizeEmittedStandardTocItem(item) {
        const candidate = item?.standardTocItem || item?.metadata?.standardTocItem;
        if (!candidate || typeof candidate !== 'object') return null;

        return {
            ...candidate,
            id: String(item?.id || candidate.id || ''),
            name: String(item?.name || candidate.name || ''),
        };
    }

    function createManagedLayerId() {
        return `layer_${userLayerSeed++}`;
    }

    function emitUserLayersChange() {
        pruneLayerContentStamps();
        emit(
            'user-layers-change',
            userDataLayers.map((item) => ({
                standardTocItem: normalizeEmittedStandardTocItem(item),
                id: item.id,
                // 内容修订号：features 引用/数量/名称未变则保持不变，下游可据此跳过重建
                revision: resolveLayerRevision(item),
                name: item.name,
                type: item.type,
                sourceType: item.sourceType || 'upload',
                order: item.order ?? 0,
                visible: item.visible,
                featureCount: item.featureCount,
                features: Array.isArray(item.features) ? item.features : [],
                opacity: item.opacity ?? 1,
                autoLabel: !!item.autoLabel,
                labelVisible: item.labelVisible !== false,
                category: item.metadata?.category,
                crs: item.metadata?.crs ? String(item.metadata.crs).toLowerCase() : undefined,
                longitude: Number.isFinite(item.metadata?.longitude)
                    ? item.metadata.longitude
                    : undefined,
                latitude: Number.isFinite(item.metadata?.latitude)
                    ? item.metadata.latitude
                    : undefined,
                styleConfig: item.styleConfig || { ...styleTemplates.classic },
            })),
        );
    }

    function emitGraphicsOverview() {
        emit('graphics-overview', {
            drawCount: drawSource.getFeatures().length,
            uploadCount: userDataLayers.filter((item) => item?.sourceType === 'upload').length,
            layers: userDataLayers.map((item) => ({
                id: item.id,
                name: item.name,
                visible: item.visible,
                featureCount: item.featureCount,
            })),
        });
    }

    /**
     * 刷新全部托管图层的 zIndex（见 @ol/layer/zIndexBands）。
     *
     * TOC 数据管理中的拖拽顺序（= 数组顺序 = order 字段）覆写默认层级：
     * TOC 顶部图层（index 0）获得最高 zIndex，最先显示；
     * 全部图层统一落在数据带 [Z_BAND.DATA, Z_BAND.DATA + N - 1]，
     * 位于底图带（含卷帘）之上、区划/标注/系统带之下（容量 600 层内）。
     */
    function refreshUserLayerZIndex() {
        const total = userDataLayers.length;
        userDataLayers.forEach((item, index) => {
            item.order = index;
            const zIndex = Z_BAND.DATA + (total - 1 - index);
            item.layer?.setZIndex?.(zIndex);
        });
    }

    function addManagedLayerRecord({
        name,
        type,
        sourceType,
        layer,
        featureCount = 1,
        features = [],
        styleConfig = null,
        metadata = null,
        standardTocItem = null,
    }) {
        const id = createManagedLayerId();
        layer?.set?.('managedLayerId', id);
        layer?.set?.('sourceType', sourceType);
        // 优先使用顶层参数，回退到 metadata 内嵌的 standardTocItem
        const resolvedStandardTocItem = standardTocItem || metadata?.standardTocItem || null;
        userDataLayers.push({
            id,
            name,
            type,
            sourceType,
            order: userDataLayers.length,
            visible: true,
            opacity: 1,
            featureCount,
            features,
            styleConfig,
            metadata,
            standardTocItem: resolvedStandardTocItem,
            layer,
        });
        refreshUserLayerZIndex();
        emitUserLayersChange();
        emitGraphicsOverview();
        return id;
    }

    return {
        createManagedLayerId,
        emitUserLayersChange,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
        addManagedLayerRecord,
    };
}
