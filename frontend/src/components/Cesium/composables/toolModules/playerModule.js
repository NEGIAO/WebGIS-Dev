/**
 * playerModule.js
 * 人物漫游模块定义
 * 第一/第三人称视角 + WASD 移动 + 碰撞检测 + 飞行模式
 * 模块元数据 + 控件定义合并为一个文件
 */

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
        ? (isFirstPerson ? '第一人称' : '第三人称')
        : '未启动';
    const statusTone = isActive ? 'success' : 'neutral';

    return {
        id: 'player',
        title: '人物漫游',
        description: '第一/第三人称视角 + WASD 移动 + 碰撞检测 + 飞行模式',
        status,
        statusTone,
        actions: [
            {
                id: 'toggle',
                label: isActive ? '停止漫游' : '启动漫游',
                variant: isActive ? 'danger' : 'primary',
            },
            {
                id: 'changeView',
                label: '切换视角',
                disabled: !isActive,
            },
            {
                id: 'setNavTarget',
                label: hasNavTarget ? '更改目标' : '设置导航',
            },
            {
                id: 'clearNavTarget',
                label: '清除导航',
                disabled: !hasNavTarget,
            },
        ],
        controls: [
            { id: 'speed', label: '行走速度', type: 'range', value: params.speed, min: 50, max: 2000, step: 10, disabled: !isActive, tooltip: '地面行走速度（米/秒）' },
            { id: 'flySpeed', label: '飞行速度', type: 'range', value: params.flySpeed, min: 2000, max: 1000000, step: 1000, disabled: !isActive, tooltip: '飞行模式速度（米/秒）' },
            { id: 'gravity', label: '重力', type: 'range', value: params.gravity, min: -6000, max: 0, step: 50, disabled: !isActive, tooltip: '重力加速度（负值），绝对值越大下落越快' },
            { id: 'jumpHeight', label: '跳跃高度', type: 'range', value: params.jumpHeight, min: 0, max: 3000, step: 50, disabled: !isActive, tooltip: '跳跃初始高度（米）' },
            { id: 'sensitivity', label: '鼠标灵敏度', type: 'range', value: params.sensitivity, min: 1, max: 20, step: 0.5, disabled: !isActive, tooltip: '鼠标视角转动灵敏度' },
            { id: 'acceleration', label: '加速惯性', type: 'range', value: params.acceleration, min: 1, max: 100, step: 1, disabled: !isActive, tooltip: '值越大加速越快。WASD 按下后到达目标速度的响应快慢。' },
            { id: 'deceleration', label: '减速惯性', type: 'range', value: params.deceleration, min: 1, max: 100, step: 1, disabled: !isActive, tooltip: '值越大松手后停得越快。影响滑行/惯性感。' },
            { id: 'spawnHeight', label: '初始高度', type: 'range', value: params.spawnHeight, min: 50, max: 5000, step: 50, disabled: false, tooltip: '漫游启动时的离地高度（米），重启后生效。' },
        ],
    };
}