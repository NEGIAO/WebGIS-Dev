/**
 * 统一地图引擎适配器接口规范 (IMapEngineAdapter)
 *
 * 规范来源：Docs/Architecture/ 与 P2 跨引擎 UI 解耦统一架构蓝图
 * 职责：定义所有底层地图底座（OpenLayers 2D / Cesium 3D / 乃至未来 Mapbox）必须实现的统一契约。
 * 业务 UI 面板（TOC、量算、标绘等）只面向此接口编程，实现真正跨引擎解耦。
 */

import type {
    CameraViewOptions,
    EngineCapabilities,
    EngineType,
    MapEngineEvent,
    MapEventListener,
    ToolType,
} from './types';

export interface IMapEngineAdapter {
    /** 标识当前适配器挂载的引擎类型 */
    readonly engineType: EngineType;

    /** 声明当前引擎的能力集（静态只读元数据） */
    readonly capabilities: Readonly<EngineCapabilities>;

    /** 检查底层地图实例是否已完成就绪加载并可交互 */
    isReady(): boolean;

    /**
     * 跨引擎平滑飞向目标相机视点（经纬度均以 WGS-84 为准）
     * @param options 目标视点与过渡时长
     */
    flyTo(options: CameraViewOptions): Promise<void>;

    /**
     * 获取当前视口地理包围盒 [minLng, minLat, maxLng, maxLat] (EPSG:4326)
     */
    getViewExtent(): [number, number, number, number];

    /**
     * 切换当前激活底图
     * @param id 底图预设唯一标识
     */
    setBasemap(id: string): Promise<void>;

    /**
     * 动态设置业务/叠加图层显隐
     * @param layerId 图层唯一标识
     * @param visible 是否可见
     */
    setLayerVisibility(layerId: string, visible: boolean): void;

    /**
     * 动态设置业务/叠加图层不透明度
     * @param layerId 图层唯一标识
     * @param opacity 不透明度 0.0 ~ 1.0
     */
    setLayerOpacity(layerId: string, opacity: number): void;

    /**
     * 获取当前激活的工具标识
     */
    getActiveTool(): ToolType;

    /**
     * 激活特定地图交互工具（如量算、标绘、分析）
     * @param toolType 工具类型枚举
     * @param options 传给该工具的可选上下文配置
     */
    activateTool(toolType: ToolType, options?: Record<string, unknown>): void;

    /**
     * 关闭/注销当前处于激活态的交互工具，恢复常规漫游
     */
    deactivateTool(): void;

    /**
     * 注册引擎生命周期与状态监听
     * @param event 事件名
     * @param handler 回调处理函数
     */
    on(event: MapEngineEvent, handler: MapEventListener): void;

    /**
     * 注销监听
     * @param event 事件名
     * @param handler 回调处理函数
     */
    off(event: MapEngineEvent, handler: MapEventListener): void;

    /**
     * 销毁适配器绑定，解绑事件与回收内部缓存
     */
    destroy?(): void;
}
