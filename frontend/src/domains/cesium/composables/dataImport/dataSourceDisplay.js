/**
 * dataSourceDisplay.js
 * 导入数据的显隐 / 透明度类型适配器（统一图层管理·句柄侧实现）。
 *
 * 输入为 loadedDataSources 中的记录（含 entity 句柄），按类型分派：
 * - 显隐：各类句柄统一走 .show；TIF 需同步 heightMesh 伴生 primitive
 * - 透明度：tif → ImageryLayer.alpha；gltf → Model.color alpha；
 *   3dtiles → Cesium3DTileStyle 白色乘 alpha（与「材质模式」互写 style，
 *   语义为「最后操作生效」，alpha=1 时清空 style 还原）；
 *   矢量类（geojson/kml/czml/shp/wayline）→ per-entity 材质 alpha 缩放：
 *   首次调节时以 WeakMap 快照原始颜色（新 alpha = 原始 alpha × 系数，可反复调节
 *   不衰减）；时间动态颜色属性（isConstant=false）包装为缩放 CallbackProperty
 *   （每次求值对原始结果缩放，保留时间动态语义），
 *   大数据源经 rAF 合并（滑杆高频拖动一帧只重算一次）。
 */

import { toRaw } from 'vue';
import { applyTilesetMaterial } from './loaders/tilesetLoader.js';

/** 矢量数据源原始颜色快照：WeakMap<DataSource, Map<entityId, snapshot>>（随句柄 GC） */
const vectorColorSnapshots = new WeakMap();

/**
 * tileset 外观二元状态：WeakMap<Cesium3DTileset, { mode, alpha }>
 * P1-2 单点合成——材质模式与透明度任一变化都以完整二元组重建外观，互不覆盖。
 */
const tilesetAppearanceState = new WeakMap();

/**
 * 获取 tileset 外观状态，不存在时按 record 当前值初始化（避免默认 'none' 与 UI 脱节）
 * @param {object} tileset - Cesium3DTileset 实例
 * @param {object} [record] - loadedDataSources 记录（用于读取初始 materialMode）
 * @returns {{ mode: string, alpha: number }}
 */
function getTilesetState(tileset, record) {
    let state = tilesetAppearanceState.get(tileset);
    if (!state) {
        // 初值以 record 为准（materialMode 与 opacity）：避免「首次拖拽即回弹」与 UI 脱节
        const fromRecord = Number(record?.opacity);
        state = {
            mode: record?.materialMode || 'none',
            alpha: Number.isFinite(fromRecord) ? Math.min(1, Math.max(0, fromRecord)) : 1,
        };
        tilesetAppearanceState.set(tileset, state);
    }
    return state;
}

/**
 * 设置 tileset 材质模式（保留当前透明度合成应用）
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} record - loadedDataSources 记录（type='3dtiles'）
 * @param {string} mode - MATERIAL_MODES 的 key
 */
export function setTilesetMaterialMode(Cesium, record, mode) {
    const entity = toRaw(record?.tileset || record?.entity);
    if (!Cesium || !entity) return;
    const state = getTilesetState(entity, record);
    state.mode = String(mode || 'none');
    applyTilesetMaterial(entity, state.mode, Cesium, state.alpha);
}

/** rAF 合并挂起表：WeakMap<DataSource, { alpha, scheduled }> */
const vectorOpacityPending = new WeakMap();

/**
 * 设置记录显隐
 * @param {object} Cesium - Cesium 命名空间（未用到保留签名一致性）
 * @param {object} record - loadedDataSources 记录 { type, entity, heightMesh? }
 * @param {boolean} visible - 目标可见性
 */
export function setRecordVisible(Cesium, record, visible) {
    const entity = toRaw(record?.entity);
    if (!entity) return;
    const next = !!visible;

    // DataSource / Cesium3DTileset / Model / ImageryLayer 均支持 .show
    entity.show = next;

    // TIF 伴生的高程拉伸网格需同步
    const heightMesh = toRaw(record?.heightMesh);
    if (heightMesh) heightMesh.show = next;
}

