/**
 * useCesiumCrsRedeclare.js — 三维图层「重设源坐标系」
 *
 * 场景：导入时把 CGCS2000 平面坐标判成了 WGS84，几何已按错误假设压到 EPSG:4326，
 * 屏幕上位置是错的。此时不该让用户重新上传，而应允许「把同一批原始数值重新解释成
 * 另一个源坐标系」。
 *
 * 前提：必须拿到重投影**之前**的原始几何 —— 由 `crs/sourceSnapshot` 在导入期留存。
 * 三维侧目前只有 GeoJSON 登记快照：SHP 在解析期已按 `.prj` / override 走完，
 * KML 的坐标在解析期由 srsName 决定并完成变换，两者都不存在「原始数值另有归属」的问题。
 *
 * 实现策略：不手写第二套数据源装配，而是把快照重新包成 File 走一遍 `loadGeoJSON` ——
 * 贴地、拔高、叠放定序、样式初值全部复用导入路径，避免两条链路行为漂移。代价是
 * 相机飞一次、成功提示两条，属于可接受的一致性成本。
 */

import { getSourceSnapshot, updateSnapshotCrs } from '@common/data-import/crs/sourceSnapshot';
import { ensureProjectionAvailable } from '@common/data-import/crs/crsUtils';
import { loadGeoJSON } from './loaders/geojsonLoader';
import { flyToEntity } from './loaders/utils.js';

/** TOC 三维节点 id 前缀（与 cesiumLayerNodeBuilder 的 CESIUM_NODE_PREFIX 同值） */
const CESIUM_NODE_PREFIX = 'cesium:';

/**
 * 工厂函数
 * @param {Object} ctx
 * @param {Function} ctx.getCesium Cesium 命名空间访问器
 * @param {Function} ctx.getViewer Viewer 访问器
 * @param {Object}   ctx.message 消息系统
 * @param {Object}   ctx.loadedDataSources 三维数据源记录数组（ref）
 * @param {Object}   ctx.nextId 资源 id 计数器（{ current:number }，与导入共用）
 * @returns {{ redeclareLayerCrs: Function }}
 */
export function createCesiumCrsRedeclareFeature({
    getCesium,
    getViewer,
    message = {},
    loadedDataSources,
    nextId,
}) {
    /**
     * 功能：剥掉 TOC 节点 id 的引擎前缀，得到数据源记录 id。
     * 参数：layerId —— TOC 节点 id（可能形如 `cesium:geojson_3`）
     * 返回：数据源记录 id
     */
    function normalizeLayerId(layerId) {
        const raw = String(layerId || '').trim();
        return raw.startsWith(CESIUM_NODE_PREFIX) ? raw.slice(CESIUM_NODE_PREFIX.length) : raw;
    }

    /**
     * 功能：用新的源坐标系重建该三维图层（几何来自导入期快照）。
     * 参数：
     *   payload.layerId — TOC 节点 id 或数据源记录 id
     *   payload.crs     — 新的源坐标系：EPSG 编码 / `+proj=` 定义串
     * 返回：Promise<boolean> — 是否完成
     */
    async function redeclareLayerCrs({ layerId, crs } = {}) {
        const id = normalizeLayerId(layerId);
        const nextSource = String(crs || '').trim();
        if (!id) return false;
        if (!nextSource) {
            message.warning?.('请先选择要声明的源坐标系');
            return false;
        }

        const snapshot = getSourceSnapshot(id);
        if (!snapshot) {
            message.warning?.(
                '该图层未保留导入前的原始几何，无法重设坐标系。请重新上传并在「源坐标系」中直接指定。',
                { duration: 5200 },
            );
            return false;
        }

        const list = loadedDataSources?.value || [];
        const record = list.find((item) => String(item?.id) === id);
        if (!record) {
            message.warning?.('未找到目标图层');
            return false;
        }
        if (String(record.type) !== 'geojson') {
            message.warning?.('三维侧仅 GeoJSON 图层保留了原始几何，暂不支持重设坐标系');
            return false;
        }

        // 与导入路径同一入口：CGCS2000 分带 / UTM 本地生成，任意 EPSG 走后端兜底
        const resolved = await ensureProjectionAvailable(nextSource);
        if (!resolved) {
            message.error?.(`无法获取坐标系定义：${nextSource}`, { closable: true, duration: 0 });
            return false;
        }

        const fileName = String(record.name || 'redeclare.geojson');
        const file = new File([JSON.stringify(snapshot.geojson)], fileName, {
            type: 'application/json',
        });

        let rebuilt;
        try {
            rebuilt = await loadGeoJSON({
                file,
                overrideCrs: resolved,
                // 快照已按原 id 存在，这次重建不得再登记一份（否则临时 id 会挤掉 LRU）
                rememberSnapshot: false,
                // 静默：不弹「加载成功」也不飞相机 —— 反馈与定位由本模块在句柄换完后统一给出
                silent: true,
                getCesium,
                getViewer,
                message,
                loadedDataSources,
                nextId,
            });
        } catch (error) {
            message.error?.(
                `按 ${resolved} 重新投影失败，原图层未改动：${error?.message || error}`,
                { closable: true, duration: 0 },
            );
            return false;
        }

        // 新数据源已就位再卸旧的：中途失败时原图层仍然完好
        try {
            getViewer()?.dataSources?.remove(record.entity, true);
        } catch {
            /* 句柄可能已随场景销毁，忽略 */
        }

        // 用原 id / 原名替换，保持 TOC 位置；显隐与透明度由元数据店按 id 差量保留
        const oldIndex = list.findIndex((item) => String(item?.id) === id);
        const others = list.filter((item) => String(item?.id) !== id && item.id !== rebuilt.id);
        const replaced = { ...rebuilt, id, name: record.name, type: record.type };
        const insertAt = oldIndex < 0 ? others.length : Math.min(oldIndex, others.length);
        loadedDataSources.value = [
            ...others.slice(0, insertAt),
            replaced,
            ...others.slice(insertAt),
        ];

        // 快照只改「解释方式」，几何仍是原始数值 → 支持连续改判
        updateSnapshotCrs(id, resolved);

        // 静默重建的唯一一次定位：句柄已换成修正后的几何，此时飞才有意义
        try {
            flyToEntity(getViewer(), getCesium(), replaced.entity, 'geojson');
        } catch {
            /* 定位失败不影响重建结果 */
        }

        message.success?.(`已将源坐标系重设为 ${resolved}，图层已按原始数值重新投影`);
        return true;
    }

    return { redeclareLayerCrs };
}
