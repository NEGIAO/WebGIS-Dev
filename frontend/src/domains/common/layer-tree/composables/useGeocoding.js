/**
 * useGeocoding.js — TOCPanel 坐标工具 / 地理编码 / 逆编码 / 高德 AOI 对话框逻辑
 *
 * 从 TOCPanel.vue 抽离（P2 拆分，见 unified-layer-management-refactor-plan.md）。
 * 职责：坐标输入三件套（经纬度/位置码/地址）绘制点、复制坐标格式化、
 *       高德 POI 手动 AOI 对话框状态机。
 */

import { computed, ref } from 'vue';
import {
    COORDINATE_FORMATS,
    DECIMAL_PLACES,
    formatCoordinate,
    generatePointName,
    processCoordinateInput,
} from '@ol/utils/biz/index';
import { apiAddressGeocode, apiReverseGeocodeWithFallback } from '@/api';
import { usePositionCodeTool } from '@ol/utils/usePositionCodeTool';

const COORD_STORAGE_KEYS = {
    FORMAT_ID: 'gis_coord_format_id',
    DECIMAL_PLACES: 'gis_coord_decimal_places',
};

/**
 * @param {object} ctx
 * @param {Function} ctx.t i18n
 * @param {object} ctx.message 消息组件
 * @param {Function} ctx.emit 组件 emit（draw-point-by-coordinates / interaction / draw-amap-aoi-from-json）
 * @param {import('vue').Ref<string>} ctx.tiandituTk 天地图 token（逆地理回退用）
 */
