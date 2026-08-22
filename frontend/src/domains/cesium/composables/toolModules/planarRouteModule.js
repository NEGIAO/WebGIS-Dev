/**
 * PlanarRouteModule.js
 * 面状航线模块定义（toolPanel 模块卡片）
 *
 * 从原 planar-wayline 页面组件中抽离的参数配置层：
 * - 参数与统计直接读取 modules/planar-route/config/planarConfig.ts 的响应式 globeConfig
 * - 运行时状态（hasRoute/isCalculating/pickingTakeoff 等）由 planarRouteController 上报
 * - 控件以 lil-gui 风格声明，由 LilGuiControls 组装渲染；动作按钮走 handleToolAction 分发
 */

import { translate as t } from '@common/app/useLocale';
import globeConfig, { PLANAR_SPEED_HARD_MAX } from '../../modules/planar-route/config/planarConfig';

/**
 * 创建面状航线模块
 * @param {import('vue').Ref<{ hasRoute: boolean, isCalculating: boolean, isImporting: boolean, pickingTakeoff: boolean, activeRouteIndex: number, routeOptions: Array<{label: string, value: number}>, routeName: string }>} state - 运行时状态快照
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, actions: Array, controls: Array }}
 */
export function createPlanarRouteModule(state) {
    const snapshot = state.value;
    const busy = snapshot.isCalculating || snapshot.isImporting;
    const picking = snapshot.pickingTakeoff;

    return {
        id: 'planarRoute',
        title: t('cesium.module.planarRoute.title'),
        description: buildDescription(),
        status: resolveStatus(snapshot),
        statusTone: snapshot.hasRoute ? 'success' : 'neutral',
        actions: [
            {
                id: 'setTakeoffPoint',
                label: picking
                    ? t('cesium.module.planarRoute.action.cancelPick')
                    : globeConfig.isSetTakeoffPoint
                        ? t('cesium.module.planarRoute.action.repickTakeoff')
                        : t('cesium.module.planarRoute.action.pickTakeoff'),
                variant: picking ? 'danger' : 'default',
                disabled: busy,
            },
            {
                id: 'importKmz',
                label: snapshot.isImporting ? t('cesium.module.planarRoute.action.importing') : t('cesium.module.planarRoute.action.importKmz'),
                variant: 'default',
                disabled: busy,
            },
            {
                id: 'saveKmz',
                label: t('cesium.module.planarRoute.action.saveKmz'),
                variant: 'primary',
                disabled: !snapshot.hasRoute || busy,
            },
            {
                id: 'clearAll',
                label: t('cesium.module.planarRoute.action.clearAll'),
                variant: 'danger',
                disabled: !snapshot.hasRoute && !globeConfig.isSetTakeoffPoint && !globeConfig.area,
            },
        ],
        controls: createPlanarRouteControls(snapshot),
    };
}

/**
 * 构建参数控件列表
 * @param {{ hasRoute: boolean, isCalculating: boolean, isImporting: boolean, activeRouteIndex: number, routeOptions: Array, routeName: string }} snapshot
 * @returns {Array<object>}
 */
