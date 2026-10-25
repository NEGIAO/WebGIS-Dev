// ---------- 测量工具（局部平面近似，仅用于面板展示） ----------

function metersPerDegree(latDeg) {
  return { mx: 111320 * Math.cos(Cesium.Math.toRadians(latDeg)), my: 110540 };
}

function toLonLats(positions) {
  return positions.map((position) => {
    const carto = Cesium.Cartographic.fromCartesian(position);
    return {
      x: Cesium.Math.toDegrees(carto.longitude),
      y: Cesium.Math.toDegrees(carto.latitude),
    };
  });
}

function measurePolygon(positions) {
  const lonLats = toLonLats(positions);
  if (lonLats.length < 3) return { area: 0, perimeter: 0 };

  const { mx, my } = metersPerDegree(lonLats[0].y);
  let perimeter = 0;
  let area = 0;
  for (let i = 0; i < lonLats.length; i++) {
    const a = lonLats[i];
    const b = lonLats[(i + 1) % lonLats.length];
    perimeter += Math.hypot((b.x - a.x) * mx, (b.y - a.y) * my);
    area += a.x * mx * (b.y * my) - b.x * mx * (a.y * my);
  }
  return { area: Math.abs(area) / 2, perimeter };
}

function measurePolyline(positions) {
  const lonLats = toLonLats(positions);
  if (lonLats.length < 2) return { length: 0 };

  const { mx, my } = metersPerDegree(
    (lonLats[0].y + lonLats[lonLats.length - 1].y) / 2,
  );
  let length = 0;
  for (let i = 0; i < lonLats.length - 1; i++) {
    length += Math.hypot(
      (lonLats[i + 1].x - lonLats[i].x) * mx,
      (lonLats[i + 1].y - lonLats[i].y) * my,
    );
  }
  return { length };
}

function measureRectangle(rectangle) {
  const { mx, my } = metersPerDegree(
    Cesium.Math.toDegrees((rectangle.south + rectangle.north) / 2),
  );
  const width = Cesium.Math.toDegrees(rectangle.east - rectangle.west) * mx;
  const height = Cesium.Math.toDegrees(rectangle.north - rectangle.south) * my;
  return { area: width * height, perimeter: 2 * (width + height) };
}

const SHAPE_TYPES = [
  "polygon",
  "polyline",
  "rectangle",
  "circle",
  "height",
  "azimuth",
];

// 这两类只取两个点：第二点落下即自动完成，不需要右键
const TWO_POINT_TYPES = ["height", "azimuth"];

// 绘制完成后不保留"最后一个取点"标记的类型。
// 方位角的终点就是箭头尖端，本身已经指明了位置，再叠一个圆点纯属干扰。
const HIDE_LAST_VERTEX_TYPES = ["azimuth"];

const START_HINTS = {
  polygon: "左键逐点取点（≥3 个），右键结束绘制。",
  polyline: "左键逐点取点（≥2 个），右键结束绘制。",
  rectangle: "左键点击第一个角点。",
  circle: "左键点击圆心。",
  height: "左键点击起点，再点第二个点 —— 两点落下自动生成高距三角形。",
  azimuth: "左键点击起点，再点第二个点 —— 两点落下自动生成方位角。",
};

// ---------- 测量开关 ----------

/**
 * 测量标注的默认开关：**默认只绘制，不测量**。
 * 由 startDraw(type, options) 覆盖。
 *
 *   measure       总开关。false 时完全不出标注
 *   showArea      面积类标注（仅 polygon / rectangle / circle 有）
 *   showPerimeter 周长 / 长度 / 距离 / 角度类标注
 *
 * 【各类型支持哪些测量项】
 *   polygon / rectangle  面积(showArea) + 周长(showPerimeter)
 *   circle               面积(showArea) + 周长(showPerimeter)
 *   polyline             长度(showPerimeter) —— 没有面积项
 *   height               垂直距离 + 水平距离(showPerimeter)
 *   azimuth              方位角(showPerimeter)
 */
const MEASURE_DEFAULTS = {
  measure: false,
  showArea: true,
  showPerimeter: true,
};

/** 面积文本：按量级自动切换 ㎡ / 公顷 / km² */
function formatAreaText(m2) {
  if (!isFinite(m2) || m2 <= 0) return "—";
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(3)} km²`;
  if (m2 >= 1e4) return `${(m2 / 1e4).toFixed(2)} 公顷`;
  return `${m2.toFixed(1)} ㎡`;
}

/** 长度文本：按量级自动切换 m / km */
function formatLengthText(m) {
  if (!isFinite(m) || m <= 0) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`;
}

/**
 * 由两点求方位角（度）。
 * 把目标点换算到起点处的 ENU 坐标系（x=东, y=北, z=天），
 * 再 atan2(东, 北) ⇒ 0° 为正北，顺时针增大，范围 [0, 360)。
 */
