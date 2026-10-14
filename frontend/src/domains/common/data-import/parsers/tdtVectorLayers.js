/**
 * 天地图矢量图层字典（12 层全量，初版）。
 *
 * 功能：为全量矢量抓取提供“层码 → 中文含义 → 关键属性 → 拓扑策略”的唯一映射；
 *   前端多选 UI 与腾讯/高德未来字典复用同形状（code/label/desc/keys/rule）。
 * 参数：无（纯常量 + 归一化 helper）。
 * 返回：ALL_TDT_VECTOR_LAYERS / TDT_VECTOR_LAYER_META / normalizeTdtLayerSelection。
 * 核心逻辑：码表与语义来自《天地图矢量瓦片全量逆向》§3-§5（12 码 + 三编码 + 分级码表）；
 *   rule 字段映射 mjs §7 通用拓扑规则（BV直出/CE按id合/CK-BM按S8合/点线裁剪去重/残余打标）。
 */

/** 全部 12 个矢量层码（顺序与 mjs ALL_LAYERS 一致，保证 CLI/前端互通） */
export const ALL_TDT_VECTOR_LAYERS = ['BI', 'BV', 'CE', 'CK', 'BM', 'BK', 'AA', 'AB', 'AP', 'AD', 'AM', 'respt'];

/**
 * 层码 → 元数据（label 中文含义 / geom 几何 / keys 关键属性 / rule 拓扑策略）。
 * 语义置信度见全量逆向 §11（AP 区划面高 / AB 无名短线中 / CK 绿地中 / BM 水面高）。
 */
export const TDT_VECTOR_LAYER_META = {
    BI: { label: 'POI/单位点', geom: 'point', keys: ['S8', 'M2', 'P5', 'W2', 'Z5', 'B1', 'F5'], rule: 'point-dedup', desc: '兴趣点/单位注记点，F5 为稳定 id' },
    BV: { label: '行政区画面', geom: 'polygon', keys: ['Z5'], rule: 'passthrough', desc: '行政底图面，原样直出不做任何拓扑' },
    CE: { label: '建筑面', geom: 'polygon', keys: ['elemid', 'A6', 'h', 'floor'], rule: 'merge-by-elemid', desc: '建筑轮廓面，elemid 只判非空（两套编码并存）' },
    CK: { label: '土地利用/绿地面', geom: 'polygon', keys: ['S8'], rule: 'fuse-by-S8', desc: '土地利用与绿地覆盖面，按 S8 分组融合' },
    BM: { label: '水面', geom: 'polygon', keys: ['S8'], rule: 'fuse-by-S8', desc: '水面（与 BK 注记 S8 配对），按 S8 分组融合' },
    BK: { label: '水系注记线', geom: 'polyline', keys: ['S8', 'Z5'], rule: 'line-dedup', desc: '水系名称注记线（对标 respt 之于建筑）' },
    AA: { label: '道路线', geom: 'polyline', keys: ['QQ', 'A6', 'X3', 'Z5', 'V1', 'JF', 'D3', 'J9'], rule: 'line-dedup', desc: '道路分级分区（QQ0-3/X3 六值/J9 公路编号）' },
    AB: { label: '无名短线', geom: 'polyline', keys: ['X3', 'V1', 'D3'], rule: 'line-dedup', desc: '支路/内部路候选，中位约 60m' },
    AP: { label: '区级行政区划面', geom: 'polygon', keys: ['objectid'], rule: 'merge-by-objectid', desc: '区级区画面，objectid（sint64）跨瓦同值' },
    AD: { label: '地铁站口点', geom: 'point', keys: ['K0', 'A6', 'C8', 'Z5', 'E0', 'L1', 'H7'], rule: 'point-dedup', desc: '地铁站口注记点' },
    AM: { label: '轨道交通线', geom: 'polyline', keys: ['K0', 'C8', 'Z5', 'C2'], rule: 'line-dedup', desc: '地铁/轨道线路' },
    respt: { label: '楼号标注点', geom: 'point', keys: ['elemid', 'lzh'], rule: 'point-dedup', desc: '楼号注记点，elemid 挂接 CE 同 id 楼名' },
};

/**
 * 归一化用户多选（多选勾选 + 全选语义）。
 * @param {string[]|string} input 层码数组或逗号字符串，空/all/缺省 → 全量
 * @returns {string[]} 去重大写后的有效层码（非法码丢弃；全空回退全量防误操作）
 */
export function normalizeTdtLayerSelection(input) {
    if (!input) return ALL_TDT_VECTOR_LAYERS.slice();
    const list = Array.isArray(input) ? input : String(input).split(',');
    const cleaned = [...new Set(list.map((s) => String(s).trim()).filter(Boolean).map((s) => (s === 'respt' ? 'respt' : s.toUpperCase())))];
    if (!cleaned.length || cleaned.includes('ALL')) return ALL_TDT_VECTOR_LAYERS.slice();
    const valid = cleaned.filter((c) => ALL_TDT_VECTOR_LAYERS.includes(c));
    return valid.length ? valid : ALL_TDT_VECTOR_LAYERS.slice();
}

/**
 * 下拉/勾选框选项（含 all 全选入口，由面板渲染）。
 * @returns {{value:string,label:string,desc:string}[]}
 */
export function tdtVectorLayerOptions() {
    return [
        { value: 'all', label: '全部图层（12 层）', desc: '一次抓取全部矢量层，分层入库' },
        ...ALL_TDT_VECTOR_LAYERS.map((code) => ({
            value: code,
            label: `${code} · ${TDT_VECTOR_LAYER_META[code].label}`,
            desc: TDT_VECTOR_LAYER_META[code].desc,
        })),
    ];
}
