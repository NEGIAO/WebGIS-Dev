/**
 * playerModule.js
 * 人物漫游模块定义
 * 第一/第三人称视角 + WASD 移动 + 碰撞检测 + 飞行模式
 * 模块元数据 + 控件定义合并为一个文件
 */

import { translate as t } from '@common/app/useLocale';

/**
 * 创建人物漫游模块
 * @param {import('vue').Ref} playerParams - 人物参数 ref
 * @param {object} _playerController - 人物控制器实例
 * @param {import('vue').Ref} _playerController.isActive
 * @param {import('vue').Ref} _playerController.isFirstPerson
 * @param {import('vue').Ref} _playerController.navTarget
 * @returns {object}
 */
export function createPlayerModule(playerParams, _playerController) {
    const isActive = _playerController?.isActive?.value;
    const isFirstPerson = _playerController?.isFirstPerson?.value;
    const hasNavTarget = !!_playerController?.navTarget?.value;
    const params = playerParams.value;

    const status = isActive
        ? (isFirstPerson ? t('cesium.status.firstPerson') : t('cesium.status.thirdPerson'))
        : t('cesium.status.notStarted');
    const statusTone = isActive ? 'success' : 'neutral';

    return {
        id: 'player',
        title: t('cesium.module.player.title'),
        description: t('cesium.module.player.description'),
        status,
        statusTone,
        actions: [
            {
                id: 'toggle',
                label: isActive ? t('cesium.module.player.stop') : t('cesium.module.player.start'),
                variant: isActive ? 'danger' : 'primary',
            },
            {
                id: 'changeView',
                label: t('cesium.module.player.changeView'),
                disabled: !isActive,
            },
            {
                id: 'setNavTarget',
                label: hasNavTarget ? t('cesium.module.player.changeNav') : t('cesium.module.player.setNav'),
            },
            {
                id: 'clearNavTarget',
                label: t('cesium.module.player.clearNav'),
                disabled: !hasNavTarget,
            },
        ],
        controls: [
            { id: 'speed', label: t('cesium.module.player.speed'), type: 'range', value: params.speed, min: 50, max: 2000, step: 10, disabled: !isActive, tooltip: t('cesium.module.player.speedTip') },
            { id: 'flySpeed', label: t('cesium.module.player.flySpeed'), type: 'range', value: params.flySpeed, min: 2000, max: 1000000, step: 1000, disabled: !isActive, tooltip: t('cesium.module.player.flySpeedTip') },
            { id: 'gravity', label: t('cesium.module.player.gravity'), type: 'range', value: params.gravity, min: -6000, max: 0, step: 50, disabled: !isActive, tooltip: t('cesium.module.player.gravityTip') },
            { id: 'jumpHeight', label: t('cesium.module.player.jumpHeight'), type: 'range', value: params.jumpHeight, min: 0, max: 3000, step: 50, disabled: !isActive, tooltip: t('cesium.module.player.jumpHeightTip') },
            { id: 'sensitivity', label: t('cesium.module.player.sensitivity'), type: 'range', value: params.sensitivity, min: 1, max: 20, step: 0.5, disabled: !isActive, tooltip: t('cesium.module.player.sensitivityTip') },
            { id: 'acceleration', label: t('cesium.module.player.acceleration'), type: 'range', value: params.acceleration, min: 1, max: 100, step: 1, disabled: !isActive, tooltip: t('cesium.module.player.accelerationTip') },
            { id: 'deceleration', label: t('cesium.module.player.deceleration'), type: 'range', value: params.deceleration, min: 1, max: 100, step: 1, disabled: !isActive, tooltip: t('cesium.module.player.decelerationTip') },
            { id: 'spawnHeight', label: t('cesium.module.player.spawnHeight'), type: 'range', value: params.spawnHeight, min: 50, max: 5000, step: 50, disabled: false, tooltip: t('cesium.module.player.spawnHeightTip') },
        ],
    };
}