function bearingDegrees(fromPosition, toPosition) {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(fromPosition);
  const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const local = Cesium.Matrix4.multiplyByPoint(inv, toPosition, new Cesium.Cartesian3());
  Cesium.Cartesian3.normalize(local, local);
  const deg = Cesium.Math.toDegrees(Math.atan2(local.x, local.y));
  return (deg + 360) % 360;
}

export default class DrawManager {
  constructor({ viewer, onStatus, onDrawComplete }) {
    this.viewer = viewer;
    this.onStatus = onStatus || (() => {});
    this.onDrawComplete = onDrawComplete || (() => {});
    this._shapeSeq = 0;
    // 最近一次绘制完成的图形数据（含 id/type/positions/lonLats/测量），
    // 供"下一步"按需读取；无图形时为 null
    this.lastShape = null;

    // 绘制状态（统一，所有图形共用）
    this.mode = null; // 当前绘制类型
    this.drawing = false;
    this.drawHandler = null;
    this.drawPositions = []; // 多边形/折线已取的点
    this.movingPosition = null; // 鼠标悬停预览点
    this.anchorCartesian = null; // 矩形第一个角点 / 圆圆心
    this.previewRectangle = null; // 矩形预览
    this.previewRadius = null; // 圆预览半径
    this.drawPointEntities = []; // 顶点标记
    this.previewEntities = []; // 当前绘制中的动态预览实体
    this.shapeEntities = {
      polygon: [],
      polyline: [],
      rectangle: [],
      circle: [],
      height: [],
      azimuth: [],
    };

    // 样式参数（交给 lil-gui 直接绑定）
    this.params = {
      fillColor: "#2e5bff",
      fillOpacity: 0.25,
      outlineColor: "#19d3ff",
      outlineWidth: 3,
      showVertices: true,
      vertexSize: 8,
    };

    // 测量开关：由 startDraw(type, options) 覆盖，默认只绘制不测量
    this.measureOptions = { ...MEASURE_DEFAULTS };
    // 测量标注实体。这些 Label 是自己加到 viewer.entities 上的，
    // Cesium 不会替我们回收，所以换图 / 清除 / 销毁时都要显式摘掉。
    this.measureLabelEntities = [];
  }

  // ============================================================
  // 对外统一接口
  // ============================================================

  /**
   * 开始绘制。
   *
   * @param {string} type  polygon | polyline | rectangle | circle | height | azimuth
   * @param {object} [options] 测量开关，不传则沿用 MEASURE_DEFAULTS（只绘制不测量）
   *        · measure       总开关。true 才出测量标注
   *        · showArea      面积标注（仅 polygon / rectangle / circle 有面积项）
   *        · showPerimeter 周长 / 长度 / 距离 / 角度标注
   */
  startDraw(type, options) {
    if (!SHAPE_TYPES.includes(type)) {
      this.onStatus(`不支持的绘制类型：${type}`);
      return;
    }
    this.clearAll(); // 内部会摘掉上一轮的测量标注
    // 注意顺序：clearAll 之后再设本次开关，否则会被重置掉
    this.measureOptions = { ...MEASURE_DEFAULTS, ...(options || {}) };
    this.mode = type;
    this.drawing = true;
    this._createPreview();
    this.onStatus(START_HINTS[type]);
    this._bindDrawEvents();
  }

  /**
   * 运行时改测量开关（对应面板上的复选框）。
   * 已画好的图形会立即按新开关重绘标注，不需要重新绘制。
   */
  setMeasureOptions(options) {
    Object.assign(this.measureOptions, options || {});
    this._createMeasureLabels(this.lastShape);
  }

  finishDraw() {
    const mode = this.mode;
    if (!mode || !this._canFinish(mode)) return;

    this._destroyHandler();
    this._removePreview(true); // 保留顶点标记，只移除动态预览
    this._trimVertexMarkers(mode); // 部分类型不要终点标记（如方位角的箭头尖端）
    this._createFinalShape(mode);
    this.onStatus(this._measureText(mode));
    const info = this._buildCompletePayload(mode);
    this.lastShape = info;
    // 按 measureOptions 出测量标注（measure 为 false 时这里什么都不做）
    this._createMeasureLabels(info);
    this.onDrawComplete(info);
    this._resetDrawState();
  }

  cancelDraw() {
    this._destroyHandler();
    this._removePreview();
    this._removeMeasureLabels();
    this._resetDrawState();
  }

  clearAll() {
    this.cancelDraw();
    for (const key of Object.keys(this.shapeEntities)) {
      this.shapeEntities[key].forEach((entity) =>
        this.viewer.entities.remove(entity),
      );
      this.shapeEntities[key] = [];
    }
    this._removeMeasureLabels();
    this.lastShape = null;
    this.onStatus("已清除。");
  }

