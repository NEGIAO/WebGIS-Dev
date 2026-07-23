/**
 * useCesiumCameraEnhanced.js
 *
 * Cesium 增强相机控制器 —— 参考 tellux 项目 Camera + SpringControl + TargetFlightController
 *
 * 核心功能：
 *  1. 增强的 flyTo：支持 heading/pitch/roll 动画插值、自定义缓动函数
 *  2. 弹簧物理相机控制（参考 tellux SpringControl）
 *  3. 飞行中断/取消功能（参考 tellux Camera.cancelFlight）
 *  4. 飞行目标解析：支持经纬度、Cartesian3、屏幕坐标
 *  5. 飞行队列管理：序列化多个飞行任务
 *  6. 飞行状态回调（onComplete / onCancel / onTick）
 *
 * 设计模式参考 tellux：
 *  - Camera 类：Cesium 风格的 viewport API，所有角度内部以度存储
 *  - SpringControl：基于 damped harmonic oscillator 的平滑相机过渡
 *  - TargetFlightController：目标解析 → 计算相机位姿 → 触发 flyTo
 *
 * @module useCesiumCameraEnhanced
 */

import { ref, computed } from 'vue'

// ======================== 缓动函数 ========================

/**
 * 缓动函数集合
 * 参考 tellux 项目中使用的标准缓动曲线
 */
export const EasingFunctions = Object.freeze({
    /** 线性 */
    linear: (t) => t,
    /** 缓入（二次方） */
    easeInQuad: (t) => t * t,
    /** 缓出（二次方） */
    easeOutQuad: (t) => t * (2 - t),
    /** 缓入缓出（二次方） */
    easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    /** 缓入（三次方） */
    easeInCubic: (t) => t * t * t,
    /** 缓出（三次方） */
    easeOutCubic: (t) => (--t) * t * t + 1,
    /** 缓入缓出（三次方）—— tellux 默认 */
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    /** 缓入（正弦） */
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    /** 缓出（正弦） */
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    /** 缓入缓出（正弦） */
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
})

// ======================== 弹簧物理 ========================

/**
 * 弹簧控制器 —— 参考 tellux SpringControl
 *
 * 基于阻尼谐振子（Damped Harmonic Oscillator）的平滑过渡。
 * 当需要从当前状态平滑过渡到目标状态时（如切换底图后恢复视角），
 * 弹簧控制比固定时长的 flyTo 更自然。
 *
 * @param {Object} options
 * @param {number} [options.stiffness=120]  - 弹簧刚度（越大越快到达）
 * @param {number} [options.damping=20]     - 阻尼系数（越大振荡越小）
 * @param {number} [options.mass=1]         - 质量
 * @param {number} [options.threshold=0.01] - 收敛阈值（值变化小于此认为到达）
 */
export class SpringController {
    constructor(options = {}) {
        this.stiffness = options.stiffness ?? 120
        this.damping = options.damping ?? 20
        this.mass = options.mass ?? 1
        this.threshold = options.threshold ?? 0.01

        this._current = 0
        this._target = 0
        this._velocity = 0
        this._active = false
    }

    /** 当前值 */
    get current() { return this._current }
    /** 目标值 */
    get target() { return this._target }
    /** 是否正在过渡 */
    get active() { return this._active }

    /**
     * 设置目标值，开始弹簧过渡
     * @param {number} target
     */
    setTarget(target) {
        this._target = target
        this._active = true
    }

    /**
     * 立即设置当前值（无过渡）
     * @param {number} value
     */
    setCurrent(value) {
        this._current = value
        this._velocity = 0
    }

    /**
     * 推进一帧（使用 Verlet 积分）
     * @param {number} dt - 时间步长（秒）
     * @returns {number} 当前值
     */
    update(dt) {
        if (!this._active) return this._current

        // 弹簧力 F = -k * x - d * v
        const displacement = this._current - this._target
        const springForce = -this.stiffness * displacement
        const dampingForce = -this.damping * this._velocity
        const acceleration = (springForce + dampingForce) / this.mass

        this._velocity += acceleration * dt
        this._current += this._velocity * dt

        // 收敛检测
        if (Math.abs(displacement) < this.threshold && Math.abs(this._velocity) < this.threshold) {
            this._current = this._target
            this._velocity = 0
            this._active = false
        }

        return this._current
    }

    /** 重置弹簧状态 */
    reset() {
        this._current = 0
        this._target = 0
        this._velocity = 0
        this._active = false
    }
}

// ======================== 飞行状态枚举 ========================

export const FlightState = Object.freeze({
    IDLE: 'idle',
    FLYING: 'flying',
    CANCELLED: 'cancelled',
})

// ======================== 主 Composable ========================

