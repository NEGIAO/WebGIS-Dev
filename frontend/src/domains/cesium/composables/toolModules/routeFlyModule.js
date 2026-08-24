/**
 * RouteFlyModule.js
 * 路线漫游模块定义（toolPanel 模块卡片）
 *
 * 手绘贴地线路 + 第一/第三人称相机漫游：
 * - 参数与统计读取 useCesiumToolModules 注入的 routeFlyState 响应式快照
 * - 运行时状态（isDrawing/isFlying/multiplier 等）由 FirstPersonFlyController 上报
 * - 控件以 lil-gui 风格声明，由 LilGuiControls 组装渲染；动作按钮走 handleToolAction 分发
 */

import { translate as t } from '@common/app/useLocale';

/**
 * 创建路线漫游模块卡片
 * @param {import('vue').Ref<{ isDrawing: boolean, pointCount: number, hasRoute: boolean, isFlying: boolean, isPaused: boolean, multiplier: number, routeLengthText: string, durationText: string, viewMode: string }>} state - 运行时状态快照
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, actions: Array, controls: Array }}
 */
export function createRouteFlyModule(state) {
    const snapshot = state.value;
    const flying = snapshot.isFlying;

    return {
        id: 'routeFly',
        title: t('cesium.module.routeFly.title'),
        description: buildDescription(snapshot),
        status: resolveStatus(snapshot),
        statusTone: flying ? 'success' : snapshot.hasRoute ? 'info' : 'neutral',
        actions: [
            {
                id: 'drawRoute',
                label: snapshot.isDrawing ? t('cesium.module.routeFly.action.finishDraw') : t('cesium.module.routeFly.action.drawRoute'),
                variant: snapshot.isDrawing ? 'danger' : 'default',
            },            { id: 'startFly', label: t('cesium.module.routeFly.action.startFly'), variant: 'primary', disabled: !snapshot.hasRoute || flying },
            { id: 'suspend', label: snapshot.isPaused ? t('cesium.module.routeFly.action.resume') : t('cesium.module.routeFly.action.suspend'), disabled: !flying },
            { id: 'speedUp', label: t('cesium.module.routeFly.action.speedUp'), disabled: !flying },
            { id: 'speedDown', label: t('cesium.module.routeFly.action.speedDown'), disabled: !flying },
            { id: 'stop', label: t('cesium.module.routeFly.action.stop'), variant: 'danger', disabled: !flying && !snapshot.isPaused },
            {
                id: 'importRoute',
                label: t('cesium.module.routeFly.action.importRoute'),
                variant: 'default',
                disabled: snapshot.isDrawing,
            },
            {
                id: 'exportRoute',
                label: t('cesium.module.routeFly.action.exportRoute'),
                variant: 'default',
                disabled: !snapshot.hasRoute,
            },
            { id: 'clearAll', label: t('cesium.module.routeFly.action.clearAll'), variant: 'danger', disabled: !snapshot.hasRoute && !snapshot.isDrawing && snapshot.pointCount === 0 },
        ],
        controls: createRouteFlyControls(snapshot),
    };
}

/**
 * 构建参数控件列表（value 全部来自控制器上报的快照，保证预设/运行时变更后 UI 同步）
 */