  applyStyle() {
    const fill = this._fillMaterial();
    const outline = this._outlineMaterial();

    for (const key of Object.keys(this.shapeEntities)) {
      // height / azimuth 的线有自己的材质（箭头、虚线）和配色，
      // 不能被统一的 outlineColor / outlineWidth 覆盖，否则语义就丢了。
      if (key === "height" || key === "azimuth") continue;
      for (const entity of this.shapeEntities[key]) {
        if (entity.polygon) entity.polygon.material = fill;
        if (entity.rectangle) entity.rectangle.material = fill;
        if (entity.polyline) {
          entity.polyline.width = this.params.outlineWidth;
          entity.polyline.material = outline;
        }
      }
    }
    this.drawPointEntities.forEach((entity) => {
      entity.point.pixelSize = this.params.vertexSize;
      entity.show = this.params.showVertices;
    });
  }

  flyTo() {
    const targets = [];
    for (const key of Object.keys(this.shapeEntities)) {
      targets.push(...this.shapeEntities[key]);
    }
    if (!targets.length) {
      this.onStatus("尚未绘制图形。");
      return;
    }
    this.viewer.flyTo(targets, {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 800),
    });
  }

  destroy() {
    this.clearAll();
  }

  // ============================================================
  // 内部：事件绑定与交互
  // ============================================================

  _bindDrawEvents() {
    // 屏蔽默认双击追踪
    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );

    const handler = new Cesium.ScreenSpaceEventHandler(
      this.viewer.scene.canvas,
    );
    this.drawHandler = handler;

    handler.setInputAction(
      (click) => this._handleLeftClick(click),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );
    handler.setInputAction(
      (movement) => this._handleMouseMove(movement),
      Cesium.ScreenSpaceEventType.MOUSE_MOVE,
    );
    if (this.mode === "polygon" || this.mode === "polyline") {
      handler.setInputAction(
        () => this._handleRightClick(),
        Cesium.ScreenSpaceEventType.RIGHT_CLICK,
      );
    }
  }

  _handleLeftClick(click) {
    const cartesian = this._pickGlobe(click.position);
    if (!cartesian) return;

    // 两点类：取满两点立即完成，不走右键
    if (TWO_POINT_TYPES.includes(this.mode)) {
      this._addPoint(cartesian, true);
      if (this.drawPositions.length === 1) {
        this.onStatus("已选起点，请点击第二个点。");
      } else {
        this.finishDraw();
      }
      return;
    }

    if (this.mode === "polygon" || this.mode === "polyline") {
      this._addPoint(cartesian);
    } else {
      this._handleAnchorClick(cartesian);
    }
  }

  _handleMouseMove(movement) {
    const cartesian = this._pickGlobe(movement.endPosition);
    if (!cartesian) return;

    if (
      this.mode === "polygon" ||
      this.mode === "polyline" ||
      TWO_POINT_TYPES.includes(this.mode)
    ) {
      this.movingPosition = cartesian;
    } else if (this.mode === "rectangle" && this.anchorCartesian) {
      this.previewRectangle = this._rectangleFromTwoCartesians(
        this.anchorCartesian,
        cartesian,
      );
    } else if (this.mode === "circle" && this.anchorCartesian) {
      this.previewRadius = this._distanceOnGround(
        this.anchorCartesian,
        cartesian,
      );
    }
  }

  _handleAnchorClick(cartesian) {
    if (!this.anchorCartesian) {
      this.anchorCartesian = cartesian;
      this.previewEntities.forEach((entity) => (entity.show = true));
      this.onStatus(
        this.mode === "circle"
          ? "移动鼠标确定半径，左键点击确认。"
          : "移动鼠标并左键点击第二个对角点。",
      );
    } else {
      if (this.mode === "rectangle") {
        this.previewRectangle = this._rectangleFromTwoCartesians(
          this.anchorCartesian,
          cartesian,
        );
      } else {
        this.previewRadius = this._distanceOnGround(
          this.anchorCartesian,
          cartesian,
        );
      }
      this.finishDraw();
    }
  }

  _handleRightClick() {
    const min = this.mode === "polygon" ? 3 : 2;
    if (this.drawPositions.length < min) {
      this.onStatus(`至少需要 ${min} 个点，请继续取点。`);
      return;
    }
    this.finishDraw();
  }

  _addPoint(cartesian, quiet = false) {
    this.drawPositions.push(cartesian);
    this.drawPointEntities.push(
      this.viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: this.params.vertexSize,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    );
    // quiet：由调用方负责状态文案（两点类没有"右键结束"这一步）
    if (!quiet) {
      this.onStatus(`已取 ${this.drawPositions.length} 个点，右键结束绘制。`);
    }
  }

  _canFinish(mode) {
    if (mode === "polygon") return this.drawPositions.length >= 3;
    if (mode === "polyline") return this.drawPositions.length >= 2;
    if (mode === "rectangle") return !!this.previewRectangle;
    if (mode === "circle") return !!this.previewRadius;
    if (TWO_POINT_TYPES.includes(mode)) return this.drawPositions.length >= 2;
    return false;
  }

  _destroyHandler() {
    this.drawing = false;
    if (this.drawHandler) {
      this.drawHandler.destroy();
      this.drawHandler = null;
    }
  }

  _resetDrawState() {
    this.mode = null;
    this.drawing = false;
    this.drawPositions = [];
    this.movingPosition = null;
    this.anchorCartesian = null;
    this.previewRectangle = null;
    this.previewRadius = null;
  }

  _pickGlobe(windowPosition) {
    const ray = this.viewer.camera.getPickRay(windowPosition);
    if (!ray) return null;
    return this.viewer.scene.globe.pick(ray, this.viewer.scene);
  }

  _rectangleFromTwoCartesians(start, end) {
    const c1 = Cesium.Cartographic.fromCartesian(start);
    const c2 = Cesium.Cartographic.fromCartesian(end);
    const west = Math.min(c1.longitude, c2.longitude);
    const east = Math.max(c1.longitude, c2.longitude);
    const south = Math.min(c1.latitude, c2.latitude);
    const north = Math.max(c1.latitude, c2.latitude);
    return new Cesium.Rectangle(west, south, east, north);
  }

  /** 两点间的地面距离（局部平面近似，与测量口径一致） */
  _distanceOnGround(a, b) {
    const ca = Cesium.Cartographic.fromCartesian(a);
    const cb = Cesium.Cartographic.fromCartesian(b);
    const { mx, my } = metersPerDegree(
      Cesium.Math.toDegrees((ca.latitude + cb.latitude) / 2),
    );
    return Math.hypot(
      (Cesium.Math.toDegrees(cb.longitude) -
        Cesium.Math.toDegrees(ca.longitude)) *
        mx,
      (Cesium.Math.toDegrees(cb.latitude) -
        Cesium.Math.toDegrees(ca.latitude)) *
        my,
    );
  }

  /** 以圆心 + 半径生成近似圆的闭合折线 */
  _circleRing(center, radius, segments = 64) {
    const carto = Cesium.Cartographic.fromCartesian(center);
    const centerLat = Cesium.Math.toDegrees(carto.latitude);
    const centerLon = Cesium.Math.toDegrees(carto.longitude);
    const { mx, my } = metersPerDegree(centerLat);

    const ring = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      ring.push(
        Cesium.Cartesian3.fromDegrees(
          centerLon + (radius * Math.cos(angle)) / mx,
          centerLat + (radius * Math.sin(angle)) / my,
        ),
      );
    }
    return ring;
  }

  _fillMaterial() {
    return Cesium.Color.fromCssColorString(this.params.fillColor).withAlpha(
      this.params.fillOpacity,
    );
  }

  _outlineMaterial() {
    return Cesium.Color.fromCssColorString(this.params.outlineColor);
  }

  // ============================================================
  // 内部：预览实体
  // ============================================================

  _createPreview() {
    this._removePreview();
    const mode = this.mode;

    if (mode === "polygon") {
      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              if (p.length > 2) p.push(p[0]);
              return p.length > 1 ? p : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
      this.previewEntities.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              return p.length > 2 ? new Cesium.PolygonHierarchy(p) : undefined;
            }, false),
            material: Cesium.Color.CYAN.withAlpha(0.15),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
    } else if (mode === "polyline") {
      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition)
                p.push(this.movingPosition);
              return p.length > 1 ? p : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
    } else if (mode === "rectangle") {
      this.previewEntities.push(
        this.viewer.entities.add({
          rectangle: {
            coordinates: new Cesium.CallbackProperty(
              () => this.previewRectangle,
              false,
            ),
            material: Cesium.Color.CYAN.withAlpha(0.18),
            outline: true,
            outlineColor: Cesium.Color.CYAN,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
          show: false,
        }),
      );
    } else if (mode === "circle") {
      // 圆预览：使用贴地折线 + 贴地面（与最终图形一致），
      // 避免 ellipse 实体在贴地模式下不可见的问题
      const circlePositions = () => {
        if (!this.anchorCartesian || !this.previewRadius) return [];
        return this._circleRing(this.anchorCartesian, this.previewRadius);
      };

      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const ring = circlePositions();
              return ring.length ? ring.concat(ring[0]) : [];
            }, false),
            width: this.params.outlineWidth,
            clampToGround: true,
            material: Cesium.Color.CYAN,
          },
        }),
      );
      this.previewEntities.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(() => {
              const ring = circlePositions();
              return ring.length > 2
                ? new Cesium.PolygonHierarchy(ring)
                : undefined;
            }, false),
            material: Cesium.Color.CYAN.withAlpha(0.15),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
    } else if (TWO_POINT_TYPES.includes(mode)) {
      // 两点类预览：起点 → 鼠标的直线。
      // 贴不贴地要跟最终图形保持一致，否则松手瞬间会"跳"一下：
      //   · 测高距 → 不贴地（最终是三维直线，斜边必须保持直线）
      //   · 方位角 → 贴地（最终箭头线跟着地形起伏）
      this.previewEntities.push(
        this.viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              const p = this.drawPositions.slice();
              if (this.drawing && this.movingPosition) p.push(this.movingPosition);
              return p.length > 1 ? p : [];
            }, false),
            width: 2,
            clampToGround: mode === "azimuth",
            material: Cesium.Color.CYAN,
          },
        }),
      );
    }
  }

  _removePreview(keepPoints = false) {
    this.previewEntities.forEach((entity) =>
      this.viewer.entities.remove(entity),
    );
    this.previewEntities = [];
    if (!keepPoints) {
      this.drawPointEntities.forEach((entity) =>
        this.viewer.entities.remove(entity),
      );
      this.drawPointEntities = [];
    }
  }

  /**
   * 按类型摘掉不需要的顶点标记。
   * 目前只有方位角：终点即箭头尖端，留着圆点会跟箭头、方位角标注挤在一起。
   * 起点标记保留 —— 它是箭头和正北虚线的共同原点，有参照价值。
   */
  _trimVertexMarkers(mode) {
    if (!HIDE_LAST_VERTEX_TYPES.includes(mode)) return;
    const last = this.drawPointEntities.pop();
    if (last) this.viewer.entities.remove(last);
  }

  // ============================================================
  // 内部：正式图形实体
  // ============================================================

  _createFinalShape(mode) {
    if (mode === "polygon") {
      const ring = this.drawPositions.slice();
      ring.push(ring[0]);
      this.shapeEntities.polygon.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(this.drawPositions.slice()),
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      this.shapeEntities.polygon.push(
        this.viewer.entities.add({
          polyline: {
            positions: ring,
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "polyline") {
      this.shapeEntities.polyline.push(
        this.viewer.entities.add({
          polyline: {
            positions: this.drawPositions.slice(),
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "rectangle") {
      const rect = this.previewRectangle;
      this.shapeEntities.rectangle.push(
        this.viewer.entities.add({
          rectangle: {
            coordinates: rect,
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      // 描边：注意 Cesium.Rectangle 的 west/south/east/north 是**弧度**，
      // 而 Cartesian3.fromDegreesArray() 要的是**度** —— 必须显式转换，
      // 否则边框会被画到完全错误的位置（约 2°E / 0.5°N 一带），看上去"没有边框"。
      // 同时数组末尾要回到起点，把环闭合，不然会缺一条边。
      const w = Cesium.Math.toDegrees(rect.west);
      const s = Cesium.Math.toDegrees(rect.south);
      const e = Cesium.Math.toDegrees(rect.east);
      const n = Cesium.Math.toDegrees(rect.north);
      const ring = [w, s, w, n, e, n, e, s, w, s];
      this.shapeEntities.rectangle.push(
        this.viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(ring),
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "circle") {
      const ring = this._circleRing(this.anchorCartesian, this.previewRadius);
      const closed = ring.slice();
      closed.push(closed[0]);
      this.shapeEntities.circle.push(
        this.viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(ring),
            material: this._fillMaterial(),
            classificationType: Cesium.ClassificationType.TERRAIN,
          },
        }),
      );
      this.shapeEntities.circle.push(
        this.viewer.entities.add({
          polyline: {
            positions: closed,
            clampToGround: true,
            width: this.params.outlineWidth,
            material: this._outlineMaterial(),
          },
        }),
      );
    } else if (mode === "height") {
      // 高距：三条线构成直角三角形
      //   直连线段（斜边，不贴地） + 垂直连线 + 水平连线
      const g = this._heightGeometry();
      if (!g) return;
      const w = Math.max(2, this.params.outlineWidth);

      // ① 直连线段：两点直接相连，clampToGround: false 保持三维直线
      this.shapeEntities.height.push(
        this.viewer.entities.add({
          polyline: {
            positions: [g.a, g.b],
            clampToGround: false,
            width: w,
            material: Cesium.Color.fromCssColorString("#ffd166"),
          },
        }),
      );
      // ② 垂直连线：低点 → 低点正上方的最高点高度
      this.shapeEntities.height.push(
        this.viewer.entities.add({
          polyline: {
            positions: [g.low, g.up],
            clampToGround: false,
            width: w,
            material: Cesium.Color.fromCssColorString("#ff5d7a"),
          },
        }),
      );
      // ③ 水平连线：在最高处的高度上，从垂线顶端连到高点
      this.shapeEntities.height.push(
        this.viewer.entities.add({
          polyline: {
            positions: [g.up, g.high],
            clampToGround: false,
            width: w,
            material: Cesium.Color.fromCssColorString("#35e0f0"),
          },
        }),
      );
    } else if (mode === "azimuth") {
      // 方位角：箭头线（起点→终点） + 正北参考虚线
      const g = this._azimuthGeometry();
      if (!g) return;

      this.shapeEntities.azimuth.push(
        this.viewer.entities.add({
          polyline: {
            positions: [g.a, g.b],
            // 箭头线贴地：跟着地形起伏走。
            // Cesium 的 GroundPolylinePrimitive 支持 PolylineArrowMaterialProperty，
            // 所以贴地和箭头样式可以同时要。
            clampToGround: true,
            width: Math.max(3, this.params.outlineWidth),
            material: new Cesium.PolylineArrowMaterialProperty(
              Cesium.Color.fromCssColorString("#ffd166"),
            ),
          },
        }),
      );
      this.shapeEntities.azimuth.push(
        this.viewer.entities.add({
          polyline: {
            positions: [g.a, g.north],
            clampToGround: false,
            width: 2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString("#9fb6cc"),
              dashLength: 16,
            }),
          },
        }),
      );
    }
  }

  // ============================================================
  // 内部：高距 / 方位角的几何
  // ============================================================

  /**
   * 高距三角形。约定：
   *   · 垂线立在**较低**那个点的水平位置上，向上到较高点的高程
   *   · 水平线取**最高处的高**，从垂线顶端连到较高点
   *   · 直连线就是两点的三维直线（斜边）
   * 直角顶点 = 低点水平位置 + 高点高程。
   */
  _heightGeometry() {
    if (this.drawPositions.length < 2) return null;
    const a = this.drawPositions[0];
    const b = this.drawPositions[1];
    const ca = Cesium.Cartographic.fromCartesian(a);
    const cb = Cesium.Cartographic.fromCartesian(b);
    const ha = ca.height;
    const hb = cb.height;

    const lowIsA = ha <= hb;
    const lowCarto = lowIsA ? ca : cb;
    const hLow = lowIsA ? ha : hb;
    const hHigh = lowIsA ? hb : ha;
    const high = lowIsA ? b : a;

    const low = Cesium.Cartesian3.fromRadians(
      lowCarto.longitude,
      lowCarto.latitude,
      hLow,
    );
    const up = Cesium.Cartesian3.fromRadians(
      lowCarto.longitude,
      lowCarto.latitude,
      hHigh,
    );
    const highCarto = Cesium.Cartographic.fromCartesian(high);

    // 标注锚点用**精确中点**，而不是 Cartesian3.midpoint：
    // 后者取 ECEF 弦中点，同一高度、不同经纬度的两点之间会略低于真实高度。
    // 垂直距离 → 垂线中点（低点水平位置，高程取两者平均）
    // 水平距离 → 水平线中点（经纬度平均，高程取最高处）
    const verticalMid = Cesium.Cartesian3.fromRadians(
      lowCarto.longitude,
      lowCarto.latitude,
      (hLow + hHigh) / 2,
    );
    const horizontalMid = Cesium.Cartesian3.fromRadians(
      (lowCarto.longitude + highCarto.longitude) / 2,
      (lowCarto.latitude + highCarto.latitude) / 2,
      hHigh,
    );

    return {
      a,
      b,
      low,
      up,
      high,
      heights: [ha, hb],
      vertical: hHigh - hLow,
      horizontal: this._distanceOnGround(a, b),
      slope: Cesium.Cartesian3.distance(a, b),
      verticalMid,
      horizontalMid,
    };
  }

  /**
   * 方位角。正北参考线沿**同一条经线**向北，长度取两点的水平距离，
   * 这样图上那个夹角就是真实的方位角。
   */
  _azimuthGeometry() {
    if (this.drawPositions.length < 2) return null;
    const a = this.drawPositions[0];
    const b = this.drawPositions[1];
    const ca = Cesium.Cartographic.fromCartesian(a);
    const horizontal = this._distanceOnGround(a, b);
    // 注意：111320 是"每度纬度的米数"，得到的是**度**，
    // 而 Cartographic.latitude 是**弧度** —— 必须转一道再用。
    const dLat = Cesium.Math.toRadians(horizontal / 111320);
    const north = Cesium.Cartesian3.fromRadians(
      ca.longitude,
      ca.latitude + dLat,
      ca.height,
    );

    return {
      a,
      b,
      north,
      azimuth: bearingDegrees(a, b),
      horizontal,
    };
  }

  // ============================================================
  // 内部：绘制完成回调载荷
  // ============================================================

  /** 组装绘制完成回调的载荷：id、类型、Cartesian3[]、经纬度(度) 及测量信息 */
  _buildCompletePayload(mode) {
    const info = {
      id: `shape-${++this._shapeSeq}`,
      type: mode,
      positions: [],
      lonLats: [],
    };

    if (mode === "polygon" || mode === "polyline") {
      info.positions = this.drawPositions.slice();
      info.lonLats = toLonLats(this.drawPositions).map((p) => [p.x, p.y]);
      if (mode === "polygon") {
        const { area, perimeter } = measurePolygon(this.drawPositions);
        info.area = area;
        info.perimeter = perimeter;
      } else {
        info.length = measurePolyline(this.drawPositions).length;
      }
    } else if (mode === "rectangle") {
      const rect = this.previewRectangle;
      info.rectangle = {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      };
      const corners = [
        [info.rectangle.west, info.rectangle.south],
        [info.rectangle.east, info.rectangle.south],
        [info.rectangle.east, info.rectangle.north],
        [info.rectangle.west, info.rectangle.north],
      ];
      info.positions = corners.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat),
      );
      info.lonLats = corners;
      const { area, perimeter } = measureRectangle(rect);
      info.area = area;
      info.perimeter = perimeter;
    } else if (mode === "circle") {
      const carto = Cesium.Cartographic.fromCartesian(this.anchorCartesian);
      const centerLon = Cesium.Math.toDegrees(carto.longitude);
      const centerLat = Cesium.Math.toDegrees(carto.latitude);
      info.center = {
        position: this.anchorCartesian,
        lonLats: [centerLon, centerLat],
      };
      info.radius = this.previewRadius;
      info.positions = this._circleRing(
        this.anchorCartesian,
        this.previewRadius,
      );
      info.lonLats = toLonLats(info.positions).map((p) => [p.x, p.y]);
      info.area = Math.PI * info.radius * info.radius;
      info.perimeter = 2 * Math.PI * info.radius;
    } else if (mode === "height") {
      const g = this._heightGeometry();
      if (!g) return info;
      info.positions = [g.a, g.b];
      info.lonLats = toLonLats([g.a, g.b]).map((p) => [p.x, p.y]);
      info.heights = g.heights;
      info.verticalDistance = g.vertical;
      info.horizontalDistance = g.horizontal;
      info.slopeDistance = g.slope;
      // 标注锚点：垂线中点 / 水平线中点
      info.verticalLabelPos = g.verticalMid;
      info.horizontalLabelPos = g.horizontalMid;
    } else if (mode === "azimuth") {
      const g = this._azimuthGeometry();
      if (!g) return info;
      info.positions = [g.a, g.b];
      info.lonLats = toLonLats([g.a, g.b]).map((p) => [p.x, p.y]);
      info.azimuth = g.azimuth;
      info.distance = g.horizontal;
      // 标注锚点：终点
      info.azimuthLabelPos = g.b;
    }

    return info;
  }

  // ============================================================
  // 内部：测量文本
  // ============================================================

  _measureText(mode) {
    if (mode === "polygon") {
      const { area, perimeter } = measurePolygon(this.drawPositions);
      return [
        `多边形绘制完成，共 ${this.drawPositions.length} 个顶点。`,
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "polyline") {
      const { length } = measurePolyline(this.drawPositions);
      return [
        `折线绘制完成，共 ${this.drawPositions.length} 个端点。`,
        `长度：${length.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "rectangle") {
      const { area, perimeter } = measureRectangle(this.previewRectangle);
      return [
        "矩形绘制完成。",
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "circle") {
      const r = this.previewRadius;
      const area = Math.PI * r * r;
      const perimeter = 2 * Math.PI * r;
      return [
        "圆绘制完成。",
        `半径：${r.toFixed(0)} m`,
        `投影面积：${(area / 10000).toFixed(2)} 公顷（${area.toFixed(0)} ㎡）`,
        `周长：${perimeter.toFixed(0)} m`,
      ].join("\n");
    }
    if (mode === "height") {
      const g = this._heightGeometry();
      if (!g) return "";
      return [
        "高距测量完成。",
        `垂直距离：${g.vertical.toFixed(2)} m`,
        `水平距离：${g.horizontal.toFixed(2)} m`,
        `斜距：${g.slope.toFixed(2)} m`,
        `起点高程：${g.heights[0].toFixed(2)} m · 终点高程：${g.heights[1].toFixed(2)} m`,
      ].join("\n");
    }
    if (mode === "azimuth") {
      const g = this._azimuthGeometry();
      if (!g) return "";
      return [
        "方位角测量完成。",
        `方位角：${g.azimuth.toFixed(2)}°（0° = 正北，顺时针）`,
        `水平距离：${g.horizontal.toFixed(2)} m`,
      ].join("\n");
    }
    return "";
  }

  // ============================================================
  // 内部：测量标注
  //
  // 标注落点约定：
  //   面积              → 图形中心（多边形用面积重心，矩形/圆用几何中心）
  //   周长 / 长度       → 线的最后一个点
  //   高距·垂直距离     → 垂线中点
  //   高距·水平距离     → 水平线中点
  //   方位角            → 终点
  // ============================================================

  /**
   * 标注样式。
   *
   * @param {string} text
   * @param {object} [opts]
   *   area            true = 蓝底（面积 / 方位角这类结果值）
   *                   false = 青底（周长 / 长度 / 垂直距这类线性标注）
   *   clampToGround   默认 true。**高距的标注必须传 false** ——
   *                   垂线中点在半空、水平线中点在最高处，
   *                   一旦 CLAMP_TO_GROUND 就会丢掉高程、压到地面，
   *                   表现就是"标注跑到线的一头去了"。
   *   offsetY         屏幕纵向偏移（px，负值向上）。不传时按类型给默认：
   *                   area 类 0，线性标注 -15。
   *                   方位角标注在箭头尖端，单独传 -15 避开箭头。
   */
  _labelStyle(text, opts) {
    const o = opts || {};
    const area = o.area === true;
    const clampToGround = o.clampToGround !== false;
    const offsetY = o.offsetY === undefined ? (area ? 0 : -15) : o.offsetY;

    const style = {
      text,
      font: "600 14px system-ui, Microsoft YaHei, sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString(
        area ? "rgba(18, 52, 110, 0.88)" : "rgba(6, 62, 74, 0.88)",
      ),
      pixelOffset: new Cesium.Cartesian2(0, offsetY),
      backgroundPadding: new Cesium.Cartesian2(9, 5),
      style: Cesium.LabelStyle.FILL,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 300000, 0.5),
    };
    if (clampToGround) {
      style.heightReference = Cesium.HeightReference.CLAMP_TO_GROUND;
    }
    return style;
  }

  /**
   * 多边形的面积重心（鞋带公式）。
   * 自相交或退化时返回 null，由调用方回退到顶点平均值。
   */
  _polygonCentroid(lonLats) {
    const n = lonLats.length;
    if (n < 3) return null;
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = lonLats[i];
      const [x2, y2] = lonLats[(i + 1) % n];
      const cross = x1 * y2 - x2 * y1;
      a += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    if (Math.abs(a) < 1e-12) return null;
    return [cx / (3 * a), cy / (3 * a)];
  }

  /** 面积标注落点：图形中心 */
  _shapeCenter(info) {
    if (info.type === "polygon") {
      const n = info.lonLats.length;
      if (!n) return null;
      const c =
        this._polygonCentroid(info.lonLats) ||
        info.lonLats.reduce((acc, p) => [acc[0] + p[0] / n, acc[1] + p[1] / n], [0, 0]);
      return Cesium.Cartesian3.fromDegrees(c[0], c[1]);
    }
    if (info.type === "rectangle") {
      const r = info.rectangle;
      return Cesium.Cartesian3.fromDegrees(
        (r.west + r.east) / 2,
        (r.south + r.north) / 2,
      );
    }
    if (info.type === "circle") return info.center.position;
    return null; // 折线没有面积
  }

  /** 周长 / 长度标注落点：线的最后一个点 */
  _lastPointOf(info) {
    if (info.positions && info.positions.length) {
      return info.positions[info.positions.length - 1];
    }
    const n = info.lonLats.length;
    if (!n) return null;
    const p = info.lonLats[n - 1];
    return Cesium.Cartesian3.fromDegrees(p[0], p[1]);
  }

  /** 清掉上一轮测量标注（换图 / 清除 / 改开关时都要先调） */
  _removeMeasureLabels() {
    if (!this.measureLabelEntities.length) return;
    this.measureLabelEntities.forEach((e) => this.viewer.entities.remove(e));
    this.measureLabelEntities = [];
  }

  /**
   * 按 measureOptions + 绘制类型生成测量标注。
   *   measure 为 false 时直接返回（只绘制不测量）。
   *   面积项只有 polygon / rectangle / circle 有，受 showArea 控制；
   *   周长 / 长度 / 距离 / 角度受 showPerimeter 控制。
   */
  _createMeasureLabels(info) {
    this._removeMeasureLabels();
    if (!info || !this.measureOptions.measure) return;

    const opt = this.measureOptions;
    const out = [];
    const add = (position, text, style) => {
      if (!position) return;
      out.push(
        this.viewer.entities.add({
          position,
          label: this._labelStyle(text, style),
        }),
      );
    };

    switch (info.type) {
      case "polygon":
      case "rectangle":
      case "circle": {
        if (opt.showArea && info.area != null) {
          add(this._shapeCenter(info), `面积 ${formatAreaText(info.area)}`, {
            area: true,
          });
        }
        if (opt.showPerimeter && info.perimeter != null) {
          add(this._lastPointOf(info), `周长 ${formatLengthText(info.perimeter)}`, {
            area: false,
          });
        }
        break;
      }
      case "polyline": {
        // 折线没有面积项，只受 showPerimeter 控制
        if (opt.showPerimeter && info.length != null) {
          add(this._lastPointOf(info), `长度 ${formatLengthText(info.length)}`, {
            area: false,
          });
        }
        break;
      }
      case "height": {
        // 垂直 / 水平距离都算"距离类"，归 showPerimeter 管；
        // 两者在半空中，必须 clampToGround: false
        if (opt.showPerimeter) {
          add(
            info.verticalLabelPos,
            `垂直 ${formatLengthText(info.verticalDistance)}`,
            { area: false, clampToGround: false },
          );
          add(
            info.horizontalLabelPos,
            `水平 ${formatLengthText(info.horizontalDistance)}`,
            { area: true, clampToGround: false },
          );
        }
        break;
      }
      case "azimuth": {
        // 标注落在箭头尖端，上移 15px 免得被箭头压住
        if (opt.showPerimeter && info.azimuth != null) {
          add(
            info.azimuthLabelPos,
            `方位角 ${info.azimuth.toFixed(2)}°`,
            { area: true, offsetY: -15 },
          );
        }
        break;
      }
      default:
        break;
    }

    this.measureLabelEntities = out;
  }
}
