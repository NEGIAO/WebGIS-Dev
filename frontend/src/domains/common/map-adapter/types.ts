/**
 * 跨引擎统一地图适配器类型契约 (Engine-Agnostic Map Adapter Types)
 *
 * 遵循架构规范：Docs/Architecture/ 与 Docs/Force_command.md
 * 本模块为通用领域（domains/common），严禁引入 domains/ol 或 domains/cesium 专属依赖。
 */

/** 支持的地图像素/渲染引擎类型 */
export type EngineType = 'openlayers' | 'cesium';

/** 引擎固有能力元数据（由各引擎适配器静态声明，驱动通用 UI 禁用/启用特定控件） */
export interface EngineCapabilities {
    /** 是否支持三维空间几何/俯仰角/高程漫游 */
    readonly supports3D: boolean;
    /** 是否支持高程地形（Terrain）渲染与采样 */
    readonly supportsTerrain: boolean;
    /** 是否支持三维空间视域/通视分析 */
    readonly supportsViewshed: boolean;
    /** 是否支持动态光照与日照阴影分析 */
    readonly supportsShadows: boolean;
    /** 是否支持二维交互式标绘/几何绘制 */
    readonly supportsDrawing2D: boolean;
    /** 是否支持双屏/左右卷帘对比（Swipe） */
    readonly supportsSwipe: boolean;
}

/** 跨引擎相机/视点统一配置（经纬度均采用 WGS-84 / EPSG:4326） */
export interface CameraViewOptions {
    /** 目标中心点 [经度, 纬度] (EPSG:4326) */
    center: [number, number];
    /** 缩放级别 (OpenLayers 标度 0~28) */
    zoom?: number;
    /** 俯仰角 (Pitch, 角度 -90~0 或度数，3D 引擎专属) */
    pitch?: number;
    /** 偏航角/方位角 (Heading, 0~360 度) */
    heading?: number;
    /** 翻滚角 (Roll, 3D 专属) */
    roll?: number;
    /** 飞行动画时长 (毫秒)，默认 800ms */
    duration?: number;
}

/** 统一激活的地图交互工具标识 */
export type ToolType =
    | 'measure-distance'
    | 'measure-area'
    | 'draw-point'
    | 'draw-line'
    | 'draw-polygon'
    | 'spatial-analysis'
    | 'none';

/** 统一地图引擎生命周期与状态事件 */
export type MapEngineEvent =
    | 'ready'
    | 'view-change'
    | 'basemap-change'
    | 'layer-change'
    | 'tool-change'
    | 'click'
    | 'pointer-move';

/** 统一地图命令对象 */
export interface MapCommand<T = unknown> {
    /** 命令唯一动词标识（如 'layer:toggle', 'camera:flyTo'） */
    type: string;
    /** 命令载荷参数 */
    payload?: T;
    /** 命令触发时间戳 */
    timestamp: number;
}

/** 通用事件监听器 */
export type MapEventListener<T = any> = (payload: T) => void;
