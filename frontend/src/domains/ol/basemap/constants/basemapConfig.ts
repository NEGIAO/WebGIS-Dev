/**
 * 底图配置 — 单一真相源（SSOT）
 *
 * 职责：
 *   1. LAYER_SOURCE_DEFINITIONS — 所有底图定义的权威来源
 *      ├─ url 字段：plaintext 模板（含占位符），供 Cesium 通过 getDescriptorById() 自动派生
 *      └─ createSource 工厂：OL 引擎运行时调用，注入 token/代理等上下文
 *   2. TileSourceDescriptor + getDescriptorById() — Cesium 描述符自动派生（替代已删除的 sourceDescriptors.ts）
 *   3. BASEMAP_PRESETS (re-export) — 预设目录（实际定义在 basemapPresets.ts）
 *
 * ⚠️ URL 二字段的分工（不可合并）：
 *   - url        → 静态模板，Cesium 直接消费；占位符（{tiandituTk}/{ovitalTdtkey}/{customUrl}）由 Cesium 侧替换
 *   - createSource → OL 工厂函数；运行时会注入 tiandituTk/ovitalTdtkey/customUrl，且可能叠加代理/适配器逻辑
 *   二者结构不同（如天地图 url 含 &tk={tiandituTk}，createSource 用 buildTiandituUrl 拼 tk），
 *   JS 对象字面量无法自引用（无法在 createSource 内写 def.url），故接受"写两次"的现实。
 *
 * ⚠️ 增删改底图时的同步清单：
 *   - 必改：本文件的 LAYER_SOURCE_DEFINITIONS 一条定义（url + createSource + 元数据）
 *   - 必改：basemapPresets.ts 中的 preset（若需出现在预设列表中）
 *   - 无需改：Cesium 描述符（getDescriptorById 自动派生）
 *   - 无需改：sourceDescriptors.ts（已删除）
 */

import type { LayerCategory, LayerGroup, LayerSourceDefinition } from './basemapCore';
import group1 from './definitions/group-1';
import group2 from './definitions/group-2';
import group3 from './definitions/group-3';
import group4 from './definitions/group-4';

// 类型与工具函数的公共面保持不变：调用方仍可从 basemapConfig 入口取用
export * from './basemapCore';

export { BASEMAP_PRESETS, DEFAULT_BASEMAP_PRESET_ID } from '@common/basemap/basemapPresets';
export type { BasemapPresetDefinition } from '@common/basemap/basemapPresets';

// ========== 配置1：图层源定义（按分组聚合，顺序与拆分前一致） ==========
export const LAYER_SOURCE_DEFINITIONS: LayerSourceDefinition[] = [
    ...group1,
    ...group2,
    ...group3,
    ...group4,
];


// ========== Cesium 描述符自动派生（SSOT：从 LAYER_SOURCE_DEFINITIONS 派生，替代已删除的 sourceDescriptors.ts） ==========

/** 引擎无关的瓦片源描述符（Cesium 引擎使用）；字段与 LayerSourceDefinition 子集对齐，但不包含 createSource */
export type TileSourceDescriptor = {
    id: string;
    name: string;
    category: LayerCategory;
    group: LayerGroup;
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

/** 内部索引：id → LayerSourceDefinition 映射，供 getDescriptorById 查表用 */
const LAYER_SOURCE_MAP = new Map(LAYER_SOURCE_DEFINITIONS.map((d) => [d.id, d]));

/** 运行时密钥池类型：与后端 api_keys 表 key_name 一一对应 */
export type RuntimeTokenPoolKey = 'tianditu_tk' | 'ovital_tdtkey';

/**
 * 根据图层 ID 解析其运行时密钥池（SSOT：依据 needsContext 声明判定，杜绝字符串猜测）
 * 供容灾轮换使用：图层失败 → 判定所属密钥池 → 轮换该池备用 key
 * @param layerId 图层源 ID
 * @returns 密钥池 key；非 token 依赖图层返回 null
 */
export function resolveRuntimeTokenPoolKey(layerId: string): RuntimeTokenPoolKey | null {
    const def = LAYER_SOURCE_MAP.get(String(layerId || '').trim());
    if (!def?.needsContext?.length) return null;
    if (def.needsContext.includes('tiandituTk')) return 'tianditu_tk';
    if (def.needsContext.includes('ovitalTdtkey')) return 'ovital_tdtkey';
    return null;
}

/**
 * 根据 id 获取 Cesium 兼容的图层描述符
 * 从 LAYER_SOURCE_DEFINITIONS 自动派生（主字段直接复制），无需人工维护 → 彻底消除 sourceDescriptors.ts 的漂移风险
 * ⚠️ 返回值只读：嵌套字段（needsContext / wms / wmts）与原始定义共享同一引用，消费方禁止修改，否则污染 SSOT 源数据
 */
export function getDescriptorById(id: string): TileSourceDescriptor | undefined {
    const def = LAYER_SOURCE_MAP.get(id);
    if (!def) return undefined;
    return {
        id: def.id,
        name: def.name,
        category: def.category,
        group: def.group,
        serviceType: def.serviceType,
        url: def.url,
        maxZoom: def.maxZoom,
        tilePixelRatio: def.tilePixelRatio,
        subdomains: def.subdomains,
        nonStandardAdapter: def.nonStandardAdapter,
        needsContext: def.needsContext,
        wms: def.wms,
        wmts: def.wmts,
    };
}

/**
 * 获取所有描述符的 ID 列表
 * 用于 Cesium 构建图层枚举（与 LAYER_SOURCE_DEFINITIONS 同序）
 */
export function getAllDescriptorIds(): string[] {
    return LAYER_SOURCE_DEFINITIONS.map((d) => d.id);
}

