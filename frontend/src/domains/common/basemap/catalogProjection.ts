/**
 * 功能名称：底图目录投影（Basemap Catalog Projection）
 * 日    期：2026/11/13
 *
 * 背景：底图目录的单一真相源（`LAYER_SOURCE_DEFINITIONS`）必须留在 ol 域——
 *      每条定义的 `createSource` 直接构造 `ol/source/*`，且 `createSource` 是
 *      二维底图装配、下载器、右键菜单共同依赖的契约，无法拆走。
 *      但三维域只需要其中的**只读元数据查询**（预设→源栈、分类/分组、描述符、密钥池）。
 *
 * 方案：注册式投影（Refactor.md §3 认可的「common 协议层间接连接」）。
 *      ol 目录模块加载时把 5 个纯查询函数发布到这里，三维域只面向本模块编程，
 *      因此 `cesium -> ol` 的静态依赖被消除，而数据仍只有一份。
 *
 * 时序保证：投影由 ol 目录模块自身的模块级副作用发布；应用编排层（HomeView）
 *          静态引入该目录 → 三维分包（懒加载）求值时投影必然已就绪。
 *          未发布即调用属装配错误，直接抛错而非静默降级。
 */

/** 图层分类（与 ol 侧 LayerCategory 同构） */
export type BasemapLayerCategory = 'label' | 'imagery' | 'terrain' | 'vector' | 'theme' | 'custom';

/** 图层分组（与 ol 侧 LayerGroup 同构，仅取字符串语义） */
export type BasemapLayerGroup = string;

/** 引擎无关的瓦片源描述符（不含 createSource） */
export type BasemapTileSourceDescriptor = {
	id: string;
	name: string;
	category: BasemapLayerCategory;
	group: BasemapLayerGroup;
	serviceType: 'xyz' | 'wms' | 'wmts' | 'osm' | 'vector-tile' | 'custom';
	url: string;
	maxZoom?: number;
	tilePixelRatio?: number;
	subdomains?: string[];
	nonStandardAdapter?: string;
	needsContext?: ('tiandituTk' | 'ovitalTdtkey' | 'customUrl')[];
	wms?: {
		layers: string;
		version?: string;
		srs?: string;
		format?: string;
		styles?: string;
		transparent?: boolean;
	};
	wmts?: {
		layer: string;
		style: string;
		matrixSet: string;
		format: string;
		version: string;
	};
};

/** 运行时密钥池类型 */
export type BasemapRuntimeTokenPoolKey = 'tianditu_tk' | 'ovital_tdtkey';

/** ol 域发布的投影实现 */
export type BasemapCatalogProjection = {
	/** 预设 / 源 id → 实际图层堆叠（去重保序，已剔除未定义 id） */
	resolvePresetLayerIds: (optionId: string) => string[];
	getLayerCategory: (layerId: string) => BasemapLayerCategory;
	getLayerGroup: (layerId: string) => BasemapLayerGroup;
	getDescriptorById: (id: string) => BasemapTileSourceDescriptor | undefined;
	resolveRuntimeTokenPoolKey: (layerId: string) => BasemapRuntimeTokenPoolKey | null;
};

let projection: BasemapCatalogProjection | null = null;

/** 由 ol 底图目录模块调用；重复调用以最后一次为准（热重载安全） */
export function publishBasemapCatalogProjection(next: BasemapCatalogProjection) {
	projection = next;
}

/** 取投影；未发布时抛错（装配错误必须暴露，不得静默返回空值） */
function requireProjection(): BasemapCatalogProjection {
	if (!projection) {
		throw new Error(
			'[basemapCatalogProjection] 底图目录投影尚未发布：请确认应用入口已加载 @ol/basemap/constants（HomeView 静态引入）',
		);
	}
	return projection;
}

/** 预设 / 源 id → 实际图层堆叠 */
export function resolvePresetLayerIds(optionId: string): string[] {
	return requireProjection().resolvePresetLayerIds(optionId);
}

/** 图层分类 */
export function getLayerCategory(layerId: string): BasemapLayerCategory {
	return requireProjection().getLayerCategory(layerId);
}

/** 图层分组 */
export function getLayerGroup(layerId: string): BasemapLayerGroup {
	return requireProjection().getLayerGroup(layerId);
}

/** 按 id 取引擎无关描述符 */
export function getDescriptorById(id: string): BasemapTileSourceDescriptor | undefined {
	return requireProjection().getDescriptorById(id);
}

/** 按 id 解析运行时密钥池 */
export function resolveRuntimeTokenPoolKey(layerId: string): BasemapRuntimeTokenPoolKey | null {
	return requireProjection().resolveRuntimeTokenPoolKey(layerId);
}
