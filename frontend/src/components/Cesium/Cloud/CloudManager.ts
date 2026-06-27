/**
 * CloudManager.ts — 体积云核心管理类
 *
 * 职责：
 * - 创建/销毁 Cesium.PostProcessStage
 * - 管理纹理资产加载（shape / detail / weather / turbulence）
 * - 桥接用户参数到着色器 uniform
 * - 提供 show / hide / destroy / updateUniforms API
 *
 * 设计原则：
 * - 完全封装在 Cloud 文件夹内，对外只暴露本类
 * - 纹理加载失败时自动降级为程序化噪声（着色器内处理）
 * - uniform 使用函数式回调，每帧自动同步，无需手动 update
 * - 纹理统一使用 Cesium.Texture 管理，由 PostProcessStage 自动绑定
 *
 * Cesium 加载策略：
 * - 不在模块顶层 import Cesium（避免 cesium-shim.js 在 window.Cesium 就绪前抛错）
 * - 通过 window.Cesium 运行时获取，与项目 CDN 加载方式一致
 */

import { getPreset, type CloudQualityLevel } from './CloudPresets'
import {
    DEFAULT_CLOUD_UNIFORMS,
    createStageUniforms,
    type CloudUniformValues,
    type CloudUniformPatch,
} from './CloudUniforms'

// ─── 着色器源码（Vite raw import） ────────────────────────────

import cloudFragmentShader from './shaders/cloudFragment.glsl?raw'

// ─── 日志标签 ─────────────────────────────────────────────────

const TAG = '[CloudManager]'

// ─── Cesium 运行时获取（避免静态 import 触发 cesium-shim 抛错） ─

function getCesium(): any {
    const C = (window as any).Cesium
    if (!C) throw new Error('[CloudManager] window.Cesium 未就绪，请确保 Cesium CDN 已加载')
    return C
}

// ─── 纹理路径（可配置） ───────────────────────────────────────

export interface CloudTexturePaths {
    /** 128^3 shape 噪声纹理 (.bin) */
    shape?: string
    /** 32^3 detail 噪声纹理 (.bin) */
    shapeDetail?: string
    /** 2D 天气纹理 (.png) */
    weather?: string
    /** 2D 湍流纹理 (.png) */
    turbulence?: string
}

// 默认纹理路径（相对于 public 目录）
const DEFAULT_TEXTURE_PATHS: CloudTexturePaths = {
    shape: '/textures/cloud/shape.bin',
    shapeDetail: '/textures/cloud/shape_detail.bin',
    weather: '/textures/cloud/local_weather.png',
    turbulence: '/textures/cloud/turbulence.png',
}

// ─── CloudManager 配置 ────────────────────────────────────────

export interface CloudManagerConfig {
    /** 纹理文件路径 */
    texturePaths?: CloudTexturePaths
    /** 初始质量预设 */
    quality?: CloudQualityLevel
    /** 初始是否启用 */
    enabled?: boolean
}

// ─── 主类 ─────────────────────────────────────────────────────

export class CloudManager {
    private viewer: any
    private stage: any | null = null
    private textures: Record<string, any | null> = {
        shape: null,
        shapeDetail: null,
        weather: null,
        turbulence: null,
    }

    private _values: CloudUniformValues = { ...DEFAULT_CLOUD_UNIFORMS }
    private _initialized = false
    private _destroyed = false
    private _texturePaths: CloudTexturePaths
    private _startTime = 0

    constructor(viewer: any, config?: CloudManagerConfig) {
        this.viewer = viewer
        this._texturePaths = { ...DEFAULT_TEXTURE_PATHS, ...config?.texturePaths }
        if (config?.quality) this._values.quality = config.quality
        if (config?.enabled !== undefined) this._values.enabled = config.enabled
    }

    // ─── 生命周期 ─────────────────────────────────────────────

