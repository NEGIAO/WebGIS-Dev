/**
 * dataSourceDisplay.ts
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
import { applyTilesetMaterial } from './loaders/tilesetLoader';

import {
    applyEntityListOpacity,
    applyVectorDataSourceOpacity,
    invalidateVectorColorSnapshots,
} from './display/vectorColorScaling';

/** 兼容既有导入方：applyEntityListOpacity 实现已下沉到 display/vectorColorScaling */
export { applyEntityListOpacity };


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
function getTilesetState(tileset: any, record?: any): { mode: string; alpha: number } {
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
export function setTilesetMaterialMode(Cesium: any, record: any, mode: string): void {
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
export function setRecordVisible(_Cesium: any, record: any, visible: boolean): void {
    const entity = toRaw(record?.entity);
    if (!entity) return;
    const next = !!visible;

    // DataSource / Cesium3DTileset / Model / ImageryLayer / Entity 均支持 .show
    entity.show = next;
    // Entity 形态 GLTF：ModelGraphics.show 同步，避免 Entity.show 与 model.show 不一致
    if (entity.model) {
        try { entity.model.show = next; } catch { /* ignore */ }
    }

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
export function setRecordOpacity(
    Cesium: any,
    record: any,
    opacity: number,
    onApplied?: () => void,
): void {
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

/**
 * 矢量透明度最小重算间隔（ms）。
 *
 * 单次重算要对「实体数 × 10 个颜色目标」逐个写 Cesium 属性，大 GeoJSON 下是
 * 数百毫秒级的主线程占用。仅用 rAF 合并等于允许 60 次/秒，拖动滑杆时主线程被
 * 连续占满 → 界面卡死。此处再叠一层时间节流：拖动过程中约 11 次/秒，且**保证
 * 末值一定落地**（拖拽松手后不会停在中间值）。
 */
const VECTOR_OPACITY_MIN_INTERVAL_MS = 90;

/** rAF + 时间节流合并：滑杆高频拖动时限制重算频率，但最终值必达 */
function scheduleVectorOpacity(Cesium: any, dataSource: any, alpha: number, onApplied?: () => void): void {
    let pending = vectorOpacityPending.get(dataSource);
    if (!pending) {
        pending = { alpha, scheduled: false, onApplied: null, timer: null, lastRun: 0 };
        vectorOpacityPending.set(dataSource, pending);
    }
    pending.alpha = alpha;
    pending.onApplied = typeof onApplied === 'function' ? onApplied : null;
    // 已有排队（rAF 或定时器）时只更新目标值，不重复排队
    if (pending.scheduled) return;
    pending.scheduled = true;

    const run = () => {
        pending.scheduled = false;
        pending.timer = null;
        pending.lastRun = performance.now();
        applyVectorDataSourceOpacity(Cesium, dataSource, pending.alpha);
        pending.onApplied?.();
    };

    const elapsed = performance.now() - pending.lastRun;
    if (elapsed >= VECTOR_OPACITY_MIN_INTERVAL_MS) {
        requestAnimationFrame(run);
        return;
    }
    // 节流窗口内：延后一次执行（读取的是最新的 pending.alpha，故末值必达）
    pending.timer = setTimeout(run, VECTOR_OPACITY_MIN_INTERVAL_MS - elapsed);
}

/**
 * 对矢量 DataSource 应用样式补丁（TOC 右键「样式设置」/ 样式页签定向修改）。
 *
 * 与透明度缩放的分工：本函数写入**绝对颜色**，透明度滑杆仍按快照做 alpha 缩放。
 * 换色后主动丢弃该数据源的透明度快照，使下次拖滑杆按新基色重新取基准，
 * 否则会出现「改完颜色一拖透明度又跳回旧色」的错觉。
 *
 * 只处理纯色材质：虚线 / 箭头 / 贴图等特效材质保持原样（改色会丢语义）。
 *
 * @param {object} Cesium Cesium 命名空间
 * @param {object} dataSource Cesium.DataSource
 * @param {{fillColor?:string, strokeColor?:string, fillOpacity?:number, strokeWidth?:number}} patch
 * @param {Function} [onApplied] 应用后回调（补 requestRender）
 * @returns {boolean} 是否有实体被改动（false = 该数据源无可着色图元）
 */
export interface VectorStylePatch {
    fillColor?: string;
    strokeColor?: string;
    fillOpacity?: number;
    strokeWidth?: number;
}

export function applyVectorDataSourceStyle(
    Cesium: any,
    dataSource: any,
    patch: VectorStylePatch = {},
    onApplied?: () => void,
): boolean {
    const entities = dataSource?.entities?.values;
    if (!Cesium || !Array.isArray(entities) || !entities.length) return false;

    const toColor = (css?: string, alpha?: number) => {
        if (!css) return null;
        try {
            const color = Cesium.Color.fromCssColorString(String(css));
            return Number.isFinite(alpha) ? color.withAlpha(alpha) : color;
        } catch {
            return null;
        }
    };

    const fillAlpha = Number.isFinite(Number(patch.fillOpacity))
        ? Math.min(1, Math.max(0, Number(patch.fillOpacity)))
        : undefined;
    const fill = toColor(patch.fillColor, fillAlpha);
    const stroke = toColor(patch.strokeColor);
    const width = Number.isFinite(Number(patch.strokeWidth)) ? Number(patch.strokeWidth) : null;

    let touched = 0;
    for (const entity of entities) {
        try {
            if (entity.polygon) {
                if (fill) {
                    entity.polygon.material = new Cesium.ColorMaterialProperty(fill);
                    touched += 1;
                }
                if (stroke) {
                    entity.polygon.outlineColor = stroke;
                    touched += 1;
                }
                if (width !== null) {
                    entity.polygon.outlineWidth = width;
                    touched += 1;
                }
            }
            if (entity.polyline) {
                const lineColor = stroke || fill;
                // 仅替换纯色材质；虚线 / 箭头 / 贴图材质保留原语义。
                // 纯色有两种形态：ColorMaterialProperty（Property 包装）与裸 Color
                // （GeoJsonDataSource / KML 载入后常见），只认前者会漏改后者的线色。
                const material = entity.polyline.material;
                const isPlainColor =
                    !material ||
                    (Cesium.ColorMaterialProperty && material instanceof Cesium.ColorMaterialProperty) ||
                    (Cesium.Color && material instanceof Cesium.Color);
                if (lineColor && isPlainColor) {
                    entity.polyline.material = new Cesium.ColorMaterialProperty(lineColor);
                    touched += 1;
                }
                if (width !== null) {
                    entity.polyline.width = width;
                    touched += 1;
                }
            }
            if (entity.point && fill) {
                entity.point.color = fill;
                touched += 1;
            }
            if (entity.label && fill) {
                entity.label.fillColor = fill;
                touched += 1;
            }
        } catch {
            /* 单个实体着色失败不影响其余实体 */
        }
    }

    if (touched) invalidateVectorColorSnapshots(dataSource);
    onApplied?.();
    return touched > 0;
}

/**
 * 切换矢量 DataSource 的标注显隐（TOC 右键「开启 / 关闭标注」）。
 * @param {object} dataSource Cesium.DataSource
 * @param {boolean} visible
 * @returns {boolean} 是否存在可切换的 label（false = 该数据源没有标注）
 */
export function setVectorLabelVisible(dataSource: any, visible: boolean): boolean {
    const entities = dataSource?.entities?.values;
    if (!Array.isArray(entities)) return false;
    let touched = 0;
    for (const entity of entities) {
        if (!entity.label) continue;
        try {
            entity.label.show = !!visible;
            touched += 1;
        } catch {
            /* ignore */
        }
    }
    return touched > 0;
}
