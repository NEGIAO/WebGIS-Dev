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
import { offset as offsetLonLat } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import type { useCompassStore } from '../stores/useCompassStore';
import type { FengShuiCompassConfig, Layer } from '../components/feng-shui-compass-svg/types';
import { readCompassUrlState, writeCompassUrlState } from './compassUrlState';

type CompassStore = ReturnType<typeof useCompassStore>;

type CompassManagerOptions = {
    map: Map;
    store: CompassStore;
    mapContainerElement?: HTMLElement | null;
};

// 基础配置尺寸，作为缩放计算的基准
const BASE_CONFIG_SIZE = 1000;

/**
 * 数值夹紧函数
 * 将数值限制在指定的最小值和最大值之间
 * @param value - 待夹紧的数值
 * @param minValue - 最小值
 * @param maxValue - 最大值
 * @returns 夹紧后的数值，若输入为 NaN 则返回最小值
 */
function clamp(value: number, minValue: number, maxValue: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return minValue;
    return Math.max(minValue, Math.min(maxValue, numeric));
}

/**
 * 角度规范化函数
 * 将任意角度值转换为 [0, 360) 范围内的标准角度
 * @param value - 待规范化的角度值
 * @returns 规范化后的角度值（0-360）
 */
function normalizeAngle(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const compact = numeric % 360;
    return compact < 0 ? compact + 360 : compact;
}

/**
 * 图层数据转换函数
 * 将指南针配置中的 data 字段转换为统一的 Layer 数组格式
 * @param data - 原始数据配置，可能是单个对象或数组
 * @returns 转换后的图层数组
 */
function toLayerArray(data: FengShuiCompassConfig['data']): Layer[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data as Layer];
    return [];
}

/**
 * 文本颜色解析函数
 * 从图层配置中解析出指定索引的文本颜色
 * @param layer - 图层配置对象
 * @param textIndex - 文本行索引（用于数组类型的多色文本）
 * @returns 文本颜色值，默认为 '#F8FAFC'
 */
function resolveTextColor(layer: Layer, textIndex = 0): string {
    const fallback = '#F8FAFC';
    if (Array.isArray(layer?.textColor)) {
        return String(layer.textColor[textIndex] || layer.textColor[0] || fallback);
    }
    return String(layer?.textColor || fallback);
}

/**
 * 像素坐标解析函数
 * 从 OpenLayers 渲染器提供的坐标数据中提取有效的 [x, y] 像素坐标
 * @param pixelCoordinates - 原始像素坐标数据（可能是嵌套数组结构）
 * @returns 解析后的 [x, y] 坐标对，若数据无效返回 null
 */
