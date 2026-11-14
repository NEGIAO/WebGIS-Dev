/**
 * 功能名称：天地图叠加图层（国界线 + 文字注记）
 * 日    期：2026/11/13
 *
 * 从 useCesiumLayers 拆出：两个叠加 ImageryLayer 的创建、置顶联动、
 * 显隐同步与清理；图层句柄状态内聚，宿主只拿 sync/ensure/clear 入口。
 */

import { TDT_SERVICE_ROOT, TDT_SUBDOMAINS } from './layerUtils';

export interface TdtOverlayCtx {
    /** 宿主 Viewer 获取器 */
    getViewer?: () => any;
    /** Cesium 命名空间获取器 */
    getCesium?: () => any;
    /** 消息系统 */
    message?: any;
    /** 天地图 token 实时读取 */
    getTiandituToken: () => string;
    /** 国界线显隐 ref */
    tdtBoundaryLayerVisible: { value: boolean };
    /** 文字注记显隐 ref */
    tdtTextLabelLayerVisible: { value: boolean };
}

/**
 * 创建天地图叠加图层管理器
 * @param ctx 宿主依赖
 * @returns sync/ensure/clear 七个入口与两个 provider 构造器
 */
export function createTdtOverlayManager(ctx: TdtOverlayCtx) {
    const { getViewer, getCesium, message, getTiandituToken, tdtBoundaryLayerVisible, tdtTextLabelLayerVisible } = ctx;
    let tdtBoundaryLayer: any = null;
    let tdtTextLabelLayer: any = null;

    function createTdtBoundaryImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=ibo_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 10,
        });
    }

    function createTdtTextLabelImageryProvider() {
        const Cesium = getCesium?.();
        return new Cesium.UrlTemplateImageryProvider({
            url: `${TDT_SERVICE_ROOT}DataServer?T=cia_w&x={x}&y={y}&l={z}&tk=${getTiandituToken()}`,
            subdomains: TDT_SUBDOMAINS,
            tilingScheme: new Cesium.WebMercatorTilingScheme(),
            maximumLevel: 18,
        });
    }

    function syncTdtOverlayLayers() {
        const viewer = getViewer?.();
        if (!viewer || !getCesium?.()) return;

        if (tdtBoundaryLayerVisible.value) {
            ensureTdtBoundaryLayer();
        } else {
            clearTdtBoundaryLayer();
        }

        if (tdtTextLabelLayerVisible.value) {
            ensureTdtTextLabelLayer();
        } else {
            clearTdtTextLabelLayer();
        }

        viewer.scene.requestRender?.();
    }

    function ensureTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtBoundaryLayer) {
            if (tdtBoundaryLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtBoundaryLayer);
            }
            return tdtBoundaryLayer;
        }

        try {
            tdtBoundaryLayer = viewer.imageryLayers.addImageryProvider(
                createTdtBoundaryImageryProvider(),
            );
            viewer.imageryLayers.raiseToTop?.(tdtBoundaryLayer);
            return tdtBoundaryLayer;
        } catch (error) {
            message.error('天地图国界线图层加载失败', error);
            return null;
        }
    }

    function ensureTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!viewer?.imageryLayers || tdtTextLabelLayer) {
            if (tdtTextLabelLayer) {
                viewer?.imageryLayers?.raiseToTop?.(tdtTextLabelLayer);
            }
            return tdtTextLabelLayer;
        }

        try {
            tdtTextLabelLayer = viewer.imageryLayers.addImageryProvider(
                createTdtTextLabelImageryProvider(),
            );
            viewer.imageryLayers.raiseToTop?.(tdtTextLabelLayer);
            return tdtTextLabelLayer;
        } catch (error) {
            message.error('天地图文字标注图层加载失败', error);
            return null;
        }
    }

    function clearTdtBoundaryLayer() {
        const viewer = getViewer?.();
        if (!tdtBoundaryLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtBoundaryLayer, true);
        } catch (error) {
            console.warn('TDT boundary layer remove warning:', error);
        }
        tdtBoundaryLayer = null;
    }

    function clearTdtTextLabelLayer() {
        const viewer = getViewer?.();
        if (!tdtTextLabelLayer || !viewer?.imageryLayers) return;

        try {
            viewer.imageryLayers.remove(tdtTextLabelLayer, true);
        } catch (error) {
            console.warn('TDT text label layer remove warning:', error);
        }
        tdtTextLabelLayer = null;
    }

    return {
        createTdtBoundaryImageryProvider,
        createTdtTextLabelImageryProvider,
        syncTdtOverlayLayers,
        ensureTdtBoundaryLayer,
        ensureTdtTextLabelLayer,
        clearTdtBoundaryLayer,
        clearTdtTextLabelLayer,
    };
}
