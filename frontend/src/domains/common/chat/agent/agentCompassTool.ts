/**
 * Agent 罗盘控制工具（V3.7.10）
 *
 * 只做一件事：把罗盘启用在当前地图视图中心，并返回可复用的地点上下文。
 * 罗盘图层渲染与 URL 同步由 CompassManager 既有 watcher 负责，本工具不介入。
 *
 * 工具本身不移动地图；用户点击卦象后是否自动追问，由 compassAnalysisSession
 * 的一次性标志驱动，面板侧消费。
 */

import { getThemeExplanationByConfig } from '@common/compass/utils/themeExplanationMapper';
import { reverseGeocodeTool } from './agentGeocodingTools';
import { armCompassAnalysis } from './compassAnalysisSession';

/** 罗盘工具结果：与其余 Agent 只读工具保持同构 */
export interface CompassToolResult {
    success: boolean;
    code: string;
    message: string;
    [key: string]: unknown;
}

export interface CompassAgentToolDeps {
    /** Pinia 罗盘 store（由宿主注入，避免在工具层创建 store 实例） */
    compassStore: any;
    /** 无副作用的当前地图上下文快照 */
    getMapContext: () => any;
}

const MAX_RADIUS_METERS = 2_000_000;

export function createCompassAgentTool({ compassStore, getMapContext }: CompassAgentToolDeps) {
    /**
     * 在当前地图中心启用罗盘，并武装一次「等待用户点卦象」会话。
     *
     * @param params.themeId 可选主题 cid（compass/circle/dark/polygon/simple）
     * @param params.radiusMeters 可选半径（米），不传则沿用当前值
     * @returns 结构化结果；失败时返回 code + message，不抛异常
     */
    async function enableCompass({
        themeId = '',
        radiusMeters,
    }: { themeId?: string; radiusMeters?: number } = {}): Promise<CompassToolResult> {
        const context = typeof getMapContext === 'function' ? getMapContext() : null;
        const lng = Number(context?.center?.lng);
        const lat = Number(context?.center?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return {
                success: false,
                code: 'MAP_CENTER_UNAVAILABLE',
                message: '无法读取当前地图中心：请先在地图上定位到目标区域，再让我启用罗盘',
            };
        }

        try {
            const cid = String(themeId || '').trim();
            if (cid) await compassStore.setCidAndLoad(cid);
            else await compassStore.ensureConfigLoaded();
        } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : 'unknown error';
            return {
                success: false,
                code: 'COMPASS_THEME_LOAD_FAILED',
                message: `罗盘主题配置加载失败：${detail}`,
            };
        }

        const radius = Number(radiusMeters);
        if (Number.isFinite(radius) && radius > 0) {
            compassStore.setPhysicalRadiusMeters(Math.min(radius, MAX_RADIUS_METERS));
        }

        compassStore.setMode('vector');
        compassStore.setPosition(lng, lat);
        compassStore.setEnabled(true);

        // 武装必须在 setEnabled 之后：setEnabled/setPosition 会清空 selectedPalace，
        // 若先武装再清选中，可能出现「无选择却消费标志」的空转。
        armCompassAnalysis();

        const themeName = getThemeExplanationByConfig(compassStore.config)?.themeName
            || String(compassStore.cid || '默认主题');
        const geo = await reverseGeocodeTool({ lng, lat });
        const place = geo.success
            ? String(geo.location?.region || geo.location?.address || '')
            : '';
        const placeLabel = place || `坐标 (${lng.toFixed(6)}, ${lat.toFixed(6)})`;
        const radiusLabel = Math.round(Number(compassStore.physicalRadiusMeters) || 0);

        return {
            success: true,
            code: 'OK',
            message: `罗盘已在当前地图中心启用：${placeLabel}，中心 (${lng.toFixed(6)}, ${lat.toFixed(6)})（WGS-84），主题「${themeName}」，分析半径约 ${radiusLabel} 米。请让用户点击罗盘上想分析的卦象；用户选择后系统会自动回传，届时结合该地地理环境给出风水条件分析。`,
            center: { lng, lat },
            location: { lng, lat, address: placeLabel, region: placeLabel },
            theme: themeName,
            radiusMeters: radiusLabel,
        };
    }

    return { enableCompass };
}
