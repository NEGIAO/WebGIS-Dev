/**
 * useCesiumModelManager.js
 *
 * Cesium 3D 模型管理器 —— 参考 tellux 项目 ModelManager + GltfModelLayer 架构
 *
 * 核心功能：
 *  1. glTF/GLB 模型的加载、定位、缩放
 *  2. 基于地理坐标的模型放置（经纬度 + heading/pitch/roll）
 *  3. 模型动画的播放与控制
 *  4. 模型生命周期管理（加载 → 就绪 → 错误 → 移除）
 *  5. 响应式模型列表，便于 Vue UI 绑定
 *  6. Object URL 管理，支持用户上传文件
 *
 * 设计模式参考 tellux：
 *  - Manager 持有 Map<string, LayerInstance> 统一管理生命周期
 *  - LayerInstance 封装原始 Cesium 对象 + 元数据
 *  - 分离响应式元数据与底层 Cesium 对象引用
 *
 * @module useCesiumModelManager
 */

import { ref, computed } from 'vue'

// ======================== 常量与枚举 ========================

/** 模型加载状态枚举 */
export const ModelState = Object.freeze({
    LOADING: 'loading',
    READY: 'ready',
    ERROR: 'error',
})

// ======================== 辅助函数 ========================

/**
 * 解析坐标输入为标准格式 { lng, lat, height }
 * 支持两种格式：[lng, lat, height?] 和 { longitude, latitude, height }
 *
 * @param {Array|Object} coordinates - 坐标输入
 * @returns {{ lng: number, lat: number, height: number }|null}
 */
function parseCoordinates(coordinates) {
    if (!coordinates) return null
    if (Array.isArray(coordinates)) {
        const [lng, lat, height = 0] = coordinates
        if (typeof lng !== 'number' || typeof lat !== 'number') return null
        return { lng, lat, height }
    }
    const lng = coordinates.longitude ?? coordinates.lng
    const lat = coordinates.latitude ?? coordinates.lat
    if (typeof lng !== 'number' || typeof lat !== 'number') return null
    return { lng, lat, height: coordinates.height ?? 0 }
}

/**
 * 根据地理坐标和姿态角计算模型变换矩阵（Cesium.Matrix4）
 *
 * 原理：在指定经纬度位置构建 ENU（东-北-天）坐标系，
 * 通过 heading/pitch/roll 旋转后叠加缩放分量。
 * 对应 tellux 中 applyModelMatrix 的逻辑。
 *
 * @param {Object} Cesium - Cesium 全局对象
 * @param {Object} options
 * @param {Array|Object} options.coordinates - 地理坐标
 * @param {number} [options.heading=0]  - 航向角（度，正北 0，顺时针）
 * @param {number} [options.pitch=0]    - 俯仰角（度，抬头为正）
 * @param {number} [options.roll=0]     - 横滚角（度）
 * @param {number|{x:number,y:number,z:number}} [options.scale=1] - 缩放
 * @returns {import('cesium').Matrix4|null}
 */
function computeModelMatrix(Cesium, options) {
    const coord = parseCoordinates(options.coordinates)
    if (!coord) return null

    const origin = Cesium.Cartesian3.fromDegrees(coord.lng, coord.lat, coord.height)
    const hpr = new Cesium.HeadingPitchRoll(
        Cesium.Math.toRadians(options.heading ?? 0),
        Cesium.Math.toRadians(options.pitch ?? 0),
        Cesium.Math.toRadians(options.roll ?? 0)
    )
    const matrix = Cesium.Transforms.headingPitchRollToFixedFrame(origin, hpr)

    // 叠加缩放
    const scale = options.scale
    if (scale !== undefined && scale !== 1) {
        let sx = 1, sy = 1, sz = 1
        if (typeof scale === 'number') {
            sx = sy = sz = scale
        } else if (typeof scale === 'object') {
            sx = scale.x ?? 1; sy = scale.y ?? 1; sz = scale.z ?? 1
        }
        const scaleMat = Cesium.Matrix4.fromScale(new Cesium.Cartesian3(sx, sy, sz))
        Cesium.Matrix4.multiply(matrix, scaleMat, matrix)
    }

    return matrix
}

// ======================== 主 Composable ========================

