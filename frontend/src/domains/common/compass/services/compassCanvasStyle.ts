/**
 * 功能名称：风水罗盘原生 Canvas 渲染样式（量测 + 分层绘制）
 * 日    期：2026/11/13
 *
 * 从 CompassManager 拆出：像素半径量测、视口可见性判定与整套
 * Canvas 矢量渲染样式构建；与地图实例解耦，通过 deps 注入。
 */
import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Style from 'ol/style/Style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { offset as offsetLonLat } from 'ol/sphere';
import type { useCompassStore } from '@common/compass/stores/useCompassStore';
import { BASE_CONFIG_SIZE, clamp, drawRadialText, hexToRgba, normalizeAngle, resolvePoint, resolveTextColor, toLayerArray, VectorLayerWithTogetherStyle } from './compassDrawUtils';

type CompassStore = ReturnType<typeof useCompassStore>;

/**
 * 计算地理半径对应的像素半径
 * 使用大地测量算法采样指南针半径
 * 从地图中心沿东向 (90°) 计算指定米数距离对应的像素距离
 * @param centerCoord - 指南针中心坐标 [lon, lat]
 * @param radiusMeters - 地理半径（米）
 * @returns 像素半径，若计算失败返回 NaN
 */
export function samplePixelRadius(map: Map, centerCoord: [number, number], radiusMeters: number): number {
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) return Number.NaN;

    const view = map.getView?.();
    const projection = view?.getProjection?.();
    if (!projection) return Number.NaN;

    const centerLonLat = toLonLat(centerCoord, projection);
    if (!Array.isArray(centerLonLat) || centerLonLat.length < 2) return Number.NaN;

    // Build a geodesic point at due-east bearing so that ring size is meter-true.
    const edgeLonLat = offsetLonLat(
        [Number(centerLonLat[0]), Number(centerLonLat[1])],
        radiusMeters,
        Math.PI / 2,
    );
    const edgeCoord = fromLonLat(edgeLonLat, projection);

    const centerPixel = map.getPixelFromCoordinate(centerCoord);
    const edgePixel = map.getPixelFromCoordinate(edgeCoord);
    if (!Array.isArray(centerPixel) || !Array.isArray(edgePixel)) return Number.NaN;

    const dx = Number(edgePixel[0]) - Number(centerPixel[0]);
    const dy = Number(edgePixel[1]) - Number(centerPixel[1]);
    const radiusPx = Math.hypot(dx, dy);

    if (!Number.isFinite(radiusPx) || radiusPx < 1) return Number.NaN;
    return radiusPx;
}

/**
 * 判断罗盘是否在视图范围内可见
 * 圆心到视图边缘的最近距离 ≤ 半径 × 1.5 时可见
 */
