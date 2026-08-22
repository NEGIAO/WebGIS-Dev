/**
 * cesium.d.ts — Cesium 模块类型声明
 *
 * Cesium 通过 CDN + cesium-shim.js 加载（非 npm 包），
 * 本文件为 TypeScript 提供模块解析。
 *
 * 每个导出同时声明 type（作为类型使用时 any）和 const/value（作为值使用时 any），
 * 使 import type / import 均可通过，且成员访问全部为 any。
 */
declare module 'cesium' {
    // 核心数学/几何
    export type Cartesian2 = any;
    export const Cartesian2: any;
    export type Cartesian3 = any;
    export const Cartesian3: any;
    export type Cartographic = any;
    export const Cartographic: any;
    export const Math: any;
    export type Matrix3 = any;
    export const Matrix3: any;
    export type Matrix4 = any;
    export const Matrix4: any;
    export type Quaternion = any;
    export const Quaternion: any;
    export const Transforms: any;
    export const HeadingPitchRoll: any;
    export const HeadingPitchRange: any;
    export type BoundingSphere = any;
    export const BoundingSphere: any;
    export type Rectangle = any;
    export const Rectangle: any;
    export type Ray = any;
    export const Ray: any;
    export const EllipsoidGeodesic: any;
    export const ReferenceFrame: any;
    export const IntersectionTests: any;

    // 地形采样
    export const sampleTerrain: any;
    export const sampleTerrainMostDetailed: any;

    // 模型与动画
    export type Model = any;
    export const Model: any;
    export type ModelAnimation = any;
    export const ModelAnimation: any;
    export const ModelAnimationLoop: any;

    // 图元与几何
    export type Primitive = any;
    export const Primitive: any;
    export const GeometryInstance: any;
    export const Geometry: any;
    export const GeometryAttribute: any;
    export const GeometryAttributes: any;
    export const ComponentDatatype: any;
    export const PrimitiveType: any;
    export const ColorGeometryInstanceAttribute: any;
    export type Color = any;
    export const Color: any;
    export const PerInstanceColorAppearance: any;
    export const Appearance: any;

    // 屏幕交互（interface + namespace 合并，支持嵌套类型访问）
    export interface ScreenSpaceEventHandler {
        destroy?: any;
        setInputAction?: any;
    }
    export namespace ScreenSpaceEventHandler {
        export type PositionedEvent = any;
        export type MotionEvent = any;
    }
    export const ScreenSpaceEventHandler: any;
    export const ScreenSpaceEventType: any;
    export type KeyboardEventModifier = any;
    export const KeyboardEventModifier: any;

    // 工具/错误
    export const defined: any;
    export const DeveloperError: any;
    export const Event: any;
    export const EventHelper: any;
    export const getTimestamp: any;
    export const getElement: any;
    export const SceneMode: any;
    export const Camera: any;

    // 纹理/渲染
    export const PixelDatatype: any;
    export const PixelFormat: any;
    export const Sampler: any;
    export const Texture: any;
    export const TextureMagnificationFilter: any;
    export const TextureMinificationFilter: any;
    export const TextureWrap: any;
    export const FrameRateMonitor: any;
    export const ShaderSource: any;
    export const VertexArray: any;
    export const BufferUsage: any;
    export const ClearCommand: any;
    export const Pass: any;
    export const Framebuffer: any;
    export const ShaderProgram: any;
    export const DrawCommand: any;
    export const RenderState: any;
    export const ComputeCommand: any;
    export const destroyObject: any;

    // 类型
    export type Viewer = any;
    export type Scene = any;

    // Knockout（独立 npm 包补丁）
    export const knockout: any;

    // Shim 特有导出
    export const cesiumReady: Promise<void>;
    export const CESIUM_BASE_URL: string;
    export function getActiveCesiumBaseUrl(): string;

    // 默认导出（cesium-shim 的真实默认导出为 CDN 全局 Proxy，供 import Cesium from 'cesium' 使用）
    export default any;
}
