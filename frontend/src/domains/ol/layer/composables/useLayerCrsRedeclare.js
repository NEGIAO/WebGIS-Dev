/**
 * useLayerCrsRedeclare.js — 图层「重设源坐标系」
 *
 * 场景：导入时坐标系判错（无 .prj 的平面坐标、.prj 缺 AUTHORITY、误选带号……），
 * 数据已经按错误假设压平到 EPSG:3857，屏幕上位置是错的。此时不该让用户重新上传，
 * 而应允许「把同一批原始数值重新解释成另一个源坐标系」。
 *
 * 前提：必须拿到重投影**之前**的原始几何 —— 由 `crs/sourceSnapshot` 在导入期留存。
 * 没有快照（大图层、3D 导入、刷新后）时明确拒绝，不做「基于已投影坐标反推」的伪修复：
 * 那种反推对任何源坐标系都能算出合法经纬度，只会把错误藏得更深。
 *
 * 与 `useCoordinateSystemConversion.toggleLayerCRS` 的分工：
 * - toggleLayerCRS：几何已经正确，只做 WGS84 ⇄ GCJ-02 的**偏移量**换算；
 * - 本模块：几何的**解释方式**是错的，换一个源 CRS 重新投影。
 * 两者不可合并：前者不改变数据来源，后者改变坐标系归属。
 */

import GeoJSON from 'ol/format/GeoJSON';
import { reprojectGeoJSON } from '@common/data-import/crs-engine';
import { ensureProjectionAvailable } from '@common/data-import/crs/crsUtils';
import {
    getSourceSnapshot,
    updateSnapshotCrs,
} from '@common/data-import/crs/sourceSnapshot';

const MAP_CRS = 'EPSG:3857';
const GEO_CRS = 'EPSG:4326';

/**
 * 工厂函数
 * @param {Object} ctx
 * @param {Object} ctx.mapInstanceRef 地图实例 ref
 * @param {Array}  ctx.userDataLayers 用户图层数组
 * @param {Object} ctx.message 消息系统
 * @param {Function} ctx.ensureFeatureId 要素 ID 兜底（与导入路径同一实现，保证属性表主键一致）
 * @param {Function} ctx.serializeManagedFeatures 要素序列化（用于 TOC 属性表展示）
 * @param {Function} ctx.normalizeLayerMetadata 元数据规范化
 * @param {Function} ctx.emitUserLayersChange 广播图层变化
 * @returns {{ redeclareLayerCrs: Function }}
 */
export function createLayerCrsRedeclareFeature({
    mapInstanceRef,
    userDataLayers = [],
    message = {},
    ensureFeatureId = () => {},
    serializeManagedFeatures = () => [],
    normalizeLayerMetadata = (m) => m,
    emitUserLayersChange = () => {},
}) {
    /**
     * 功能：用新的源坐标系重新投影该图层（几何来自导入期快照）。
     * 参数：
     *   payload.layerId — 托管图层 id
     *   payload.crs     — 新的源坐标系：EPSG 编码 / WKT 别名 / `+proj=` 定义串
     * 返回：Promise<boolean> — 是否完成
     */
    async function redeclareLayerCrs({ layerId, crs } = {}) {
        const id = String(layerId || '').trim();
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

        const layerData = userDataLayers.find((item) => String(item?.id) === id);
        if (!layerData) {
            message.warning?.('未找到目标图层');
            return false;
        }
        const vectorSource = layerData.layer?.getSource?.();
        if (!vectorSource) {
            message.warning?.('该图层不是矢量图层，无法重设坐标系');
            return false;
        }

        // 1. 解析并注册定义：CGCS2000 分带 / UTM 走本地公式，任意其它 EPSG 走后端兜底。
        //    必须用异步版本 —— 导入路径用的就是它，同步的 ensureCrsDef 只认内置表，
        //    否则会出现「同一个 EPSG 能导入、却不能重设」的能力断层。
        const resolvedSource = await ensureProjectionAvailable(nextSource);
        if (!resolvedSource) {
            message.error?.(`无法获取坐标系定义：${nextSource}`, { closable: true, duration: 0 });
            return false;
        }

        // 2. 原始几何 → 经纬度（逐要素降级：坏点只丢该要素）
        let stats = { droppedFeatures: 0, invalidPoints: 0 };
        const geojson = reprojectGeoJSON(snapshot.geojson, resolvedSource, GEO_CRS, {
            onInvalid: (result) => {
                stats = result;
            },
        });

        // 3. 经纬度 → 地图投影（OL 负责，避免自己再算一次）
        const features = new GeoJSON().readFeatures(geojson, {
            dataProjection: GEO_CRS,
            featureProjection: MAP_CRS,
        });
        if (!features.length) {
            message.error?.('按新坐标系转换后没有有效要素，已取消（原图层未改动）', {
                closable: true,
                duration: 0,
            });
            return false;
        }

        // 4. 替换要素：ID 规则与导入路径一致，属性表 / 查询才认得出同一批要素
        features.forEach((feature, index) => {
            ensureFeatureId(feature, layerData.name, index);
        });
        vectorSource.clear(true);
        vectorSource.addFeatures(features);

        // 5. 元数据回写：属性面板展示的「坐标系」也随之更新
        const nextStandardTocItem = layerData.metadata?.standardTocItem
            ? {
                  ...layerData.metadata.standardTocItem,
                  metadata: {
                      ...(layerData.metadata.standardTocItem.metadata || {}),
                      sourceCrs: resolvedSource,
                  },
              }
            : layerData.metadata?.standardTocItem;
        layerData.metadata = normalizeLayerMetadata(
            {
                ...(layerData.metadata || {}),
                sourceCrs: resolvedSource,
                ...(nextStandardTocItem ? { standardTocItem: nextStandardTocItem } : null),
            },
            features,
        );
        layerData.featureCount = features.length;
        layerData.features = serializeManagedFeatures(features, layerData.name);

        // 6. 快照只改「解释方式」，几何仍是原始数值 → 支持连续改判
        updateSnapshotCrs(id, resolvedSource);

        // 7. 标注样式缓存以 feature 对象为键：换了新要素后旧键成为强引用垃圾，必须清
        if (layerData.labelStyleCache && typeof layerData.labelStyleCache.clear === 'function') {
            layerData.labelStyleCache.clear();
        }

        layerData.layer?.changed?.();
        emitUserLayersChange?.();

        const extent = vectorSource.getExtent?.();
        if (extent && Number.isFinite(extent[0]) && mapInstanceRef?.value) {
            mapInstanceRef.value.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                duration: 800,
            });
        }

        if (stats.droppedFeatures > 0) {
            message.warning?.(
                `已重设为 ${resolvedSource}，其中 ${stats.droppedFeatures} 个要素落在有效范围外被跳过`,
                { duration: 5200 },
            );
        } else {
            message.success?.(`已将源坐标系重设为 ${resolvedSource}，共 ${features.length} 个要素`);
        }
        return true;
    }

    return { redeclareLayerCrs };
}
