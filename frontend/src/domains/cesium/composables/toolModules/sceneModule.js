/**
 * sceneModule.js
 * 场景导航模块定义
 * 提供相机飞行和演示数据加载的入口
 * 模块元数据 + 控件定义合并为一个文件
 */

import { translate as t } from '@common/app/useLocale';

/**
 * 创建场景导航模块
 * @param {{ flyToHome?: Function, flyToEverest?: Function, loadCustomTileset?: Function }} sceneActions - 场景操作回调
 * @returns {{ id: string, title: string, description: string, actions: Array }}
 */
export function createSceneModule(_sceneActions = {}) {
    return {
        id: 'scene',
        title: t('cesium.module.scene.title'),
        description: t('cesium.module.scene.description'),
        actions: [
            { id: 'home', label: t('cesium.module.scene.home') },
            { id: 'everest', label: t('cesium.module.scene.everest') },
            { id: 'tileset', label: t('cesium.module.scene.tileset') },
        ],
    };
}
