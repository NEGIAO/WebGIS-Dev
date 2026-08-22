/**
 * terrainClampService.js
 * Cesium 贴地辅助模块（纯函数，无 Vue 依赖）
 *
 * 架构方案：Docs/Architecture/2026-08-22-clamp-to-ground-strategy.md
 *
 * ⚠️ 职责边界（能省则省）：
 *  - geojson/kml/kmz/shp 矢量：官方 DataSource.load 期 `clampToGround: true` 一步到位，
 *    GroundPrimitive 随地形切换自动跟随，本模块不参与；
 *  - CZML 无加载期选项 → 使用本模块的实体级 heightReference 贴地（这本身是官方 API）；
 *  - glTF：Entity ModelGraphics 的 heightReference 官方机制承担（CLAMP_TO_GROUND /
 *    RELATIVE_TO_GROUND），见 dataImport/loaders/gltfLoader.js 的 loadGltfWithCoords；
 *  - 3D Tiles 地理配准修正走 tilesetLoader 的基底配准（另一类问题，非贴地）。
 */

/**
 * 判断当前是否开启了真实地形（非椭球地形）。
 *
 * instanceof 强化：cesium-shim 默认导出 Proxy 返回真类引用，instanceof 可靠；
 * 若未来经命名导入拿到 bind 副本导致 instanceof 抛错，降级为 constructor 引用比较。
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium - Cesium 命名空间
 * @returns {boolean} 是否开启真实地形
 */
export function isTerrainEnabled(viewer, Cesium) {
    if (!viewer?.terrainProvider || !Cesium?.EllipsoidTerrainProvider) return false;
    try {
        return !(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider);
    } catch {
        return viewer.terrainProvider.constructor !== Cesium.EllipsoidTerrainProvider;
    }
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
 * 幂等，已设置非 NONE 高度引用则不覆盖。
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

    // ---- 点：贴地 + 关闭深度测试（地形起伏下始终可见）----
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

    // ---- 标注：贴地 + 关闭深度测试 ----
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

    // ---- 面：贴地需 perPositionHeight=false。数据自带海拔（perPositionHeight=true）跳过，
    //      保留语义高度 ----
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

    // ---- 椭圆 / 模型图形：贴地 ----
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
 * 供 CZML loader 调用（其余矢量格式由 DataSource.load 期 clampToGround 承担）；
 * 地形关闭时不动作，由 terrainProviderChanged 监听在切换后补贴地（幂等）。
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
