/**
 * 功能名称：OpenLayers 地图绘图、几何编辑、交互工具与逆地理拾点编排 Composable
 * 说    明：从 MapContainer 抽离绘图/测量/高级绘制/几何编辑/交互选点与视图缩放逻辑，
 *           保证组件容器仅作依赖装配与视图代理。
 */
import { ref, type Ref } from 'vue';
import { createEmpty, extend as extendExtent, isEmpty as isExtentEmpty } from 'ol/extent';
import type Map from 'ol/Map';
import type VectorSource from 'ol/source/Vector';

import { createDrawMeasureFeature } from '@ol/drawing/composables/useDrawMeasure';
import { createAdvancedDrawingFeature } from '@ol/drawing/composables/useAdvancedDrawing';
import { createGeometryEditFeature } from '@ol/drawing/composables/useGeometryEdit';
import {
    isAdvancedDrawingType,
    isSelectEditTool,
    normalizeDrawingStyleParams,
} from '@ol/drawing/registry/drawingToolRegistry';
import { wgs84ToGcj02 } from '@common/data-import/crs/coordTransform';
import { apiReverseGeocodeWithFallback } from '@/api';
import { STYLE_TEMPLATES } from '@/constants';

export interface UseMapDrawingActionsDeps {
    mapInstanceRef: Ref<Map | null>;
    drawSource: VectorSource;
    userDataLayers: any[];
    isAttributeQueryEnabled: Ref<boolean>;
    isReverseGeocodePickMode: Ref<boolean>;
    pendingReverseGeocodePickRef: Ref<any>;
    tiandituTkRef: Ref<string>;
    message: any;
    emit: (event: any, ...args: any[]) => void;
    createStyleFromConfig: (...args: any[]) => any;
    mergeStyleConfig: (...args: any[]) => any;
    applyManagedLayerStyle: (...args: any[]) => any;
    createManagedVectorLayer: (...args: any[]) => any;
    serializeManagedFeatures: (...args: any[]) => any;
    refreshUserLayerZIndex: () => void;
    emitUserLayersChange: () => void;
    emitGraphicsOverview: () => void;
    startReverseGeocodePick: () => Promise<any>;
    drawPointByCoordinatesInput: (payload: any) => any;
    getDrawLayerInstance: () => any;
    getRemoveManagedLayerById: () => (...args: any[]) => any;
}

