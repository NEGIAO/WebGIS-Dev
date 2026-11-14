/** 矢量数据源原始颜色快照：WeakMap<DataSource, Map<entityId, snapshot>>（随句柄 GC） */
const vectorColorSnapshots = new WeakMap<any, Map<string, any>>();

/**
 * 矢量颜色缩放内核（从 dataSourceDisplay.js 拆出）
 *
 * 只做「快照原始色 → 写入 原始alpha×系数」这一件事：
 * 常量色直接缩放、时间动态色包装成缩放 CallbackProperty、材质只处理纯色/描边线。
 * 快照表按图层维度由调用方持有，故本模块不持全局状态。
 */

/** 需要参与透明度缩放的 (图元, 颜色属性) 清单 */
const VECTOR_COLOR_TARGETS: Array<[string, string]> = [
    ['point', 'color'],
    ['point', 'outlineColor'],
    ['billboard', 'color'],
    ['label', 'fillColor'],
    ['label', 'outlineColor'],
    ['label', 'backgroundColor'],
    ['polyline', 'materialColor'],
    ['polyline', 'materialOutlineColor'],
    ['polygon', 'materialColor'],
    ['polygon', 'outlineColor'],
];

/** 各 (图元, 颜色属性) 在 Cesium 中的隐式默认色（未显式赋值时 Cesium 实际使用的颜色） */
const VECTOR_COLOR_DEFAULTS: Record<string, string> = {
    'billboard.color': 'WHITE',
    'label.fillColor': 'WHITE',
    'label.outlineColor': 'BLACK',
    'label.backgroundColor': 'TRANSPARENT',
    'point.color': 'WHITE',
    'point.outlineColor': 'BLACK',
    'polygon.outlineColor': 'BLACK',
};

/**
 * 对 DataSource 全部实体应用透明度（基于原始颜色快照，可反复调节不衰减）
 * @param {object} Cesium - Cesium 命名空间
 * @param {object} dataSource - Cesium.DataSource
 * @param {number} alpha - 0~1 系数
 */
/**
 * 对任意实体列表应用透明度缩放（基于原始颜色快照，可反复调节不衰减）。
 *
 * 从 `applyVectorDataSourceOpacity` 抽出：路线句柄持有的是 `Entity[]` 而非 DataSource，
 * 但透明度语义完全一致（快照原始色 → 写入 原始alpha×系数）。
 * 快照表由调用方按「图层」维度自持，互不串扰。
 *
 * @param {object} Cesium - Cesium 命名空间
 * @param {Array} entities - Cesium.Entity 数组
 * @param {number} alpha - 0~1 系数
 * @param {Map} snapshots - entityId → 原始色快照（首次调用时自动填充）
 */
export function applyEntityListOpacity(
    Cesium: any,
    entities: any[],
    alpha: number,
    snapshots: Map<string, any>,
): void {
    if (!Cesium || !Array.isArray(entities) || !(snapshots instanceof Map)) return;
    const now = Cesium.JulianDate.now();

    for (const entity of entities) {
        if (!entity) continue;
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

export function applyVectorDataSourceOpacity(Cesium: any, dataSource: any, alpha: number): void {
    const entities = dataSource?.entities?.values;
    if (!Cesium || !Array.isArray(entities)) return;

    let snapshots = vectorColorSnapshots.get(dataSource);
    if (!snapshots) {
        snapshots = new Map();
        vectorColorSnapshots.set(dataSource, snapshots);
    }

    applyEntityListOpacity(Cesium, entities, alpha, snapshots);
}

/**
 * 缩放单个颜色属性：快照原始色 → 写入 原始alpha×系数 的新常量色。
 * 时间动态属性（isConstant=false）不再跳过——包装为缩放 CallbackProperty，
 * 每次求值时对原始属性结果做 alpha 缩放（保留 CZML 等时间动态语义）。
 * 材质支持：ColorMaterialProperty（color）与 PolylineOutlineMaterialProperty（color + outlineColor，P2-2）。
 */
function applyColorScale(
    Cesium: any,
    graphics: any,
    graphicsKey: string,
    propKey: string,
    snapshot: any,
    alpha: number,
    now: any,
): void {
	const isMaterial = propKey === 'materialColor' || propKey === 'materialOutlineColor';
	const cacheKey = `${graphicsKey}.${propKey}`;
	const property = isMaterial ? graphics.material : graphics[propKey];

	// ── 属性缺失但有隐式默认色：按默认色建基准后照常缩放 ──
	// 覆盖 GeoJSON/KML 的 Point → billboard（只有 image 没有 color）、label（只有 text）
	// 这类「Cesium 自己生成、我们从未赋色」的图元。快照同样入表，保证反复拖动不衰减。
	if (!property && !isMaterial) {
		let fallbackEntry = snapshot[cacheKey];
		if (!fallbackEntry) {
			const fallbackName = VECTOR_COLOR_DEFAULTS[cacheKey];
			const baseColor = fallbackName ? Cesium.Color?.[fallbackName] : null;
			if (!baseColor) return;              // 无默认色语义（如线材质）→ 不处理
			fallbackEntry = { constantOriginal: Cesium.Color.clone(baseColor, new Cesium.Color()) };
			snapshot[cacheKey] = fallbackEntry;
		}
		const base = fallbackEntry.constantOriginal;
		if (!base) return;
		graphics[propKey] = base.withAlpha(base.alpha * alpha);
		return;
	}

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
function createScaledColorProperty(Cesium: any, original: any, alpha: number): any {
	const source = original[SCALED_FROM_KEY] || original;
	const wrapper = new Cesium.CallbackProperty((time: any) => {
		const color = source.getValue(time);
		return color ? color.withAlpha(color.alpha * alpha) : color;
	}, source.isConstant !== false);
	wrapper[SCALED_FROM_KEY] = source;
	return wrapper;
}

/**
 * 样式补丁后失效受影响的透明度基准快照（只清样式确实改写过的图元，保留 billboard 基准）
 * @param dataSource Cesium.DataSource
 */
export function invalidateVectorColorSnapshots(dataSource: any): void {
    const snapshots = vectorColorSnapshots.get(dataSource);
    if (!snapshots) return;
    const invalidatedKeys = new Set([
        'polygon.materialColor',
        'polygon.outlineColor',
        'polyline.materialColor',
        'point.color',
        'label.fillColor',
    ]);
    for (const entry of snapshots.values()) {
        for (const key of Object.keys(entry)) {
            if (invalidatedKeys.has(key)) delete entry[key];
        }
    }
}

