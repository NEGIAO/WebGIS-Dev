/**
 * shims-modules.d.ts — 无内置类型声明的第三方库模块声明
 *
 * 为未附带 .d.ts 的运行库（three / pako / lerc）提供模块级 TypeScript 契约，
 * 消除 strict / noImplicitAny 模式下的 TS7016。
 */

declare module 'three' {
    // 基础数学与核心对象
    export type Vector2 = any;
    export const Vector2: any;
    export type Vector3 = any;
    export const Vector3: any;
    export type Matrix4 = any;
    export const Matrix4: any;
    export type Color = any;
    export const Color: any;
    export const MathUtils: any;
    export type Clock = any;
    export const Clock: any;

    // 场景、相机、渲染器与光照
    export type Scene = any;
    export const Scene: any;
    export type Group = any;
    export const Group: any;
    export type PerspectiveCamera = any;
    export const PerspectiveCamera: any;
    export type CubeCamera = any;
    export const CubeCamera: any;
    export type WebGLRenderer = any;
    export const WebGLRenderer: any;
    export type WebGLRenderTarget = any;
    export const WebGLRenderTarget: any;
    export type WebGLCubeRenderTarget = any;
    export const WebGLCubeRenderTarget: any;
    export type PMREMGenerator = any;
    export const PMREMGenerator: any;
    export type DirectionalLight = any;
    export const DirectionalLight: any;
    export type HemisphereLight = any;
    export const HemisphereLight: any;

    // 几何与网格
    export type Mesh = any;
    export const Mesh: any;
    export type PlaneGeometry = any;
    export const PlaneGeometry: any;
    export type SphereGeometry = any;
    export const SphereGeometry: any;
    export type DodecahedronGeometry = any;
    export const DodecahedronGeometry: any;
    export type TubeGeometry = any;
    export const TubeGeometry: any;
    export type CatmullRomCurve3 = any;
    export const CatmullRomCurve3: any;

    // 材质与纹理
    export type Material = any;
    export const Material: any;
    export type MeshBasicMaterial = any;
    export const MeshBasicMaterial: any;
    export type MeshStandardMaterial = any;
    export const MeshStandardMaterial: any;
    export type ShaderMaterial = any;
    export const ShaderMaterial: any;
    export type Texture = any;
    export const Texture: any;
    export type CanvasTexture = any;
    export const CanvasTexture: any;
    export type DepthTexture = any;
    export const DepthTexture: any;
    export type Data3DTexture = any;
    export const Data3DTexture: any;
    export type FileLoader = any;
    export const FileLoader: any;

    // 常量枚举
    export const ACESFilmicToneMapping: any;
    export const AdditiveBlending: any;
    export const BackSide: any;
    export const DepthFormat: any;
    export const LinearFilter: any;
    export const LinearMipmapLinearFilter: any;
    export const NoColorSpace: any;
    export const RedFormat: any;
    export const RepeatWrapping: any;
    export const SRGBColorSpace: any;
    export const UnsignedIntType: any;

    const THREE: Record<string, any>;
    export default THREE;
}

declare module 'three/addons/controls/OrbitControls.js' {
    export const OrbitControls: any;
    export type OrbitControls = any;
}

declare module 'three/addons/objects/Sky.js' {
    export const Sky: any;
    export type Sky = any;
}

declare module 'pako/lib/inflate.js' {
    export function inflate(data: Uint8Array | ArrayBuffer, options?: Record<string, any>): Uint8Array;
}

declare module 'lerc' {
    export interface LercDecodedResult {
        width: number;
        height: number;
        pixels: Float32Array[];
        mask?: Uint8Array | null;
        [key: string]: any;
    }
    export interface LercApi {
        decode(input: ArrayBuffer | Uint8Array, options?: Record<string, any>): LercDecodedResult;
        default?: LercApi;
        [key: string]: any;
    }
    const LercModule: LercApi;
    export default LercModule;
}