export function isCompassVisibleInView(map: Map, centerPixel: [number, number], radiusPx: number): boolean {
    const size = map.getSize();
    if (!Array.isArray(size) || size.length < 2) {
        return true;
    }

    const width = Number(size[0]);
    const height = Number(size[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return true;
    }

    const centerX = Number(centerPixel[0]);
    const centerY = Number(centerPixel[1]);
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        return false;
    }

    // 计算罗盘圆心到视图矩形的最近距离（点到矩形最短距离）
    const nearestX = Math.max(0, Math.min(centerX, width));
    const nearestY = Math.max(0, Math.min(centerY, height));
    const dx = centerX - nearestX;
    const dy = centerY - nearestY;
    const distanceToEdge = Math.hypot(dx, dy);

    // 罗盘可见条件：圆心到视图边缘的距离 <= 罗盘半径 × 1.5
    return distanceToEdge <= radiusPx * 1.5;
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
export function createCompassCanvasStyle(deps: { map: Map; store: CompassStore; feature: Feature<Point> | null }): Style {
    return new Style({
        renderer: (pixelCoordinates: unknown, renderState: any) => {
            if (!deps.store.enabled || deps.store.mode !== 'vector') return;

            const context = renderState?.context as CanvasRenderingContext2D | undefined;
            if (!context) return;

            const pointPixel = resolvePoint(pixelCoordinates);
            if (!pointPixel) return;

            const geometry = deps.feature?.getGeometry?.() as Point | undefined;
            const centerCoordRaw = geometry?.getCoordinates?.();
            if (!Array.isArray(centerCoordRaw) || centerCoordRaw.length < 2) return;

            const centerCoord: [number, number] = [
                Number(centerCoordRaw[0]),
                Number(centerCoordRaw[1]),
            ];
            const centerX = Number(pointPixel[0]);
            const centerY = Number(pointPixel[1]);
            if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return;

            // 缩放等级可见性判断
            // 在渲染器中不做额外的缩放限制，罗盘始终可渲染
            // 实际的缩放显隐由 isCompassVisibleInView 和图层 maxResolution 控制

            const radiusMeters = Number(deps.store.physicalRadiusMeters || 10000);
            const radiusPx = samplePixelRadius(deps.map, centerCoord, radiusMeters);
            if (!Number.isFinite(radiusPx) || radiusPx < 2) return;

            const config = deps.store.vectorRenderConfig;
            const layers = toLayerArray(config?.data);
            if (!layers.length) return;

            const line = config?.line || {
                borderColor: '#AAAAAA',
                scaleColor: '#AAAAAA',
                scaleHighlightColor: '#FF0000',
            };

            const opacity = clamp(Number(deps.store.opacity || 0.9), 0.1, 1);
            const rotationRad =
                (normalizeAngle(Number(deps.store.rotation || 0)) * Math.PI) / 180;

            const configWidth = Number(config?.compassSize?.width || BASE_CONFIG_SIZE);
            const tianChiRadiusRaw = Number(
                config?.compassSize?.tianChiRadius || configWidth * 0.1,
            );
            const tianChiRatio = clamp(tianChiRadiusRaw / Math.max(1, configWidth), 0.06, 0.22);
            const tianChiRadius = radiusPx * tianChiRatio;

            const hasScale = config?.isShowScale !== false;
            const contentOuterRadius = hasScale ? radiusPx * 0.82 : radiusPx * 0.95;
            const layerBand = Math.max(
                1,
                (contentOuterRadius - tianChiRadius) / Math.max(1, layers.length),
            );

            //判断是否有可见部分在视图范围内，控制渲染性能，避免在指南针完全不可见时仍然执行复杂的绘制逻辑
            if (!isCompassVisibleInView(deps.map, [centerX, centerY], radiusPx)) {
                return;
            }

            context.save();
            context.globalAlpha = opacity;
            context.translate(centerX, centerY);
            context.rotate(rotationRad);

            // 渐变背景：2 倍半径的径向渐变
            // 目的：提高罗盘与地图底图的对比度，增强可读性
            const gradientRadius = radiusPx * 2;
            const bgBase = deps.store.bgColor || '#000000';
            const bgGradient = context.createRadialGradient(0, 0, 0, 0, 0, gradientRadius);
            bgGradient.addColorStop(0, hexToRgba(bgBase, 0.45));
            bgGradient.addColorStop(0.3, hexToRgba(bgBase, 0.25));
            bgGradient.addColorStop(0.6, hexToRgba(bgBase, 0.10));
            bgGradient.addColorStop(1, hexToRgba(bgBase, 0));
            context.fillStyle = bgGradient;
            context.beginPath();
            context.arc(0, 0, gradientRadius, 0, Math.PI * 2);
            context.fill();

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

                // Segment dividers and highlight.
                const selected = deps.store.selectedPalace;
                for (let i = 0; i < segmentCount; i += 1) {
                    const angle = -Math.PI / 2 + startOffset + (i * Math.PI * 2) / segmentCount;
                    const sx = Math.cos(angle) * innerR;
                    const sy = Math.sin(angle) * innerR;
                    const ex = Math.cos(angle) * outerR;
                    const ey = Math.sin(angle) * outerR;

                    if (
                        selected &&
                        selected.layerIndex === layerIndex &&
                        selected.segmentIndex === i
                    ) {
                        context.save();
                        context.fillStyle = 'rgba(255, 215, 0, 0.4)';
                        context.beginPath();
                        context.arc(0, 0, outerR, angle, angle + (Math.PI * 2) / segmentCount);
                        context.arc(
                            0,
                            0,
                            innerR,
                            angle + (Math.PI * 2) / segmentCount,
                            angle,
                            true,
                        );
                        context.closePath();
                        context.fill();
                        context.restore();
                    }

                    context.beginPath();
                    context.moveTo(sx, sy);
                    context.lineTo(ex, ey);
                    context.stroke();
                }

                const shouldSkipText =
                    (segmentCount >= 60 && !showUltraDenseText) ||
                    (segmentCount >= 24 && !showDenseText);
                if (shouldSkipText) return;

                const defaultFont =
                    clamp(Number(layer?.fontSize || 16), 8, 34) *
                    (radiusPx / (BASE_CONFIG_SIZE / 2));

                for (let i = 0; i < segmentCount; i += 1) {
                    const angleMid =
                        -Math.PI / 2 + startOffset + ((i + 0.5) * Math.PI * 2) / segmentCount;
                    const label = Array.isArray(layer?.data) ? layer.data[i] : '';

                    if (Array.isArray(label)) {
                        const rows = label
                            .map((item) => String(item || '').trim())
                            .filter(Boolean);
                        const rowCount = rows.length;
                        if (rowCount === 0) continue;

                        // 读取配置中的排列样式，默认为原有逻辑（垂直堆叠）
                        // 自定义属性：VectorLayer 实例上挂载的扩展配置
                        const style = (layer as unknown as VectorLayerWithTogetherStyle).togetherStyle;

                        if (style === 'equally') {
                            // --- 【横向排列逻辑】 ---
                            // 1. 半径固定在层中心
                            const rr = innerR + layerBand * 0.52;

                            // 2. 计算一格（segment）的总弧度，并留出边距
                            const segmentSpan = (Math.PI * 2) / segmentCount;
                            const contentSpan = segmentSpan * 0.85; // 占据 85% 的格子空间，防止文字挨太近

                            rows.forEach((rowText, rowIndex) => {
                                // 3. 计算角度偏移：让文字以 angleMid 为中心左右平分
                                const offset =
                                    (rowIndex - (rowCount - 1) / 2) * (contentSpan / rowCount);

                                drawRadialText(
                                    context,
                                    angleMid + offset, // 偏移角度实现横向
                                    rr, // 固定半径
                                    rowText,
                                    defaultFont * 0.85, // 横排可以稍微大一点点
                                    resolveTextColor(layer, rowIndex),
                                    false,
                                );
                            });
                        } else {
                            // --- 【原有纵向排列逻辑】 ---
                            rows.forEach((rowText, rowIndex) => {
                                const rr =
                                    innerR + layerBand * ((rowIndex + 1) / (rowCount + 1));
                                drawRadialText(
                                    context,
                                    angleMid,
                                    rr,
                                    rowText,
                                    defaultFont * 0.76,
                                    resolveTextColor(layer, rowIndex),
                                    false,
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
                        layer.vertical ?? false, // 🔴 这里必须读取 layer.vertical
                    );
                }
            });

            // Scale ring.
            // ==================== 4. 刻度环与数字 (Scale Ring) ====================
            if (hasScale) {
                const scale = config?.scaclStyle || {
                    minLineHeight: 10,
                    midLineHeight: 20,
                    maxLineHeight: 25,
                    numberFontSize: 13,
                };

                // 1. 定义地理比例常数 (相对于总半径 radiusPx)
                // 假设 0.82 为主体边缘，我们将刻度分布在 0.82 到 1.0 的地理区间内
                const scaleStartRatio = 0.825; // 刻度起始位置 (82.5% 半径处)
                const tickMaxRatio = 0.06; // 最长刻度线占总半径的 6%
                const numberPosRatio = 0.9; // 数字中心点位于 93% 半径处

                const scaleInner = radiusPx * scaleStartRatio;
                const baseScale = radiusPx / (BASE_CONFIG_SIZE / 2);

                // 2. 将刻度线长度转换为比例长度
                const shortLen = clamp(
                    Number(scale.minLineHeight || 10) * baseScale,
                    2,
                    radiusPx * 0.03,
                );
                const midLen = clamp(
                    Number(scale.midLineHeight || 20) * baseScale,
                    3,
                    radiusPx * 0.05,
                );
                const longLen = clamp(
                    Number(scale.maxLineHeight || 25) * baseScale,
                    4,
                    radiusPx * tickMaxRatio,
                );

                // 3. 将字号转换为比例大小
                const numberFont = clamp(
                    Number(scale.numberFontSize || 13) * baseScale,
                    6,
                    radiusPx * 0.05,
                );

                for (let degree = 0; degree < 360; degree += 1) {
                    const angle = -Math.PI / 2 + (degree * Math.PI) / 180;
                    const isTen = degree % 10 === 0;
                    const isFive = degree % 5 === 0;

                    const markLen = isTen ? longLen : isFive ? midLen : shortLen;
                    const color = isTen
                        ? String(line.scaleHighlightColor || '#FF0000')
                        : String(line.scaleColor || '#AAAAAA');

                    context.strokeStyle = color;
                    context.lineWidth = Math.max(0.5, baseScale * 0.8); // 刻度线宽度也随比例变化

                    // 绘制刻度线：从 scaleInner 出发，向外延伸 markLen
                    context.beginPath();
                    context.moveTo(Math.cos(angle) * scaleInner, Math.sin(angle) * scaleInner);
                    context.lineTo(
                        Math.cos(angle) * (scaleInner + markLen),
                        Math.sin(angle) * (scaleInner + markLen),
                    );
                    context.stroke();

                    // 绘制标注数字：放置在预设的比例圆周上
                    // 只有当半径足够大（地理实体可见度高）时才渲染文字
                    if (isTen && radiusPx > 120) {
                        drawRadialText(
                            context,
                            angle,
                            radiusPx * numberPosRatio, // 绝对地理位置：93% 半径处
                            String(degree),
                            numberFont * 1.5,
                            color,
                            false, // 刻度数字通常沿切线排列
                        );
                    }
                }
            }

            // Tianxin cross: exactly 1/3 radius.
            if (config?.isShowTianxinCross !== false) {
                context.strokeStyle = String(config?.tianxinCrossColor || '#FF0000');
                context.lineWidth =
                    clamp(Number(config?.tianxinCrossWidth || 2), 1, 8) *
                    (radiusPx / (BASE_CONFIG_SIZE / 2));

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
        },
    });
}
