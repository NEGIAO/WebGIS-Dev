/**
 * global.d.ts — 面状航线模块全局声明
 *
 * 模块原工程以 window.mainViewer / window.miniViewer 持有 Viewer 引用；
 * 迁移后 mainViewer 指向宿主 Viewer（打开浮层时赋值、关闭时清空）。
 */
declare global {
    interface Window {
        /** CDN 全局加载的 Cesium 命名空间（启动期加载链禁止顶层 import 'cesium'，运行时经此取用） */
        Cesium: any;
        /** 宿主 Cesium Viewer（面状航线模块运行期引用，浮层打开时赋值） */
        mainViewer: any;
        /** 备用小视图 Viewer（源工程遗留，当前仅死代码路径引用） */
        miniViewer?: any;
    }
}

export {};