    /**
     * 初始化体积云（创建 PostProcessStage + 加载纹理）
     * 幂等：重复调用无副作用
     */
    async init(): Promise<void> {
        if (this._initialized || this._destroyed) return

        const scene = this.viewer.scene
        if (!scene || scene.isDestroyed()) {
            console.warn(TAG, 'Scene not available, skip init')
            return
        }

        this._startTime = performance.now() / 1000

        const Cs = getCesium()
        const context = scene.context

        // ── Step 1: 创建 1×1 fallback 纹理（先于 PostProcessStage） ──
        // 确保 uniform setter 永远不会收到 null
        const fallbackSampler = new Cs.Sampler({
            minificationFilter: Cs.TextureMinificationFilter.LINEAR,
            magnificationFilter: Cs.TextureMagnificationFilter.LINEAR,
            wrapS: Cs.TextureWrap.REPEAT,
            wrapT: Cs.TextureWrap.REPEAT,
        })

        const createFallback = () => new Cs.Texture({
            context,
            source: { arrayBufferView: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 },
            pixelFormat: Cs.PixelFormat.RGBA,
            pixelDatatype: Cs.PixelDatatype.UNSIGNED_BYTE,
            sampler: fallbackSampler,
        })

        // 逐一创建 fallback，任一失败则中止（不创建 PostProcessStage）
        try {
            this.textures.shape = createFallback()
            this.textures.shapeDetail = createFallback()
            this.textures.weather = createFallback()
            this.textures.turbulence = createFallback()
        } catch (texErr) {
            console.warn(TAG, 'Fallback texture creation failed, aborting init:', texErr)
            // 清理已创建的 fallback
            for (const t of [this.textures.shape, this.textures.shapeDetail, this.textures.weather, this.textures.turbulence]) {
                if (t) try { t.destroy() } catch { /* noop */ }
            }
            this.textures.shape = null
            this.textures.shapeDetail = null
            this.textures.weather = null
            this.textures.turbulence = null
            return
        }

        // ── Step 2: 创建 PostProcessStage（stage 初始禁用） ──
        this.stage = new Cs.PostProcessStage({
            fragmentShader: cloudFragmentShader,
            uniforms: this.buildStageUniforms(),
        })

        // 关键：先禁用，等纹理加载完成后再根据用户设置启用
        this.stage.enabled = false
        scene.postProcessStages.add(this.stage)

        // 异步加载纹理（失败不影响运行，着色器有程序化降级）
        await this.loadTextures()

        // 再次检查：init 期间可能已被 destroy
        if (this._destroyed) return

        // ── Step 3: 纹理就绪，根据用户设置启用 stage ──
        this._initialized = true
        if (this.stage && this._values.enabled) {
            this.stage.enabled = true
        }

        console.warn(TAG, 'Initialized', {
            quality: this._values.quality,
            enabled: this._values.enabled,
            textures: {
                shape: !!this.textures.shape,
                detail: !!this.textures.shapeDetail,
                weather: !!this.textures.weather,
                turbulence: !!this.textures.turbulence,
            },
        })
    }

    /**
     * 销毁体积云（移除 PostProcessStage + 释放纹理）
     */
    destroy(): void {
        this._destroyed = true

        if (this.stage) {
            const scene = this.viewer.scene
            if (scene && !scene.isDestroyed()) {
                scene.postProcessStages.remove(this.stage)
                this.stage.destroy()
            }
            this.stage = null
        }

        // 释放 Cesium.Texture
        for (const key of Object.keys(this.textures)) {
            if (this.textures[key]) {
                try { this.textures[key].destroy() } catch { /* already destroyed */ }
                this.textures[key] = null
            }
        }

        this._initialized = false
        console.warn(TAG, 'Destroyed')
    }

    // ─── 公共 API ─────────────────────────────────────────────

    /** 显示体积云 */
    show(): void {
        this._values.enabled = true
        if (this.stage) this.stage.enabled = true
    }

