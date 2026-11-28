/**
 * 瓦片底图定义校验（V3.7.16 层定义驱动重构）
 *
 * 纯函数，零引擎依赖。约束：
 * - 错误（error）：id/order 唯一且 order 覆盖 1..N；必填字段齐全；
 *   method 取值合法；correction != 'none' 时 proxy 不得为 'direct'；
 *   wms/wmts 方法缺少必需参数；nonStandardAdapter 只允许 method='xyz'。
 * - 警告（warning）：url 为 'None' 占位（order 94/95 已知既有问题，只记录不改，
 *   见 Docs/TODO/bugfix-optimization-plan.md）——不阻断启动。
 *
 * 由 definitions/index.ts 在模块加载时调用：警告打印 console.warn，
 * 错误直接抛错（定义损坏必须启动即暴露，不得静默带病运行）。
 */

import type {
    CoordCorrection,
    ProxyMode,
    TileLayerDefinition,
    TileLoadMethod,
} from './types';

export type TileLayerValidationResult = {
    errors: string[];
    warnings: string[];
};

const VALID_METHODS: TileLoadMethod[] = ['xyz', 'wmts', 'wms', 'mvt', 'osm', 'custom'];
const VALID_CORRECTIONS: CoordCorrection[] = ['none', 'gcj2wgs', 'wgs2gcj', 'bd2wgs', 'wgs2bd'];
const VALID_PROXY_MODES: ProxyMode[] = ['direct', 'proxy', 'auto'];

/**
 * 校验一组图层定义
 * @param definitions 待校验的定义数组（应已按 order 排序）
 * @returns 错误与警告列表；错误为空才算通过
 */
export function validateTileLayerDefinitions(
    definitions: readonly TileLayerDefinition[],
): TileLayerValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const seenIds = new Set<string>();
    const seenOrders = new Set<number>();

    for (const def of definitions) {
        const tag = def?.id ? `图层 ${def.id}` : `图层(order=${def?.order})`;

        if (!def || typeof def !== 'object') {
            errors.push('存在非对象图层定义');
            continue;
        }
        if (!def.id || typeof def.id !== 'string') {
            errors.push(`${tag} 缺少 id`);
            continue;
        }
        if (seenIds.has(def.id)) errors.push(`${tag} 的 id 重复`);
        seenIds.add(def.id);

        if (!Number.isInteger(def.order) || def.order < 1) {
            errors.push(`${tag} 的 order 非正整数：${def.order}`);
        } else {
            if (seenOrders.has(def.order)) errors.push(`${tag} 的 order 重复：${def.order}`);
            seenOrders.add(def.order);
        }

        for (const key of ['name', 'catalogCategory', 'provider', 'coord', 'description'] as const) {
            if (!def[key]) errors.push(`${tag} 缺少 ${key}`);
        }

        if (!VALID_METHODS.includes(def.method)) {
            errors.push(`${tag} 的 method 非法：${def.method}`);
            continue;
        }

        if (def.method !== 'custom' && !def.url) {
            errors.push(`${tag} 的 url 为空（仅 custom 允许空 url）`);
        }
        if (def.url === 'None') {
            warnings.push(`${tag} 的 url 为 'None' 占位条目（已知既有问题，未修复）`);
        }

        const correction = def.correction || 'none';
        if (!VALID_CORRECTIONS.includes(correction)) {
            errors.push(`${tag} 的 correction 非法：${def.correction}`);
        }
        const proxy = def.proxy || 'auto';
        if (!VALID_PROXY_MODES.includes(proxy)) {
            errors.push(`${tag} 的 proxy 非法：${def.proxy}`);
        }
        if (correction !== 'none' && proxy === 'direct') {
            errors.push(`${tag} 纠偏 ${correction} 只能在 VPS 代理上做，proxy 不得为 'direct'`);
        }

        if (def.method === 'wms' && !def.wms?.layers) {
            errors.push(`${tag} 的 wms 缺少 layers 参数`);
        }
        if (def.method === 'wmts' && (!def.wmts?.layer || !def.wmts?.matrixSet)) {
            errors.push(`${tag} 的 wmts 缺少 layer 或 matrixSet 参数`);
        }
        if (def.nonStandardAdapter && def.method !== 'xyz') {
            errors.push(`${tag} 的 nonStandardAdapter 只允许 method='xyz'`);
        }
        if (def.engines) {
            for (const engine of def.engines) {
                if (engine !== 'ol' && engine !== 'cesium') {
                    errors.push(`${tag} 的 engines 含非法值：${engine}`);
                }
            }
        }
    }

    // order 必须覆盖 1..N（URL 参数 l 的 1-based 序号契约依赖它）
    const n = definitions.length;
    for (let order = 1; order <= n; order++) {
        if (!seenOrders.has(order)) {
            errors.push(`order 缺失：${order}（应覆盖 1..${n}）`);
        }
    }

    return { errors, warnings };
}