function resolvePoint(pixelCoordinates: unknown): [number, number] | null {
    if (!Array.isArray(pixelCoordinates)) return null;

    if (Array.isArray(pixelCoordinates[0])) {
        const first = pixelCoordinates[0];
        if (!Array.isArray(first) || first.length < 2) return null;
        const x = Number(first[0]);
        const y = Number(first[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return [x, y];
    }

    if (pixelCoordinates.length < 2) return null;
    const x = Number(pixelCoordinates[0]);
    const y = Number(pixelCoordinates[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
}

/**
 * 放射性文本绘制函数
 * 在圆周上按指定角度、半径绘制旋转对齐的文本
 * 支持两种对齐模式：径向垂直（朝向圆心）和环形横向（沿切线方向）
 * 
 * @param ctx - Canvas 2D 上下文
 * @param angleRad - 文本在圆周上的角度（弧度制）
 * @param radiusPx - 文本距离原点的半径（像素）
 * @param text - 待绘制的文本内容
 * @param fontSize - 字体大小（像素）
 * @param color - 文本颜色
 * @param vertical - 对齐模式
 *   - true: 径向垂直模式，文字沿半径方向朝向圆心
 *   - false: 环形横向模式，文字沿切线方向（垂直于半径）
 */
function drawRadialText(
    ctx: CanvasRenderingContext2D,
    angleRad: number,
    radiusPx: number,
    text: string,
    fontSize: number,
    color: string,
    vertical = false // true: 径向垂直(朝向圆心) | false: 环形横向(沿切线)
): void {
    const content = String(text || '').trim();
    if (!content) return;

    // 1. 计算文字在圆周上的位置
    const x = Math.cos(angleRad) * radiusPx;
    const y = Math.sin(angleRad) * radiusPx;

    ctx.save();
    ctx.translate(x, y); // 把原点移到文字位置（关键：旋转中心在这里）

    let rotate: number;

    if (vertical) {
        // 径向垂直：文字沿半径方向，朝向圆心
        rotate = angleRad;
        // 自动翻转：保证文字在所有位置都正立（不会倒着）
        if (angleRad > Math.PI / 2 && angleRad < (Math.PI * 3) / 2) {
            rotate += Math.PI;
        }
    } else {
        // 环形横向：文字沿切线方向（垂直于半径）
        rotate = angleRad + Math.PI / 2; // +90° 让文字垂直于半径，沿切线排列
        // 自动翻转：保证文字在所有位置都正立
        if (rotate > Math.PI / 2 && rotate < (Math.PI * 3) / 2) {
            rotate += Math.PI;
        }
    }

    ctx.rotate(rotate); // 应用旋转

    // 文字样式设置
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(fontSize)}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.75, fontSize * 0.12);

    // 描边（抗锯齿，和你原图效果一致）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.strokeText(content, 0, 0);
    // 填充文字
    ctx.fillStyle = color;
    ctx.fillText(content, 0, 0);

    ctx.restore();
}

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
    private readonly map: Map;                           // OpenLayers Map 实例
    private readonly store: CompassStore;                // Pinia 状态存储
    private readonly mapContainerElement: HTMLElement | null; // 地图容器 DOM 元素

    // ==================== 指南针图层相关 ====================
    private source: VectorSource | null = null;         // 矢量数据源
    private feature: Feature<Point> | null = null;      // 指南针中心点要素
    private layer: VectorLayer<VectorSource> | null = null; // 矢量图层

    // ==================== 事件监听器句柄 ====================
    private stopHandles: WatchStopHandle[] = [];         // Vue watch 停止函数集合
    private viewResolutionKey: unknown = null;           // 地图分辨率变化事件监听器 key

    private singleClickHandler: ((event: MouseEvent) => void) | null = null; // 地图点击处理器
    private resizeHandler: (() => void) | null = null;   // 窗口缩放处理器

    private orientationHandler: ((event: DeviceOrientationEvent & { webkitCompassHeading?: number }) => void) | null = null; // 设备方向传感器处理器

    private urlSyncTimer: number | null = null;         // URL 同步防抖计时器

    // ==================== 渲染相关 ====================
    private readonly style: Style;                       // 自定义 Canvas 渲染样式

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
        await this.restoreFromUrlState();
        this.ensureVectorLayer();
        this.syncFeatureGeometry();
        this.bindMapListeners();
        this.bindStoreWatchers();
        this.updateLayerVisibility();
        this.updatePlacementCursor();
        this.scheduleUrlSync();
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
        if (this.layer) return;

        this.source = new VectorSource();
        this.feature = new Feature<Point>(new Point(fromLonLat([this.store.position.lng, this.store.position.lat])));
        this.source.addFeature(this.feature);

        this.layer = new VectorLayer({
            // 做一个缓冲半径，避免指南针边缘被地图容器裁切掉（尤其在放大时）
            renderBuffer: 2000,
            source: this.source,
            style: this.style,
            updateWhileAnimating: true,
            updateWhileInteracting: true,
            zIndex: 1205,
            visible: true
        });

        this.map.addLayer(this.layer);
    }

    /**
     * 解绑地图事件监听器
     * 包括：单击事件、分辨率变化事件、窗口缩放事件
     */
    private unbindMapListeners(): void {
        if (this.singleClickHandler) {
            this.map.getViewport().removeEventListener('click', this.singleClickHandler);
            this.singleClickHandler = null;
        }

        if (this.viewResolutionKey) {
            unByKey(this.viewResolutionKey as any);
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
            this.map.getViewport().addEventListener('click', this.singleClickHandler);
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
                    this.syncFeatureGeometry();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
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
                    this.store.renderCacheToken
                ],
                () => {
                    this.updateLayerVisibility();
                    this.requestRender();
                    this.scheduleUrlSync();
                },
                { immediate: true }
            )
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
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.enabled && this.store.mode === 'vector' && this.store.placementMode,
                () => this.updatePlacementCursor(),
                { immediate: true }
            )
        );

        this.stopHandles.push(
            watch(
                () => this.store.cid,
                () => {
                    this.requestRender();
                }
            )
        );
    }

    /**
     * 同步地理要素坐标
     * 将状态存储中的经纬度坐标同步到 OpenLayers 点要素
     * 如果位置无效，则从地图中心获取坐标
     */
    private syncFeatureGeometry(): void {
        if (!this.feature) return;

        if (!this.store.hasValidPosition) {
            const center = this.map.getView?.()?.getCenter?.();
            if (Array.isArray(center) && center.length >= 2) {
                const [lng, lat] = toLonLat(center);
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    this.store.setPosition(lng, lat);
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

        // Auto-hide while zooming out: layer remains hidden above this max resolution.
        this.layer.setMaxResolution(Number(this.store.minResolution || 450));
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
    private handleMapSingleClick = (event: MouseEvent): void => {
        if (!this.store.enabled || this.store.mode !== 'vector' || !this.store.placementMode) return;

        const coordinate = this.map.getEventCoordinate(event);
        if (!Array.isArray(coordinate) || coordinate.length < 2) return;

        const [lng, lat] = toLonLat(coordinate);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        this.store.setPosition(lng, lat);
        this.scheduleUrlSync();
    };

    /**
     * 更新放置模式下的鼠标光标样式
     * 在地图容器上添加/移除 'compass-placement-mode' CSS 类
     */
    private updatePlacementCursor(): void {
        if (!this.mapContainerElement) return;

        const active = Boolean(this.store.enabled)
            && this.store.mode === 'vector'
            && Boolean(this.store.placementMode);

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
        event: DeviceOrientationEvent & { webkitCompassHeading?: number }
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
     */
    private scheduleUrlSync(): void {
        if (typeof window === 'undefined') return;

        if (this.urlSyncTimer !== null) {
            window.clearTimeout(this.urlSyncTimer);
        }

        this.urlSyncTimer = window.setTimeout(() => {
            this.urlSyncTimer = null;

            writeCompassUrlState({
                lng: Number(this.store.position?.lng),
                lat: Number(this.store.position?.lat),
                radius: Number(this.store.physicalRadiusMeters || 10000)
            });
        }, 120);
    }

    /**
     * 从 URL 参数恢复指南针状态
     * 解析 URL 查询参数中的指南针位置和大小配置
     * 如果参数有效，则更新状态存储并将地图中心移至该位置
     */
    private async restoreFromUrlState(): Promise<void> {
        const urlState = readCompassUrlState();

        if (Number.isFinite(Number(urlState.lng)) && Number.isFinite(Number(urlState.lat))) {
            const lng = Number(urlState.lng);
            const lat = Number(urlState.lat);

            this.store.setPosition(lng, lat);
            this.store.setEnabled(true);

            const center = fromLonLat([lng, lat]);
            this.map.getView()?.setCenter(center);
        }

        if (Number.isFinite(Number(urlState.radius))) {
            this.store.setPhysicalRadiusMeters(Number(urlState.radius));
        }
    }

    /**
     * 计算地理半径对应的像素半径
     * 使用大地测量算法采样指南针半径
     * 从地图中心沿东向 (90°) 计算指定米数距离对应的像素距离
     * @param centerCoord - 指南针中心坐标 [lon, lat]
     * @param radiusMeters - 地理半径（米）
     * @returns 像素半径，若计算失败返回 NaN
     */
    private samplePixelRadius(centerCoord: [number, number], radiusMeters: number): number {
        if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return Number.NaN;

        const view = this.map.getView?.();
        const projection = view?.getProjection?.();
        if (!projection) return Number.NaN;

        const centerLonLat = toLonLat(centerCoord, projection);
        if (!Array.isArray(centerLonLat) || centerLonLat.length < 2) return Number.NaN;

        // Build a geodesic point at due-east bearing so that ring size is meter-true.
        const edgeLonLat = offsetLonLat(
            [Number(centerLonLat[0]), Number(centerLonLat[1])],
            radiusMeters,
            Math.PI / 2
        );
        const edgeCoord = fromLonLat(edgeLonLat, projection);

        const centerPixel = this.map.getPixelFromCoordinate(centerCoord);
        const edgePixel = this.map.getPixelFromCoordinate(edgeCoord);
        if (!Array.isArray(centerPixel) || !Array.isArray(edgePixel)) return Number.NaN;

        const dx = Number(edgePixel[0]) - Number(centerPixel[0]);
        const dy = Number(edgePixel[1]) - Number(centerPixel[1]);
        const radiusPx = Math.hypot(dx, dy);

        if (!Number.isFinite(radiusPx) || radiusPx < 1) return Number.NaN;
        return radiusPx;
    }

    // 封装一个函数，判断指南针圆是否与当前视图相交，以优化渲染性能
    private isCompassVisibleInView(
        centerPixel: [number, number],
        radiusPx: number
    ): boolean {
        const size = this.map.getSize();
        if (!Array.isArray(size) || size.length < 2) {
            return true;
        }

        const width = Number(size[0]);
        const height = Number(size[1]);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
            return true;
        }

        // 使用“点到矩形最近距离”判断圆与视图是否相交。
        const minX = 0;
        const minY = 0;
        const maxX = width;
        const maxY = height;

        const centerX = Number(centerPixel[0]);
        const centerY = Number(centerPixel[1]);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
            return false;
        }

        const nearestX = Math.max(minX, Math.min(centerX, maxX));
        const nearestY = Math.max(minY, Math.min(centerY, maxY));

        const dx = centerX - nearestX;
        const dy = centerY - nearestY;

        return (dx * dx + dy * dy) <= (radiusPx * radiusPx);
    }


    
    /**
     * 创建原生 Canvas 渲染样式
     * 返回 OpenLayers 的自定义渲染样式，在地图 Canvas 中绘制指南针
     * 
     * 渲染内容包括：
     * 1. 太极圆：中心核心圆
     * 2. 图层环：多个同心圆及其分隔线
     * 3. 图层文本：八卦、龙、数字等标注文本
     *    - 支持纵向堆叠和横向排列两种布局模式
     *    - 自动根据缩放级别隐藏密集文本（LOD 优化）
     * 4. 刻度环：外侧的度数刻度和数字
     * 5. 天心十字：中心十字标记线
     * 
     * 所有元素都根据指南针半径自动缩放，以保持正确的视觉比例
     * 
     * @returns 自定义 Canvas 渲染样式
     */
    private createNativeCanvasStyle(): Style {
        return new Style({
            renderer: (pixelCoordinates: unknown, renderState: any) => {
                
                if (!this.store.enabled || this.store.mode !== 'vector') return;

                const context = renderState?.context as CanvasRenderingContext2D | undefined;
                if (!context) return;
                



                const pointPixel = resolvePoint(pixelCoordinates);
                if (!pointPixel) return;

                const geometry = this.feature?.getGeometry?.() as Point | undefined;
                const centerCoordRaw = geometry?.getCoordinates?.();
                if (!Array.isArray(centerCoordRaw) || centerCoordRaw.length < 2) return;

                const centerCoord: [number, number] = [Number(centerCoordRaw[0]), Number(centerCoordRaw[1])];
                const centerX = Number(pointPixel[0]);
                const centerY = Number(pointPixel[1]);
                if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;

                const minResolution = Number(this.store.minResolution || 450);
                const resolution = Number(renderState?.resolution);
                if (Number.isFinite(minResolution) && Number.isFinite(resolution) && resolution > minResolution) {
                    return;
                }

                const radiusMeters = Number(this.store.physicalRadiusMeters || 10000);
                const radiusPx = this.samplePixelRadius(centerCoord, radiusMeters);
                if (!Number.isFinite(radiusPx) || radiusPx < 2) return;

                const config = this.store.vectorRenderConfig;
                const layers = toLayerArray(config?.data);
                if (!layers.length) return;

                const line = config?.line || {
                    borderColor: '#AAAAAA',
                    scaleColor: '#AAAAAA',
                    scaleHighlightColor: '#FF0000'
                };

                const opacity = clamp(Number(this.store.opacity || 0.9), 0.1, 1);
                const rotationRad = (normalizeAngle(Number(this.store.rotation || 0)) * Math.PI) / 180;

                const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
                const tianChiRadiusRaw = Number(config?.compassSize?.tianChiRadius || configWidth * 0.1);
                const tianChiRatio = clamp(tianChiRadiusRaw / Math.max(1, configWidth), 0.06, 0.22);
                const tianChiRadius = radiusPx * tianChiRatio;

                const hasScale = config?.isShowScale !== false;
                const contentOuterRadius = hasScale ? radiusPx * 0.82 : radiusPx * 0.95;
                const layerBand = Math.max(1, (contentOuterRadius - tianChiRadius) / Math.max(1, layers.length));


                //判断是否有可见部分在视图范围内，控制渲染性能，避免在指南针完全不可见时仍然执行复杂的绘制逻辑
                if (!this.isCompassVisibleInView([centerX, centerY], radiusPx)) {
                    return;
                }

                context.save();
                context.globalAlpha = opacity;
                context.translate(centerX, centerY);
                context.rotate(rotationRad);

                const strokeWidth = Math.max(0.8, radiusPx / 260);
                context.lineWidth = strokeWidth;
                context.strokeStyle = String(line.borderColor || '#AAAAAA');

                // Tianchi core circle.
                context.beginPath();
                context.arc(0, 0, tianChiRadius, 0, Math.PI * 2);
                context.stroke();

                // LOD gate for dense layers.
                const showUltraDenseText = radiusPx >= 130;
                const showDenseText = radiusPx >= 95;

                layers.forEach((layer, layerIndex) => {
                    const innerR = tianChiRadius + layerBand * layerIndex;
                    const outerR = innerR + layerBand;

                    const countRaw = Array.isArray(layer?.data) ? layer.data.length : 0;
                    const segmentCount = Math.max(1, countRaw);
                    const startOffset = (Number(layer?.startAngle || 0) * Math.PI) / 180;

                    // Ring boundary.
                    context.beginPath();
                    context.arc(0, 0, outerR, 0, Math.PI * 2);
                    context.stroke();

                    // Segment dividers.
                    for (let i = 0; i < segmentCount; i += 1) {
                        const angle = -Math.PI / 2 + startOffset + (i * Math.PI * 2) / segmentCount;
                        const sx = Math.cos(angle) * innerR;
                        const sy = Math.sin(angle) * innerR;
                        const ex = Math.cos(angle) * outerR;
                        const ey = Math.sin(angle) * outerR;

                        context.beginPath();
                        context.moveTo(sx, sy);
                        context.lineTo(ex, ey);
                        context.stroke();
                    }

                    const shouldSkipText = (
                        (segmentCount >= 60 && !showUltraDenseText)
                        || (segmentCount >= 24 && !showDenseText)
                    );
                    if (shouldSkipText) return;

                    const defaultFont = clamp(Number(layer?.fontSize || 16), 8, 34) * (radiusPx / (BASE_CONFIG_SIZE / 2));

                    for (let i = 0; i < segmentCount; i += 1) {
                        const angleMid = -Math.PI / 2 + startOffset + ((i + 0.5) * Math.PI * 2) / segmentCount;
                        const label = Array.isArray(layer?.data) ? layer.data[i] : '';

                        if (Array.isArray(label)) {
                            const rows = label.map((item) => String(item || '').trim()).filter(Boolean);
                            const rowCount = rows.length;
                            if (rowCount === 0) continue;

                            // 读取配置中的排列样式，默认为原有逻辑（垂直堆叠）
                            const style = (layer as any).togetherStyle;

                            if (style === 'equally') {
                                // --- 【横向排列逻辑】 ---
                                // 1. 半径固定在层中心
                                const rr = innerR + layerBand * 0.52;

                                // 2. 计算一格（segment）的总弧度，并留出边距
                                const segmentSpan = (Math.PI * 2) / segmentCount;
                                const contentSpan = segmentSpan * 0.85; // 占据 85% 的格子空间，防止文字挨太近

                                rows.forEach((rowText, rowIndex) => {
                                    // 3. 计算角度偏移：让文字以 angleMid 为中心左右平分
                                    const offset = (rowIndex - (rowCount - 1) / 2) * (contentSpan / rowCount);

                                    drawRadialText(
                                        context,
                                        angleMid + offset, // 偏移角度实现横向
                                        rr,                // 固定半径
                                        rowText,
                                        defaultFont * 0.85, // 横排可以稍微大一点点
                                        resolveTextColor(layer, rowIndex),
                                        false
                                    );
                                });
                            } else {
                                // --- 【原有纵向排列逻辑】 ---
                                rows.forEach((rowText, rowIndex) => {
                                    const rr = innerR + layerBand * ((rowIndex + 1) / (rowCount + 1));
                                    drawRadialText(
                                        context,
                                        angleMid,
                                        rr,
                                        rowText,
                                        defaultFont * 0.76,
                                        resolveTextColor(layer, rowIndex),
                                        false
                                    );
                                });
                            }
                            continue;
                        }

                        // ==============================================
                        // 🔴 修改点 2：这里最后加 【, layer.vertical ?? false】
                        // 作用：普通文本（透地六十龙）→ 读取配置里的 vertical
                        // ==============================================
                        drawRadialText(
                            context,
                            angleMid,
                            innerR + layerBand * 0.52,
                            String(label || ''),
                            defaultFont,
                            resolveTextColor(layer, i),
                            layer.vertical ?? false // 🔴 这里必须读取 layer.vertical
                        );
                    }
                });

                // Scale ring.
                if (hasScale) {
                    const scale = config?.scaclStyle || {
                        minLineHeight: 10,
                        midLineHeight: 20,
                        maxLineHeight: 25,
                        numberFontSize: 13
                    };

                    const baseScale = radiusPx / (BASE_CONFIG_SIZE / 2);
                    const shortLen = clamp(Number(scale.minLineHeight || 10) * baseScale, 2, 20);
                    const midLen = clamp(Number(scale.midLineHeight || 20) * baseScale, 3, 28);
                    const longLen = clamp(Number(scale.maxLineHeight || 25) * baseScale, 4, 36);
                    const numberFont = clamp(Number(scale.numberFontSize || 13) * baseScale, 8, 18);
                    const scaleInner = contentOuterRadius + 2;

                    for (let degree = 0; degree < 360; degree += 1) {
                        const angle = -Math.PI / 2 + (degree * Math.PI) / 180;
                        const ten = degree % 10 === 0;
                        const five = degree % 5 === 0;
                        const markLen = ten ? longLen : five ? midLen : shortLen;
                        const color = ten
                            ? String(line.scaleHighlightColor || '#FF0000')
                            : String(line.scaleColor || '#AAAAAA');

                        context.strokeStyle = color;
                        context.beginPath();
                        context.moveTo(Math.cos(angle) * scaleInner, Math.sin(angle) * scaleInner);
                        context.lineTo(Math.cos(angle) * (scaleInner + markLen), Math.sin(angle) * (scaleInner + markLen));
                        context.stroke();

                        if (ten && showDenseText) {
                            drawRadialText(
                                context,
                                angle,
                                scaleInner + markLen + numberFont,
                                String(degree),
                                numberFont,
                                color
                            );
                        }
                    }
                }

                // Tianxin cross: exactly 1/3 radius.
                if (config?.isShowTianxinCross !== false) {
                    context.strokeStyle = String(config?.tianxinCrossColor || '#FF0000');
                    context.lineWidth = clamp(Number(config?.tianxinCrossWidth || 2), 1, 8) * (radiusPx / (BASE_CONFIG_SIZE / 2));

                    const crossHalf = radiusPx / 3;
                    context.beginPath();
                    context.moveTo(-crossHalf, 0);
                    context.lineTo(crossHalf, 0);
                    context.stroke();

                    context.beginPath();
                    context.moveTo(0, -crossHalf);
                    context.lineTo(0, crossHalf);
                    context.stroke();
                }

                context.restore();
            }
        });
    }
}