function createRouteFlyControls(snapshot) {
    const locked = snapshot.isDrawing;
    const live = flyingLocked(snapshot);
    const distance = num(snapshot.distance, 100);
    const heading = num(snapshot.heading, 0);
    const pitch = num(snapshot.pitch, -30);
    const flyHeight = num(snapshot.flyHeight, 50);
    const speed = num(snapshot.multiplier, 30);

    return [
        {
            id: 'viewPreset',
            label: t('cesium.module.routeFly.control.viewPreset'),
            type: 'select',
            value: snapshot.lastPreset || 'third',
            options: [
                { label: t('cesium.module.routeFly.option.viewFirst'), value: 'first' },
                { label: t('cesium.module.routeFly.option.viewThird'), value: 'third' },
            ],
            tooltip: t('cesium.module.routeFly.tip.viewPreset'),
        },
        {
            id: 'distance',
            label: t('cesium.module.routeFly.control.distance'),
            type: 'range',
            min: 0.1,
            max: 2000,
            step: 0.1,
            value: distance,
            displayValue: `${distance.toFixed(1)} m`,
            disabled: !live,
        },
        {
            id: 'heading',
            label: t('cesium.module.routeFly.control.heading'),
            type: 'range',
            min: -180,
            max: 180,
            step: 1,
            value: heading,
            displayValue: `${Math.round(heading)}°`,
            disabled: !live,
            tooltip: t('cesium.module.routeFly.tip.heading'),
        },
        {
            id: 'pitch',
            label: t('cesium.module.routeFly.control.pitch'),
            type: 'range',
            min: -90,
            max: 90,
            step: 1,
            value: pitch,
            displayValue: `${Math.round(pitch)}°`,
            disabled: !live,
        },
        {
            id: 'flyHeight',
            label: t('cesium.module.routeFly.control.flyHeight'),
            type: 'range',
            min: 0,
            max: 1000,
            step: 5,
            value: flyHeight,
            displayValue: `${Math.round(flyHeight)} m`,
            disabled: !snapshot.hasRoute,
            tooltip: t('cesium.module.routeFly.tip.flyHeight'),
        },
        {
            id: 'speed',
            label: t('cesium.module.routeFly.control.speed'),
            type: 'range',
            min: 0.125,
            max: 256,
            step: 0.125,
            value: speed,
            displayValue: `${speed.toFixed(2)}x`,
            disabled: !live,
        },
        {
            id: 'sampleStep',
            label: t('cesium.module.routeFly.control.sampleStep'),
            type: 'range',
            min: 5,
            max: 200,
            step: 5,
            value: num(snapshot.sampleStep, 20),
            displayValue: `${num(snapshot.sampleStep, 20)} m`,
            disabled: locked || snapshot.isFlying,
            tooltip: t('cesium.module.routeFly.tip.sampleStep'),
        },
        {
            id: 'clampToBuildings',
            label: t('cesium.module.routeFly.control.clampToBuildings'),
            type: 'toggle',
            value: snapshot.clampToBuildings !== false,
            disabled: locked || snapshot.isFlying,
            tooltip: t('cesium.module.routeFly.tip.clampToBuildings'),
        },
        {
            id: 'modelUri',
            label: t('cesium.module.routeFly.control.modelUri'),
            type: 'text',
            value: snapshot.modelUri || '',
            tooltip: t('cesium.module.routeFly.tip.modelUri'),
        },
        {
            id: 'showModel',
            label: t('cesium.module.routeFly.control.showModel'),
            type: 'toggle',
            value: snapshot.showModel === true,
        },
        {
            id: 'modelScale',
            label: t('cesium.module.routeFly.control.modelScale'),
            type: 'range',
            min: 0.1,
            max: 10,
            step: 0.1,
            value: num(snapshot.modelScale, 1),
            disabled: !live,
        },
        {
            id: 'modelHeadingOffset',
            label: t('cesium.module.routeFly.control.modelHeadingOffset'),
            type: 'range',
            min: -180,
            max: 180,
            step: 1,
            value: num(snapshot.modelHeadingOffset, 0),
            displayValue: `${Math.round(num(snapshot.modelHeadingOffset, 0))}°`,
            disabled: !live,
        },
        {
            id: 'showPath',
            label: t('cesium.module.routeFly.control.showPath'),
            type: 'toggle',
            value: snapshot.showPath !== false,
        },
        {
            id: 'showMarkers',
            label: t('cesium.module.routeFly.control.showMarkers'),
            type: 'toggle',
            value: snapshot.showMarkers !== false,
        },
        {
            id: 'exportFormat',
            label: t('cesium.module.routeFly.control.exportFormat'),
            type: 'select',
            value: snapshot.exportFormat || 'geojson',
            options: [
                { label: t('cesium.module.routeFly.option.fmtGeoJson'), value: 'geojson' },
                { label: t('cesium.module.routeFly.option.fmtKml'), value: 'kml' },
                { label: t('cesium.module.routeFly.option.fmtKmz'), value: 'kmz' },
            ],
            disabled: !snapshot.hasRoute,
            tooltip: t('cesium.module.routeFly.tip.exportFormat'),
        },
    ];
}

/** 数值兜底转换 */
function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/** 视角/速度类运行时控件仅在漫游中可调 */
function flyingLocked(snapshot) {
    return snapshot.isFlying && !snapshot.isPaused;
}

/**
 * 卡片状态徽标文案
 */
function resolveStatus(snapshot) {
    if (snapshot.isDrawing) return t('cesium.module.routeFly.status.drawing');
    if (snapshot.isPaused) return t('cesium.module.routeFly.status.paused');
    if (snapshot.isFlying) return t('cesium.module.routeFly.status.flying');
    if (snapshot.hasRoute) return t('cesium.module.routeFly.status.ready');
    return t('cesium.module.routeFly.status.idle');
}

/**
 * 卡片描述行：基础说明 + 航点/总长/预计时长实时统计
 */
function buildDescription(snapshot) {
    const base = t('cesium.module.routeFly.description');
    // 错误优先展示（导入失败/无路线等），4 秒后自动清除
    if (snapshot.errorText) {
        return `${base}｜⚠ ${snapshot.errorText}`;
    }
    const stats = [];
    if (snapshot.pointCount > 0) {
        stats.push(`${t('cesium.module.routeFly.stats.points')} ${snapshot.pointCount}`);
    }
    if (snapshot.routeLengthText) {
        stats.push(`${t('cesium.module.routeFly.stats.length')} ${snapshot.routeLengthText}`);
    }
    if (snapshot.durationText) {
        stats.push(`${t('cesium.module.routeFly.stats.duration')} ${snapshot.durationText}`);
    }
    return stats.length > 0 ? `${base}｜${stats.join(' · ')}` : base;
}
