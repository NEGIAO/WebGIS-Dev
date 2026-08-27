/**
 * useSharedResources.js — TOCPanel 共享资源扫描与加载
 *
 * 从 TOCPanel.vue 抽离（P2 拆分，见 unified-layer-management-refactor-plan.md）。
 * 底层复用 @common/data-import/useSharedResourceLoader 的反应式状态，
 * 这里只补齐 TOC 交互语义：扫描提示、加载中提示、经 gisLoader 进入上传管线。
 */

import { ref } from 'vue';
import { useSharedResourceLoader } from '@common/data-import/useSharedResourceLoader';

/**
 * @param {object} ctx
 * @param {Function} ctx.t i18n
 * @param {object} ctx.message 消息组件
 * @param {Function} ctx.emit 组件 emit（upload-data）
 * @param {() => object} ctx.getGisLoader useGisLoader 实例（含 createUploadPayloadsFromFiles）
 */
export function useSharedResources({ t, message, emit, getGisLoader }) {
    const sharedLoader = useSharedResourceLoader();
    const lastScanAttempted = ref(false);

    /** 扫描共享资源目录；结果存于 sharedLoader 的反应式状态中 */
    async function scanSharedResources() {
        try {
            await sharedLoader.scanResources();
            lastScanAttempted.value = true;
            if (sharedLoader.hasResources.value) {
                message.success(
                    t('layer.sharedFound', { count: sharedLoader.resources.value.length }),
                );
            } else {
                message.info(t('layer.sharedEmpty'));
            }
        } catch (error) {
            message.error(t('layer.sharedScanFailed', { error: String(error) }));
        }
    }

    /** 加载选中的共享资源：转换为 File 后复用上传管线，保证与手动上传同流程 */
    async function loadSharedResource(resource) {
        if (!resource || !resource.path) {
            message.warning(t('layer.sharedIncomplete'));
            return;
        }

        try {
            const files = await sharedLoader.loadResourceAsFiles(resource.path);
            if (!files || files.length === 0) {
                message.warning(t('layer.sharedLoadFailed'));
                return;
            }

            message.info(t('layer.sharedLoading', { name: resource.name }), { duration: 2000 });
            emit('upload-data', getGisLoader().createUploadPayloadsFromFiles(files));
        } catch (error) {
            message.error(t('layer.sharedLoadError', { error: String(error) }));
        }
    }

    return {
        sharedLoader,
        lastScanAttempted,
        scanSharedResources,
        loadSharedResource,
    };
}