function createPlanarRouteControls(snapshot) {
    const isOblique = Number(globeConfig.climbType) === 2;
    // 采集方式 / 高度模式 / 角度等在规划中禁用，防止并发重规划抖动
    const locked = snapshot.isCalculating || snapshot.isImporting;
    return [
        {
            id: 'routeName',
            label: t('cesium.module.planarRoute.control.routeName'),
            type: 'text',
            value: snapshot.routeName || '',
            tooltip: t('cesium.module.planarRoute.control.routeNameTip'),
        },
        {
            id: 'climbType',
            label: t('cesium.module.planarRoute.control.climbType'),
            type: 'select',
            value: Number(globeConfig.climbType),
            options: [
                { label: t('cesium.module.planarRoute.option.climbOrtho'), value: 1 },
                { label: t('cesium.module.planarRoute.option.climbOblique'), value: 2 },
            ],
            tooltip: t('cesium.module.planarRoute.control.climbTypeTip'),
        },
        {
            id: 'heightType',
            label: t('cesium.module.planarRoute.control.heightMode'),
            type: 'select',
            value: Number(globeConfig.heightType),
            options: [
                { label: t('cesium.module.planarRoute.option.heightAgl'), value: 3 },
                { label: t('cesium.module.planarRoute.option.heightAlt'), value: 2 },
                { label: t('cesium.module.planarRoute.option.heightAsl'), value: 1 },
            ],
            disabled: locked,
            tooltip: t(`cesium.module.planarRoute.tip.height${Number(globeConfig.heightType)}`),
        },
        {
            id: 'lineHeight',
            label: t('cesium.module.planarRoute.control.lineHeight'),
            type: 'range',
            min: 2,
            max: 1500,
            step: 1,
            value: Number(globeConfig.lineHeight),
            displayValue: `${Math.round(Number(globeConfig.lineHeight))} m`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.lineHeightTip'),
        },
        {
            id: 'speed',
            label: t('cesium.module.planarRoute.control.speed'),
            type: 'range',
            min: 1,
            max: PLANAR_SPEED_HARD_MAX,
            step: 0.1,
            value: Number(globeConfig.speed),
            displayValue: `${Number(globeConfig.speed).toFixed(1)} m/s`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.tip.speed', { suggested: Number(globeConfig.maxSpeed).toFixed(1), max: PLANAR_SPEED_HARD_MAX }),
        },
        {
            id: 'gimbalPitch',
            label: t('cesium.module.planarRoute.control.gimbalPitch'),
            type: 'range',
            min: -85,
            max: -40,
            step: 1,
            value: Number(globeConfig.smartObliqueGimbalPitch),
            displayValue: `${Math.round(Number(globeConfig.smartObliqueGimbalPitch))}°`,
            disabled: locked || !isOblique,
            tooltip: t('cesium.module.planarRoute.control.gimbalPitchTip'),
        },
        {
            id: 'lineAngle',
            label: t('cesium.module.planarRoute.control.lineAngle'),
            type: 'range',
            min: 0,
            max: 179,
            step: 1,
            value: Number(globeConfig.lineAngle),
            displayValue: `${Number(globeConfig.lineAngle).toFixed(1)}°`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.lineAngleTip'),
        },
        {
            id: 'takeoffSpeed',
            label: t('cesium.module.planarRoute.control.takeoffSpeed'),
            type: 'range',
            min: 1,
            max: 15,
            step: 1,
            value: Number(globeConfig.takeoffSpeed),
            displayValue: `${Math.round(Number(globeConfig.takeoffSpeed))} m/s`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.takeoffSpeedTip'),
        },
        {
            id: 'overlapW',
            label: t('cesium.module.planarRoute.control.overlapSide'),
            type: 'range',
            min: 10,
            max: 90,
            step: 1,
            value: Number(globeConfig.overlapW),
            displayValue: `${Math.round(Number(globeConfig.overlapW))} %`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.overlapSideTip'),
        },
        {
            id: 'overlapH',
            label: t('cesium.module.planarRoute.control.overlapForward'),
            type: 'range',
            min: 10,
            max: 90,
            step: 1,
            value: Number(globeConfig.overlapH),
            displayValue: `${Math.round(Number(globeConfig.overlapH))} %`,
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.overlapForwardTip'),
        },
        {
            id: 'photoTriggerMode',
            label: t('cesium.module.planarRoute.control.photoTrigger'),
            type: 'select',
            value: globeConfig.photoTriggerMode === 'distance' ? 'distance' : 'time',
            options: [
                { label: t('cesium.module.planarRoute.option.triggerTime'), value: 'time' },
                { label: t('cesium.module.planarRoute.option.triggerDistance'), value: 'distance' },
            ],
            disabled: locked,
            tooltip: t('cesium.module.planarRoute.control.photoTriggerTip'),
        },
        {
            id: 'activeRoute',
            label: t('cesium.module.planarRoute.control.activeRoute'),
            type: 'select',
            value: snapshot.activeRouteIndex ?? 0,
            options: snapshot.routeOptions.length > 0
                ? snapshot.routeOptions
                : [{ label: t('cesium.module.planarRoute.option.noRoute'), value: 0 }],
            disabled: locked || snapshot.routeOptions.length <= 1,
            tooltip: t('cesium.module.planarRoute.control.activeRouteTip'),
        },
    ];
}

/**
 * 模块卡片状态徽标文案。
 * @param {{ hasRoute: boolean, isCalculating: boolean, isImporting: boolean, pickingTakeoff: boolean }} snapshot
 * @returns {string}
 */
function resolveStatus(snapshot) {
    if (snapshot.isImporting) return t('cesium.module.planarRoute.status.importing');
    if (snapshot.isCalculating) return t('cesium.module.planarRoute.status.calculating');
    if (snapshot.pickingTakeoff) return t('cesium.module.planarRoute.status.picking');
    if (snapshot.hasRoute) return t('cesium.module.planarRoute.status.ready');
    return t('cesium.module.planarRoute.status.idle');
}

/**
 * 卡片描述行：基础说明 + 测区/航线实时统计。
 * @returns {string}
 */
function buildDescription() {
    const base = t('cesium.module.planarRoute.description');
    const stats = [];
    if (globeConfig.area > 0) {
        stats.push(`${t('cesium.module.planarRoute.stats.area')} ${formatArea(globeConfig.area)} m²`);
    }
    if (globeConfig.lineLength > 0) {
        stats.push(`${t('cesium.module.planarRoute.stats.length')} ${globeConfig.lineLength} m`);
    }
    if (globeConfig.flyTime && globeConfig.flyTime !== '0') {
        stats.push(`${t('cesium.module.planarRoute.stats.time')} ${globeConfig.flyTime}`);
    }
    if (globeConfig.photoCount > 0) {
        stats.push(`${t('cesium.module.planarRoute.stats.photos')} ${globeConfig.photoCount}`);
    }
    return stats.length > 0 ? `${base}｜${stats.join(' · ')}` : base;
}

/**
 * 格式化测区面积（万平方米以上换算 km²）。
 * @param {number} area 面积（平方米）
 * @returns {string}
 */
function formatArea(area) {
    if (area >= 1000000) return `${(area / 1000000).toFixed(2)}k`;
    return Math.round(area).toLocaleString();
}