export function useGeocoding({ t, message, emit, tiandituTk }) {
    const coordInputLon = ref('');
    const coordInputLat = ref('');
    const coordInputCRS = ref('wgs84');
    const coordInputError = ref('');
    const coordInputP = ref('');
    const coordInputPError = ref('');
    const geocodeAddressInput = ref('');
    const geocodeCityInput = ref('');
    const geocodeToolError = ref('');
    const manualAoiPoiId = ref('');
    const manualAoiJsonText = ref('');
    const manualAoiError = ref('');
    const manualAoiDialogVisible = ref(false);
    const manualAoiSourceLayerName = ref('');
    const isDecodePBusy = ref(false);
    const isGeocodeBusy = ref(false);

    const { decodePositionCodeToPointPayload } = usePositionCodeTool({
        tiandituTk,
        reverseGeocode: apiReverseGeocodeWithFallback,
    });

    function getCurrentFormatConfig() {
        const rawFormatId = String(localStorage.getItem(COORD_STORAGE_KEYS.FORMAT_ID) || 'format_6');
        const rawPlaces = Number(localStorage.getItem(COORD_STORAGE_KEYS.DECIMAL_PLACES) || 6);

        const formatId = COORDINATE_FORMATS[rawFormatId] ? rawFormatId : 'format_6';
        const decimalPlaces = DECIMAL_PLACES[rawPlaces] ? rawPlaces : 6;

        return { formatId, decimalPlaces };
    }

    /** 复制图层经纬度信息到剪贴板（按当前格式配置转化） */
    async function copyLayerCoordinates(layer) {
        if (!(Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude))) {
            message.warning(t('layer.noCopyableCoords'));
            return;
        }

        const { formatId, decimalPlaces } = getCurrentFormatConfig();
        const lon = Number(layer.longitude);
        const lat = Number(layer.latitude);
        const text = formatCoordinate(lon, lat, formatId, decimalPlaces);

        if (!text) {
            message.warning(t('layer.coordFormatFailed'));
            return;
        }

        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            message.success(t('layer.coordsCopied', { text }));
        } catch {
            message.error(t('layer.copyPoiIdFailed'));
        }
    }

    function clearCoordinateInput() {
        coordInputLon.value = '';
        coordInputLat.value = '';
        coordInputError.value = '';
    }

    function clearPositionCodeInput() {
        coordInputP.value = '';
        coordInputPError.value = '';
    }

    function _clearGeocodeInput() {
        geocodeAddressInput.value = '';
        geocodeCityInput.value = '';
        geocodeToolError.value = '';
    }

    function normalizeManualAoiPoiId(rawValue, options = {}) {
        const keepRawFallback = options?.keepRawFallback !== false;
        const rawText = String(rawValue || '').trim();
        if (!rawText) return '';

        const unwrapped = rawText
            .replace(/^\{+|\}+$/g, '')
            .replace(/^['"]+|['"]+$/g, '')
            .trim();
        if (!unwrapped) return '';

        if (/^https?:\/\//i.test(unwrapped)) {
            try {
                const url = new URL(unwrapped);
                const idFromUrl = String(
                    url.searchParams.get('id') || url.searchParams.get('poiid') || '',
                ).trim();
                if (idFromUrl) return idFromUrl;
            } catch {
                // noop
            }
        }

        const inlineIdMatch = unwrapped.match(/[?&](?:id|poiid)=([^&#\s]+)/i);
        if (inlineIdMatch?.[1]) {
            return String(decodeURIComponent(inlineIdMatch[1])).trim();
        }

        try {
            const parsed = JSON.parse(unwrapped);
            const idFromJson = String(
                parsed?.data?.base?.poiid ||
                    parsed?.base?.poiid ||
                    parsed?.data?.base?.id ||
                    parsed?.pois?.[0]?.id ||
                    parsed?.id ||
                    '',
            ).trim();
            if (idFromJson) return idFromJson;
        } catch {
            // noop
        }

        return keepRawFallback ? unwrapped : '';
    }

    function closeManualAoiDialog() {
        manualAoiDialogVisible.value = false;
        manualAoiJsonText.value = '';
        manualAoiError.value = '';
        manualAoiSourceLayerName.value = '';
    }

    function openManualAoiDetailLink() {
        manualAoiError.value = '';
        const poiId = normalizeManualAoiPoiId(manualAoiPoiId.value, { keepRawFallback: true });
        if (poiId) {
            manualAoiPoiId.value = poiId;
        }

        const detailUrl = buildAmapDetailUrl(manualAoiPoiId.value);
        if (typeof window !== 'undefined') {
            const popup = window.open(detailUrl, '_blank', 'noopener,noreferrer');
            if (!popup) {
                message.warning(t('layer.popupBlocked'));
            }
        }
    }

    function openManualAoiDialogByPoi(payload = {}, options = {}) {
        const poiId = normalizeManualAoiPoiId(payload?.poiid, { keepRawFallback: false });
        const layerName = String(payload?.layerName || '').trim();
        const shouldResetContent = !manualAoiDialogVisible.value || poiId !== manualAoiPoiId.value;

        manualAoiPoiId.value = poiId || '';
        if (shouldResetContent) {
            manualAoiJsonText.value = '';
            manualAoiError.value = '';
        }
        manualAoiSourceLayerName.value = layerName;
        manualAoiDialogVisible.value = true;

        if (!poiId && options?.showMissingIdHint) {
            message.info(t('layer.poiMissingIdHint'));
        }

        if (options?.autoOpenDetail) {
            openManualAoiDetailLink();
        }

        return true;
    }

    /** 解析用户输入的高德详情 JSON，尝试从中提取 POI ID，并触发绘制事件 */
    function drawAmapAoiFromManualJson() {
        manualAoiError.value = '';
        const jsonText = String(manualAoiJsonText.value || '').trim();
        if (!jsonText) {
            manualAoiError.value = t('layer.pasteAmapJsonFirst');
            message.warning(manualAoiError.value);
            return;
        }

        const inputPoiId = normalizeManualAoiPoiId(manualAoiPoiId.value);
        const poiId = inputPoiId || normalizeManualAoiPoiId(jsonText, { keepRawFallback: false });
        if (poiId) {
            manualAoiPoiId.value = poiId;
        }

        emit('draw-amap-aoi-from-json', {
            poiid: poiId,
            jsonText,
            sourceLayerName: manualAoiSourceLayerName.value,
        });

        // 取消自动关闭，允许用户继续修改 JSON 或 POI ID 以调整绘制结果
    }

    function buildAmapDetailUrl(rawPoiId) {
        const poiId = normalizeManualAoiPoiId(rawPoiId, { keepRawFallback: true });
        return poiId
            ? `https://www.amap.com/detail/get/detail?id=${encodeURIComponent(poiId)}`
            : 'https://www.amap.com/';
    }

    const manualAoiDetailUrl = computed(() => {
        return buildAmapDetailUrl(manualAoiPoiId.value);
    });

    function buildReverseGeocodeProperties(reverseResult) {
        const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
        const province = String(reverseResult?.province || '').trim();
        const city = String(reverseResult?.city || '').trim();
        const district = String(reverseResult?.district || '').trim();
        const township = String(reverseResult?.township || '').trim();
        const provider = String(reverseResult?.provider || '').trim();
        const businessAreaText = Array.isArray(reverseResult?.businessAreas)
            ? reverseResult.businessAreas
                  .map((item) => String(item?.name || '').trim())
                  .filter(Boolean)
                  .join('、')
            : '';

        return {
            逆地理编码地址: formattedAddress || '未解析',
            逆地理编码省: province || '未知',
            逆地理编码市: city || '未知',
            逆地理编码区县: district || '未知',
            逆地理编码乡镇: township || '未知',
            逆地理编码商圈: businessAreaText || '无',
            逆地理编码服务: provider || 'unknown',
        };
    }

    function drawPointByCoordinates() {
        coordInputError.value = '';
        const crsType = String(coordInputCRS.value || 'wgs84').toLowerCase();
        const result = processCoordinateInput(coordInputLon.value, coordInputLat.value, crsType);

        if (!result.valid) {
            coordInputError.value = result.message;
            message.warning(result.message);
            return;
        }

        emit('draw-point-by-coordinates', {
            lng: result.lng,
            lat: result.lat,
            crsType,
            displayName: generatePointName(result.lng, result.lat, crsType),
        });

        clearCoordinateInput();
    }

    async function drawPointByPositionCode() {
        coordInputPError.value = '';
        const code = String(coordInputP.value || '').trim();

        isDecodePBusy.value = true;
        try {
            const decodeResult = await decodePositionCodeToPointPayload(code);
            if (!decodeResult?.ok) {
                coordInputPError.value = String(decodeResult?.error || t('layer.pDecodeFailed'));
                message.warning(coordInputPError.value);
                return;
            }

            emit('draw-point-by-coordinates', {
                ...decodeResult.payload,
            });

            message.success(t('layer.pPointDrawn', { name: decodeResult.layerName }));
            clearPositionCodeInput();
        } finally {
            isDecodePBusy.value = false;
        }
    }

    async function drawPointByGeocodeAddress() {
        geocodeToolError.value = '';

        const inputAddress = String(geocodeAddressInput.value || '').trim();
        const inputCity = String(geocodeCityInput.value || '').trim();
        if (!inputAddress) {
            geocodeToolError.value = t('layer.geocodeAddressRequired');
            message.warning(geocodeToolError.value);
            return;
        }

        isGeocodeBusy.value = true;
        try {
            const geocodeResponse = await apiAddressGeocode(inputAddress, inputCity, { silent: true });
            const geocodeResult = geocodeResponse?.data || null;
            if (
                !geocodeResult ||
                !Number.isFinite(geocodeResult.lng) ||
                !Number.isFinite(geocodeResult.lat)
            ) {
                throw new Error(t('layer.geocodeNoCoords'));
            }
            let reverseResult = null;
            try {
                const reverseResponse = await apiReverseGeocodeWithFallback(
                    geocodeResult.lng,
                    geocodeResult.lat,
                    {
                        tiandituTk: tiandituTk.value,
                        silent: true,
                    },
                );
                reverseResult = reverseResponse?.data || null;
            } catch {
                reverseResult = null;
            }

            emit('draw-point-by-coordinates', {
                lng: geocodeResult.lng,
                lat: geocodeResult.lat,
                crsType: 'wgs84',
                displayName: inputAddress,
                label: inputAddress,
                layerName: inputAddress,
                properties: {
                    来源: '地理编码',
                    输入地址: inputAddress,
                    城市限定: inputCity || '无',
                    地理编码地址: String(geocodeResult?.formattedAddress || '').trim() || inputAddress,
                    地理编码级别: String(geocodeResult?.level || '').trim() || 'unknown',
                    地理编码ADCODE: String(geocodeResult?.adcode || '').trim() || 'unknown',
                    ...buildReverseGeocodeProperties(reverseResult),
                },
            });

            message.success(t('layer.geocodeSuccess', { address: inputAddress }));
        } catch (error) {
            const detail = error instanceof Error ? error.message : t('layer.geocodeFailed');
            geocodeToolError.value = detail;
            message.error(t('layer.geocodeFailedDetail', { detail }));
        } finally {
            isGeocodeBusy.value = false;
        }
    }

    function startReverseGeocodePick() {
        geocodeToolError.value = '';
        emit('interaction', 'ReverseGeocodePick');
    }

    return {
        // refs
        coordInputLon,
        coordInputLat,
        coordInputCRS,
        coordInputError,
        coordInputP,
        coordInputPError,
        geocodeAddressInput,
        geocodeCityInput,
        geocodeToolError,
        manualAoiPoiId,
        manualAoiJsonText,
        manualAoiError,
        manualAoiDialogVisible,
        manualAoiSourceLayerName,
        isDecodePBusy,
        isGeocodeBusy,
        manualAoiDetailUrl,
        // methods
        copyLayerCoordinates,
        getCurrentFormatConfig,
        clearCoordinateInput,
        clearPositionCodeInput,
        _clearGeocodeInput,
        closeManualAoiDialog,
        openManualAoiDetailLink,
        openManualAoiDialogByPoi,
        drawAmapAoiFromManualJson,
        drawPointByCoordinates,
        drawPointByPositionCode,
        drawPointByGeocodeAddress,
        startReverseGeocodePick,
        normalizeManualAoiPoiId,
    };
}
