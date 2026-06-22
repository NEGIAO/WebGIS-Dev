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
import { unByKey } from 'ol/Observable';
import { normalizeHtmlAttributes } from './useLayerMetadataNormalization';
import { getFeatureIdFromFeature } from '../../../utils/map/featureKey';
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
    busPickSource,
    highlightManagedFeature,
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

        // 保存 viewport 上的匿名监听器引用，便于卸载时清理
        const _mouseoutHandler = () => {
            if (tooltipRef?.helpTooltipEl) tooltipRef.helpTooltipEl.classList.add('hidden');
        };
        const _contextmenuHandler = (e) => {
            const controller = rightDragZoomControllerRef?.value;
            if (controller?.shouldSuppressContextMenu?.()) {
                e.preventDefault();
                return;
            }
            if (!isAttributeQueryEnabledRef?.value) return;
            e.preventDefault();
            const pixel = map.getEventPixel(e);
            const feature = map.forEachFeatureAtPixel(pixel, (f) => f);
            if (!feature) return;
            const { geometry: _geometry, style: _style, ...props } = feature.getProperties();
            emit?.('feature-selected', {
                ...normalizeHtmlAttributes(props),
                操作提示: '右键选择，可在工具箱中编辑样式',
            });
        };
        const _touchmoveHandler = () => {
            updateCurrentCoordinate(map.getView().getCenter());
        };

        // ✅ 修复 Canvas 警告（正确时机：地图渲染后）
        const olKeys = [];
        const postrenderKey = map.on('postrender', () => {
            const canvas = viewport.querySelector('canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx && !ctx.willReadFrequently) {
                    ctx.willReadFrequently = true;
                    // [C8] 设置成功后移除 postrender 监听器，避免每帧执行
                    unByKey(postrenderKey);
                    const idx = olKeys.indexOf(postrenderKey);
                    if (idx !== -1) olKeys.splice(idx, 1);
                }
            }
        });
        olKeys.push(postrenderKey);

        // ========== pointermove 事件 ==========
        olKeys.push(map.on('pointermove', (evt) => {
            if (evt.dragging) return;
            const coordinate = evt.coordinate;
            if (tooltipRef?.helpTooltipEl) {
                const sketchFeature = getSketchFeature?.();
                const tooltipText = sketchFeature
                    ? sketchFeature.getGeometry?.() instanceof Polygon
                        ? '双击结束多边形'
                        : '双击结束测距'
                    : '单击开始绘制';
                tooltipRef.helpTooltipEl.innerHTML = tooltipText;
                tooltipRef.helpTooltipOverlay?.setPosition?.(coordinate);
                tooltipRef.helpTooltipEl.classList.remove('hidden');
            }
        }));

        // ========== mouseout 事件 ==========
        viewport.addEventListener('mouseout', _mouseoutHandler);

        // ========== singleclick 事件 ==========
        olKeys.push(map.on('singleclick', async (evt) => {
            const pendingBusPick = pendingBusPickRef?.value;
            if (pendingBusPick) {
                const lonLat = toLonLat(evt.coordinate);
                const pickType = pendingBusPick.type;
                busPickSource
                    ?.getFeatures?.()
                    .forEach(
                        (f) => f.get('busPickType') === pickType && busPickSource.removeFeature(f),
                    );
                busPickSource?.addFeature?.(
                    new Feature({ geometry: new Point(evt.coordinate), busPickType: pickType }),
                );
                pendingBusPick.resolve({
                    lng: Number(lonLat[0].toFixed(6)),
                    lat: Number(lonLat[1].toFixed(6)),
                });
                pendingBusPickRef.value = null;
                return;
            }

            const pendingReverseGeocodePick = pendingReverseGeocodePickRef?.value;
            if (pendingReverseGeocodePick) {
                const lonLat = toLonLat(evt.coordinate);
                pendingReverseGeocodePick.resolve({
                    lng: Number(lonLat[0].toFixed(6)),
                    lat: Number(lonLat[1].toFixed(6)),
                });
                pendingReverseGeocodePickRef.value = null;
                return;
            }

            const clickedLonLat = toLonLat(evt.coordinate);
            emit?.('map-click', {
                lon: Number(clickedLonLat[0].toFixed(6)),
                lat: Number(clickedLonLat[1].toFixed(6)),
                source: 'map-singleclick',
            });

            if (!isAttributeQueryEnabledRef?.value) return;
            const drawInteraction = getDrawInteraction?.();
            if (drawInteraction?.getActive?.()) return;

            // ★ 改造（2026-06-21）：累积所有命中 feature 而非只取第一个，
            //    并通过 Ctrl/Shift 修饰键决定多选模式
            const originalEvent = evt?.originalEvent || null;
            const isCtrlPressed = !!(originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
            const isShiftPressed = !!originalEvent?.shiftKey;
            const selectionMode = isCtrlPressed
                ? 'toggle'
                : isShiftPressed
                    ? 'range'
                    : 'replace';

            const hits = [];
            let clickedFeature = null;
            let clickedLayer = null;
            map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (!f) return false;
                hits.push({ feature: f, layer });
                // 取第一个作为默认响应（避免点空：必须有一个被高亮的）
                if (!clickedFeature) {
                    clickedFeature = f;
                    clickedLayer = layer;
                }
                return false; // false 才会继续遍历；truthy 会让 OL 提前停止
            });

            if (clickedFeature) {
                const { geometry: _geometry, style: _style, ...props } = clickedFeature.getProperties();
                const layerId = String(clickedLayer?.get?.('managedLayerId') || clickedLayer?.get?.('layerId') || '');
                const featureId = getFeatureIdFromFeature(clickedFeature);
                if (layerId && featureId) {
                    highlightManagedFeature?.({ layerId, featureId, mode: selectionMode });
                }
                emit?.('feature-selected', {
                    ...normalizeHtmlAttributes(props),
                    layerId,
                    featureId,
                    mode: selectionMode,
                    totalHits: hits.length,
                });
                return;
            }

            const queryRasterFn = queryRasterValueAtCoordinateRef?.value;
            if (queryRasterFn) {
                const rasterInfo = await queryRasterFn(evt.coordinate);
                if (rasterInfo) emit?.('feature-selected', rasterInfo);
            }
        }));

        // ========== contextmenu 事件 ==========
        viewport.addEventListener('contextmenu', _contextmenuHandler);

        // ========== 缩放/中心事件 ==========
        olKeys.push(map.getView().on('change:resolution', () => {
            const zoom = map.getView().getZoom();
            if (zoom !== undefined) currentZoomRef.value = Math.round(zoom);
        }));

        olKeys.push(map.getView().on('change:center', () => {
            updateCurrentCoordinate(map.getView().getCenter());
        }));

        // ✅ 修复 宽高0 警告（nextTick 等待 DOM 渲染完成）
        olKeys.push(map.on('moveend', async () => {
            updateCurrentCoordinate(map.getView().getCenter());
            syncAttributeTableMapExtent?.();
            await nextTick();
            map.updateSize();
        }));

        // ========== 移动端触摸事件 ==========
        viewport.addEventListener('touchmove', _touchmoveHandler, false);

        // 返回清理函数，组件卸载时移除 viewport 上的监听器
        return function cleanupMapEventHandlers() {
            viewport.removeEventListener('mouseout', _mouseoutHandler);
            viewport.removeEventListener('contextmenu', _contextmenuHandler);
            viewport.removeEventListener('touchmove', _touchmoveHandler);
            olKeys.forEach((key) => unByKey(key));
            olKeys.length = 0;
        };
    }

    return { bindMapEvents };
}