export function createMapDrawingActions(deps: UseMapDrawingActionsDeps) {
    const {
        mapInstanceRef,
        drawSource,
        userDataLayers,
        isAttributeQueryEnabled,
        isReverseGeocodePickMode,
        pendingReverseGeocodePickRef,
        tiandituTkRef,
        message,
        emit,
        createStyleFromConfig,
        mergeStyleConfig,
        applyManagedLayerStyle,
        createManagedVectorLayer,
        serializeManagedFeatures,
        refreshUserLayerZIndex,
        emitUserLayersChange,
        emitGraphicsOverview,
        startReverseGeocodePick,
        drawPointByCoordinatesInput,
        getDrawLayerInstance,
        getRemoveManagedLayerById,
    } = deps;

    const drawStyleConfig = ref<Record<string, any>>({ ...STYLE_TEMPLATES.classic });
    const drawingStyleParams = ref<Record<string, any>>(normalizeDrawingStyleParams({}));
    const drawGraphicSeedRef = { value: 1 };
    const tooltipRef = {
        helpTooltipEl: null as HTMLElement | null,
        helpTooltipOverlay: null as any,
    };

    const {
        activateInteraction: activateDrawMeasure,
        clearInteractions: clearDrawMeasureInteractions,
        clearAllGraphics,
        getDrawInteraction,
        getSketchFeature,
    } = createDrawMeasureFeature({
        mapInstanceRef,
        drawSource,
        createStyleFromConfig,
        createManagedVectorLayer,
        emitGraphicsOverview,
        refreshUserLayerZIndex,
        emitUserLayersChange,
        removeManagedLayerById: (...args: any[]) => getRemoveManagedLayerById()(...args),
        drawStyleConfig,
        drawingStyleParamsRef: drawingStyleParams,
        drawGraphicSeedRef,
        userDataLayers,
        tooltipRef,
    });

    // 高级绘制：矩形/椭圆/圆/箭头等
    const {
        activateAdvancedDrawing,
        clearAdvancedDrawingInteractions,
        undoLastDrawingLayer,
    } = createAdvancedDrawingFeature({
        mapInstanceRef,
        drawSource,
        createManagedVectorLayer,
        emitGraphicsOverview,
        emitUserLayersChange,
        drawStyleConfig,
        drawingStyleParamsRef: drawingStyleParams,
        drawGraphicSeedRef,
        userDataLayers,
    });

    // 几何编辑：Select + Modify + 删除选中
    const {
        activateGeometryEdit,
        clearGeometryEditInteractions,
        deleteSelectedDrawingFeature,
        updateSelectedDrawingStyle,
        getSelectedEditFeature,
    } = (createGeometryEditFeature as (opts: any) => any)({
        mapInstanceRef,
        userDataLayers,
        serializeManagedFeatures,
        emitUserLayersChange,
        emitGraphicsOverview,
        removeManagedLayerById: (...args: any[]) => getRemoveManagedLayerById()(...args),
        onSelectionChange: (payload: any) => {
            if (!payload) return;
            emit('feature-selected', {
                编辑模式: '几何编辑',
                绘制类型: payload.drawType || '未知',
                图层名称: payload.layerItem?.name || '未知',
            });
        },
    });

    /**
     * 统一清理绘制/测量/高级绘制/几何编辑交互
     */
    function clearAllDrawingInteractions(): void {
        clearDrawMeasureInteractions();
        clearAdvancedDrawingInteractions();
        clearGeometryEditInteractions();
    }

    /**
     * TOC 图层目录「编辑要素」入口：对指定托管图层启动几何编辑会话
     * @param layerId - 托管图层 ID；为空则等价于绘制面板的全图层选择编辑
     * @returns 是否成功进入编辑模式
     */
    function activateGeometryEditForLayer(layerId = ''): boolean {
        clearAllDrawingInteractions();
        const activated = activateGeometryEdit({ layerId: String(layerId || '').trim() });
        if (activated) {
            message.info('已进入要素编辑模式：点击要素拖动顶点，Delete 删除选中，Esc 退出');
        }
        return activated;
    }

    // [隶属] 图层管理-绘图样式
    // [作用] 更新绘图图层及历史绘制图层的样式。
    // [交互] 影响绘图工具与图层管理面板样式显示。
    function setDrawStyle(styleCfg: any): void {
        drawStyleConfig.value = mergeStyleConfig(drawStyleConfig.value, styleCfg);
        // 同步到高级绘制参数，保证 DrawPanel 样式区可影响后续绘制
        drawingStyleParams.value = normalizeDrawingStyleParams({
            ...drawingStyleParams.value,
            ...(styleCfg || {}),
            radius: styleCfg?.pointRadius ?? styleCfg?.radius ?? drawingStyleParams.value.radius,
            fillOpacity:
                styleCfg?.fillOpacity ??
                (Number.isFinite(styleCfg?.fillOpacityPct)
                    ? styleCfg.fillOpacityPct / 100
                    : drawingStyleParams.value.fillOpacity),
        });
        const drawLayerInstance = getDrawLayerInstance();
        if (drawLayerInstance) {
            drawLayerInstance.setStyle(createStyleFromConfig(drawStyleConfig.value));
        }
        userDataLayers
            .filter((item) => item.sourceType === 'draw')
            .forEach((item) => {
                // 若图层内存在要素级 styleParams，则保留 feature 自身样式，只更新图层默认配置
                item.styleConfig = mergeStyleConfig(item.styleConfig, styleCfg);
                item.labelStyleCache = new globalThis.Map();
                applyManagedLayerStyle(item);
            });
        emitUserLayersChange();
    }

    /**
     * 更新绘制样式参数（优先作用于选中要素，否则影响后续绘制）
     */
    function updateDrawingStyleParams(stylePatch: Record<string, any> = {}): void {
        drawingStyleParams.value = normalizeDrawingStyleParams({
            ...drawingStyleParams.value,
            ...(stylePatch || {}),
        });
        // 同步基础 drawStyleConfig，兼容旧 TOC 样式入口
        drawStyleConfig.value = mergeStyleConfig(drawStyleConfig.value, {
            fillColor: drawingStyleParams.value.fillColor,
            strokeColor: drawingStyleParams.value.strokeColor,
            fillOpacity: drawingStyleParams.value.fillOpacity,
            strokeWidth: drawingStyleParams.value.strokeWidth,
            pointRadius: drawingStyleParams.value.radius,
        });
        if (getSelectedEditFeature()) {
            updateSelectedDrawingStyle(stylePatch);
        }
    }

    // [隶属] 底部控制-图形视野
    // [作用] 将视图缩放到所有绘制/上传图层的联合范围。
    // [交互] 由工具栏 ZoomToGraphics 与外部调用触发。
    function zoomToGraphics(): void {
        if (!mapInstanceRef.value) return;
        const unionExtent = createEmpty();

        const drawExtent = drawSource.getExtent();
        if (drawExtent && drawExtent.every((v: number) => Number.isFinite(v))) {
            extendExtent(unionExtent, drawExtent);
        }

        userDataLayers.forEach((item) => {
            const ext = item.layer.getSource()?.getExtent();
            if (ext && ext.every((v: number) => Number.isFinite(v))) {
                extendExtent(unionExtent, ext);
            }
        });

        if (isExtentEmpty(unionExtent)) return;

        mapInstanceRef.value.getView().fit(unionExtent, {
            padding: [80, 80, 80, 80],
            duration: 900,
            maxZoom: 18,
        });
    }

    async function startReverseGeocodePickAndDraw(): Promise<void> {
        const picked = await startReverseGeocodePick();
        if (!picked || !Number.isFinite(picked.lng) || !Number.isFinite(picked.lat)) {
            throw new Error('逆地理编码选点失败，请重试');
        }

        // 长时间等待用户点击后，地图可能已卸载
        if (!mapInstanceRef.value) {
            throw new Error('地图已卸载');
        }

        let reverseResult: any;
        try {
            const reverseResponse = await apiReverseGeocodeWithFallback(picked.lng, picked.lat, {
                tiandituTk: tiandituTkRef.value, // 读取响应式 ref，确保 token 轮换后使用最新值
                silent: true,
            });
            reverseResult = reverseResponse?.data || null;
        } catch {
            reverseResult = null;
        }

        const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
        const layerName =
            formattedAddress || `逆编码点_${picked.lng.toFixed(6)}_${picked.lat.toFixed(6)}`;
        const businessAreaText = Array.isArray(reverseResult?.businessAreas)
            ? reverseResult.businessAreas
                  .map((item: any) => String(item?.name || '').trim())
                  .filter(Boolean)
                  .join('、')
            : '';

        // 高德 API 需要 GCJ-02 坐标，将地图拾取的 WGS-84 转为 GCJ-02 再存储
        const [gcjLng, gcjLat] = wgs84ToGcj02(picked.lng, picked.lat);
        drawPointByCoordinatesInput({
            lng: gcjLng,
            lat: gcjLat,
            crsType: 'gcj02',
            displayName: layerName,
            label: layerName,
            layerName,
            properties: {
                来源: '地图逆地理编码拾点',
                逆地理编码地址: formattedAddress || '未解析',
                逆地理编码省: String(reverseResult?.province || '').trim() || '未知',
                逆地理编码市: String(reverseResult?.city || '').trim() || '未知',
                逆地理编码区县: String(reverseResult?.district || '').trim() || '未知',
                逆地理编码乡镇: String(reverseResult?.township || '').trim() || '未知',
                逆地理编码商圈: businessAreaText || '无',
                逆地理编码服务: String(reverseResult?.provider || '').trim() || 'unknown',
            },
        });

        if (formattedAddress) {
            message.success(`逆地理编码成功：${formattedAddress}`);
        } else {
            message.warning('逆地理编码未返回地址，已按坐标绘制点位。');
        }
    }

    // [隶属] 组件交互-绘图与测量
    // [作用] 根据工具类型激活绘图、测量、清理、属性查询等交互。
    // [交互] 对外 emit(feature-selected/graphics-overview) 并被父组件工具箱调用。
    function activateInteraction(type: string): void {
        clearAllDrawingInteractions();
        if (!mapInstanceRef.value) return;

        // 切换到非选点交互时，退出选点模式
        if (type !== 'ReverseGeocodePick') {
            isReverseGeocodePickMode.value = false;
        }

        if (type !== 'ReverseGeocodePick' && pendingReverseGeocodePickRef.value?.reject) {
            pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
            pendingReverseGeocodePickRef.value = null;
        }

        if (type === 'AttributeQuery') {
            isAttributeQueryEnabled.value = true;
            return;
        }

        if (type === 'CloseTools') {
            isAttributeQueryEnabled.value = false;
            return;
        }

        if (type === 'ReverseGeocodePick') {
            // Toggle：已在选点模式 → 取消当前选点并退出
            if (isReverseGeocodePickMode.value) {
                isReverseGeocodePickMode.value = false;
                if (pendingReverseGeocodePickRef.value?.reject) {
                    pendingReverseGeocodePickRef.value.reject(new Error('逆地理编码选点已取消'));
                    pendingReverseGeocodePickRef.value = null;
                }
                message.info('已退出标注模式');
                return;
            }

            isReverseGeocodePickMode.value = true;
            try {
                message.info('请在地图上单击一个点，系统将自动逆地理编码并绘制。', {
                    closable: true,
                    duration: 4500,
                });
                startReverseGeocodePickAndDraw()
                    .catch((error) => {
                        const detail = error instanceof Error ? error.message : '未知错误';
                        // 静默忽略：用户主动取消、地图已卸载、地图未初始化
                        if (/(取消|cancel|地图已卸载|地图尚未初始化)/i.test(detail)) return;
                        message.warning(`逆地理编码选点未完成：${detail}`);
                    })
                    .finally(() => {
                        isReverseGeocodePickMode.value = false;
                    });
            } catch {
                isReverseGeocodePickMode.value = false;
            }
            return;
        }

        if (type === 'ZoomToGraphics') {
            zoomToGraphics();
            return;
        }

        if (type === 'ViewGraphics') {
            emitGraphicsOverview();
            emit('feature-selected', {
                绘制图形数量: drawSource.getFeatures().length,
                上传图层数量: userDataLayers.length,
                上传图层名称: userDataLayers.map((item) => item.name).join('、') || '无',
            });
            return;
        }

        if (type === 'Clear') {
            Promise.resolve(clearAllGraphics()).catch((e) =>
                console.error('[Map] clearAllGraphics failed:', e),
            );
            return;
        }

        if (type === 'UndoLastDrawing') {
            Promise.resolve(
                undoLastDrawingLayer((...args: any[]) => getRemoveManagedLayerById()(...args)),
            ).catch((error) => {
                console.warn('[MapContainer] undoLastDrawingLayer failed:', error);
            });
            return;
        }

        // 选择编辑：Select + Modify（全部矢量托管图层，路线/栅格/WebGL 除外）
        if (isSelectEditTool(type)) {
            activateGeometryEdit();
            return;
        }

        // 高级绘制：矩形/椭圆/圆/箭头等
        if (isAdvancedDrawingType(type)) {
            activateAdvancedDrawing(type);
            return;
        }

        // 其他类型则激活基础绘图/测量（Point/LineString/Polygon/MeasureDistance/MeasureArea）
        (activateDrawMeasure as (...args: any[]) => void)(type, (propsPayload: any) =>
            emit('feature-selected', propsPayload),
        );
    }

    // [隶属] 组件交互-绘图与测量
    // [作用] 清理当前激活的绘图/捕捉交互和提示覆盖物。
    function clearInteractions(): void {
        clearAllDrawingInteractions();
    }

    return {
        drawStyleConfig,
        drawingStyleParams,
        tooltipRef,
        getDrawInteraction,
        getSketchFeature,
        deleteSelectedDrawingFeature,
        updateSelectedDrawingStyle,
        clearAllDrawingInteractions,
        activateGeometryEditForLayer,
        setDrawStyle,
        updateDrawingStyleParams,
        zoomToGraphics,
        activateInteraction,
        clearInteractions,
    };
}
