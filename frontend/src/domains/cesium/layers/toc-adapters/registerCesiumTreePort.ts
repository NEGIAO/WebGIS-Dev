/**
 * 功能名称：三维域图层树端口注册
 * 日    期：2026/11/13
 *
 * 由应用编排层（HomeView）在启动时调用一次，把「三维记录 + 动作处理器 + 分组构建」
 * 注册到 common 的 `engineTreePort`，使图层树（common）无需 import 三维实现。
 *
 * 注意：注册必须早于图层树首次渲染；`listRecords` / `buildGroup` 内部即时读取
 * Pinia 状态，因此保持响应式追踪，不得改为一次性快照。
 */
import { registerEngineTreePort } from '@common/layer-tree/engineTreePort';
import { CESIUM_NODE_PREFIX } from '@common/layer-tree/protocol';
import {
	useCesiumLayersStore,
	isCesiumStyleSupportedType,
} from '@cesium-domain/stores/cesiumLayers';
import { buildCesiumDataGroup } from '@cesium-domain/stores/cesiumLayerNodeBuilder';
import { handleCesiumLayerTreeAction } from './cesiumTocActions';

let registered = false;

/** 注册三维引擎的图层树端口（幂等） */
export function registerCesiumTreePort() {
	if (registered) return;
	registered = true;

	registerEngineTreePort({
		prefix: CESIUM_NODE_PREFIX,
		listRecords: () => useCesiumLayersStore().records || [],
		buildGroup: (expandedState) =>
			buildCesiumDataGroup(useCesiumLayersStore().records || [], expandedState) as any,
		isStyleSupported: (type) => isCesiumStyleSupportedType(type ?? ''),
		handleAction: (evt) => handleCesiumLayerTreeAction(evt, useCesiumLayersStore()),
	});
}