/**
 * 设置记录透明度（仅 tif / gltf / 3dtiles）
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} record - loadedDataSources 记录
 * @param {number} opacity - 0~1
 * @param {Function} [onApplied] - 矢量类 rAF 合并应用后的回调（用于补 requestRender）
 */
export function setRecordOpacity(Cesium, record, opacity, onApplied) {
    const entity = toRaw(record?.tileset || record?.entity);
    if (!Cesium || !entity) return;
    const alpha = Math.min(1, Math.max(0, Number(opacity) || 0));

    switch (record.type) {
        case 'tif':
        case 'imagery':
            // ImageryLayer 原生 alpha（tif 栅格与 Ion/在线影像同型句柄）
            entity.alpha = alpha;
            break;
        case 'gltf':
            // Model 颜色乘白：仅调透明不改色相。
            // Entity 化后句柄是 Entity（ModelGraphics 在 entity.model 上），
            // 直接对 Entity 赋 color 是无效属性——必须写入 model.color
            // （未显式设色的 ModelGraphics 其 color 读取为 undefined，故只以
            //   entity.model 存在性判型，勿加 color 存在性条件）；
            // 历史裸 primitive（Cesium.Model）保持原路径
            if (entity.model) {
                entity.model.color = Cesium.Color.WHITE.withAlpha(alpha);
            } else {
                entity.color = Cesium.Color.WHITE.withAlpha(alpha);
            }
            break;
        case '3dtiles': {
            // P1-2 单点合成：透明度变化时保留当前材质模式一并重建外观
            const state = getTilesetState(entity, record);
            state.alpha = alpha;
            applyTilesetMaterial(entity, state.mode, Cesium, state.alpha);
            break;
        }
        default:
            // 矢量类（geojson/kml/czml/shp）：per-entity 材质 alpha 缩放
            scheduleVectorOpacity(Cesium, entity, alpha, onApplied);
            break;
    }
}

/** rAF 合并：滑杆高频拖动时同一 DataSource 一帧只重算一次 */
function scheduleVectorOpacity(Cesium, dataSource, alpha, onApplied) {
    let pending = vectorOpacityPending.get(dataSource);
    if (!pending) {
        pending = { alpha, scheduled: false, onApplied: null };
        vectorOpacityPending.set(dataSource, pending);
    }
    pending.alpha = alpha;
    pending.onApplied = typeof onApplied === 'function' ? onApplied : null;
    if (pending.scheduled) return;
    pending.scheduled = true;

    requestAnimationFrame(() => {
        pending.scheduled = false;
        applyVectorDataSourceOpacity(Cesium, dataSource, pending.alpha);
        pending.onApplied?.();
    });
}

/** 需要参与透明度缩放的 (图元, 颜色属性) 清单 */
const VECTOR_COLOR_TARGETS = [
    ['point', 'color'],
    ['point', 'outlineColor'],
    ['billboard', 'color'],
    ['label', 'fillColor'],
    ['label', 'outlineColor'],
    ['label', 'backgroundColor'],
    ['polyline', 'materialColor'],          // material 为 Color/PolylineOutline 材质时取其 color
    ['polyline', 'materialOutlineColor'],   // PolylineOutlineMaterialProperty 的描边色（P2-2）
    ['polygon', 'materialColor'],
    ['polygon', 'outlineColor'],
];

/**
 * 对 DataSource 全部实体应用透明度（基于原始颜色快照，可反复调节不衰减）
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} dataSource - Cesium.DataSource
 * @param {number} alpha - 0~1 系数
 */
function applyVectorDataSourceOpacity(Cesium, dataSource, alpha) {
    const entities = dataSource?.entities?.values;
    if (!Cesium || !Array.isArray(entities)) return;

    let snapshots = vectorColorSnapshots.get(dataSource);
    if (!snapshots) {
        snapshots = new Map();
        vectorColorSnapshots.set(dataSource, snapshots);
    }
    const now = Cesium.JulianDate.now();

    for (const entity of entities) {
        let snapshot = snapshots.get(entity.id);
        if (!snapshot) {
            snapshot = {};
            snapshots.set(entity.id, snapshot);
        }
        for (const [graphicsKey, propKey] of VECTOR_COLOR_TARGETS) {
            const graphics = entity[graphicsKey];
            if (!graphics) continue;
            applyColorScale(Cesium, graphics, graphicsKey, propKey, snapshot, alpha, now);
        }
    }
}

