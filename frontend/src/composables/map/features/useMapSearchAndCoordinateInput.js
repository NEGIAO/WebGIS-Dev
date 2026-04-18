/**
 * 地图搜索和坐标输入功能库
 * 负责地名搜索结果落图与手动坐标绘制
 * 
 * 导出：
 * - handleSearchJump(payload)
 * - drawPointByCoordinatesInput(payload)
 */

import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import { fetchAmapPoiDetailAoi, parseAmapDetailAoiFromPayload } from '../../../api/map';

const SEARCH_AOI_LAYER_NAME = '搜索 AOI 结果';

function closeLinearRing(ring = []) {
    if (ring.length < 3) return [];
    const first = ring[0];
    const last = ring[ring.length - 1];
    const isClosed = Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12;
    if (!isClosed) {
        ring.push([first[0], first[1]]);
    }
    return ring.length >= 4 ? ring : [];
}

function normalizeScalarProperty(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        const text = value.trim();
        return text ? text : null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'object') {
        try {
            const text = JSON.stringify(value);
            return text && text !== '{}' ? text : null;
        } catch {
            return null;
        }
    }
    return null;
}

function pickAoiProperties(base = {}) {
    const picked = {};
    Object.entries(base || {}).forEach(([key, value]) => {
        if (!key) return;
        if (/^pixel[xy]$/i.test(String(key))) return;

        const normalized = normalizeScalarProperty(value);
        if (normalized === null) return;
        picked[key] = normalized;
    });
    return picked;
}

