/**
 * 天地图矢量图层字典（20 层默认集 + 完整语义，V2）。
 *
 * 功能：为全量矢量抓取提供“层码 → 中文含义 → 关键属性 → 拓扑策略”的唯一映射；
 *   前端多选 UI 与腾讯/高德未来字典复用同形状（code/label/desc/keys/rule）。
 * 参数：无（纯常量 + 归一化 helper）。
 * 返回：ALL_TDT_VECTOR_LAYERS / TDT_VECTOR_LAYER_META / normalizeTdtLayerSelection / tdtVectorLayerOptions。
 * 核心逻辑：码表与语义来自官方样式审计（normal 样式 487 样式层 → 73 源层 + 实测 9 城 z4~z18），
 *   默认集与 CLI `tdt_vector_fetch.mjs` 的 DEFAULT_LAYERS 严格对齐（20 码），保证前端/CLI 互通；
 *   rule 字段映射拓扑策略（BV/AR 直出、CE 按 elemid 合、AP 按 objectid、CK/BM 按 S8 融合、点线裁剪去重）。
 */

/** 默认 20 个矢量层码（顺序与 mjs DEFAULT_LAYERS 一致，保证 CLI/前端互通） */
export const ALL_TDT_VECTOR_LAYERS = [
    'BI', 'BV', 'CE', 'CK', 'BM', 'BK', 'AA', 'AB', 'AP', 'AD', 'AM', 'respt',
    'BA', 'AN', 'AR', 'AW', 'AF', 'CA', 'BN', 'AX',
];

/**
 * 层码 → 元数据（label 中文含义 / geom 几何 / keys 关键属性 / rule 拓扑策略）。
 * 语义与置信度来自官方样式 + 瓦片实测：A6/V1 是数据生产批次码（非行政区），K0 才是城市码，
 * B1 是 POI 分类码，S8 按图层分表（CK 绿地 / BM 水体 / BI 分类），AP 为中位约 1 公顷的地块单元。
 */
export const TDT_VECTOR_LAYER_META: Record<string, { label: string; geom: string; keys: string[]; rule: string; desc: string }> = {
    BI: { label: 'POI/单位点', geom: 'point', keys: ['S8', 'M2', 'P5', 'W2', 'Z5', 'B1', 'F5'], rule: 'point-dedup', desc: '兴趣点/单位，B1 为 6 位 POI 分类码、F5 为稳定 id' },
    BV: { label: '行政区划/国界面', geom: 'polygon', keys: ['Z5'], rule: 'passthrough', desc: '国/省/市多级混装，低 zoom 含外国，原样直出不做拓扑' },
    CE: { label: '建筑面', geom: 'polygon', keys: ['elemid', 'A6', 'h', 'floor', 'Z5', 'I8'], rule: 'merge-by-elemid', desc: '建筑轮廓，elemid 两套编码并存，h=米、floor≡h/3' },
    CK: { label: '绿地/植被覆盖面', geom: 'polygon', keys: ['S8'], rule: 'fuse-by-S8', desc: '覆盖绿地面（样式填 #CEEAD6），S8 按层分表' },
    BM: { label: '水体面', geom: 'polygon', keys: ['S8'], rule: 'fuse-by-S8', desc: '河湖渠池水面，S8 与 CK 数值可重叠但语义不同' },
    BK: { label: '水系名称注记线', geom: 'polyline', keys: ['S8', 'Z5'], rule: 'line-dedup', desc: '放水名的注记线，非水体本身（对标 respt 之于建筑）' },
    AA: { label: '城市道路线', geom: 'polyline', keys: ['QQ', 'A6', 'X3', 'Z5', 'V1', 'JF', 'D3', 'J9'], rule: 'line-dedup', desc: 'A6/V1 为数据生产批次码（非行政区），J9 公路编号，X3/D3 分级' },
    AB: { label: '无名支路/巷道', geom: 'polyline', keys: ['X3', 'V1', 'D3'], rule: 'line-dedup', desc: 'z17+ 补充路网，无名称无编号，接缝不可拼' },
    AP: { label: '街区/地块单元', geom: 'polygon', keys: ['objectid'], rule: 'merge-by-objectid', desc: '最小面单元（中位约 1 公顷，非区级区划），objectid 跨瓦同值' },
    AD: { label: '地铁站/出入口', geom: 'point', keys: ['K0', 'A6', 'C8', 'Z5', 'E0', 'L1', 'H7'], rule: 'point-dedup', desc: 'K0 为真实城市码，A6=450101 站 / 450190 出入口' },
    AM: { label: '轨道交通线', geom: 'polyline', keys: ['K0', 'C8', 'Z5', 'C2'], rule: 'line-dedup', desc: '地铁/轨道线路，C2 为线路号' },
    respt: { label: '楼号标注点', geom: 'point', keys: ['elemid', 'lzh'], rule: 'point-dedup', desc: '楼号注记点，按 elemid 挂接 CE 同名楼' },
    BA: { label: '铁路线', geom: 'polyline', keys: ['A6', 'Z5'], rule: 'line-dedup', desc: '铁路线（官方样式灰底＋白虚线），Z5 为线名如「京广线」' },
    AN: { label: '水面轮廓线', geom: 'polyline', keys: ['S8'], rule: 'line-dedup', desc: '水体面 BM 的边线（同色描边），z10+' },
    AR: { label: '低 zoom 面状水体', geom: 'polygon', keys: ['S8', 'Z8'], rule: 'passthrough', desc: '海/大湖/大河面（z2~11），S8 取 0~7，原样直出' },
    AW: { label: '低 zoom 水系线', geom: 'polyline', keys: ['S8'], rule: 'line-dedup', desc: '岸线/河线（z4~11），S8 取 0~5' },
    AF: { label: '行政地名点', geom: 'point', keys: ['B7', 'O4', 'I8'], rule: 'point-dedup', desc: '国/省/市/区县注记点，O4=1 首都 / 2 市 / 4 区县' },
    CA: { label: '街道/乡镇地名点', geom: 'point', keys: ['Z5', 'F5', 'I8', 'S8'], rule: 'point-dedup', desc: '街道/乡镇名（z8~11），F5 为稳定 id' },
    BN: { label: '河流名注记点', geom: 'point', keys: ['B7', 'S8'], rule: 'point-dedup', desc: '河流名称注记（水系蓝），B7 为水名如「黄河」' },
    AX: { label: 'POI 补充点', geom: 'point', keys: ['S8', 'A6', 'Z5'], rule: 'point-dedup', desc: '文教/场馆等补充 POI（z12~19），Z5 为名称' },
};

/**
 * 归一化用户多选（多选勾选 + 全选语义）。
 * @param {string[]|string} input 层码数组或逗号字符串，空/all/缺省 → 全量
 * @returns {string[]} 去重大写后的有效层码（非法码丢弃；全空回退全量防误操作）
 */
export function normalizeTdtLayerSelection(input: any) {
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
        { value: 'all', label: `全部图层（${ALL_TDT_VECTOR_LAYERS.length} 层）`, desc: '一次抓取全部默认矢量层，分层入库' },
        ...ALL_TDT_VECTOR_LAYERS.map((code) => ({
            value: code,
            label: `${code} · ${TDT_VECTOR_LAYER_META[code].label}`,
            desc: TDT_VECTOR_LAYER_META[code].desc,
        })),
    ];
}