/**
 * Cesium 增强相机控制器
 *
 * @param {Object} deps
 * @param {Function} deps.getViewer - 返回 Cesium.Viewer 实例的闭包
 * @param {Function} deps.getCesium - 返回 Cesium 全局对象的闭包
 * @returns {Object} 增强相机 API
 */
export function useCesiumCameraEnhanced({ getViewer, getCesium }) {
    // ---- 内部状态 ----
    let _flightId = 0
    let _activeFlightId = null
    let _animationFrameId = null

    // ---- 响应式状态 ----
    const flightState = ref(FlightState.IDLE)
    const currentFlightId = computed(() => _activeFlightId)

    // ======================== 飞行取消 ========================

    /**
     * 取消当前正在进行的飞行
     * 参考 tellux Camera.cancelFlight() 的实现
     */
    function cancelFlight() {
        if (_animationFrameId !== null) {
            cancelAnimationFrame(_animationFrameId)
            _animationFrameId = null
        }
        _activeFlightId = null
        flightState.value = FlightState.CANCELLED
    }

    // ======================== 增强 flyTo ========================

    /**
     * 增强版相机飞行
     *
     * 相比原生 Cesium flyTo 增加：
     *  - 自定义缓动函数（默认 easeInOutCubic，与 tellux 一致）
     *  - 每帧回调 onTick（可用于 UI 更新）
     *  - 飞行取消能力
     *  - 支持 heading/pitch/roll 的角度插值
     *
     * @param {Object} options
     * @param {Object|Array} options.destination - 目标位置
     *   - {longitude, latitude, height} 或 [lng, lat, height]
     *   - 或 Cesium.Cartesian3
     * @param {Object}  [options.orientation]         - 目标朝向
     * @param {number}  [options.orientation.heading] - 航向角（度）
     * @param {number}  [options.orientation.pitch]   - 俯仰角（度）
     * @param {number}  [options.orientation.roll]    - 横滚角（度）
     * @param {number}  [options.duration=2.5]        - 飞行时长（秒）
     * @param {string}  [options.easing='easeInOutCubic'] - 缓动函数名
     * @param {number}  [options.maximumHeight]       - 最大飞行高度（米）
     * @param {boolean} [options.cancelPrevious=true] - 是否取消之前的飞行
     * @param {Function} [options.onComplete]         - 飞行完成回调
     * @param {Function} [options.onCancel]           - 飞行取消回调
     * @param {Function} [options.onTick]             - 每帧回调 (progress, currentPos)
     * @returns {number|null} 飞行 ID，可用于后续取消
     */
    function enhancedFlyTo(options) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        // 取消之前的飞行
        if (options.cancelPrevious !== false) {
            cancelFlight()
        }

        // 解析目标位置
        const destination = resolveDestination(Cesium, options.destination)
        if (!destination) {
            console.warn('[CameraEnhanced] 无效的目标位置:', options.destination)
            return null
        }

        // 解析目标朝向
        const camera = viewer.camera
        const startHeading = camera.heading
        const startPitch = camera.pitch
        const startRoll = camera.roll
        const startCartesian = camera.positionWC.clone()

        const ori = options.orientation ?? {}
        const endHeading = Cesium.Math.toRadians(ori.heading ?? Cesium.Math.toDegrees(startHeading))
        const endPitch = Cesium.Math.toRadians(ori.pitch ?? Cesium.Math.toDegrees(startPitch))
        const endRoll = Cesium.Math.toRadians(ori.roll ?? Cesium.Math.toDegrees(startRoll))

        // 处理最大飞行高度
        let targetDestination = destination.clone()
        if (options.maximumHeight !== undefined) {
            const carto = Cesium.Cartographic.fromCartesian(destination)
            if (carto.height > options.maximumHeight) {
                targetDestination = Cesium.Cartesian3.fromRadians(
                    carto.longitude,
                    carto.latitude,
                    options.maximumHeight
                )
            }
        }

        // 获取缓动函数
        const easingName = options.easing ?? 'easeInOutCubic'
        const easingFn = EasingFunctions[easingName] ?? EasingFunctions.easeInOutCubic

        const duration = options.duration ?? 2.5
        const flightId = ++_flightId
        _activeFlightId = flightId
        flightState.value = FlightState.FLYING

        let startTime = null

        function tick(timestamp) {
            if (_activeFlightId !== flightId) return // 已被取消或替换

            if (startTime === null) startTime = timestamp
            const elapsed = (timestamp - startTime) / 1000 // 秒
            const rawProgress = Math.min(elapsed / duration, 1)
            const progress = easingFn(rawProgress)

            // 位置插值（Cartesian3 lerp）
            const currentPos = Cesium.Cartesian3.lerp(
                startCartesian,
                targetDestination,
                progress,
                new Cesium.Cartesian3()
            )

            // 朝向插值（角度 lerp，处理角度环绕）
            const currentHeading = lerpAngle(startHeading, endHeading, progress)
            const currentPitch = startPitch + (endPitch - startPitch) * progress
            const currentRoll = startRoll + (endRoll - startRoll) * progress

            camera.setView({
                destination: currentPos,
                orientation: {
                    heading: currentHeading,
                    pitch: currentPitch,
                    roll: currentRoll,
                },
            })

            // 每帧回调
            options.onTick?.(rawProgress, currentPos)

            if (rawProgress < 1) {
                _animationFrameId = requestAnimationFrame(tick)
            } else {
                // 飞行完成
                _animationFrameId = null
                if (_activeFlightId === flightId) {
                    _activeFlightId = null
                    flightState.value = FlightState.IDLE
                    options.onComplete?.()
                }
            }
        }

        _animationFrameId = requestAnimationFrame(tick)
        return flightId
    }

    // ======================== 快捷飞行方法 ========================

    /**
     * 飞行到指定经纬度
     *
     * @param {number} longitude - 经度（度）
     * @param {number} latitude  - 纬度（度）
     * @param {number} [height=1000] - 高度（米）
     * @param {Object} [options={}] - 同 enhancedFlyTo 选项
     * @returns {number|null}
     */
    function flyToPosition(longitude, latitude, height = 1000, options = {}) {
        return enhancedFlyTo({
            ...options,
            destination: { longitude, latitude, height },
        })
    }

    /**
     * 飞行到指定位置并朝向目标点（两点法）
     * 适用于"飞行到某建筑并面向它"的场景
     *
     * @param {Object} cameraPosition - 相机位置 {longitude, latitude, height}
     * @param {Object} lookAtTarget   - 观察目标 {longitude, latitude, height}
     * @param {Object} [options={}]   - 同 enhancedFlyTo 选项
     * @returns {number|null}
     */
    function flyToAndLookAt(cameraPosition, lookAtTarget, options = {}) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        // 计算从相机位置到目标的航向角和俯仰角
        const camCart = Cesium.Cartesian3.fromDegrees(
            cameraPosition.longitude, cameraPosition.latitude, cameraPosition.height
        )
        const targetCart = Cesium.Cartesian3.fromDegrees(
            lookAtTarget.longitude, lookAtTarget.latitude, lookAtTarget.height
        )

        // 方向向量
        const direction = Cesium.Cartesian3.subtract(targetCart, camCart, new Cesium.Cartesian3())
        Cesium.Cartesian3.normalize(direction, direction)

        // 转换为 heading/pitch
        const heading = Math.atan2(direction.x, direction.y)
        const pitch = Math.asin(direction.z)

        return enhancedFlyTo({
            ...options,
            destination: cameraPosition,
            orientation: {
                heading: Cesium.Math.toDegrees(heading),
                pitch: Cesium.Math.toDegrees(pitch),
                roll: 0,
            },
        })
    }

    /**
     * 飞行到矩形范围（Bounding Rectangle）
     * 相机自动定位到能完整显示该区域的位置
     *
     * @param {Object} rectangle - {west, south, east, north}（度）
     * @param {Object} [options={}] - 同 enhancedFlyTo 选项
     * @returns {number|null}
     */
    function flyToRectangle(rectangle, options = {}) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        const rect = new Cesium.Rectangle.fromDegrees(
            rectangle.west, rectangle.south, rectangle.east, rectangle.north
        )
        const center = Cesium.Rectangle.center(rect)
        const width = Cesium.Math.toDegrees(rect.east - rect.west)
        const height = width * 0.8 // 估算合适的观察高度

        return enhancedFlyTo({
            ...options,
            destination: {
                longitude: Cesium.Math.toDegrees(center.longitude),
                latitude: Cesium.Math.toDegrees(center.latitude),
                height: Math.max(height * 111000, 1000), // 粗略转换为米
            },
            orientation: { heading: 0, pitch: -45, roll: 0 },
        })
    }

    // ======================== 弹簧过渡 ========================

    /**
     * 使用弹簧物理进行平滑的相机高度过渡
     * 适用于需要"弹性"感觉的场景（如 UI 缩放触发的视角变化）
     *
     * @param {Object} options
     * @param {number} options.targetHeight - 目标高度（米）
     * @param {Object} [options.spring]     - 弹簧参数 {stiffness, damping, mass}
     * @param {Function} [options.onComplete] - 完成回调
     * @returns {number|null} 动画 ID
     */
    function springToHeight(options) {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        cancelFlight()

        const spring = new SpringController(options.spring)
        const currentCarto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC)
        spring.setCurrent(currentCarto.height)
        spring.setTarget(options.targetHeight)

        const flightId = ++_flightId
        _activeFlightId = flightId
        flightState.value = FlightState.FLYING

        let lastTime = null

        function tick(timestamp) {
            if (_activeFlightId !== flightId) return

            if (lastTime === null) { lastTime = timestamp; return }
            const dt = (timestamp - lastTime) / 1000
            lastTime = timestamp

            const newHeight = spring.update(dt)

            const currentPos = Cesium.Cartesian3.fromRadians(
                currentCarto.longitude,
                currentCarto.latitude,
                newHeight
            )
            viewer.camera.setView({
                destination: currentPos,
                orientation: {
                    heading: viewer.camera.heading,
                    pitch: viewer.camera.pitch,
                    roll: viewer.camera.roll,
                },
            })

            if (spring.active) {
                _animationFrameId = requestAnimationFrame(tick)
            } else {
                _animationFrameId = null
                if (_activeFlightId === flightId) {
                    _activeFlightId = null
                    flightState.value = FlightState.IDLE
                    options.onComplete?.()
                }
            }
        }

        _animationFrameId = requestAnimationFrame(tick)
        return flightId
    }

    // ======================== 相机状态查询 ========================

    /**
     * 获取当前相机状态（参考 tellux Camera.getState）
     *
     * @returns {{ longitude: number, latitude: number, height: number,
     *             heading: number, pitch: number, roll: number }|null}
     *           所有角度为度
     */
    function getCameraState() {
        const viewer = getViewer?.()
        const Cesium = getCesium?.()
        if (!viewer || !Cesium) return null

        const carto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC)
        return {
            longitude: Cesium.Math.toDegrees(carto.longitude),
            latitude: Cesium.Math.toDegrees(carto.latitude),
            height: carto.height,
            heading: Cesium.Math.toDegrees(viewer.camera.heading),
            pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
            roll: Cesium.Math.toDegrees(viewer.camera.roll),
        }
    }

    /**
     * 获取相机当前位置的经纬度字符串（格式化显示用）
     *
     * @param {number} [precision=6] - 小数位数
     * @returns {string} 如 "116.391234°E, 39.907654°N, 450.2m"
     */
    function getFormattedPosition(precision = 6) {
        const state = getCameraState()
        if (!state) return '--'
        const lngDir = state.longitude >= 0 ? 'E' : 'W'
        const latDir = state.latitude >= 0 ? 'N' : 'S'
        return `${Math.abs(state.longitude).toFixed(precision)}°${lngDir}, ${Math.abs(state.latitude).toFixed(precision)}°${latDir}, ${state.height.toFixed(1)}m`
    }

    // ======================== 清理 ========================

    /** 清理所有动画和资源 */
    function cleanup() {
        cancelFlight()
    }

    // ======================== 辅助函数 ========================

    /**
     * 解析多种格式的目标位置为 Cartesian3
     * @param {Object} Cesium
     * @param {Object|Array|Object} destination
     * @returns {import('cesium').Cartesian3|null}
     */
    function resolveDestination(Cesium, destination) {
        if (!destination) return null

        // 已经是 Cartesian3
        if (destination instanceof Cesium.Cartesian3) return destination

        // 数组格式 [lng, lat, height?]
        if (Array.isArray(destination)) {
            const [lng, lat, height = 0] = destination
            return Cesium.Cartesian3.fromDegrees(lng, lat, height)
        }

        // 对象格式 {longitude, latitude, height} 或 {lng, lat, height}
        const lng = destination.longitude ?? destination.lng
        const lat = destination.latitude ?? destination.lat
        if (typeof lng === 'number' && typeof lat === 'number') {
            return Cesium.Cartesian3.fromDegrees(lng, lat, destination.height ?? 0)
        }

        return null
    }

    /**
     * 角度插值（处理 0° ↔ 360° 环绕问题）
     *
     * @param {number} from - 起始角度（弧度）
     * @param {number} to   - 目标角度（弧度）
     * @param {number} t    - 插值参数 [0, 1]
     * @returns {number} 插值结果（弧度）
     */
    function lerpAngle(from, to, t) {
        // 计算最短路径的差值
        let diff = to - from
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        return from + diff * t
    }

    // ======================== 返回 ========================
    return {
        // 状态
        flightState,
        currentFlightId,

        // 飞行控制
        enhancedFlyTo,
        cancelFlight,

        // 快捷方法
        flyToPosition,
        flyToAndLookAt,
        flyToRectangle,

        // 弹簧过渡
        springToHeight,
        SpringController,

        // 状态查询
        getCameraState,
        getFormattedPosition,

        // 清理
        cleanup,

        // 工具
        EasingFunctions,
    }
}