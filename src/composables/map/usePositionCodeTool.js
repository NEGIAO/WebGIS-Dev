import { apiReverseGeocodeWithFallback } from '../../api';
import { decodePos } from '../../utils/biz';

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
        逆地理编码服务: provider || 'unknown'
    };
}

/**
 * p 参数解码业务。
 * - 负责 p 参数校验与解码
 * - 负责逆地理编码补全属性
 * - 返回可直接用于 draw-point-by-coordinates 的 payload
 */
export function usePositionCodeTool({
    tiandituTk = '',
    reverseGeocode = apiReverseGeocodeWithFallback
} = {}) {
    async function decodePositionCodeToPointPayload(code) {
        const normalizedCode = String(code || '').trim();
        if (!normalizedCode || normalizedCode === '0') {
            return {
                ok: false,
                error: '请输入有效的 p 参数（不能为 0）'
            };
        }

        const decoded = decodePos(normalizedCode);
        if (!decoded || !Number.isFinite(decoded.lng) || !Number.isFinite(decoded.lat)) {
            return {
                ok: false,
                error: 'p 参数解码失败，请检查编码内容'
            };
        }

        let reverseResult = null;
        try {
            const reverseResponse = await reverseGeocode(decoded.lng, decoded.lat, {
                tiandituTk,
                silent: true
            });
            reverseResult = reverseResponse?.data || null;
        } catch {
            reverseResult = null;
        }

        const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
        const layerName = formattedAddress || `P_${normalizedCode}`;

        return {
            ok: true,
            layerName,
            payload: {
                lng: decoded.lng,
                lat: decoded.lat,
                crsType: 'wgs84',
                displayName: layerName,
                label: layerName,
                layerName,
                properties: {
                    来源: 'p参数解码',
                    原始编码: normalizedCode,
                    解析后经度: Number(decoded.lng.toFixed(6)),
                    解析后纬度: Number(decoded.lat.toFixed(6)),
                    ...buildReverseGeocodeProperties(reverseResult)
                }
            }
        };
    }

    return {
        decodePositionCodeToPointPayload
    };
}