function parseCenterText(centerText) {
    const parts = String(centerText || '').split(',');
    if (parts.length < 2) return null;

    const lng = Number.parseFloat(parts[0]);
    const lat = Number.parseFloat(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return [lng, lat];
}

/**
 * 工厂函数 - 返回搜索和坐标输入相关的导出函数
 * @param {Object} options 配置选项
 * @param {Object} options.message - 消息系统
 * @param {Object} options.mapInstanceRef - 地图实例 ref
 * @param {Function} options.createManagedVectorLayer - 创建托管矢量图层的函数
 * @param {Function} options.gcj02ToWgs84 - GCJ02转WGS84转换函数
 * @param {Object} options.searchResultStyle - 搜索结果样式配置
 * @returns {Object} 包含 handleSearchJump 和 drawPointByCoordinatesInput 的对象
 */
export function createMapSearchAndCoordinateInputFeature({
    message = {},
    mapInstanceRef = { value: null },
    createManagedVectorLayer = () => null,
    gcj02ToWgs84 = () => [0, 0],
    searchResultStyle = {},
    searchAoiStyle = {},
    amapExtractAoiStyle = {
        fillColor: '#0099ff',
        fillOpacity: 0.2,
        strokeColor: '#005b99',
        strokeWidth: 2,
        pointRadius: 6
    },
    userDataLayers = [],
    ensureFeatureId = () => '',
    serializeManagedFeatures = () => [],
    emitUserLayersChange = () => {},
    emitGraphicsOverview = () => {},
    onSearchPoiResolved = () => {}
}) {
    let searchAoiLayerId = '';
    const verifyPromptedPoiIds = new Set();

    function openAmapVerifyWindow(verifyUrl) {
        if (typeof window === 'undefined') return false;

        const finalUrl = String(verifyUrl || '').trim() || 'https://www.amap.com';
        const popup = window.open(
            finalUrl,
            'amap-verify-window',
            'width=960,height=760,left=80,top=80'
        );

        return !!popup;
    }

    function requestManualOpenVerifyWindow(verifyUrl) {
        if (typeof window === 'undefined') return false;

        const finalUrl = String(verifyUrl || '').trim() || 'https://www.amap.com';
        const shouldOpen = window.confirm('高德触发验证，浏览器可能拦截了自动弹窗。是否立即手动打开验证窗口？');
        if (!shouldOpen) return false;

        const popup = window.open(finalUrl, '_blank');
        return !!popup;
    }

    function handleAmapVerifyRequired(error, poiid) {
        const verifyUrl = String(error?.verifyUrl || '').trim();
        const idKey = String(poiid || '').trim();

        if (!idKey) {
            message.warning?.('高德触发验证，请前往高德地图页面完成滑块后重试');
            return;
        }

        const alreadyPrompted = verifyPromptedPoiIds.has(idKey);
        if (!alreadyPrompted) {
            const opened = openAmapVerifyWindow(verifyUrl);
            if (opened) {
                verifyPromptedPoiIds.add(idKey);
                message.warning?.('已打开高德验证窗口，请完成验证后重新点击该 POI');
                return;
            }

            const manuallyOpened = requestManualOpenVerifyWindow(verifyUrl);
            if (manuallyOpened) {
                verifyPromptedPoiIds.add(idKey);
                message.warning?.('请在新窗口完成高德验证，完成后回到地图重新点击该 POI');
                return;
            }
        }

        if (verifyUrl) {
            message.warning?.(`高德需要人机验证，请先访问验证页后重试：${verifyUrl}`);
        } else {
            message.warning?.('高德需要人机验证，请先完成验证后重新点击该 POI');
        }
    }

    function getSearchAoiLayerItem() {
        if (searchAoiLayerId) {
            const byId = userDataLayers.find((item) => item.id === searchAoiLayerId) || null;
            if (byId) return byId;
            searchAoiLayerId = '';
        }

        const byType = userDataLayers.find((item) => (
            item?.sourceType === 'search'
            && String(item?.type || '').toLowerCase() === 'search_aoi'
        )) || null;

        if (byType?.id) {
            searchAoiLayerId = byType.id;
        }
        return byType;
    }

    function appendToManagedSearchAoiLayer(feature, metadata = {}) {
        if (!feature) return null;

        const existingLayer = getSearchAoiLayerItem();
        if (!existingLayer) {
            const createdId = createManagedVectorLayer?.({
                name: SEARCH_AOI_LAYER_NAME,
                type: 'search_aoi',
                sourceType: 'search',
                features: [feature],
                styleConfig: searchAoiStyle,
                autoLabel: false,
                metadata: {
                    ...(metadata || {}),
                    category: 'search-aoi',
                    labelField: '名称'
                },
                fitView: false
            });
            if (createdId) {
                searchAoiLayerId = createdId;
            }
            return createdId;
        }

        const source = existingLayer?.layer?.getSource?.();
        if (!source) return null;

        const currentCount = Number(source.getFeatures?.().length || 0);
        ensureFeatureId(feature, SEARCH_AOI_LAYER_NAME, currentCount);
        source.addFeature(feature);

        const allFeatures = source.getFeatures?.() || [];
        existingLayer.featureCount = allFeatures.length;
        existingLayer.features = serializeManagedFeatures(allFeatures, SEARCH_AOI_LAYER_NAME);
        existingLayer.metadata = {
            ...(existingLayer.metadata || {}),
            ...(metadata || {}),
            category: 'search-aoi',
            labelField: '名称'
        };

        emitUserLayersChange?.();
        emitGraphicsOverview?.();
        return existingLayer.id;
    }

    function convertGcjRingsToMapRings(gcjRings = []) {
        return (gcjRings || [])
            .map((ring) => {
                const mapRing = (ring || [])
                    .map((point) => {
                        const gcjLng = Number(point?.[0]);
                        const gcjLat = Number(point?.[1]);
                        if (!Number.isFinite(gcjLng) || !Number.isFinite(gcjLat)) return null;

                        const [wgsLng, wgsLat] = gcj02ToWgs84(gcjLng, gcjLat);
                        if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) return null;

                        return fromLonLat([wgsLng, wgsLat]);
                    })
                    .filter((coord) => Array.isArray(coord) && coord.length === 2);

                return closeLinearRing(mapRing);
            })
            .filter((ring) => Array.isArray(ring) && ring.length >= 4);
    }

    function convertWgsRingsToMapRings(wgsRings = []) {
        return (wgsRings || [])
            .map((ring) => {
                const mapRing = (ring || [])
                    .map((point) => {
                        const wgsLng = Number(point?.[0]);
                        const wgsLat = Number(point?.[1]);
                        if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) return null;
                        return fromLonLat([wgsLng, wgsLat]);
                    })
                    .filter((coord) => Array.isArray(coord) && coord.length === 2);

                return closeLinearRing(mapRing);
            })
            .filter((ring) => Array.isArray(ring) && ring.length >= 4);
    }

    function buildAoiMetadata(detail, payload = {}) {
        const centerText = detail?.raw?.data?.spec?.mining_shape?.center
            || detail?.raw?.spec?.mining_shape?.center
            || '';

        let gcjCenter = parseCenterText(centerText);
        if (!gcjCenter) {
            const xVal = Number.parseFloat(detail?.base?.x);
            const yVal = Number.parseFloat(detail?.base?.y);
            if (Number.isFinite(xVal) && Number.isFinite(yVal)) {
                gcjCenter = [xVal, yVal];
            }
        }

        if (gcjCenter) {
            const [metaLng, metaLat] = gcj02ToWgs84(gcjCenter[0], gcjCenter[1]);
            if (Number.isFinite(metaLng) && Number.isFinite(metaLat)) {
                return {
                    longitude: Number(metaLng.toFixed(6)),
                    latitude: Number(metaLat.toFixed(6)),
                    crs: 'wgs84'
                };
            }
        }

        const fallbackLng = Number(payload?.lng);
        const fallbackLat = Number(payload?.lat);
        return {
            longitude: Number.isFinite(fallbackLng) ? fallbackLng : undefined,
            latitude: Number.isFinite(fallbackLat) ? fallbackLat : undefined,
            crs: 'wgs84'
        };
    }

    function drawAoiFeatureFromDetail(detail, payload = {}, pointLayerName = '') {
        if (!detail?.shape) {
            throw new Error('AOI 详情中未包含 shape 节点');
        }

        const mapRings = convertGcjRingsToMapRings(detail?.rings || []);
        if (!mapRings.length) {
            throw new Error('AOI 坐标转换失败，请检查 shape 数据');
        }

        const baseProperties = pickAoiProperties(detail?.base || {});
        const nameFromBase = String(baseProperties?.name || '').trim();
        const preferredName = String(payload?.layerName || '').trim();
        const defaultAoiName = nameFromBase ? `${nameFromBase}_AOI` : (pointLayerName ? `${pointLayerName}_AOI` : '手动导入_AOI');
        const aoiName = preferredName || defaultAoiName;
        const poiid = String(payload?.poiid || detail?.poiid || baseProperties?.poiid || '').trim();

        const aoiFeature = new Feature({
            geometry: new Polygon(mapRings),
            type: 'search_aoi',
            名称: aoiName,
            ...(poiid ? { POI_ID: poiid } : {}),
            来源服务: String(detail?.source || 'amap-detail'),
            ...(payload?.raw?.address ? { 地址: String(payload.raw.address) } : {}),
            ...baseProperties
        });

        appendToManagedSearchAoiLayer(aoiFeature, buildAoiMetadata(detail, payload));

        return {
            name: aoiName,
            poiid,
            feature: aoiFeature
        };
    }

    async function fetchAndDrawSearchAoi(payload, pointLayerName) {
        const selectedService = String(payload?.service || payload?.raw?._service || '').trim().toLowerCase();
        const poiid = String(payload?.poiid || payload?.raw?.id || '').trim();
        if (!poiid) {
            if (selectedService === 'amap') {
                message.warning?.('该高德结果缺少 POI ID，已跳过 AOI 请求');
            }
            return;
        }

        let detail = null;
        try {
            detail = await fetchAmapPoiDetailAoi({
                poiid,
                extensions: 'all'
            });
        } catch (error) {
            if (error?.code === 'AMAP_VERIFY_REQUIRED') {
                handleAmapVerifyRequired(error, poiid);
                return;
            }
            throw error;
        }

        // 没有 AOI shape 则直接返回，不影响主点位流程。
        if (!detail?.shape) return;
        drawAoiFeatureFromDetail(detail, { ...payload, poiid }, pointLayerName);
    }

    function drawAmapAoiByDetailJsonInput(payload = {}) {
        try {
            const jsonText = String(payload?.jsonText || '').trim();
            if (!jsonText) {
                message.warning?.('请先粘贴高德详情 JSON 内容');
                return;
            }

            const detail = parseAmapDetailAoiFromPayload(jsonText);
            const manualPoiId = String(payload?.poiid || '').trim();
            const poiid = manualPoiId || String(detail?.poiid || '').trim();
            const poiName = String(detail?.name || detail?.base?.name || '').trim();
            const fallbackName = poiid ? `POI_${poiid}` : (String(payload?.sourceLayerName || '').trim() || 'AOI');
            const layerName = String(payload?.layerName || '').trim() || `${poiName || fallbackName} - AOI范围`;

            let mapRings = convertWgsRingsToMapRings(detail?.ringsWgs84 || []);
            if (!mapRings.length) {
                mapRings = convertGcjRingsToMapRings(detail?.rings || []);
            }
            if (!mapRings.length) {
                message.warning?.('未发现边界数据');
                return;
            }

            const baseProperties = detail?.base && typeof detail.base === 'object'
                ? { ...detail.base }
                : {};

            const aoiFeature = new Feature({
                geometry: new Polygon(mapRings),
                type: 'search_aoi',
                名称: layerName,
                ...(poiid ? { POI_ID: poiid } : {}),
                来源服务: 'amap-manual-json',
                ...baseProperties
            });

            createManagedVectorLayer?.({
                name: layerName,
                type: 'search_aoi',
                sourceType: 'search',
                features: [aoiFeature],
                styleConfig: amapExtractAoiStyle,
                autoLabel: true,
                metadata: {
                    ...buildAoiMetadata(detail, payload),
                    category: 'search-aoi',
                    labelField: '名称'
                },
                fitView: true
            });

            message.success?.('AOI 提取成功，属性已同步至属性表');
        } catch (error) {
            const code = String(error?.code || '').toUpperCase();
            if (code.includes('NO_SHAPE') || code.includes('INVALID_SHAPE')) {
                message.warning?.('未发现边界数据');
                return;
            }

            const detailText = error instanceof Error
                ? error.message
                : 'AOI 解析失败';
            message.warning?.(detailText || 'AOI 解析失败');
        }
    }

    /**
     * 处理地名搜索跳转
     * 接收 LayerControlPanel 解析后的定位载荷并渲染搜索结果图层
     * @param {Object} payload - 搜索结果 { lng, lat, name, zoom }
     */
    function handleSearchJump(payload) {
        if (!mapInstanceRef.value || !payload) return;

        const lon = Number(payload.lng);
        const lat = Number(payload.lat);
        if (Number.isNaN(lon) || Number.isNaN(lat)) {
            message.warning?.('无法解析该结果的坐标');
            return;
        }
        const coord = fromLonLat([lon, lat]);

        const layerName = (payload.name || `搜索结果_${lon.toFixed(5)}_${lat.toFixed(5)}`).trim();
        const poiid = String(payload?.poiid || payload?.raw?.id || '').trim();
        const sourceService = String(payload?.service || payload?.raw?._service || '').trim().toLowerCase();
        
        // 构建特征属性，包含 POI ID（来自 Amap 搜索结果）
        const featureProperties = {
            geometry: new Point(coord),
            type: 'search',
            名称: layerName,
            经度: Number(lon.toFixed(6)),
            纬度: Number(lat.toFixed(6)),
            坐标系: 'wgs84'
        };
        
        // 如果检测到 POI ID，添加到属性中
        if (poiid) {
            featureProperties['POI_ID'] = poiid;
        }
        
        // 添加其他 Amap 特定字段
        if (payload.raw?.address) {
            featureProperties['地址'] = String(payload.raw.address);
        }
        
        const f = new Feature(featureProperties);
        createManagedVectorLayer?.({
            name: layerName,
            type: 'search',
            sourceType: 'search',
            features: [f],
            styleConfig: searchResultStyle,
            autoLabel: true,
            metadata: {
                longitude: Number(lon.toFixed(6)),
                latitude: Number(lat.toFixed(6)),
                crs: 'wgs84'
            },
            fitView: false
        });

        if (sourceService === 'amap' || poiid) {
            onSearchPoiResolved?.({
                poiid,
                name: layerName,
                service: sourceService,
                raw: payload?.raw || null
            });
        }

        // AOI 提取改为“点击 POI 项 -> 注入弹窗 -> 手动粘贴 JSON”流程。
        // 这里不再自动请求 AOI，避免触发验证弹窗并减少无效请求。

        // 动画缩放到位置
        mapInstanceRef.value?.getView()?.animate?.({
            center: coord,
            zoom: Number(payload.zoom) > 0 ? Number(payload.zoom) : 16,
            duration: 700
        });
    }

    /**
     * 手动坐标绘制
     * 接收输入经纬度（WGS-84 / GCJ-02），落图并自动飞行到目标点
        * @param {Object} payload - 坐标输入
        * @param {number|string} payload.lng
        * @param {number|string} payload.lat
        * @param {'wgs84'|'gcj02'} [payload.crsType='wgs84']
        * @param {string} [payload.displayName] 输入名称
        * @param {string} [payload.label] 点位标注名称
        * @param {string} [payload.layerName] 图层名称
        * @param {number} [payload.zoom] 动画缩放级别
        * @param {Object} [payload.properties] 额外属性（会并入 Feature 属性）
     */
    function drawPointByCoordinatesInput(payload) {
        if (!mapInstanceRef.value || !payload) return;

        const rawLng = Number(payload.lng);
        const rawLat = Number(payload.lat);
        const crsType = String(payload.crsType || 'wgs84').toLowerCase();

        if (!Number.isFinite(rawLng) || !Number.isFinite(rawLat)) {
            message.warning?.('输入坐标无效，请检查经纬度');
            return;
        }

        if (rawLng < -180 || rawLng > 180 || rawLat < -90 || rawLat > 90) {
            message.warning?.('输入坐标超出范围（经度 -180~180，纬度 -90~90）');
            return;
        }

        let mapLng = rawLng;
        let mapLat = rawLat;
        if (crsType === 'gcj02') {
            [mapLng, mapLat] = gcj02ToWgs84(rawLng, rawLat);
        }

        if (!Number.isFinite(mapLng) || !Number.isFinite(mapLat)) {
            message.error?.('坐标转换失败，请稍后重试');
            return;
        }

        const mapCoord = fromLonLat([mapLng, mapLat]);
        const displayName = String(payload.displayName || `输入点_${rawLng.toFixed(6)}_${rawLat.toFixed(6)}`).trim();
        const labelName = String(payload.label || displayName || '').trim() || displayName;
        const layerName = String(payload.layerName || labelName || displayName).trim() || displayName;
        const labelField = String(payload.labelField || '名称').trim() || '名称';
        const shouldAutoLabel = payload.autoLabel !== false;
        const extraProperties = payload?.properties && typeof payload.properties === 'object'
            ? { ...payload.properties }
            : {};

        delete extraProperties.geometry;
        delete extraProperties.style;

        const pointProperties = {
            geometry: new Point(mapCoord),
            type: 'Point',
            名称: labelName,
            输入名称: displayName,
            经度: Number(rawLng.toFixed(6)),
            纬度: Number(rawLat.toFixed(6)),
            坐标系: crsType,
            解析后经度: Number(mapLng.toFixed(6)),
            解析后纬度: Number(mapLat.toFixed(6)),
            ...extraProperties
        };

        const labelFieldValue = pointProperties[labelField];
        if (labelFieldValue === null || labelFieldValue === undefined || String(labelFieldValue).trim() === '') {
            pointProperties[labelField] = labelName;
        }

        const pointFeature = new Feature(pointProperties);

        createManagedVectorLayer?.({
            name: layerName,
            type: 'Point',
            sourceType: 'draw',
            features: [pointFeature],
            autoLabel: shouldAutoLabel,
            metadata: {
                longitude: Number(rawLng.toFixed(6)),
                latitude: Number(rawLat.toFixed(6)),
                crs: crsType,
                labelField
            },
            fitView: false
        });

        const targetZoom = Number(payload.zoom);
        mapInstanceRef.value?.getView()?.animate?.({
            center: mapCoord,
            zoom: Number.isFinite(targetZoom) && targetZoom > 0 ? targetZoom : 16,
            duration: 700
        });

        message.success?.(`已绘制点位：${layerName}`);
    }

    return {
        handleSearchJump,
        drawPointByCoordinatesInput,
        drawAmapAoiByDetailJsonInput
    };
}
