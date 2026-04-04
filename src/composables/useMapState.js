import debounce from 'lodash/debounce';
import { onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { LineString } from 'ol/geom';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import { Fill, Stroke, Style, Text } from 'ol/style';

/**
 * 获取数组的第一个元素，如果不是数组则返回原值
 * @param {*} value - 待处理的值
 * @returns {*} 数组首元素或原值
 */
function getFirstValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

/**
 * 将值解析为有限的数字
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的数字，或无法解析时返回 null
 */
function parseNumber(value) {
    const raw = Number(getFirstValue(value));
    return Number.isFinite(raw) ? raw : null;
}

/**
 * 将值解析为整数
 * @param {*} value - 待解析的值
 * @returns {number|null} 解析后的整数，或无法解析时返回 null
 */
function parseInteger(value) {
    const raw = parseNumber(value);
    if (raw === null) return null;
    return Number.isInteger(raw) ? raw : null;
}

/**
 * 将数字格式化为指定小数位数的字符串
 * @param {*} value - 待格式化的值
 * @param {number} fractionDigits - 保留的小数位数
 * @returns {string|null} 格式化后的字符串，或无效时返回 null
 */
function formatNumber(value, fractionDigits) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return null;
    return numberValue.toFixed(fractionDigits);
}

/**
 * 从 URL hash 中解析查询参数
 * @returns {Object} 包含 lng、lat、z、l 的查询参数对象
 */
function parseHashQuery() {
    if (typeof window === 'undefined') return {};
    const hash = String(window.location.hash || '');
    const queryStart = hash.indexOf('?');
    if (queryStart < 0) return {};

    const params = new URLSearchParams(hash.slice(queryStart + 1));
    return {
        lng: params.get('lng'),
        lat: params.get('lat'),
        z: params.get('z'),
        l: params.get('l')
    };
}

/**
 * 地图状态管理组合式函数
 * 负责 URL 同步、图层切换、地形线渲染与视图动画
 * 
 * @param {Object} mapInstance - ShallowRef 包装的 OpenLayers Map 实例
 * @param {Object} options - 配置选项
 * @param {number} [options.defaultZoom=17] - 默认缩放级别
 * @param {number} [options.flyDuration=700] - 飞行动画持续时间（毫秒）
 * @param {number} [options.syncDebounceMs=500] - URL 同步防抖时间（毫秒）
 * @param {Function} [options.getLayerIndex] - 获取当前图层索引的回调函数
 * @param {Function} [options.onLayerIndexChange] - 图层索引变化的回调函数
 * @param {Object} [options.layerListRef] - 图层列表的 ref 对象
 * @param {Object} [options.layerInstances] - 图层实例映射表
 * @param {Array} [options.layerConfigs] - 图层配置数组
 * @param {Function} [options.resolveVisibleLayerIds] - 根据 option id 解析需要显示的图层列表
 * @param {Array} [options.satelliteLayers] - 卫星图层 ID 列表
 * @param {Array} [options.vectorLayers] - 矢量图层 ID 列表
 * @returns {Object} 返回公共 API 集合
 */
