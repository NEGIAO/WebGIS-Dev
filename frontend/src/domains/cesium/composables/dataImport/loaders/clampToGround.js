/**
 * clampToGround.js
 * 导入数据统一贴地工具
 *
 * 借鉴 planar-route/drawPolygon.ts 的贴地实现（该绘制工具在真实地形下已稳定贴地）：
 * - 点   → point.heightReference = CLAMP_TO_GROUND + disableDepthTestDistance = Infinity
 * - 线   → polyline.clampToGround = true
 * - 面   → polygon.heightReference = CLAMP_TO_GROUND + perPositionHeight = false
 * - 标注 → label 同点处理（heightReference + disableDepthTestDistance）
 *
 * 统一入口设计（对应需求"先判断地形是否开启，再统一贴地"）：
 * - 先判断地形是否开启（terrainProvider 非 EllipsoidTerrainProvider 即视为开启）；
 * - 地形开启才对导入数据统一贴地；地形关闭保持数据原始绝对高度（无地形时
 *   CLAMP_TO_GROUND 退化为椭球面 0 高，若数据本身带语义高度会被误压平）；
 * - 幂等：已设置非 NONE 高度引用的实体（数据自带海拔语义）不覆盖；
 * - 时间动态实体（isConstant === false，如 CZML 采样轨迹）跳过——贴地会拍平
 *   动画语义高度。
 */

/**
 * 判断当前是否开启了真实地形（非椭球地形）
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium - Cesium 命名空间
 * @returns {boolean} 是否开启真实地形
 */
export function isTerrainEnabled(viewer, Cesium) {
    if (!viewer?.terrainProvider || !Cesium) return false;
    return viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;
}

/**
 * 读取图形属性的常量值。
 * 属性未设置 / 时间动态 / 取值异常时返回 undefined，调用方按"未设置"处理。
 * @param {object|undefined} property - 图形属性（如 point.heightReference）
 * @returns {*} 常量值；无法读取时 undefined
 */
function getConstantValue(property) {
    if (!property || typeof property.getValue !== 'function') return undefined;
    if (property.isConstant === false) return undefined;
    try {
        return property.getValue();
    } catch {
        return undefined;
    }
}

/**
 * 对单个实体施加贴地属性（点/线/面/标注/billboard/柱廊/矩形/椭圆/模型）。
 * 借鉴 drawPolygon.ts 的属性组合；幂等，已设置非 NONE 高度引用则不覆盖。
 *
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.Entity} entity - 目标实体
 * @returns {boolean} 是否发生了修改
 */
export function clampEntityToGround(Cesium, entity) {
    if (!Cesium || !entity) return false;

    // 时间动态实体（CZML 采样轨迹 / 回调位置等）跳过：贴地会拍平动画语义高度
    if (
        entity.position?.isConstant === false ||
        entity.polyline?.positions?.isConstant === false ||
        entity.polygon?.hierarchy?.isConstant === false
    ) {
        return false;
    }

    const HR = Cesium.HeightReference.CLAMP_TO_GROUND;
    let modified = false;

    // ---- 点：贴地 + 关闭深度测试（地形起伏下始终可见，与 drawPolygon 一致）----
    if (entity.point) {
        const hr = getConstantValue(entity.point.heightReference);
        if (hr === undefined || hr === Cesium.HeightReference.NONE) {
            entity.point.heightReference = HR;
            modified = true;
        }
        const ddt = getConstantValue(entity.point.disableDepthTestDistance);
        if (ddt === undefined || ddt === 0) {
            entity.point.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            modified = true;
        }
    }

    // ---- 标注：贴地 + 关闭深度测试（与 drawPolygon 一致）----
    if (entity.label) {
        const hr = getConstantValue(entity.label.heightReference);
        if (hr === undefined || hr === Cesium.HeightReference.NONE) {
            entity.label.heightReference = HR;
            modified = true;
        }
        const ddt = getConstantValue(entity.label.disableDepthTestDistance);
        if (ddt === undefined || ddt === 0) {
            entity.label.disableDepthTestDistance = Number.POSITIVE_INFINITY;
            modified = true;
        }
    }

    // ---- billboard（KML 图标点）：贴地 ----
    if (entity.billboard) {
        const hr = getConstantValue(entity.billboard.heightReference);
        if (hr === undefined || hr === Cesium.HeightReference.NONE) {
            entity.billboard.heightReference = HR;
            modified = true;
        }
    }

    // ---- 线：clampToGround ----
    if (entity.polyline) {
        const clamped = getConstantValue(entity.polyline.clampToGround);
        if (clamped !== true) {
            entity.polyline.clampToGround = true;
            modified = true;
        }
    }

    // ---- 面：贴地需 perPositionHeight=false（drawPolygon 的 perPositionHeight 方案）。
    //      数据自带海拔（perPositionHeight=true）时跳过，保留语义高度。----
    if (entity.polygon) {
        const perPosH = getConstantValue(entity.polygon.perPositionHeight);
        if (perPosH !== true) {
            if (perPosH !== false) {
                entity.polygon.perPositionHeight = false;
                modified = true;
            }
            const hr = getConstantValue(entity.polygon.heightReference);
            if (hr === undefined || hr === Cesium.HeightReference.NONE) {
                entity.polygon.heightReference = HR;
                modified = true;
            }
        }
    }

    // ---- 柱廊 / 矩形：clampToGround ----
    if (entity.corridor) {
        const clamped = getConstantValue(entity.corridor.clampToGround);
        if (clamped !== true) {
            entity.corridor.clampToGround = true;
            modified = true;
        }
    }
    if (entity.rectangle) {
        const clamped = getConstantValue(entity.rectangle.clampToGround);
        if (clamped !== true) {
            entity.rectangle.clampToGround = true;
            modified = true;
        }
    }

    // ---- 椭圆 / 模型：贴地 ----
    if (entity.ellipse) {
        const hr = getConstantValue(entity.ellipse.heightReference);
        if (hr === undefined || hr === Cesium.HeightReference.NONE) {
            entity.ellipse.heightReference = HR;
            modified = true;
        }
    }
    if (entity.model) {
        const hr = getConstantValue(entity.model.heightReference);
        if (hr === undefined || hr === Cesium.HeightReference.NONE) {
            entity.model.heightReference = HR;
            modified = true;
        }
    }

    return modified;
}

/**
 * 统一贴地入口：先判断地形是否开启，开启后对数据源全部实体施加贴地。
 * 供各 loader（KML/KMZ/CZML/GeoJSON/SHP）与地形切换监听共用。
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium - Cesium 命名空间
 * @param {Cesium.DataSource} dataSource - 已加载的矢量数据源
 * @returns {{ clamped: number, total: number, terrainEnabled: boolean }}
 *          clamped=实际修改的实体数；terrainEnabled=是否处于真实地形（未开启时 clamped=0）
 */
export function clampDataSourceToGround(viewer, Cesium, dataSource) {
    const terrainEnabled = isTerrainEnabled(viewer, Cesium);
    const entities = dataSource?.entities?.values;
    if (!terrainEnabled || !Array.isArray(entities)) {
        return { clamped: 0, total: Array.isArray(entities) ? entities.length : 0, terrainEnabled };
    }

    let clamped = 0;
    for (const entity of entities) {
        if (clampEntityToGround(Cesium, entity)) clamped++;
    }
    return { clamped, total: entities.length, terrainEnabled: true };
}