/**
 * 缩放单个颜色属性：快照原始色 → 写入 原始alpha×系数 的新常量色。
 * 时间动态属性（isConstant=false）不再跳过——包装为缩放 CallbackProperty，
 * 每次求值时对原始属性结果做 alpha 缩放（保留 CZML 等时间动态语义）。
 * 材质支持：ColorMaterialProperty（color）与 PolylineOutlineMaterialProperty（color + outlineColor，P2-2）。
 */
function applyColorScale(Cesium, graphics, graphicsKey, propKey, snapshot, alpha, now) {
	const isMaterial = propKey === 'materialColor' || propKey === 'materialOutlineColor';
	const property = isMaterial ? graphics.material : graphics[propKey];
	if (!property) return;

	// 材质类型白名单：纯色 / 描边线；贴图与特效材质不触碰
	if (isMaterial) {
		const isColorMaterial = property instanceof Cesium.ColorMaterialProperty;
		const isOutlineMaterial = Cesium.PolylineOutlineMaterialProperty
			&& property instanceof Cesium.PolylineOutlineMaterialProperty;
		if (!isColorMaterial && !isOutlineMaterial) return;
		// outlineColor 仅描边线材质具备
		if (propKey === 'materialOutlineColor' && !isOutlineMaterial) return;
	}

	// 仅处理常量颜色：材质子属性 / 普通颜色 Property
	const colorProperty = isMaterial
		? (propKey === 'materialOutlineColor' ? property.outlineColor : property.color)
		: property;
	if (!colorProperty || typeof colorProperty.getValue !== 'function') return;

	const cacheKey = `${graphicsKey}.${propKey}`;
	let entry = snapshot[cacheKey];

	if (!entry) {
		// 首次调节：按常量/动态分路建立快照
		if (colorProperty.isConstant === false) {
			// 动态属性：记录原始属性引用，后续经包装器缩放
			entry = { dynamicOriginal: colorProperty };
			snapshot[cacheKey] = entry;
		} else {
			const original = colorProperty.getValue(now);
			if (!original) return;
			entry = { constantOriginal: Cesium.Color.clone(original, new Cesium.Color()) };
			snapshot[cacheKey] = entry;
		}
	}

	if (entry.dynamicOriginal) {
		// 动态路径：写入（或刷新）包装属性。包装器标记 __scaledFrom 防止二次包裹。
		const wrapper = createScaledColorProperty(Cesium, entry.dynamicOriginal, alpha);
		if (isMaterial) {
			if (propKey === 'materialOutlineColor') {
				property.outlineColor = wrapper;
			} else {
				property.color = wrapper;
			}
		} else {
			graphics[propKey] = wrapper;
		}
		return;
	}

	const base = entry.constantOriginal;
	if (!base) return;
	const next = base.withAlpha(base.alpha * alpha);
	if (isMaterial) {
		if (propKey === 'materialOutlineColor') {
			property.outlineColor = next;
		} else {
			property.color = next;
		}
	} else {
		graphics[propKey] = next;
	}
}

/** 包装器回指原始属性的标记键（防重复包裹导致缩放叠加） */
const SCALED_FROM_KEY = '__cesiumScaledFrom';

/**
 * 创建动态颜色的 alpha 缩放包装属性：getValue 时对原始结果做 withAlpha(alpha)。
 * 常量性跟随原属性；原属性若已是上一次的包装器则解包，保证始终从真源缩放。
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} original - 原始颜色 Property
 * @param {number} alpha - 0~1 系数
 * @returns {object} CallbackProperty 实例
 */
function createScaledColorProperty(Cesium, original, alpha) {
	const source = original[SCALED_FROM_KEY] || original;
	const wrapper = new Cesium.CallbackProperty((time) => {
		const color = source.getValue(time);
		return color ? color.withAlpha(color.alpha * alpha) : color;
	}, source.isConstant !== false);
	wrapper[SCALED_FROM_KEY] = source;
	return wrapper;
}