/**
 * Cesium 模型管理器 Composable
 *
 * 使用方式（与 tellux Viewer.addModel 对齐）：
 * ```js
 * const modelManager = useCesiumModelManager({ getViewer, getCesium, message })
 * await modelManager.addModel({
 *   url: '/models/building.glb',
 *   coordinates: [116.39, 39.9, 50],
 *   heading: 45, scale: 1.5,
 * })
 * ```
 *
 * @param {Object} deps
 * @param {Function} deps.getViewer  - 返回 Cesium.Viewer 实例的闭包
 * @param {Function} deps.getCesium  - 返回 Cesium 全局对象的闭包
 * @param {Object}   [deps.message]  - useMessage 实例（可选）
 * @returns {Object} 模型管理器 API
 */
export function useCesiumModelManager({ getViewer, getCesium, message }) {
    // ---- 内部存储 ----
    /** @type {Map<string, { primitive: Object|null, objectUrl: string|null, entry: Object }>} */
    const modelStore = new Map()
    let nextId = 0

    // ---- 响应式状态 ----
    /** 模型元数据列表（浅拷贝，不含 Cesium 原始对象） */
    const models = ref([])
    /** 正在加载的模型数量 */
    const loadingCount = computed(() => models.value.filter(m => m.state === ModelState.LOADING).length)
    /** 已就绪的模型数量 */
    const readyCount = computed(() => models.value.filter(m => m.state === ModelState.READY).length)
    /** 模型总数 */
    const modelCount = computed(() => models.value.length)

    // ---- 内部工具 ----

    /** 将 modelStore 的元数据同步到响应式 models 列表 */
    function syncModels() {
        models.value = Array.from(modelStore.values()).map(s => ({ ...s.entry }))
    }

    /** 生成不重复的自增 ID */
    function createId() {
        do { nextId++ } while (modelStore.has(`model-${nextId}`))
        return `model-${nextId}`
    }

    // ======================== 核心 API ========================

    /**
     * 加载并添加 3D 模型到场景
     *
     * @param {Object} options
     * @param {string}  [options.id]                  - 唯一标识（默认自动生成 model-N）
     * @param {string}  [options.name]                - 显示名称
     * @param {string}   options.url                  - glTF / GLB 文件 URL
     * @param {Array|Object} options.coordinates      - [lng, lat, height?] 或 {longitude, latitude, height}
     * @param {number}  [options.heading=0]           - 航向角（度）
     * @param {number}  [options.pitch=0]             - 俯仰角（度）
     * @param {number}  [options.roll=0]              - 横滚角（度）
     * @param {number|Object} [options.scale=1]       - 缩放比例（标量或 {x,y,z}）
     * @param {number}  [options.minimumPixelSize=64] - 最小像素尺寸（LOD 控制）
     * @param {boolean} [options.autoPlayAnimation=true] - 加载完成后自动播放动画
     * @param {Object}  [options.metadata]            - 自定义元数据（可存储任意业务数据）
     * @returns {Promise<Object|null>} 模型元数据条目，失败返回 null
     */
    async function addModel(options) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) {
            message?.error?.('Cesium 尚未初始化，无法加载模型')
            return null
        }

        const id = options.id ?? createId()
        if (modelStore.has(id)) {
            message?.error?.(`模型 "${id}" 已存在，请使用其他 ID`)
            return null
        }

        // 构建元数据条目
        const coord = parseCoordinates(options.coordinates)
        const entry = {
            id,
            name: options.name ?? id,
            url: options.url,
            coordinates: coord,
            heading: options.heading ?? 0,
            pitch: options.pitch ?? 0,
            roll: options.roll ?? 0,
            scale: options.scale ?? 1,
            state: ModelState.LOADING,
            metadata: options.metadata ?? {},
            addedAt: Date.now(),
            errorMessage: null,
        }

        // 占位（先写入 store 再异步加载）
        modelStore.set(id, { primitive: null, objectUrl: null, entry })
        syncModels()

        try {
            // 1. 计算模型变换矩阵
            const matrix = computeModelMatrix(Cesium, {
                coordinates: entry.coordinates,
                heading: entry.heading,
                pitch: entry.pitch,
                roll: entry.roll,
                scale: entry.scale,
            })
            if (!matrix) throw new Error('坐标无效，无法计算模型矩阵')

            // 2. 加载 glTF/GLB
            const loadOpts = {
                url: options.url,
                modelMatrix: matrix,
                minimumPixelSize: options.minimumPixelSize ?? 64,
                maximumScale: 20000,
                scene: viewer.scene,
            }

            let model
            if (typeof Cesium.Model.fromGltfAsync === 'function') {
                model = await Cesium.Model.fromGltfAsync(loadOpts)
            } else if (typeof Cesium.Model.fromGltf === 'function') {
                // 旧版 Cesium 降级
                model = Cesium.Model.fromGltf(loadOpts)
            } else {
                throw new Error('当前 Cesium 版本不支持 Model API')
            }

            // 3. 挂载到场景
            viewer.scene.primitives.add(model)
            const store = modelStore.get(id)
            store.primitive = model

            // 4. 监听就绪 → 更新状态 / 自动播放动画
            const onReady = () => {
                const s = modelStore.get(id)
                if (!s) return
                s.entry.state = ModelState.READY
                syncModels()

                if (options.autoPlayAnimation !== false) {
                    try {
                        model.activeAnimations.addAll({
                            loop: Cesium.ModelAnimationLoop.REPEAT,
                        })
                    } catch {
                        // 模型可能不含动画，忽略
                    }
                }
            }

            if (model.readyEvent) {
                model.readyEvent.addEventListener(onReady)
            } else {
                onReady()
            }

            // 5. 监听错误
            if (model.errorEvent) {
                model.errorEvent.addEventListener((error) => {
                    const s = modelStore.get(id)
                    if (!s) return
                    s.entry.state = ModelState.ERROR
                    s.entry.errorMessage = error?.message ?? '模型加载异常'
                    syncModels()
                    console.error(`[ModelManager] 模型 "${id}" 错误:`, error)
                })
            }

            syncModels()
            return { ...entry }
        } catch (error) {
            // 失败清理
            const store = modelStore.get(id)
            if (store?.objectUrl) URL.revokeObjectURL(store.objectUrl)
            modelStore.delete(id)
            syncModels()

            message?.error?.(`模型加载失败: ${error.message}`)
            console.error('[ModelManager] addModel error:', error)
            return null
        }
    }

    /**
     * 从本地 File 对象加载模型（适用于拖拽上传 / 文件选择场景）
     *
     * @param {File} file - glTF / GLB 文件
     * @param {Object} [options={}] - 模型配置（同 addModel，不需要 url）
     * @returns {Promise<Object|null>}
     */
    async function addModelFromFile(file, options = {}) {
        const objectUrl = URL.createObjectURL(file)
        const result = await addModel({
            ...options,
            url: objectUrl,
            name: options.name ?? file.name.replace(/\.(glb|gltf)$/i, ''),
        })

        if (result) {
            const store = modelStore.get(result.id)
            if (store) store.objectUrl = objectUrl
        } else {
            URL.revokeObjectURL(objectUrl)
        }
        return result
    }

    /**
     * 移除模型并释放所有关联资源
     * @param {string} id - 模型 ID
     */
    function removeModel(id) {
        const viewer = getViewer?.()
        const store = modelStore.get(id)
        if (!store) return

        // 从场景移除
        if (store.primitive && viewer) {
            try { viewer.scene.primitives.remove(store.primitive) } catch (e) {
                console.warn(`[ModelManager] 移除 "${id}" 时场景报错:`, e)
            }
        }

        // 销毁模型内部资源
        if (store.primitive?.destroy) {
            try { store.primitive.destroy() } catch { /* 忽略 */ }
        }

        // 释放 Object URL
        if (store.objectUrl) URL.revokeObjectURL(store.objectUrl)

        modelStore.delete(id)
        syncModels()
    }

    /**
     * 更新模型属性（位置 / 姿态 / 缩放 / 名称 / 元数据）
     * 仅传入的字段会被更新，未传入的保持原值。
     *
     * @param {string} id - 模型 ID
     * @param {Object} updates - 待更新字段
     * @returns {boolean} 是否成功
     */
    function updateModel(id, updates = {}) {
        const Cesium = getCesium?.()
        const store = modelStore.get(id)
        if (!store || !Cesium) return false

        const entry = store.entry

        // 合并字段
        if (updates.coordinates) entry.coordinates = parseCoordinates(updates.coordinates)
        if (updates.heading !== undefined) entry.heading = updates.heading
        if (updates.pitch !== undefined) entry.pitch = updates.pitch
        if (updates.roll !== undefined) entry.roll = updates.roll
        if (updates.scale !== undefined) entry.scale = updates.scale
        if (updates.name) entry.name = updates.name
        if (updates.metadata) entry.metadata = { ...entry.metadata, ...updates.metadata }

        // 重新计算模型矩阵
        if (store.primitive) {
            const matrix = computeModelMatrix(Cesium, {
                coordinates: entry.coordinates,
                heading: entry.heading,
                pitch: entry.pitch,
                roll: entry.roll,
                scale: entry.scale,
            })
            if (matrix) store.primitive.modelMatrix = matrix
        }

        syncModels()
        return true
    }

    /**
     * 相机飞行到指定模型附近
     *
     * @param {string} id - 模型 ID
     * @param {Object} [options={}]
     * @param {number} [options.duration=2]       - 飞行时长（秒）
     * @param {number} [options.range=200]        - 观察距离（米）
     * @param {number} [options.heading=0]        - 观察航向角（度）
     * @param {number} [options.pitch=-30]        - 观察俯仰角（度，负值 = 俯视）
     */
    function flyToModel(id, options = {}) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        const store = modelStore.get(id)
        if (!store || !viewer || !Cesium) return

        const coord = store.entry.coordinates
        if (!coord) return

        const { range = 200, heading = 0, pitch = -30, duration = 2 } = options
        const targetHeight = coord.height + range * 0.3

        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(coord.lng, coord.lat, targetHeight),
            orientation: {
                heading: Cesium.Math.toRadians(heading),
                pitch: Cesium.Math.toRadians(pitch),
                roll: 0,
            },
            duration,
        })
    }

    // ======================== 动画控制 ========================

    /**
     * 播放模型动画
     *
     * @param {string}  id - 模型 ID
     * @param {string}  [animationName] - 动画名称（省略则播放全部）
     * @param {Object}  [options={}]
     * @param {boolean} [options.loop=true]    - 是否循环
     * @param {number}  [options.speedup=1.0]  - 播放速率倍率
     */
    function playAnimation(id, animationName, options = {}) {
        const store = modelStore.get(id)
        const Cesium = getCesium?.()
        if (!store?.primitive || !Cesium) return

        try {
            const model = store.primitive
            const loopMode = options.loop !== false
                ? Cesium.ModelAnimationLoop.REPEAT
                : Cesium.ModelAnimationLoop.NONE

            if (animationName) {
                // 在已有动画中查找
                let found = false
                const anims = model.activeAnimations
                for (let i = 0; i < anims.length; i++) {
                    if (anims.get(i).name === animationName) {
                        anims.get(i).playing = true
                        found = true
                        break
                    }
                }
                // 未找到则手动添加
                if (!found) {
                    model.activeAnimations.add({
                        name: animationName,
                        loop: loopMode,
                        speedup: options.speedup ?? 1.0,
                    })
                }
            } else {
                model.activeAnimations.addAll({
                    loop: loopMode,
                    speedup: options.speedup ?? 1.0,
                })
            }
        } catch (e) {
            console.warn(`[ModelManager] 播放动画失败 "${id}":`, e)
        }
    }

    /**
     * 停止模型的所有动画
     * @param {string} id - 模型 ID
     */
    function stopAnimation(id) {
        const store = modelStore.get(id)
        if (!store?.primitive) return

        try {
            const anims = store.primitive.activeAnimations
            for (let i = 0; i < anims.length; i++) {
                anims.get(i).playing = false
            }
        } catch (e) {
            console.warn(`[ModelManager] 停止动画失败 "${id}":`, e)
        }
    }

    // ======================== 查询 ========================

    /**
     * 获取模型元数据（浅拷贝）
     * @param {string} id
     * @returns {Object|null}
     */
    function getModel(id) {
        const store = modelStore.get(id)
        return store ? { ...store.entry } : null
    }

    /**
     * 获取原始 Cesium.Model 对象（高级用法，谨慎操作）
     * @param {string} id
     * @returns {Object|null}
     */
    function getModelPrimitive(id) {
        return modelStore.get(id)?.primitive ?? null
    }

    // ======================== 生命周期 ========================

    /** 销毁所有模型，释放全部资源 */
    function dispose() {
        const ids = Array.from(modelStore.keys())
        for (const id of ids) removeModel(id)
        modelStore.clear()
        syncModels()
    }

    // ======================== 返回 ========================
    return {
        // 响应式状态
        models,
        loadingCount,
        readyCount,
        modelCount,

        // 核心操作
        addModel,
        addModelFromFile,
        removeModel,
        updateModel,
        flyToModel,

        // 动画控制
        playAnimation,
        stopAnimation,

        // 查询
        getModel,
        getModelPrimitive,

        // 生命周期
        dispose,
    }
}