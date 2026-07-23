/**
 * toolsModule.js
 * 空间工具模块定义
 * 模型管理、增强相机、高度采样
 * 模块元数据 + 控件定义合并为一个文件
 */

/**
 * 创建空间工具模块
 * @param {{ modelCount?: import('vue').Ref<number>, flightState?: import('vue').Ref<string> }} modelManager - 模型管理器
 * @param {{ flightState?: import('vue').Ref<string> }} cameraEnhanced - 增强相机
 * @returns {{ id: string, title: string, description: string, status: string, statusTone: string, controls: Array }}
 */
export function createToolsModule(_modelManager, _cameraEnhanced) {
    const modelCount = _modelManager?.modelCount?.value ?? 0;
    const flightState = _cameraEnhanced?.flightState?.value;

    const status = (modelCount > 0 ? '模型' : '')
        || (flightState === 'flying' ? '飞行中' : '就绪');
    const statusTone = modelCount > 0 ? 'success' : 'neutral';

    return {
        id: 'tools',
        title: '空间工具',
        description: '模型加载、增强相机、高度采样（Tellux 移植）',
        status,
        statusTone,
        controls: [
            { id: 'modelManagerEnabled', label: '模型管理', type: 'toggle', value: false, tooltip: '启用后可加载 glTF/GLB 模型到地理坐标位置' },
            { id: 'cameraEnhancedEnabled', label: '增强相机', type: 'toggle', value: false, tooltip: '自定义缓动函数、角度插值和弹簧物理' },
            { id: 'heightSamplerEnabled', label: '高度采样', type: 'toggle', value: false, tooltip: '地形高度查询、批量异步采样、屏幕坐标拾取' },
        ],
    };
}