/**
 * 地图事件处理统一库
 * 
 * 功能：
 * - 地图事件绑定（pointermove, singleclick, contextmenu, 坐标更新等）
 * - 坐标同步管理
 * - 右键菜单控制
 * - 移动端和桌面端事件兼容
 * 
 * 依赖注入参数：
 * - mapInstanceRef: OpenLayers Map 实例 ShallowRef
 * - currentCoordinateRef: 当前坐标响应式状态 ref
 * - currentZoomRef: 当前缩放级别响应式状态 ref
 * - emit: Vue emit 函数（用于 feature-selected）
 * - getDrawInteraction: 获取绘图交互的函数
 * - getSketchFeature: 获取草稿要素的函数
 * - queryRasterValueAtCoordinateRef: 栅格值查询函数的 ref（支持延迟初始化）
 * - rightDragZoomControllerRef: 右拖缩放控制器 ref { value: controller }
 * - isAttributeQueryEnabledRef: 属性查询启用状态 ref
 * - tooltipRef: 提示工具对象 { helpTooltipEl, helpTooltipOverlay }
 * - syncAttributeTableMapExtent: 属性表范围同步函数
 * - pendingBusPickRef: 待处理的公交选点 ref
 * - pendingReverseGeocodePickRef: 待处理的逆地理编码选点 ref
 * - busPickSource: 公交选点图层的 VectorSource
 */
/**
 * 地图事件处理统一库
 */

import { toLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import { Point, Polygon } from 'ol/geom';
// 新增：导入 Vue nextTick 解决生命周期时序问题
import { nextTick } from 'vue';

export function createMapEventHandlers({
    mapInstanceRef,
    currentCoordinateRef,
    currentZoomRef,
    emit,
    getDrawInteraction,
    getSketchFeature,
    queryRasterValueAtCoordinateRef,
    rightDragZoomControllerRef,
    isAttributeQueryEnabledRef,
    tooltipRef,
    syncAttributeTableMapExtent,
    pendingBusPickRef,
    pendingReverseGeocodePickRef,
    busPickSource
}) {
    function updateCurrentCoordinate(olCoordinate) {
        if (!olCoordinate || olCoordinate.length < 2) return;
        const lonLat = toLonLat(olCoordinate);
        if (currentCoordinateRef?.value !== undefined) {
            currentCoordinateRef.value = { lng: lonLat[0], lat: lonLat[1] };
        }
    }

    function bindMapEvents() {
        const map = mapInstanceRef?.value;
        if (!map) return;
        const viewport = map.getViewport();

        // ✅ 修复 Canvas 警告（正确时机：地图渲染后）
        map.on('postrender', () => {
            const canvas = viewport.querySelector('canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx && !ctx.willReadFrequently) {
                    ctx.willReadFrequently = true;
                }
            }
        });

        // ========== pointermove 事件 ==========
        map.on('pointermove', (evt) => {
            if (evt.dragging) return;
            const coordinate = evt.coordinate;
            if (tooltipRef?.helpTooltipEl) {
                const sketchFeature = getSketchFeature?.();
                const tooltipText = sketchFeature ?
                    (sketchFeature.getGeometry?.() instanceof Polygon ? '双击结束多边形' : '双击结束测距') :
                    '单击开始绘制';
                tooltipRef.helpTooltipEl.innerHTML = tooltipText;
                tooltipRef.helpTooltipOverlay?.setPosition?.(coordinate);
                tooltipRef.helpTooltipEl.classList.remove('hidden');
            }
        });

        // ========== mouseout 事件 ==========
        viewport.addEventListener('mouseout', () => {
            if (tooltipRef?.helpTooltipEl) tooltipRef.helpTooltipEl.classList.add('hidden');
        });

        // ========== singleclick 事件 ==========
        map.on('singleclick', async (evt) => {
            const pendingBusPick = pendingBusPickRef?.value;
            if (pendingBusPick) {
                const lonLat = toLonLat(evt.coordinate);
                const pickType = pendingBusPick.type;
                busPickSource?.getFeatures?.().forEach(f => f.get('busPickType') === pickType && busPickSource.removeFeature(f));
                busPickSource?.addFeature?.(new Feature({ geometry: new Point(evt.coordinate), busPickType: pickType }));
                pendingBusPick.resolve({ lng: Number(lonLat[0].toFixed(6)), lat: Number(lonLat[1].toFixed(6)) });
                pendingBusPickRef.value = null;
                return;
            }

            const pendingReverseGeocodePick = pendingReverseGeocodePickRef?.value;
            if (pendingReverseGeocodePick) {
                const lonLat = toLonLat(evt.coordinate);
                pendingReverseGeocodePick.resolve({ lng: Number(lonLat[0].toFixed(6)), lat: Number(lonLat[1].toFixed(6)) });
                pendingReverseGeocodePickRef.value = null;
                return;
            }

            const clickedLonLat = toLonLat(evt.coordinate);
            emit?.('map-click', { lon: Number(clickedLonLat[0].toFixed(6)), lat: Number(clickedLonLat[1].toFixed(6)), source: 'map-singleclick' });

            if (!isAttributeQueryEnabledRef?.value) return;
            const drawInteraction = getDrawInteraction?.();
            if (drawInteraction?.getActive?.()) return;

            const feature = map.forEachFeatureAtPixel(evt.pixel, f => f);
            if (feature) {
                const { geometry, style, ...props } = feature.getProperties();
                emit?.('feature-selected', props);
                return;
            }

            const queryRasterFn = queryRasterValueAtCoordinateRef?.value;
            if (queryRasterFn) {
                const rasterInfo = await queryRasterFn(evt.coordinate);
                rasterInfo && emit?.('feature-selected', rasterInfo);
            }
        });

        // ========== contextmenu 事件 ==========
        viewport.addEventListener('contextmenu', (e) => {
            const controller = rightDragZoomControllerRef?.value;
            if (controller?.shouldSuppressContextMenu?.()) { e.preventDefault(); return; }
            if (!isAttributeQueryEnabledRef?.value) return;
            e.preventDefault();
            const pixel = map.getEventPixel(e);
            const feature = map.forEachFeatureAtPixel(pixel, f => f);
            if (!feature) return;
            const { geometry, style, ...props } = feature.getProperties();
            emit?.('feature-selected', { ...props, 操作提示: '右键选择，可在工具箱中编辑样式' });
        });

        // ========== 缩放/中心事件 ==========
        map.getView().on('change:resolution', () => {
            const zoom = map.getView().getZoom();
            zoom !== undefined && (currentZoomRef.value = Math.round(zoom));
        });

        map.getView().on('change:center', () => {
            updateCurrentCoordinate(map.getView().getCenter());
        });

        // ✅ 修复 宽高0 警告（nextTick 等待 DOM 渲染完成）
        map.on('moveend', async () => {
            updateCurrentCoordinate(map.getView().getCenter());
            syncAttributeTableMapExtent?.();
            await nextTick();
            map.updateSize();
        });

        // ========== 移动端触摸事件 ==========
        viewport.addEventListener('touchmove', () => {
            updateCurrentCoordinate(map.getView().getCenter());
        }, false);
    }

    return { bindMapEvents };
}