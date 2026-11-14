import { BASE_CONFIG_SIZE, clamp, normalizeAngle, toLayerArray } from './compassDrawUtils';
import { createCompassCanvasStyle, samplePixelRadius } from './compassCanvasStyle';

/**
 * CompassManager Service
 * 风水指南针地图管理服务
 *
 * 负责管理地图上的风水指南针组件的完整生命周期，包括：
 * - 指南针矢量图层的挂载/卸载
 * - 指南针的可见性
 * - 地理要素的位置同步
 * - 在 OpenLayers 渲染管道中进行原生 Canvas 矢量渲染
 * - 设备传感器方向同步（陀螺仪）
 * - URL 状态持久化与恢复
 * - 放置模式下的鼠标交互处理
 */

import { watch, type WatchStopHandle } from 'vue';
import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import type { useCompassStore } from '@common/compass/stores/useCompassStore';
import { readCompassUrlState, writeCompassUrlState } from './urlState';

type CompassStore = ReturnType<typeof useCompassStore>;

type CompassManagerOptions = {
    map: Map;
    store: CompassStore;
    mapContainerElement?: HTMLElement | null;
};

// 扩展 VectorLayer：支持自定义排列样式属性

// 基础配置尺寸，作为缩放计算的基准

/**
 * CompassManager encapsulates all map-bound compass responsibilities:
 * - vector layer mount/unmount
 * - geographic feature placement
 * - native canvas vector rendering in OpenLayers renderer pipeline
 * - sensor heading synchronization
 * - URL state synchronization
 */
/**
 * CompassManager 类
 * 指南针管理器 - 负责地图上风水指南针的完整生命周期管理
 *
 * 主要职责：
 * 1. 矢量图层管理：创建、添加、移除 OpenLayers 矢量图层
 * 2. 地理要素同步：保持指南针地理坐标与门店状态一致
 * 3. 原生 Canvas 渲染：使用 OpenLayers Style 的自定义渲染器绘制指南针
 * 4. 用户交互：处理放置模式下的地图点击事件
 * 5. 传感器集成：同步设备陀螺仪数据到指南针旋转角度
 * 6. 状态持久化：与 URL 参数同步指南针位置和配置
 */
export class CompassManager {


    // ==================== 核心依赖 ====================
    private readonly map: Map; // OpenLayers Map 实例
    private readonly store: CompassStore; // Pinia 状态存储
    private readonly mapContainerElement: HTMLElement | null; // 地图容器 DOM 元素

    // ==================== 指南针图层相关 ====================
    private source: VectorSource | null = null; // 矢量数据源
    private feature: Feature<Point> | null = null; // 指南针中心点要素
    private layer: VectorLayer<VectorSource> | null = null; // 矢量图层

    // ==================== 事件监听器句柄 ====================
    private stopHandles: WatchStopHandle[] = []; // Vue watch 停止函数集合
    private viewResolutionKey: EventsKey | null = null; // 地图分辨率变化事件监听器 key (ol EventsKey)

    private singleClickHandler: ((event: MouseEvent) => void) | null = null; // 地图点击处理器
    private resizeHandler: (() => void) | null = null; // 窗口缩放处理器

