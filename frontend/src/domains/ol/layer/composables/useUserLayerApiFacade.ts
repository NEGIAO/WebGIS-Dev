/**
 * useUserLayerApiFacade.js
 *
 * [作用] 提取所有用户图层 API 委托函数，统一管理动态导入和 API 调用
 * [特点] 提供一致的异步 API 接口，隐藏动态导入细节，支持 API 缓存和延迟加载
 * [模式] Factory 函数，依赖注入 ensureXxxApi 确保函数
 *
 * 中文注释遵循原有约定，保持代码可读性。
 */

export interface UserLayerApiFacadeDeps {
    ensureLayerDataImportApi: () => Promise<any>;
    ensureUserLayerActionsApi: () => Promise<any>;
}

/**
 * 创建用户图层 API 门面工厂函数
 *
 * @param {UserLayerApiFacadeDeps} options - 工厂选项
 *
 * @returns {Object} 返回所有 API 委托函数
 */
export function createUserLayerApiFacadeFeature({
    ensureLayerDataImportApi,
    ensureUserLayerActionsApi,
}: UserLayerApiFacadeDeps) {
    /**
     * 添加用户数据图层
     */
    async function addUserDataLayer(payload: any) {
        const api = await ensureLayerDataImportApi();
        return api.addUserDataLayer(payload);
    }

    /**
     * 查询栅格值在指定坐标处的值
     */
    async function queryRasterValueAtCoordinate(coordinate: any) {
        const api = await ensureLayerDataImportApi();
        return api.queryRasterValueAtCoordinate(coordinate);
    }

    /**
     * 设置用户图层可见性
     */
    async function setUserLayerVisibility(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.setUserLayerVisibility(...args);
    }

    /**
     * 设置用户图层不透明度
     */
    async function setUserLayerOpacity(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.setUserLayerOpacity(...args);
    }

    /**
     * 移除用户图层
     */
    async function removeUserLayer(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.removeUserLayer(...args);
    }

    /**
     * 重新排序用户图层
     */
    async function reorderUserLayers(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.reorderUserLayers(...args);
    }

    /**
     * 设置图层为单一显示（隐藏其他图层）
     */
    async function soloUserLayer(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.soloUserLayer(...args);
    }

    /**
     * 设置用户图层样式
     */
    async function setUserLayerStyle(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.setUserLayerStyle(...args);
    }

    /**
     * 设置用户图层标签可见性
     */
    async function setUserLayerLabelVisibility(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.setUserLayerLabelVisibility(...args);
    }

    /**
     * 应用样式模板
     */
    async function applyStyleTemplate(...args: any[]) {
        const api = await ensureUserLayerActionsApi();
        return api.applyStyleTemplate(...args);
    }

    return {
        addUserDataLayer,
        queryRasterValueAtCoordinate,
        setUserLayerVisibility,
        setUserLayerOpacity,
        removeUserLayer,
        reorderUserLayers,
        soloUserLayer,
        setUserLayerStyle,
        setUserLayerLabelVisibility,
        applyStyleTemplate,
    };
}
