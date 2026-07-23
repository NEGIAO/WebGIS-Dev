/**
 * sceneModule.js
 * 场景导航模块定义
 * 提供相机飞行和演示数据加载的入口
 * 模块元数据 + 控件定义合并为一个文件
 */

/**
 * 创建场景导航模块
 * @param {{ flyToHome?: Function, flyToEverest?: Function, loadCustomTileset?: Function }} sceneActions - 场景操作回调
 * @returns {{ id: string, title: string, description: string, actions: Array }}
 */
export function createSceneModule(_sceneActions = {}) {
    return {
        id: 'scene',
        title: '场景导航',
        description: '相机飞行和演示数据',
        actions: [
            { id: 'home', label: '回到初始视角' },
            { id: 'everest', label: '飞越珠峰' },
            { id: 'tileset', label: '加载3D模型' },
        ],
    };
}