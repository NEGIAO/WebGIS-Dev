/**
 * 功能名称：图层树「非二维引擎」节点协议（Engine Tree Port）
 * 日    期：2026/11/13
 *
 * 背景：图层树（common）需要展示并操作三维域（cesium）的图层记录，
 *      但 `Refactor.md §3` 禁止 `common -> cesium`。此处提供**注册式端口**：
 *      三维域在自身入口把「记录列表 + 动作处理器」注册进来，
 *      common 只面向接口编程，不 import 任何 cesium 实现。
 *
 * 设计要点：
 *   1. `listRecords` / `buildGroup` 会在 computed 内被调用，必须直接读取 Pinia 响应式状态，
 *      保证依赖追踪成立（不得缓存快照）。
 *   2. 未注册时全部降级为空集合 / 未消费，2D-only 场景无需任何三维代码加载。
 *   3. 端口按节点前缀（如 `cesium:`）索引，未来新增引擎（如 `deck:`）直接注册即可。
 */

/** 引擎图层记录的公共最小契约（各引擎自有字段不在此约束） */
export type EngineLayerRecord = {
	id: string | number;
	name?: string;
	type?: string;
};

/** 图层树分组节点（与 layerTreeBuilder.toLayerNode 契约一致） */
export type EngineTreeGroupNode = {
	id: string;
	name: string;
	type: string;
	children?: unknown[];
	actions?: Record<string, unknown>;
	[key: string]: unknown;
};

/** 单个引擎向图层树注册的端口 */
export type EngineTreePort = {
	/** TOC 节点 id 前缀，如 `cesium:` */
	prefix: string;
	/** 读取当前记录（必须在 computed 内调用以维持响应式追踪） */
	listRecords: () => EngineLayerRecord[];
	/** 构建该引擎的图层树分组节点；无记录时应返回空数组 */
	buildGroup: (expandedState: Record<string, boolean>) => EngineTreeGroupNode[];
	/** 该引擎是否支持「可改样式」判定（用于样式页签目标列表） */
	isStyleSupported?: (type?: string) => boolean;
	/** 处理该引擎的树动作；返回 true 表示已消费，false 交回通用链路 */
	handleAction: (evt: Record<string, any>) => boolean;
};

const ports = new Map<string, EngineTreePort>();

/** 注册（或覆盖）一个引擎端口；由各引擎域在自身入口调用 */
export function registerEngineTreePort(port: EngineTreePort) {
	ports.set(port.prefix, port);
}

/** 按前缀取端口；未注册返回 null */
export function getEngineTreePort(prefix: string): EngineTreePort | null {
	return ports.get(prefix) || null;
}

/** 全部已注册端口（顺序即注册顺序） */
export function listEngineTreePorts(): EngineTreePort[] {
	return [...ports.values()];
}

/** 汇总所有引擎的记录 id（含前缀），供多选全集使用 */
export function listEngineTreeNodeIds(): string[] {
	const out: string[] = [];
	listEngineTreePorts().forEach((port) => {
		(port.listRecords() || []).forEach((record) => {
			const id = String(record?.id ?? '').trim();
			if (id) out.push(`${port.prefix}${id}`);
		});
	});
	return out;
}

/** 汇总所有引擎的分组节点，供 layerTree 拼装使用 */
export function buildEngineTreeGroups(expandedState: Record<string, boolean>): EngineTreeGroupNode[] {
	return listEngineTreePorts().flatMap((port) => port.buildGroup(expandedState) || []);
}

/** 依次尝试各引擎处理器；任一消费即返回 true */
export function dispatchToEngineTree(evt: Record<string, any>): boolean {
	for (const port of ports.values()) {
		if (port.handleAction(evt)) return true;
	}
	return false;
}

/** 清空注册（仅供测试与热重载复位，业务代码不要调用） */
export function resetEngineTreePorts() {
	ports.clear();
}
