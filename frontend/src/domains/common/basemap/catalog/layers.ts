/**
 * 引擎无关的图层定义注册表（阶段 2 桥接）。
 *
 * 当前由 common/basemap/definitions（index.ts）在模块加载时登记完整图层定义；阶段 3/4 的目录
 * UI 与 Cesium 均可从此处读取 category/provider/coord/description，而不必
 * 各自解析 id 字符串。后续阶段可把登记动作迁移到 catalog/layers/*.ts，
 * 对外 API 不变。
 */
import type { BasemapLayerDefinition } from './types';

let layerDefinitions: BasemapLayerDefinition[] = [];
const layerIndex = new Map<string, BasemapLayerDefinition>();

/** 登记版本号：每次 registerLayerDefinitions 自增，供 registry 缓存失效判断（热重载安全） */
let registryVersion = 0;

/** 当前登记版本号；registry 据此判断缓存是否失效 */
export function getLayerRegistryVersion(): number {
    return registryVersion;
}

export function registerLayerDefinitions(definitions: readonly BasemapLayerDefinition[]): void {
    layerDefinitions = [...definitions];
    layerIndex.clear();
    for (const definition of layerDefinitions) layerIndex.set(definition.id, definition);
    registryVersion += 1;
}

export function getAllLayerDefinitions(): BasemapLayerDefinition[] {
    return layerDefinitions;
}

export function getLayerDefinitionById(id: string): BasemapLayerDefinition | undefined {
    return layerIndex.get(String(id ?? '').trim());
}