    /** 隐藏体积云 */
    hide(): void {
        this._values.enabled = false
        if (this.stage) this.stage.enabled = false
    }

    /** 切换显示/隐藏 */
    toggle(): void {
        if (this._values.enabled) this.hide()
        else this.show()
    }

    /** 是否已初始化 */
    get initialized(): boolean {
        return this._initialized
    }

    /** 是否正在显示 */
    get visible(): boolean {
        return this._values.enabled
    }

    /** 当前参数快照 */
    get values(): Readonly<CloudUniformValues> {
        return this._values
    }

    /**
     * 批量更新参数
     * 只传入需要修改的字段，其余保持不变
     */
    updateUniforms(patch: CloudUniformPatch): void {
        Object.assign(this._values, patch)
    }

    /**
     * 设置质量预设
     */
    setQuality(level: CloudQualityLevel): void {
        this._values.quality = level
    }

    /**
     * 获取当前预设详情
     */
    getPresetDetail() {
        return getPreset(this._values.quality)
    }

    // ─── 内部方法 ─────────────────────────────────────────────

    /**
     * 构建 PostProcessStage 的 uniforms 字典
     * 使用函数式回调，每帧自动获取最新值
     */
    private buildStageUniforms(): Record<string, () => unknown> {
        const getValues = () => this._values
        const dynamicUniforms = createStageUniforms(getValues)

        // 纹理 uniform — 返回 Cesium Texture 对象
        const textureUniforms: Record<string, () => any> = {
            u_shapeTexture: () => this.textures.shape,
            u_shapeDetailTexture: () => this.textures.shapeDetail,
            u_weatherTexture: () => this.textures.weather,
            u_turbulenceTexture: () => this.textures.turbulence,
        }

        // 时间 uniform
        const timeUniform = {
            u_time: () => performance.now() / 1000 - this._startTime,
        }

        // 纹理参数
        const texParamUniforms = {
            u_shapeRepeat: () => [0.0003, 0.0003, 0.0003],
            u_shapeDetailRepeat: () => [0.006, 0.006, 0.006],
            u_weatherRepeat: () => [1.0, 1.0],
            u_shapeDepth: () => 128.0,
            u_shapeDetailDepth: () => 32.0,
        }

        // Cesium 自动 uniform（PostProcessStage 不自动注入，需手动传入）
        // 注意: Cesium uniform setter 期望 Cartesian3/Matrix4 原生对象，不要转 array
        const cesiumUniforms: Record<string, () => unknown> = {
            u_cameraPosition: () => {
                const Cs = getCesium()
                const p = this.viewer?.scene?.camera?.positionWC
                return p ?? new Cs.Cartesian3(0, 0, 0)
            },
            u_inverseProjection: () => {
                const Cs = getCesium()
                const m = this.viewer?.scene?.context?.uniformState?.inverseProjectionMatrix
                return m ?? Cs.Matrix4.IDENTITY
            },
            u_inverseView: () => {
                const Cs = getCesium()
                const m = this.viewer?.scene?.context?.uniformState?.inverseViewMatrix
                return m ?? Cs.Matrix4.IDENTITY
            },
            u_sunDirection: () => {
                const Cs = getCesium()
                const d = this.viewer?.scene?.context?.uniformState?.sunDirectionWC
                return d ?? new Cs.Cartesian3(0, 0, 1)
            },
            u_ellipsoidRadii: () => {
                const Cs = getCesium()
                const r = this.viewer?.scene?.globe?.ellipsoid?.radii
                return r ?? new Cs.Cartesian3(6378137.0, 6378137.0, 6356752.314245179)
            },
        }

        return {
            ...dynamicUniforms,
            ...textureUniforms,
            ...timeUniform,
            ...texParamUniforms,
            ...cesiumUniforms,
        }
    }