    private orientationHandler:
        | ((event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => void)
        | null = null; // 设备方向传感器处理器

    private urlSyncTimer: number | null = null; // URL 同步防抖计时器

    private restoringFromUrl = false; // 从 URL 恢复罗盘状态时跳过 URL 写入，避免 cs 自动追加

    // ==================== 渲染相关 ====================
    private readonly style: Style; // 自定义 Canvas 渲染样式

    // ==================== 重入保护 ====================
    private isSyncingGeometry = false; // 防止 syncFeatureGeometry → setPosition 递归触发 watch

    /**
     * 构造函数
     * @param options - 管理器初始化选项
     *   - map: OpenLayers 地图实例
     *   - store: Pinia 状态存储
     *   - mapContainerElement: 地图容器 DOM 元素（可选）
     */
    constructor(options: CompassManagerOptions) {
        this.map = options.map;
        this.store = options.store;
        this.mapContainerElement = options.mapContainerElement || null;
        this.style = this.createNativeCanvasStyle();
    }

    /**
     * 初始化管理器
     * 执行完整的初始化流程：
     * 1. 等待指南针配置加载完毕
     * 2. 从 URL 参数恢复指南针状态
     * 3. 创建并挂载矢量图层
     * 4. 同步地理要素坐标
     * 5. 绑定地图和状态存储事件监听器
     * 6. 设置图层可见性和放置模式光标
     * 7. 启动 URL 状态同步定时器
     */
    async init(): Promise<void> {
        await this.store.ensureConfigLoaded();

        // 从 URL 恢复时标记，防止 watcher 的 immediate 触发 scheduleUrlSync() 回写 cs
        this.restoringFromUrl = true;
        await this.restoreFromUrlState();

        this.ensureVectorLayer();
        this.syncFeatureGeometry();
        this.bindMapListeners();
        this.bindStoreWatchers(); // watcher 的 { immediate: true } 在此触发，但 restoringFromUrl=true 跳过写入
        this.restoringFromUrl = false;

        this.updateLayerVisibility();
        this.updatePlacementCursor();
        this.requestRender();
    }

    /**
     * 销毁管理器并释放所有资源
     * 清理流程：
     * 1. 停止所有 Vue watch 监听
     * 2. 解绑所有地图事件监听器
     * 3. 停止设备方向传感器监听
     * 4. 清理 URL 同步定时器
     * 5. 从地图移除矢量图层
     * 6. 移除放置模式 CSS 类
     */
    dispose(): void {
        this.stopHandles.forEach((stop) => stop());
        this.stopHandles = [];

        this.unbindMapListeners();
        this.stopDeviceOrientationSync();

        if (this.urlSyncTimer !== null && typeof window !== 'undefined') {
            window.clearTimeout(this.urlSyncTimer);
            this.urlSyncTimer = null;
        }

        if (this.layer) {
            this.map.removeLayer(this.layer);
            this.layer = null;
        }

        this.source = null;
        this.feature = null;

        if (this.mapContainerElement) {
            this.mapContainerElement.classList.remove('compass-placement-mode');
        }
    }

    /**
     * 确保矢量图层已创建
     * 创建 OpenLayers 矢量图层、数据源和中心点要素
     * 如果图层已存在则直接返回
     */
    private ensureVectorLayer(): void {
        // 延迟创建：仅当启用且为 vector 模式时才创建图层，避免默认创建带来的性能负担
        if (this.layer) return;
        if (!this.store.enabled || this.store.mode !== 'vector') return;

        this.source = new VectorSource();
        // 如果当前没有有效位置，先创建空要素，后续由 syncFeatureGeometry 填充几何信息
        this.feature = new Feature<Point>();
        this.source.addFeature(this.feature);

        this.layer = new VectorLayer({
            // 缓冲半径设为 50000，覆盖极端缩放场景，避免内存浪费
            renderBuffer: 50000,
            source: this.source,
            style: this.style,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
            // 系统叠加层（风水罗盘）：恒高于 @ol/layer/zIndexBands 全部显示带，保持最顶
            // （common 域不反向依赖 ol 域，故不直接引用 Z_BAND 常量）
            zIndex: 1205,
            visible: Boolean(this.store.enabled && this.store.mode === 'vector'),
        });

        this.map.addLayer(this.layer);
    }

    /**
     * 解绑地图事件监听器
     * 包括：单击事件、分辨率变化事件、窗口缩放事件
     */
    private unbindMapListeners(): void {
        if (this.singleClickHandler) {
            this.map.getViewport()?.removeEventListener('click', this.singleClickHandler);
            this.singleClickHandler = null;
        }

        if (this.viewResolutionKey) {
            unByKey(this.viewResolutionKey);
            this.viewResolutionKey = null;
        }

        if (this.resizeHandler && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
    }

    /**
     * 绑定地图事件监听器
     * 包括：
     * - 地图单击事件（用于放置模式）
     * - 地图分辨率变化事件（用于重新渲染）
     * - 窗口缩放事件（用于重新渲染）
     */
    private bindMapListeners(): void {
        if (!this.singleClickHandler) {
            this.singleClickHandler = this.handleMapSingleClick;
            this.map.getViewport()?.addEventListener('click', this.singleClickHandler);
        }

        const view = this.map.getView?.();
        if (view && !this.viewResolutionKey) {
            this.viewResolutionKey = view.on('change:resolution', () => {
                this.requestRender();
            });
        }

        if (!this.resizeHandler && typeof window !== 'undefined') {
            this.resizeHandler = () => {
                this.requestRender();
            };
            window.addEventListener('resize', this.resizeHandler);
        }
    }

    /**
     * 绑定状态存储监听器
     * 监听以下状态变化并触发相应的更新：
     * - 位置 (lng/lat)：同步地理要素坐标
     * - 启用状态、模式、缩放限制、直径、透明度、旋转角度：重新渲染
     * - 传感器启用状态与 HUD 模式：启动/停止设备方向传感器
     * - 放置模式：更新鼠标光标样式
     * - 指南针配置 ID：重新渲染
     */
    private bindStoreWatchers(): void {
        this.stopHandles.push(
            watch(
                () => [this.store.position.lng, this.store.position.lat],
                () => {
                    if (this.isSyncingGeometry) return;
                    this.syncFeatureGeometry();
                    this.scheduleUrlSync();
                },
                { immediate: true },
            ),
        );

        this.stopHandles.push(
            watch(
                () => [
                    this.store.enabled,
                    this.store.mode,
                    this.store.minResolution,
                    this.store.physicalRadiusMeters,
                    this.store.opacity,
                    this.store.rotation,
                    this.store.renderCacheToken,
                ],
                () => {
                    this.updateLayerVisibility();
                    this.requestRender();
                    this.scheduleUrlSync();
                },
                { immediate: true },
            ),
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.sensorEnabled && this.store.mode === 'hud',
                (active) => {
                    if (active) {
                        this.startDeviceOrientationSync();
                        return;
                    }
                    this.stopDeviceOrientationSync();
                },
                { immediate: true },
            ),
        );

        this.stopHandles.push(
            watch(
                () =>
                    this.store.enabled && this.store.mode === 'vector' && this.store.placementMode,
                () => this.updatePlacementCursor(),
                { immediate: true },
            ),
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.mode === 'vector',
                (active) => {
                    if (active) {
                        this.ensureVectorLayer();
                    }
                },
                { immediate: true },
            ),
        );

        this.stopHandles.push(
            watch(
                () => this.store.cid,
                () => {
                    this.requestRender();
                },
            ),
        );

        this.stopHandles.push(
            watch(
                () => this.store.selectedPalace,
                () => {
                    this.requestRender();
                },
                { deep: true },
            ),
        );
    }