export function useMapState(mapInstance, options = {}) {
    const route = useRoute();
    const router = useRouter();

    const {
        defaultZoom = 17,
        flyDuration = 700,
        syncDebounceMs = 500,
        getLayerIndex = () => null,
        onLayerIndexChange = () => {},
        layerListRef = null,
        layerInstances = null,
        layerConfigs = null,
        resolveVisibleLayerIds = null,
        satelliteLayers = ['tianDiTu', 'Google', 'esri', 'google'],
        vectorLayers = ['tianDiTu_vec']
    } = options;

    let moveEndKey = null;
    let graticuleMoveKey = null;
    let graticuleLayer = null;
    let graticuleActive = false;

    const debouncedSyncUrlFromMap = debounce(() => {
        syncUrlFromMap();
    }, syncDebounceMs);

    /**
     * 读取查询参数值（同时支持 router.query 和 hash 查询）
     * @param {string} key - 参数键名
     * @returns {string|null} 参数值
     * @private
     */
    function readQueryValue(key) {
        const routeValue = getFirstValue(route.query?.[key]);
        if (routeValue !== undefined && routeValue !== null && routeValue !== '') {
            return routeValue;
        }
        const hashQuery = parseHashQuery();
        return hashQuery[key];
    }

    /**
     * 解析 URL 为地图状态对象
     * @returns {Object} 包含 lng、lat、zoom、layerIndex 的状态对象
     */
    function parseUrlToState() {
        const lng = parseNumber(readQueryValue('lng'));
        const lat = parseNumber(readQueryValue('lat'));
        const zoom = parseNumber(readQueryValue('z'));
        // 默认底图索引为 3（Google），如果 URL 中无参数则使用该默认值
        const layerIndex = parseInteger(readQueryValue('l') ?? readQueryValue('layer')) ?? 3;

        return {
            lng,
            lat,
            zoom: zoom === null ? defaultZoom : zoom,
            layerIndex
        };
    }

    /**
     * 构建查询参数对象
     * @param {Object} params - 地图参数 { lng, lat, zoom, layerIndex }
     * @returns {Object} 格式化的查询参数 { lng, lat, z, l }
     * @private
     */
    function buildQuery({ lng, lat, zoom, layerIndex }) {
        return {
            lng: formatNumber(lng, 6),
            lat: formatNumber(lat, 6),
            z: formatNumber(zoom, 2),
            l: Number.isInteger(layerIndex) ? String(layerIndex) : null
        };
    }

    /**
     * 判断新查询参数是否与当前 URL 参数相同
     * @param {Object} nextQuery - 新查询参数
     * @returns {boolean} 是否相同
     * @private
     */
    function isSameQuery(nextQuery) {
        const currentLng = String(readQueryValue('lng') ?? '');
        const currentLat = String(readQueryValue('lat') ?? '');
        const currentZoom = String(readQueryValue('z') ?? '');
        const currentLayer = String(readQueryValue('l') ?? readQueryValue('layer') ?? '');

        return currentLng === String(nextQuery.lng ?? '')
            && currentLat === String(nextQuery.lat ?? '')
            && currentZoom === String(nextQuery.z ?? '')
            && currentLayer === String(nextQuery.l ?? '');
    }

    /**
     * 更新 URL 查询参数，通过 router 或直接修改 location
     * @param {Object} nextQuery - 新查询参数
     * @private
     */
    function replaceUrlQuery(nextQuery) {
        if (!nextQuery?.lng || !nextQuery?.lat || !nextQuery?.z || !nextQuery?.l) return;
        if (isSameQuery(nextQuery)) return;

        if (router && route) {
            void router.replace({
                path: route.path || '/home',
                query: nextQuery
            }).catch(() => {});
            return;
        }

        if (typeof window === 'undefined') return;

        const hashPath = String(window.location.hash || '#/home').split('?')[0] || '#/home';
        const params = new URLSearchParams(nextQuery);
        const nextUrl = `${window.location.pathname}${window.location.search}${hashPath}?${params.toString()}`;
        window.location.replace(nextUrl);
    }

    /**
     * 从当前地图状态同步 URL 查询参数
     * 提取地图中心和缩放级别，构建新查询参数并更新 URL
     */
    function syncUrlFromMap() {
        const map = mapInstance?.value;
        if (!map) return;

        const view = map.getView?.();
        const center = view?.getCenter?.();
        const zoom = view?.getZoom?.();
        if (!Array.isArray(center) || center.length < 2 || !Number.isFinite(zoom)) return;

        const [lng, lat] = toLonLat(center);
        const layerIndex = getLayerIndex();
        const nextQuery = buildQuery({ lng, lat, zoom, layerIndex });
        replaceUrlQuery(nextQuery);
    }

    /**
     * 绑定地图视图变化监听，自动同步 URL
     * 监听 moveend 事件，防抖调用 syncUrlFromMap
     */
    function bindMapViewSync() {
        const map = mapInstance?.value;
        if (!map || moveEndKey) return;
        moveEndKey = map.on('moveend', () => {
            debouncedSyncUrlFromMap();
        });
    }

    /**
     * 停止地图视图同步，清除事件监听和防抖定时器
     */
    function stopMapViewSync() {
        if (!moveEndKey) return;
        unByKey(moveEndKey);
        moveEndKey = null;
        debouncedSyncUrlFromMap.cancel();
    }

    /**
     * 地图飞行到指定视角
     * @param {Object} params - 目标参数
     * @param {number} [params.lng] - 经度（或 lng）
     * @param {number} [params.lat] - 纬度（或 lat）
     * @param {number} [params.zoom] - 缩放级别（或 z）
     * @param {number} [params.z] - 缩放级别（备选）
     * @param {number} [params.layerIndex] - 图层索引（或 l）
     * @param {number} [params.l] - 图层索引（备选）
     * @param {number} [params.duration] - 动画持续时间（毫秒）
     */
    function flyToView({ lng, lat, zoom, z, layerIndex, l, duration } = {}) {
        const normalizedLayerIndex = parseInteger(layerIndex ?? l);
        if (normalizedLayerIndex !== null) {
            onLayerIndexChange(normalizedLayerIndex);
        }

        const map = mapInstance?.value;
        const view = map?.getView?.();

        const normalizedLng = parseNumber(lng);
        const normalizedLat = parseNumber(lat);
        const normalizedZoom = parseNumber(zoom ?? z);

        if (view && normalizedLng !== null && normalizedLat !== null) {
            const targetZoom = normalizedZoom === null
                ? Number(view.getZoom?.() ?? defaultZoom)
                : normalizedZoom;

            if (typeof view.animate === 'function') {
                view.animate({
                    center: fromLonLat([normalizedLng, normalizedLat]),
                    zoom: targetZoom,
                    duration: Number(duration) > 0 ? Number(duration) : flyDuration
                });
            } else {
                view.setCenter?.(fromLonLat([normalizedLng, normalizedLat]));
                view.setZoom?.(targetZoom);
            }
        }

        const finalLayerIndex = normalizedLayerIndex !== null ? normalizedLayerIndex : parseInteger(getLayerIndex());
        let finalLng = normalizedLng;
        let finalLat = normalizedLat;
        let finalZoom = normalizedZoom;

        if ((finalLng === null || finalLat === null || finalZoom === null) && view) {
            const currentCenter = view.getCenter?.();
            if (Array.isArray(currentCenter) && currentCenter.length >= 2) {
                const [currentLng, currentLat] = toLonLat(currentCenter);
                finalLng = finalLng === null ? currentLng : finalLng;
                finalLat = finalLat === null ? currentLat : finalLat;
            }
            const currentZoom = parseNumber(view.getZoom?.());
            finalZoom = finalZoom === null ? currentZoom : finalZoom;
        }

        if (finalLng === null || finalLat === null || finalZoom === null || finalLayerIndex === null) {
            return;
        }

        replaceUrlQuery(buildQuery({
            lng: finalLng,
            lat: finalLat,
            zoom: finalZoom,
            layerIndex: finalLayerIndex
        }));
    }

    /**
     * 更新地图视图（flyToView 的别名）
     * @param {Object} params - 目标参数 
     */
    function updateMapView(params = {}) {
        flyToView(params);
    }

    /**
     * 根据图层 ID 查找图层配置
     * @param {string} layerId - 图层 ID
     * @param {Array} configs - 图层配置数组
     * @returns {Object|null} 找到的配置对象，或未找到时返回 null
     * @private
     */
    function findLayerConfigById(layerId, configs = layerConfigs) {
        if (!Array.isArray(configs)) return null;
        return configs.find((cfg) => cfg?.id === layerId) || null;
    }

    /**
     * 确保指定图层的数据源已初始化
     * @param {string} layerId - 图层 ID
     * @param {Object} instanceMap - 图层实例映射
     * @param {Array} configs - 图层配置数组
     * @private
     */
    function ensureLayerSourceById(layerId, instanceMap = layerInstances, configs = layerConfigs) {
        if (!instanceMap || !layerId) return;
        const layer = instanceMap[layerId];
        if (!layer || layer.getSource?.()) return;
        const cfg = findLayerConfigById(layerId, configs);
        if (!cfg || typeof cfg.createSource !== 'function') return;
        layer.setSource(cfg.createSource());
    }

    /**
     * 刷新所有图层实例的显示状态和层级
     * @param {Object} options - 配置对象
     * @param {Array} [options.layerList] - 图层列表（来自 layerListRef.value）
     * @param {Object} [options.instanceMap] - 图层实例映射
     * @param {Array} [options.configs] - 图层配置数组
     */
    function refreshLayerInstances({
        layerList = layerListRef?.value,
        instanceMap = layerInstances,
        configs = layerConfigs
    } = {}) {
        if (!Array.isArray(layerList) || !instanceMap) return;

        layerList.forEach((item, index) => {
            const layer = instanceMap[item.id];
            if (!layer) return;

            if (item.visible) {
                ensureLayerSourceById(item.id, instanceMap, configs);
            }

            layer.setVisible(!!item.visible);
            layer.setZIndex(layerList.length - index);
        });
    }

    /**
     * 按 ID 切换图层（设置为可见/不可见）
     * 自动处理卫星图和矢量图标注的显示/隐藏
     * @param {string} layerId - 目标图层 ID
     * @param {Object} options - 配置对象
     * @param {Array} [options.layerList] - 图层列表
     * @param {Object} [options.instanceMap] - 图层实例映射
     * @param {Array} [options.configs] - 图层配置数组
     * @param {Array} [options.satelliteIds] - 卫星图层 ID 列表
     * @param {Array} [options.vectorIds] - 矢量图层 ID 列表
     * @param {Function} [options.onUpdated] - 更新完成的回调函数
     */
    function switchLayerById(layerId, {
        layerList = layerListRef?.value,
        instanceMap = layerInstances,
        configs = layerConfigs,
        visibleLayerResolver = resolveVisibleLayerIds,
        satelliteIds = satelliteLayers,
        vectorIds = vectorLayers,
        onUpdated
    } = {}) {
        if (!Array.isArray(layerList) || !layerId) return;
        let normalizedResolvedIds = null;

        const resolvedIds = typeof visibleLayerResolver === 'function'
            ? visibleLayerResolver(layerId, { layerList, instanceMap, configs })
            : null;

        if (Array.isArray(resolvedIds) && resolvedIds.length) {
            normalizedResolvedIds = resolvedIds.map((id) => String(id));
            const visibleIdSet = new Set(normalizedResolvedIds);
            let matchedCount = 0;

            layerList.forEach((item) => {
                const visible = visibleIdSet.has(item.id);
                if (visible) matchedCount += 1;
                item.visible = visible;
            });

            // 若解析结果未匹配任何图层，则退回到单图层切换模式。
            if (matchedCount === 0) {
                layerList.forEach((item) => {
                    if (item.id === 'label' || item.id === 'label_vector') return;
                    item.visible = item.id === layerId;
                });

                const needsSatelliteLabel = satelliteIds.includes(layerId);
                const labelItem = layerList.find((item) => item.id === 'label');
                if (labelItem) labelItem.visible = needsSatelliteLabel;

                const needsVectorLabel = vectorIds.includes(layerId);
                const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
                if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
            }
        } else {
            layerList.forEach((item) => {
                if (item.id === 'label' || item.id === 'label_vector') return;
                item.visible = item.id === layerId;
            });

            const needsSatelliteLabel = satelliteIds.includes(layerId);
            const labelItem = layerList.find((item) => item.id === 'label');
            if (labelItem) labelItem.visible = needsSatelliteLabel;

            const needsVectorLabel = vectorIds.includes(layerId);
            const vectorLabelItem = layerList.find((item) => item.id === 'label_vector');
            if (vectorLabelItem) vectorLabelItem.visible = needsVectorLabel;
        }

        refreshLayerInstances({ layerList, instanceMap, configs });

        // 组合图层模式下，按配置顺序（从下到上）强制设置层级。
        if (Array.isArray(normalizedResolvedIds) && normalizedResolvedIds.length && instanceMap) {
            const zIndexBase = layerList.length + 10;
            normalizedResolvedIds.forEach((id, index) => {
                const layer = instanceMap[id];
                if (!layer || typeof layer.setZIndex !== 'function') return;
                layer.setZIndex(zIndexBase + index);
            });
        }

        if (typeof onUpdated === 'function') {
            onUpdated(layerId);
        }
    }

    /**
     * 格式化经度为字符串 (如 "123.4567°E")
     * @param {number} lon - 经度值
     * @returns {string} 格式化的经度字符串
     */
    function formatLongitude(lon) {
        const abs = Math.abs(lon).toFixed(4);
        return `${abs}°${lon >= 0 ? 'E' : 'W'}`;
    }

    /**
     * 格式化纬度为字符串 (如 "56.7890°N")
     * @param {number} lat - 纬度值
     * @returns {string} 格式化的纬度字符串
     */
    function formatLatitude(lat) {
        const abs = Math.abs(lat).toFixed(4);
        return `${abs}°${lat >= 0 ? 'N' : 'S'}`;
    }

    /**
     * 创建经纬网线的样式
     * @param {string} [textLabel=''] - 文本标签
     * @param {Object} [textOptions={}] - 文本选项 { offsetX, offsetY, textAlign }
     * @returns {Style} OpenLayers 样式对象
     * @private
     */
    function createGraticuleStyle(textLabel = '', textOptions = {}) {
        return new Style({
            stroke: new Stroke({ color: 'rgba(255,255,255,0.92)', width: 2 }),
            text: textLabel
                ? new Text({
                    text: textLabel,
                    font: 'bold 12px Consolas, Monaco, monospace',
                    fill: new Fill({ color: '#124e28' }),
                    backgroundFill: new Fill({ color: 'rgba(255,255,255,0.9)' }),
                    padding: [2, 4, 2, 4],
                    offsetX: textOptions.offsetX ?? 0,
                    offsetY: textOptions.offsetY ?? -10,
                    textAlign: textOptions.textAlign ?? 'center'
                })
                : undefined
        });
    }

    /**
     * 确保经纬网图层已创建
     * 如果图层不存在则创建新的 VectorLayer，并添加到地图
     * @returns {VectorLayer|null} 经纬网图层
     * @private
     */
    function ensureGraticuleLayer() {
        const map = mapInstance?.value;
        if (!map) return null;
        if (graticuleLayer) return graticuleLayer;

        graticuleLayer = new VectorLayer({
            source: new VectorSource(),
            zIndex: 1080
        });
        map.addLayer(graticuleLayer);
        return graticuleLayer;
    }

    /**
     * 更新经纬网图层
     * 根据当前地图视图范围重绘经纬线和标签
     * @private
     */
    function updateGraticuleLayer() {
        const map = mapInstance?.value;
        if (!map) return;

        const layer = ensureGraticuleLayer();
        const source = layer?.getSource?.();
        if (!source) return;

        source.clear();
        if (!graticuleActive) {
            layer.setVisible(false);
            return;
        }

        layer.setVisible(true);
        const view = map.getView();
        const size = map.getSize();
        if (!size) return;

        const extent = view.calculateExtent(size);
        const sw = toLonLat([extent[0], extent[1]]);
        const ne = toLonLat([extent[2], extent[3]]);

        const lonStep = (ne[0] - sw[0]) / 3;
        const latStep = (ne[1] - sw[1]) / 3;
        const lonList = [sw[0] + lonStep, sw[0] + lonStep * 2];
        const latList = [sw[1] + latStep, sw[1] + latStep * 2];
        const centerLon = (sw[0] + ne[0]) / 2;
        const centerLat = (sw[1] + ne[1]) / 2;

        const features = [];

        lonList.forEach((lon) => {
            const start = fromLonLat([lon, sw[1]]);
            const end = fromLonLat([lon, ne[1]]);
            const line = new Feature({ geometry: new LineString([start, end]) });
            line.setStyle(createGraticuleStyle());
            features.push(line);

            const topLabel = new Feature({ geometry: new Point(end) });
            topLabel.setStyle(createGraticuleStyle(formatLongitude(lon), { offsetY: 12 }));
            const bottomLabel = new Feature({ geometry: new Point(start) });
            bottomLabel.setStyle(createGraticuleStyle(formatLongitude(lon), { offsetY: -12 }));
            features.push(topLabel, bottomLabel);
        });

        latList.forEach((lat) => {
            const start = fromLonLat([sw[0], lat]);
            const end = fromLonLat([ne[0], lat]);
            const line = new Feature({ geometry: new LineString([start, end]) });
            line.setStyle(createGraticuleStyle());
            features.push(line);

            const leftLabel = new Feature({ geometry: new Point(start) });
            leftLabel.setStyle(createGraticuleStyle(formatLatitude(lat), { offsetX: 42, textAlign: 'left' }));
            const rightLabel = new Feature({ geometry: new Point(end) });
            rightLabel.setStyle(createGraticuleStyle(formatLatitude(lat), { offsetX: -42, textAlign: 'right' }));
            features.push(leftLabel, rightLabel);
        });

        const centerCoord = fromLonLat([centerLon, centerLat]);
        const centerPlus = new Feature({ geometry: new Point(centerCoord) });
        centerPlus.setStyle(new Style({
            text: new Text({
                text: '+',
                font: '700 26px "Segoe UI", "Arial", sans-serif',
                fill: new Fill({ color: 'rgba(255, 235, 130, 0.98)' }),
                stroke: new Stroke({ color: 'rgba(0, 0, 0, 0.78)', width: 3 }),
                textAlign: 'center',
                textBaseline: 'middle'
            })
        }));

        features.push(centerPlus);
        source.addFeatures(features);
    }

    /**
     * 设置经纬网的激活状态
     * @param {boolean} active - 是否激活
     * @returns {boolean} 设置后的激活状态
     */
    function setGraticuleActive(active) {
        graticuleActive = !!active;
        const map = mapInstance?.value;
        if (!map) return graticuleActive;

        if (graticuleActive && !graticuleMoveKey) {
            graticuleMoveKey = map.on('moveend', () => {
                if (graticuleActive) updateGraticuleLayer();
            });
        }

        updateGraticuleLayer();
        return graticuleActive;
    }

    /**
     * 切换经纬网的显示/隐藏状态
     * @returns {boolean} 切换后的激活状态
     */
    function toggleGraticule() {
        return setGraticuleActive(!graticuleActive);
    }

    /**
     * 停止经纬网，清除事件监听和图层数据
     */
    function stopGraticule() {
        if (graticuleMoveKey) {
            unByKey(graticuleMoveKey);
            graticuleMoveKey = null;
        }
        if (graticuleLayer) {
            graticuleLayer.setVisible(false);
            graticuleLayer.getSource()?.clear?.();
        }
        graticuleActive = false;
    }

    onUnmounted(() => {
        stopMapViewSync();
        stopGraticule();
    });

    return {
        parseUrlToState,
        flyToView,
        updateMapView,
        syncUrlFromMap,
        bindMapViewSync,
        stopMapViewSync,
        refreshLayerInstances,
        switchLayerById,
        setGraticuleActive,
        toggleGraticule,
        updateGraticuleLayer,
        stopGraticule
    };
}