    /**
     * 加载纹理资产
     * 逐一尝试加载，失败则降级（着色器内程序化生成）
     */
    private async loadTextures(): Promise<void> {
        const loadTasks = [
            this.load3DBinaryTexture('shape', this._texturePaths.shape, 128),
            this.load3DBinaryTexture('shapeDetail', this._texturePaths.shapeDetail, 32),
            this.load2DImageTexture('weather', this._texturePaths.weather),
            this.load2DImageTexture('turbulence', this._texturePaths.turbulence),
        ]

        await Promise.allSettled(loadTasks)

        // 如果在加载期间被销毁，释放已加载的纹理
        if (this._destroyed) {
            for (const key of Object.keys(this.textures)) {
                if (this.textures[key]) {
                    try { this.textures[key].destroy() } catch { /* noop */ }
                    this.textures[key] = null
                }
            }
        }
    }

    /**
     * 加载 3D 二进制纹理（.bin 体积数据）
     * 格式：raw uint8，单通道（R8），尺寸 size^3
     * 存储为 2D 纹理（size × size*size）由着色器 sample3DAs2D 重映射
     */
    private async load3DBinaryTexture(
        key: string,
        url: string | undefined,
        size: number,
    ): Promise<void> {
        if (!url) return
        const context = this.viewer.scene?.context
        if (!context) return

        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const buffer = await response.arrayBuffer()
            const expectedSize = size * size * size
            if (buffer.byteLength < expectedSize) {
                console.warn(TAG, `Texture ${key} too small: expected ${expectedSize}, got ${buffer.byteLength}`)
                return
            }

            const data = new Uint8Array(buffer, 0, expectedSize)

            // 用 Cesium.Texture 创建 2D 纹理（将 3D 数据展平为 size × size²）
            const Cs = getCesium()
            const texture = new Cs.Texture({
                context,
                source: {
                    arrayBufferView: data,
                    width: size,
                    height: size * size,
                },
                pixelFormat: Cs.PixelFormat.RED,
                pixelDatatype: Cs.PixelDatatype.UNSIGNED_BYTE,
                sampler: new Cs.Sampler({
                    minificationFilter: Cs.TextureMinificationFilter.LINEAR,
                    magnificationFilter: Cs.TextureMagnificationFilter.LINEAR,
                    wrapS: Cs.TextureWrap.REPEAT,
                    wrapT: Cs.TextureWrap.REPEAT,
                }),
            })

            // 释放旧纹理（fallback 或之前加载的）
            if (this.textures[key]) {
                try { this.textures[key].destroy() } catch { /* noop */ }
            }
            this.textures[key] = texture
            console.warn(TAG, `Loaded 3D texture: ${key} (${size}^3 -> ${size}x${size * size})`)
        } catch (err) {
            console.warn(TAG, `Failed to load texture ${key}, using procedural fallback`, err)
        }
    }

    /**
     * 加载 2D 图片纹理（.png）
     */
    private async load2DImageTexture(
        key: string,
        url: string | undefined,
    ): Promise<void> {
        if (!url) return
        const context = this.viewer.scene?.context
        if (!context) return

        try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const blob = await response.blob()
            const imageBitmap = await createImageBitmap(blob)

            const Cs = getCesium()
            const texture = new Cs.Texture({
                context,
                source: imageBitmap,
                sampler: new Cs.Sampler({
                    minificationFilter: Cs.TextureMinificationFilter.LINEAR,
                    magnificationFilter: Cs.TextureMagnificationFilter.LINEAR,
                    wrapS: Cs.TextureWrap.REPEAT,
                    wrapT: Cs.TextureWrap.REPEAT,
                }),
            })

            imageBitmap.close()

            // 释放旧纹理（fallback 或之前加载的）
            if (this.textures[key]) {
                try { this.textures[key].destroy() } catch { /* noop */ }
            }
            this.textures[key] = texture
            console.warn(TAG, `Loaded 2D texture: ${key}`)
        } catch (err) {
            console.warn(TAG, `Failed to load texture ${key}, using procedural fallback`, err)
        }
    }
}
