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
        // 安全检查：isActive 为 true 但没有实际实例时，自动重置（防止之前失败卡住状态）
        if (isActive.value && !playerInstance) {
            isActive.value = false;
            isFirstPerson.value = false;
            isFlying.value = false;
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
                    // 直接用 sampleTerrain 指定层级，避免 sampleTerrainMostDetailed 请求过高精度导致瓦片过载
                    // 天地图用 level 10，ArcGIS/Cesium 用 level 12
                    const prov = provider;
                    const sampleLevel = prov._bottomLevel
                        ? Math.max(0, prov._bottomLevel - 1)
                        : Math.min(prov.maximumLevel ?? 12, 12);
                    let sampled = null;
                    try {
                        sampled = await Cesium.sampleTerrain(provider, sampleLevel, [carto]);
                    } catch { /* 采样失败 */ }

                    if (sampled && sampled[0] && Cesium.defined(sampled[0].height)) {
                        // 采样成功：地形高度 + 500m
                        terrainHeight = sampled[0].height;
                        spawnHeight = terrainHeight + 500;
                        noTerrain = false;
                    } else {
                        // 采样失败但地形存在（网络/服务异常），仍尝试创建碰撞体
                        spawnHeight = carto.height > 0 ? carto.height + 500 : 500;
                        noTerrain = false;
                    }
                }
                // else: 平面地形（EllipsoidTerrainProvider），spawnHeight 保持 500m，noTerrain = true

                initPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, spawnHeight);
            }

            // 构建地形碰撞体：仅在有地形时创建，范围 ±0.03°（约 ±3.3km）
            let staticCollider = options.staticCollider;
            const TERRAIN_HALF = 0.03;
            let colliderCenter = { lon: carto.longitude, lat: carto.latitude };
            if (!staticCollider && !noTerrain) {
                staticCollider = [{
                    type: 'terrain',
                    rectangle: [
                        carto.longitude - TERRAIN_HALF,
                        carto.latitude - TERRAIN_HALF,
                        carto.longitude + TERRAIN_HALF,
                        carto.latitude + TERRAIN_HALF,
                    ],
                    resolution: 64,
                }];
            }

            // 合并相机配置（局部副本，避免突变共享默认对象）
            const cameraConfig = { ...DEFAULT_CAMERA_CONFIG };
            if (noTerrain) cameraConfig.isFirstPerson = false;

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
                ...cameraConfig,
                mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
                keyMap: DEFAULT_KEY_MAP,
                isShowMobileControls: false,
            });

            // 无地形自动进入飞行模式
            if (noTerrain) {
                player.isFlying = true;
            }

            playerInstance = player;

            // 接入 Cesium 帧循环（含最低高度保护 + 动态地形碰撞更新）
            const MIN_HEIGHT = 5;
            const TERRAIN_UPDATE_THRESHOLD = TERRAIN_HALF * 0.6; // 距碰撞中心 60% 时触发更新
            let updatingTerrain = false;
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

                // 动态地形碰撞：玩家接近碰撞边界时重新采样地形
                if (!noTerrain && !updatingTerrain) {
                    const dLon = Math.abs(posCarto.longitude - colliderCenter.lon);
                    const dLat = Math.abs(posCarto.latitude - colliderCenter.lat);
                    if (dLon > TERRAIN_UPDATE_THRESHOLD || dLat > TERRAIN_UPDATE_THRESHOLD) {
                        updatingTerrain = true;
                        const newLon = posCarto.longitude;
                        const newLat = posCarto.latitude;
                        colliderCenter = { lon: newLon, lat: newLat };
                        // 异步更新碰撞体，不阻塞渲染
                        player.physics.clearStaticColliders();
                        player.physics.addStaticColliders(viewer, {
                            type: 'terrain',
                            rectangle: [
                                newLon - TERRAIN_HALF,
                                newLat - TERRAIN_HALF,
                                newLon + TERRAIN_HALF,
                                newLat + TERRAIN_HALF,
                            ],
                            resolution: 64,
                        }).then(async () => {
                            // 更新地形高度基准（用于最低高度保护）
                            try {
                                const provider = viewer.terrainProvider;
                                const centerCarto = new Cesium.Cartographic(newLon, newLat, 0);
                                const level = provider._bottomLevel
                                    ? Math.max(0, provider._bottomLevel - 1)
                                    : Math.min(provider.maximumLevel ?? 12, 12);
                                const sampled = await Cesium.sampleTerrain(provider, level, [centerCarto]);
                                if (sampled && sampled[0] && Cesium.defined(sampled[0].height)) {
                                    terrainHeight = sampled[0].height;
                                }
                            } catch { /* 保持旧值 */ }
                            updatingTerrain = false;
                        }).catch(() => {
                            updatingTerrain = false;
                        });
                    }
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