    /**
     * 同步地理要素坐标
     * 将状态存储中的经纬度坐标同步到 OpenLayers 点要素。
     * 罗盘未启用时不从地图中心生成默认位置，避免刷新后误写 cs。
     */
    private syncFeatureGeometry(): void {
        if (!this.store.enabled || this.store.mode !== 'vector') return;
        if (!this.feature) return;

        if (!this.store.hasValidPosition) {
            const center = this.map.getView?.()?.getCenter?.();
            if (Array.isArray(center) && center.length >= 2) {
                const [lng, lat] = toLonLat(center);
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    this.isSyncingGeometry = true;
                    this.store.setPosition(lng, lat);
                    this.isSyncingGeometry = false;
                }
            }
        }

        if (!this.store.hasValidPosition) return;

        const point = fromLonLat([this.store.position.lng, this.store.position.lat]);
        this.feature.setGeometry(new Point(point));
    }

    /**
     * 更新图层可见性
     * 设置图层显示条件：
     * - 指南针启用 && 模式为 'vector' 时显示
     * - 根据 minResolution 设置地图缩放限制（用于自动隐藏）
     */
    private updateLayerVisibility(): void {
        if (!this.layer) return;
        const visible = Boolean(this.store.enabled) && this.store.mode === 'vector';
        this.layer.setVisible(visible);

        // 不限制缩放级别：罗盘在任意缩放级别下都可显示
        // 移除 maxResolution 限制，避免放大/缩小地图时罗盘自动隐藏
    }

    /**
     * 请求地图重新渲染
     * 触发 OpenLayers 地图的渲染流程
     */
    private requestRender(): void {
        this.map.render();
    }

    /**
     * 处理地图单击事件（放置模式）
     * 当处于放置模式时，将地图点击位置转换为经纬度并保存到状态存储
     */
    // private handleMapSingleClick = (event: MouseEvent): void => {
    //     if (!this.store.enabled || this.store.mode !== 'vector' || !this.store.placementMode) return;

    //     const coordinate = this.map.getEventCoordinate(event);
    //     if (!Array.isArray(coordinate) || coordinate.length < 2) return;

    //     const [lng, lat] = toLonLat(coordinate);
    //     if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    //     this.store.setPosition(lng, lat);
    //     this.scheduleUrlSync();
    // };

    /**
     * 更新放置模式下的鼠标光标样式
     * 在地图容器上添加/移除 'compass-placement-mode' CSS 类
     */
    private updatePlacementCursor(): void {
        if (!this.mapContainerElement) return;

        const active =
            Boolean(this.store.enabled) &&
            this.store.mode === 'vector' &&
            Boolean(this.store.placementMode);

        this.mapContainerElement.classList.toggle('compass-placement-mode', active);
    }

    /**
     * 规范化方向角
     * 将任意方向角转换为 [0, 360) 范围
     */
    private normalizeHeading(value: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        const compact = numeric % 360;
        return compact < 0 ? compact + 360 : compact;
    }

    /**
     * 处理设备方向传感器事件
     * 从陀螺仪数据中提取方向角并同步到状态存储
     * 支持 iOS (webkitCompassHeading) 和 Android (alpha) 两种方向传感器
     */
    private handleDeviceOrientation = (
        event: DeviceOrientationEvent & { webkitCompassHeading?: number },
    ): void => {
        if (!this.store.enabled || !this.store.sensorEnabled) return;

        const iosHeading = Number(event?.webkitCompassHeading);
        if (Number.isFinite(iosHeading)) {
            this.store.setRotation(this.normalizeHeading(iosHeading));
            return;
        }

        const alpha = Number(event?.alpha);
        if (!Number.isFinite(alpha)) return;
        const heading = (360 - alpha) % 360;
        this.store.setRotation(this.normalizeHeading(heading));
    };

    /**
     * 启动设备方向传感器监听
     * 申请设备方向权限并监听 deviceorientation 事件
     * 如果浏览器不支持或权限被拒绝，则更新状态存储的传感器状态
     */
    private startDeviceOrientationSync(): void {
        if (typeof window === 'undefined' || this.orientationHandler) return;

        if (typeof DeviceOrientationEvent === 'undefined') {
            this.store.setSensorPermission('unsupported');
            this.store.setSensorEnabled(false);
            return;
        }

        this.orientationHandler = this.handleDeviceOrientation;
        window.addEventListener('deviceorientation', this.orientationHandler, true);
    }

    /**
     * 停止设备方向传感器监听
     * 移除 deviceorientation 事件监听器
     */
    private stopDeviceOrientationSync(): void {
        if (typeof window === 'undefined' || !this.orientationHandler) return;
        window.removeEventListener('deviceorientation', this.orientationHandler, true);
        this.orientationHandler = null;
    }

    /**
     * 调度 URL 状态同步（防抖）
     * 将指南针位置信息写入 URL 参数，用于页面刷新时保持状态
     * 使用 120ms 防抖延迟避免频繁更新
     *
     * [Bug Fix] 只在罗盘启用时才写入 URL 参数
     * 问题背景：默认情况下 syncFeatureGeometry() 会将地图中心设置为罗盘位置，
     * 导致 URL 中默认就有 cs 参数。
     * 解决方案：只有当 enabled=true 时才写入 URL 参数，否则删除 cs 参数。
     */
    private scheduleUrlSync(): void {
        if (typeof window === 'undefined') return;

        // 从 URL 恢复阶段跳过写入，避免 cs 参数自动追加循环
        if (this.restoringFromUrl) return;

        if (this.urlSyncTimer !== null) {
            window.clearTimeout(this.urlSyncTimer);
        }

        this.urlSyncTimer = window.setTimeout(() => {
            this.urlSyncTimer = null;

            // 只在罗盘启用时才写入 URL 参数
            if (this.store.enabled) {
                writeCompassUrlState({
                    lng: Number(this.store.position?.lng),
                    lat: Number(this.store.position?.lat),
                    radius: Number(this.store.physicalRadiusMeters || 10000),
                });
            } else {
                // 罗盘未启用时，删除 URL 中的 cs 参数
                writeCompassUrlState({
                    lng: null,
                    lat: null,
                    radius: null,
                });
            }
        }, 120);
    }

    /**
     * 从 URL 参数恢复指南针状态
     * 解析 URL 查询参数中的指南针位置和大小配置。
     * 只有完整合法的 cs 才启用罗盘；缺失、cs=0 或损坏参数均保持关闭。
     */
    private async restoreFromUrlState(): Promise<void> {
        const urlState = readCompassUrlState();
        const lng = Number(urlState.lng);
        const lat = Number(urlState.lat);
        const radius = Number(urlState.radius);
        const hasValidCompassUrlState =
            Number.isFinite(lng) &&
            lng >= -180 &&
            lng <= 180 &&
            Number.isFinite(lat) &&
            lat >= -90 &&
            lat <= 90 &&
            Number.isFinite(radius) &&
            radius > 0;

        if (!hasValidCompassUrlState) {
            this.store.setEnabled(false);
            return;
        }

        this.store.setPosition(lng, lat);
        this.store.setPhysicalRadiusMeters(radius);
        this.store.setEnabled(true);

        const center = fromLonLat([lng, lat]);
        this.map.getView()?.setCenter(center);
    }

    private handleMapSingleClick = (event: MouseEvent): void => {
        if (!this.store.enabled || this.store.mode !== 'vector') return;

        // 如果处于放置模式：直接把点击位置设置为罗盘中心（经纬度）
        if (this.store.placementMode) {
            const coordinate = this.map.getEventCoordinate(event);
            if (!Array.isArray(coordinate) || coordinate.length < 2) return;
            const [lng, lat] = toLonLat(coordinate);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            this.store.setPosition(lng, lat);
            this.scheduleUrlSync();
            return;
        }

        // 非放置模式：尝试解析点击是否落在罗盘内部并选中宫位
        const pixel = this.map.getEventPixel(event);
        if (!pixel) return;

        const geometry = this.feature?.getGeometry() as Point | undefined;
        const centerCoord = geometry?.getCoordinates?.();
        if (!Array.isArray(centerCoord) || centerCoord.length < 2) return;

        const centerPixel = this.map.getPixelFromCoordinate(centerCoord as [number, number]);
        if (!Array.isArray(centerPixel) || centerPixel.length < 2) return;

        const dx = pixel[0] - centerPixel[0];
        const dy = pixel[1] - centerPixel[1];
        const distance = Math.hypot(dx, dy);

        const radiusMeters = Number(this.store.physicalRadiusMeters || 10000);
        const radiusPx = this.samplePixelRadius(centerCoord as [number, number], radiusMeters);
        const config = this.store.vectorRenderConfig;
        const layers = toLayerArray(config?.data);
        if (!layers.length || !Number.isFinite(radiusPx)) return;

        const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
        const tianChiRatio = clamp(
            Number(config?.compassSize?.tianChiRadius || configWidth * 0.1) / configWidth,
            0.06,
            0.22,
        );
        const tianChiRadius = radiusPx * tianChiRatio;
        const contentOuterRadius =
            config?.isShowScale !== false ? radiusPx * 0.82 : radiusPx * 0.95;
        const layerBand = (contentOuterRadius - tianChiRadius) / Math.max(1, layers.length);

        if (distance < tianChiRadius || distance > contentOuterRadius) {
            this.store.setSelectedPalace(null);
            return;
        }

        const layerIndex = Math.floor((distance - tianChiRadius) / layerBand);
        const targetLayer = layers[layerIndex];
        if (!targetLayer) return;

        const rotationRad = (normalizeAngle(Number(this.store.rotation || 0)) * Math.PI) / 180;
        let angle = Math.atan2(dy, dx) - rotationRad;

        const startOffset = (Number(targetLayer.startAngle || 0) * Math.PI) / 180;
        angle = (angle + Math.PI / 2 - startOffset) % (Math.PI * 2);
        if (angle < 0) angle += Math.PI * 2;

        const segmentCount = Array.isArray(targetLayer.data) ? targetLayer.data.length : 1;
        const segmentIndex = Math.floor((angle / (Math.PI * 2)) * segmentCount);

        const palaceData = Array.isArray(targetLayer.data)
            ? (targetLayer.data[segmentIndex] ?? '')
            : (targetLayer.data ?? '');

        // 把 coord 规范为经纬度（lon, lat），便于弹窗定位与外部使用
        const clickedCoord = this.map.getCoordinateFromPixel(pixel);
        const lonLat =
            Array.isArray(clickedCoord) && clickedCoord.length >= 2 ? toLonLat(clickedCoord) : null;

        this.store.setSelectedPalace({
            layerIndex,
            segmentIndex,
            data: palaceData,
            coord: lonLat || [],
        });
    };

    /** 像素半径量测（实现见 ./compassCanvasStyle） */
    private samplePixelRadius(centerCoord: [number, number], radiusMeters: number): number {
        return samplePixelRadius(this.map, centerCoord, radiusMeters);
    }

    /** 原生 Canvas 矢量渲染样式（构建逻辑见 ./compassCanvasStyle） */
    private createNativeCanvasStyle(): Style {
        return createCompassCanvasStyle({ map: this.map, store: this.store, feature: this.feature });
    }
}
