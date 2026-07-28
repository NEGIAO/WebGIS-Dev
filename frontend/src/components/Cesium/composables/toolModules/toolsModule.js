/**
 * toolsModule.js
 * 空间工具模块定义
 * 模型管理、增强相机、高度采样
 * 模块元数据 + 控件定义合并为一个文件
 */

import { translate as t } from '@/composables/useLocale';

/**
 * 创建空间工具模块
 * @param {{ modelCount?: import('vue').Ref<number>, flightState?: import('vue').Ref<string> }} modelManager - 模型管理器
 * @param {{ flightState?: import('vue').Ref<string> }} cameraEnhanced - 增强相机
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createToolsModule(_modelManager, _cameraEnhanced) {
    const modelCount = _modelManager?.modelCount?.value ?? 0;
    const flightState = _cameraEnhanced?.flightState?.value;

    const status = (modelCount > 0 ? t('cesium.status.models') : '')
        || (flightState === 'flying' ? t('cesium.status.flying') : t('cesium.status.ready'));
    const statusTone = modelCount > 0 ? 'success' : 'neutral';

    return {
        id: 'tools',
        title: t('cesium.module.tools.title'),
        description: t('cesium.module.tools.description'),
        status,
        statusTone,
        controls: [
            { id: 'modelManagerEnabled', label: t('cesium.module.tools.modelManagerEnabled'), type: 'toggle', value: false, tooltip: t('cesium.module.tools.modelManagerEnabledTip') },
            { id: 'cameraEnhancedEnabled', label: t('cesium.module.tools.cameraEnhancedEnabled'), type: 'toggle', value: false, tooltip: t('cesium.module.tools.cameraEnhancedEnabledTip') },
            { id: 'heightSamplerEnabled', label: t('cesium.module.tools.heightSamplerEnabled'), type: 'toggle', value: false, tooltip: t('cesium.module.tools.heightSamplerEnabledTip') },
        ],
    };
}