/**
 * usePlayerController.js
 * 人物漫游控制器 composable
 *
 * 集成 cesium-player-controller 提供第一/第三人称漫游模式：
 * - WASD 移动 + Shift 冲刺 + Space 跳跃
 * - V 切换第一/第三人称，F 切换飞行模式
 * - 胶囊体碰撞 + 地形碰撞 + 3D Tiles 碰撞
 * - 人物 GLB 模型 + 动画状态机
 *
 * 使用方式：点击控制中心「漫游模式」按钮启动/停止。
 *
 * @param {Object} options
 * @param {Function} options.getViewer - 返回 Cesium.Viewer 实例
 * @param {Function} options.getCesium - 返回 Cesium 全局对象
 * @param {Object}   options.message   - 消息提示对象（message.success/error）
 */
import { ref } from 'vue';
import {
    DEFAULT_PLAYER_MODEL_CONFIG,
    DEFAULT_PHYSICS_CONFIG,
    DEFAULT_CAMERA_CONFIG,
    DEFAULT_KEY_MAP,
    DEFAULT_MOUSE_SENSITIVITY,
} from './playerDefaults';
import { hasRealTerrain } from './utils/terrainHelper';

export function usePlayerController({ getViewer, getCesium, message }) {
    /** 漫游模式是否激活 */
    const isActive = ref(false);

    /** 当前是否为第一人称 */
    const isFirstPerson = ref(false);

    /** 当前是否处于飞行模式 */
    const isFlying = ref(false);

    let playerInstance = null;
    let preUpdateListener = null;

    /**
     * 启动漫游模式
     * 动态导入 PlayerController 模块（懒加载，避免首屏体积膨胀）
     *
     * @param {Object} [options] - 可选配置覆盖
     * @param {Object} [options.modelConfig] - 人物模型配置覆盖
     * @param {Object} [options.staticCollider] - 静态碰撞源
     * @param {Object} [options.initPos] - 初始位置（Cartesian3），默认使用当前相机位置
     */
    async function startPlayer(options = {}) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) {
            message?.error?.('Cesium 未初始化');
            return;
        }
        if (isActive.value) return;

        try {
            message?.info?.('正在加载漫游控制器...');

            // 从本地模块导入（懒加载 rapier WASM + 控制器 + loaders.gl）
            const { playerController } = await import('./index.js');

            // 确定出生点：用户指定 > 当前相机位置
            // 逻辑：有地形 → 地形高度 + 500m | 确认平面地形 → 固定 500m
            let initPos = options.initPos;
            let terrainHeight = 0;
            let noTerrain = true;
            const camera = viewer.camera;
            const carto = Cesium.Cartographic.fromCartesian(camera.position);
            if (!initPos) {
                let spawnHeight = 500;
                const provider = viewer.terrainProvider;

                if (hasRealTerrain(provider)) {
                    // 有地形 provider（Cesium/天地图/ArcGIS），尝试采样高度
                    let sampled = null;
                    try {
                        sampled = await Cesium.sampleTerrainMostDetailed(provider, [carto]);
                    } catch {
                        // sampleTerrainMostDetailed 不兼容时降级
                        try {
                            sampled = await Cesium.sampleTerrain(provider, 17, [carto]);
                        } catch { /* 采样彻底失败 */ }
                    }

                    if (sampled && sampled[0] && Cesium.defined(sampled[0].height)) {
                        // 采样成功：地形高度 + 500m
                        terrainHeight = sampled[0].height;
                        spawnHeight = terrainHeight + 500;
                        noTerrain = false;
                    } else {
                        // 采样失败但地形存在（网络/服务异常），仍尝试创建碰撞体
                        console.warn('[PlayerController] 地形高度采样失败，使用相机高度 + 500m');
                        spawnHeight = carto.height > 0 ? carto.height + 500 : 500;
                        noTerrain = false;
                    }
                }
                // else: 平面地形（EllipsoidTerrainProvider），spawnHeight 保持 500m，noTerrain = true

                initPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, spawnHeight);
            }

            // 构建地形碰撞体：仅在有地形时创建
            let staticCollider = options.staticCollider;
            if (!staticCollider && !noTerrain) {
                const half = 0.006;
                staticCollider = [{
                    type: 'terrain',
                    rectangle: [
                        carto.longitude - half,
                        carto.latitude - half,
                        carto.longitude + half,
                        carto.latitude + half,
                    ],
                    resolution: 64,
                }];
            }

            // 无地形时默认开启飞行模式，角色悬浮可自由移动
            if (noTerrain) {
                DEFAULT_CAMERA_CONFIG.isFirstPerson = false;
            }

            // 合并模型配置
            const modelConfig = {
                ...DEFAULT_PLAYER_MODEL_CONFIG,
                ...DEFAULT_PHYSICS_CONFIG,
                ...options.modelConfig,
            };

            // 创建控制器实例
            const player = new playerController();

            await player.init({
                viewer,
                initPos,
                playerModelConfig: modelConfig,
                staticCollider,
                ...DEFAULT_CAMERA_CONFIG,
                mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
                keyMap: DEFAULT_KEY_MAP,
                isShowMobileControls: false,
            });

            // 无地形自动进入飞行模式
            if (noTerrain) {
                player.isFlying = true;
            }

            playerInstance = player;

            // 接入 Cesium 帧循环（含最低高度保护）
            const MIN_HEIGHT = 5;
            let lastTime = performance.now();
            preUpdateListener = viewer.scene.preUpdate.addEventListener(() => {
                const now = performance.now();
                const delta = (now - lastTime) / 1000;
                lastTime = now;
                player.update(delta);

                // 最低高度保护：有地形时防止穿地，无地形时保持悬浮
                const pos = player.getPosition();
                const posCarto = Cesium.Cartographic.fromCartesian(pos);
                const floor = noTerrain ? MIN_HEIGHT : terrainHeight + MIN_HEIGHT;
                if (posCarto.height < floor) {
                    player.reset(Cesium.Cartesian3.fromRadians(
                        posCarto.longitude,
                        posCarto.latitude,
                        floor,
                    ));
                }
            });

            // 监听视角切换事件
            player.onViewChange = (firstPerson) => {
                isFirstPerson.value = firstPerson;
            };

            // 监听飞行状态变化
            player.onGroundChange = () => {
                isFlying.value = player.getIsFlying();
            };

            isActive.value = true;
            isFirstPerson.value = player.getIsFirstPerson();
            isFlying.value = player.getIsFlying();
            message?.success?.('漫游模式已启动（WASD 移动 / V 切视角 / F 飞行）');
        } catch (error) {
            console.error('[PlayerController] 启动失败:', error);
            message?.error?.(`漫游模式启动失败: ${error.message || '未知错误'}`);
            stopPlayer();
        }
    }

    /**
     * 停止漫游模式
     * 销毁控制器实例，恢复 Cesium 默认交互
     */
    function stopPlayer() {
        // 移除帧监听
        if (preUpdateListener) {
            preUpdateListener();
            preUpdateListener = null;
        }

        // 销毁控制器
        if (playerInstance) {
            try {
                playerInstance.destroy();
            } catch (error) {
                console.warn('[PlayerController] 销毁警告:', error);
            }
            playerInstance = null;
        }

        // 恢复 Cesium 默认交互
        const viewer = getViewer();
        if (viewer) {
            const sscc = viewer.scene.screenSpaceCameraController;
            sscc.enableRotate = true;
            sscc.enableTranslate = true;
            sscc.enableZoom = true;
            sscc.enableTilt = true;
            sscc.enableLook = true;
        }

        isActive.value = false;
        isFirstPerson.value = false;
        isFlying.value = false;
    }

    /**
     * 切换漫游模式启动/停止
     * @param {Object} [options] - 传递给 startPlayer 的配置
     */
    function togglePlayer(options) {
        if (isActive.value) {
            stopPlayer();
            message?.info?.('漫游模式已停止');
        } else {
            startPlayer(options);
        }
    }

    /**
     * 切换第一/第三人称视角
     * 仅在漫游模式激活时有效
     */
    function changeView() {
        if (!playerInstance) return;
        playerInstance.changeView();
        isFirstPerson.value = playerInstance.getIsFirstPerson();
    }

    /**
     * 获取当前控制器实例（高级用法）
     * @returns {Object|null}
     */
    function getPlayerInstance() {
        return playerInstance;
    }

    return {
        isActive,
        isFirstPerson,
        isFlying,
        startPlayer,
        stopPlayer,
        togglePlayer,
        changeView,
        getPlayerInstance,
    };
}
