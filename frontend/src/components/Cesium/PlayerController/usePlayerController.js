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

    /**
     * 人物三维坐标（经纬度 + 高度）
     * 格式: { lng: number, lat: number, height: number }
     * 漫游模式激活时实时更新，停止时重置为 null
     */
    const playerPosition = ref(null);

    /**
     * 人物实时速度（m/s）
     * 漫游模式激活时每帧更新，停止时重置为 0
     */
    const playerSpeed = ref(0);

    /**
     * 导航目标点
     * 格式: { lng, lat, name, bearing?, distance?, _entity? }
     * bearing = 玩家到目标的方位角（度，0=北，顺时针）
     * distance = 玩家到目标的直线距离（米）
     * _entity = Cesium Entity 引用（用于 Selection Indicator）
     */
    const navTarget = ref(null);

    let playerInstance = null;
    let preUpdateListener = null;
    let _onOpenNavDialog = null; // 外部注册的打开导航对话框回调
    let _navSelectionListener = null; // selectedEntity 变更监听器（锁定选中状态）
    let _navPreRenderListener = null; // 导航 HUD 每帧更新监听器（preRender）

    /**
     * 启动漫游模式
     * 动态导入 PlayerController 模块（懒加载，避免首屏体积膨胀）
     *
     * @param {Object} [options] - 可选配置覆盖
     * @param {Object} [options.modelConfig] - 人物模型配置覆盖
     * @param {Object} [options.staticCollider] - 静态碰撞源
     * @param {Object} [options.initPos] - 初始位置（Cartesian3），默认使用当前相机位置
     * @param {number} [options.spawnHeight=500] - 初始离地高度（米），有地形时叠加地形高度
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
            // 逻辑：有地形 → 地形高度 + spawnHeight | 确认平面地形 → 固定 spawnHeight
            let initPos = options.initPos;
            const heightOffset = options.spawnHeight || 500; // 用户可配置的离地高度，默认 500m
            let terrainHeight = 0;
            let noTerrain = true;
            const camera = viewer.camera;
            const carto = Cesium.Cartographic.fromCartesian(camera.position);
            if (!initPos) {
                let spawnHeight = heightOffset;
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
                        // 采样成功：地形高度 + 用户设定离地高度
                        terrainHeight = sampled[0].height;
                        spawnHeight = terrainHeight + heightOffset;
                        noTerrain = false;
                    } else {
                        // 采样失败但地形存在（网络/服务异常），仍尝试创建碰撞体
                        spawnHeight = carto.height > 0 ? carto.height + heightOffset : heightOffset;
                        noTerrain = false;
                    }
                }
                // else: 平面地形（EllipsoidTerrainProvider），生成平坦椭球面碰撞体
                // 出生高度保持 heightOffset（默认 500m），noTerrain = true

                initPos = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, spawnHeight);
            }

            // 构建碰撞体：有地形时采样高程网格，无地形时创建平坦椭球面（height=0）
            const MIN_HEIGHT = 5;
            let staticCollider = options.staticCollider;
            const TERRAIN_HALF = 0.03;
            let colliderCenter = { lon: carto.longitude, lat: carto.latitude };
            if (!staticCollider) {
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

            playerInstance = player;

            // 接入 Cesium 帧循环（含最低高度保护 + 动态地形碰撞更新）
            const TERRAIN_UPDATE_THRESHOLD = TERRAIN_HALF * 0.6; // 距碰撞中心 60% 时触发更新
            let updatingTerrain = false;
            let lastTime = performance.now();
            preUpdateListener = viewer.scene.preUpdate.addEventListener(() => {
                const now = performance.now();
                const delta = (now - lastTime) / 1000;
                lastTime = now;
                player.update(delta);

                // 最低高度保护：有地形时防止穿地（terrainHeight + 1m），无地形时兜底在椭球面(0m)
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

                // 更新人物三维坐标（经纬度 + 高度）
                playerPosition.value = {
                    lng: Cesium.Math.toDegrees(posCarto.longitude),
                    lat: Cesium.Math.toDegrees(posCarto.latitude),
                    height: posCarto.height,
                };

                // 更新实时速度（m/s）：ENU 速度分量合成
                const vel = player.getVelocity();
                playerSpeed.value = Math.hypot(vel.e, vel.n, vel.u);


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
        playerPosition.value = null;
        playerSpeed.value = 0;
        // 注意：不清除 navTarget，导航目标独立于漫游状态
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
     * 设置导航目标
     * 创建 Cesium Entity 并聚焦 Selection Indicator，同时记录坐标用于 HUD 方位计算
     *
     * @param {Object} target - 目标信息
     * @param {number} target.lng - 经度
     * @param {number} target.lat - 纬度
     * @param {string} [target.name] - 目标名称
     */
    function setNavTarget({ lng, lat, name }) {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        // 清除旧目标
        clearNavTarget();

        const pos = Cesium.Cartesian3.fromDegrees(lng, lat);
        // 创建 Entity 用于 Selection Indicator 显示
        const targetEntity = viewer.entities.add({
            position: pos,
            point: { pixelSize: 10, color: Cesium.Color.CYAN.withAlpha(0.8) },
            name: name || '导航目标',
        });
        viewer.selectedEntity = targetEntity;

        // 锁定 Selection Indicator：监听选中变化，防止点击其他地方取消选中
        _navSelectionListener = viewer.selectedEntityChanged.addEventListener((selectedEntity) => {
            if (navTarget.value?._entity && selectedEntity !== navTarget.value._entity) {
                // 延迟一帧恢复，避免与 Cesium 内部逻辑冲突
                Promise.resolve().then(() => {
                    if (navTarget.value?._entity) {
                        viewer.selectedEntity = navTarget.value._entity;
                    }
                });
            }
        });

        navTarget.value = {
            lng,
            lat,
            name: name || '导航目标',
            bearing: 0,
            distance: 0,
            _entity: targetEntity,
        };

        // 注册 preRender 监听器：每帧更新相对方位角 + 距离（不依赖漫游状态）
        const targetCartesian = Cesium.Cartesian3.fromDegrees(lng, lat);
        _navPreRenderListener = viewer.scene.preRender.addEventListener(() => {
            if (!navTarget.value) return;

            const cameraPos = viewer.camera.position;
            const cameraCarto = Cesium.Cartographic.fromCartesian(cameraPos);

            // 1. 绝对方位角：相机 → 目标（度，0=北，顺时针）
            const absoluteBearing = computeBearing(
                Cesium.Math.toDegrees(cameraCarto.longitude),
                Cesium.Math.toDegrees(cameraCarto.latitude),
                lng, lat,
            );

            // 2. 相机航向（弧度 → 度）
            const cameraHeadingDeg = Cesium.Math.toDegrees(viewer.camera.heading);

            // 3. 相对方位角 = 绝对方位角 - 相机航向（箭头指向目标在屏幕上的方向）
            navTarget.value.bearing = (absoluteBearing - cameraHeadingDeg + 360) % 360;

            // 4. 3D 欧氏距离（米）
            navTarget.value.distance = Cesium.Cartesian3.distance(cameraPos, targetCartesian);

            // 5. 锁定 Selection Indicator
            const entity = navTarget.value._entity;
            if (entity && viewer.selectedEntity !== entity) {
                viewer.selectedEntity = entity;
            }
        });

        message?.info?.(`导航目标已设置：${name || '地图选点'}`);
    }

    /**
     * 清除导航目标
     * 移除 Cesium Entity 并取消 Selection Indicator
     */
    function clearNavTarget() {
        const viewer = getViewer();

        // 移除每帧更新监听器
        if (_navPreRenderListener) {
            _navPreRenderListener();
            _navPreRenderListener = null;
        }

        // 移除选中锁定监听器
        if (_navSelectionListener) {
            _navSelectionListener();
            _navSelectionListener = null;
        }

        if (viewer && navTarget.value?._entity) {
            try {
                viewer.entities.remove(navTarget.value._entity);
            } catch { /* entity 可能已被移除 */ }
            viewer.selectedEntity = undefined;
        }
        navTarget.value = null;
    }

    /**
     * 打开导航目标选择对话框
     * 由控制中心调用，实际对话框由 CesiumContainer 管理
     */
    function openNavDialog() {
        if (_onOpenNavDialog) {
            _onOpenNavDialog();
        }
    }

    /**
     * 注册打开导航对话框的回调（由 CesiumContainer 调用）
     * @param {Function} handler - 打开对话框的回调函数
     */
    function setOpenNavDialogHandler(handler) {
        _onOpenNavDialog = handler;
    }

    /**
     * 进入导航目标点选模式
     * 点击 Cesium 场景设置目标：优先检测数据实体，否则取地形坐标
     * 点选完成后自动退出模式
     */
    function startNavPick() {
        const viewer = getViewer();
        const Cesium = getCesium();
        if (!viewer || !Cesium) return;

        message?.info?.('点击地图选择导航目标');

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
            // 优先检测是否点到了数据实体
            const picked = viewer.scene.pick(click.position);
            if (Cesium.defined(picked) && picked.id && picked.id.position) {
                const julianDate = viewer.clock.currentTime;
                const entityPos = picked.id.position.getValue(julianDate);
                if (entityPos) {
                    const carto = Cesium.Cartographic.fromCartesian(entityPos);
                    if (carto) {
                        viewer.selectedEntity = picked.id;
                        navTarget.value = {
                            lng: Cesium.Math.toDegrees(carto.longitude),
                            lat: Cesium.Math.toDegrees(carto.latitude),
                            name: picked.id.name || '数据要素',
                            bearing: 0,
                            distance: 0,
                            _entity: picked.id,
                        };
                        message?.info?.(`导航目标已设置：${picked.id.name || '数据要素'}`);
                        handler.destroy();
                        return;
                    }
                }
            }

            // 未命中实体 → 取地形坐标
            const cartesian = viewer.scene.pickPosition(click.position)
                || viewer.scene.globe.pick(viewer.camera.getPickRay(click.position), viewer.scene);
            if (cartesian) {
                const carto = Cesium.Cartographic.fromCartesian(cartesian);
                setNavTarget({
                    lng: Cesium.Math.toDegrees(carto.longitude),
                    lat: Cesium.Math.toDegrees(carto.latitude),
                    name: '地图选点',
                });
            }
            handler.destroy();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
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
        playerPosition,
        playerSpeed,
        navTarget,
        startPlayer,
        stopPlayer,
        togglePlayer,
        changeView,
        getPlayerInstance,
        setNavTarget,
        clearNavTarget,
        startNavPick,
        openNavDialog,
        setOpenNavDialogHandler,
    };
}

/**
 * 初始方位角（度，0=北，顺时针）
 * @param {number} lon1 - 起点经度
 * @param {number} lat1 - 起点纬度
 * @param {number} lon2 - 终点经度
 * @param {number} lat2 - 终点纬度
 * @returns {number} 方位角（0~360 度）
 */
function computeBearing(lon1, lat1, lon2, lat2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
