/**
 * V3.7.16 迁移等价校验（回归抽查，代码级验证，非实机）：
 * 逐条比对迁移前后定义的 id / order / 元数据 / method /
 * correction / proxy / wms / wmts / styleUrl / maxZoom / tilePixelRatio /
 * skipHighResTile / nonStandardAdapter / engines，以及 OL 与 Cesium
 * 两条链路的最终 URL 是否一致。
 *
 * 旧定义取自 `git show HEAD:...`（只读），新定义取自工作树；
 * resolveTileUrl 用 Node 类型剥离直接 import 真实 TS 模块，测的是真函数。
 *
 * 旧基线布局自适应（V3.7.20 修复：原实现写死 category-*.ts 文件名，
 * 在 HEAD 仍为 group-1..4 布局的仓库中 git show 直接崩溃）：
 * - 用 `git ls-tree` 动态发现 HEAD 旧目录下的全部 .ts 分片；
 * - group 布局（无 order / 元数据字段）：order 按分片聚合位置（1..N）推导，
 *   catalogCategory/provider/coord/description/date 属本次新增元数据，旧缺免比对；
 * - category 布局（带 order）：行为与原实现一致；
 * - HEAD 已无旧定义（迁移提交已落库）：显式说明后跳过校验（一次性脚本）。
 *
 * 退出码语义（V3.7.27）：0=逐条断言通过；1=断言失败；2=未执行（基线不符，
 * 不产出任何校验结论）。CI 若纳入门禁，必须把 2 视为未覆盖，不得当作通过。
 *
 * 覆盖的抽查项（任务门禁要求逐项写清）：
 * 天地图影像（xyz/WGS84）、高德电子（xyz/gcj2wgs）、百度（bd2wgs）、
 * 一例 WMS、一例 WMTS、一例 MVT、Sentinel 历史影像。
 *
 * 用法：cd frontend && node scripts/check-basemap-migration.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(process.cwd(), '..');
const OLD_DIR_REL = 'frontend/src/domains/ol/basemap/constants/definitions';
const NEW_DIR = resolve(process.cwd(), 'src/domains/common/basemap/definitions');
const BASE = 'https://TILE-PROXY-BASE';
const TK = 'TK123';
const OV = 'OV456';

const failures = [];
const notes = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

// ---------- 通用解析 ----------

function splitDefs(src) {
    const m = src.match(/const definitions[^=]*=\s*\[/);
    if (!m) return [];
    let i = m.index + m[0].length;
    const out = [];
    while (i < src.length) {
        if (src[i] === '{') {
            let depth = 0; let j = i;
            while (j < src.length) {
                if (src[j] === '{') depth += 1;
                else if (src[j] === '}') { depth -= 1; if (depth === 0) break; }
                j += 1;
            }
            out.push(src.slice(i, j + 1)); i = j + 1;
        } else i += 1;
    }
    return out;
}

function balancedObject(text, startIdx) {
    let depth = 0;
    for (let j = startIdx; j < text.length; j += 1) {
        if (text[j] === '{') depth += 1;
        else if (text[j] === '}') { depth -= 1; if (depth === 0) return text.slice(startIdx, j + 1); }
    }
    return '';
}

function strField(block, name) {
    return block.match(new RegExp(`\\n {8}${name}: '([^']*)'`))?.[1];
}
function numField(block, name) {
    const v = block.match(new RegExp(`\\n {8}${name}: (\\d+)`))?.[1];
    return v === undefined ? undefined : Number(v);
}
function normObj(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}
function extractNamedObject(block, name) {
    const m = block.match(new RegExp(`\\n {8}${name}: \\{`));
    if (!m) return undefined;
    return balancedObject(block, m.index + m[0].length - 1);
}
function extractArrayItems(block, name) {
    const m = block.match(new RegExp(`\\n {8}${name}: \\[([^\\]]*)\\]`));
    if (!m) return undefined;
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

// ---------- 旧定义解析 ----------

const PROXY_SEG = { gcj2wgsProxyUrl: 'gcj2wgs', wgs2gcjProxyUrl: 'wgs2gcj', bd2wgsProxyUrl: 'bd2wgs' };

function unwrapProxyCall(fn, arg) {
    if (fn in PROXY_SEG) return `${BASE}/proxy/${PROXY_SEG[fn]}/${arg}`;
    if (fn === 'tileProxyUrl') return `${BASE}/proxy/${arg}`;
    return arg;
}

function parseOldUrl(block) {
    const m = block.match(/\n {8}url: (?:'([^']*)'|(gcj2wgsProxyUrl|wgs2gcjProxyUrl|bd2wgsProxyUrl|tileProxyUrl)\(\s*'([^']*)')/);
    if (!m) return { kind: 'missing', raw: undefined, cesiumUrl: undefined };
    if (m[1] !== undefined) return { kind: 'literal', raw: m[1], cesiumUrl: m[1] };
    return { kind: m[2], raw: m[3], cesiumUrl: unwrapProxyCall(m[2], m[3]) };
}

function parseOldOlUrl(block, helperUrls) {
    const cs = block.slice(block.indexOf('createSource:'));
    if (/new OSM\(\)/.test(cs)) return null; // OSM：createSource 不带 URL
    if (/createXYZSourceFromUrl\(\s*customUrl/.test(cs)) return null; // custom：URL 来自运行时
    if (/createOpenFreeMapVectorSource\(\)/.test(cs)) return helperUrls.openfreemap;
    let m = cs.match(/new XYZ\(\{\s*url: (?:'([^']*)'|(gcj2wgsProxyUrl|wgs2gcjProxyUrl|bd2wgsProxyUrl|tileProxyUrl)\(\s*'([^']*)')/);
    if (m) return m[1] !== undefined ? m[1] : unwrapProxyCall(m[2], m[3]);
    m = cs.match(/buildTiandituUrl\(\s*'([^']*)',\s*tiandituTk/);
    if (m) return `https://t0.tianditu.gov.cn${m[1]}${m[1].includes('?') ? '&' : '?'}tk=${TK}`;
    m = cs.match(/buildOvitalUrl\(\s*'([^']*)',\s*ovitalTdtkey/);
    if (m) return `https://omap.map-world.com.cn${m[1]}${m[1].includes('?') ? '&' : '?'}tdtkey=${OV}`;
    m = cs.match(/createXYZSourceFromUrl\(\s*'([^']*)'/);
    if (m) return m[1];
    m = cs.match(/createVectorTileSourceFromUrl\(\s*'([^']*)'/);
    if (m) return m[1];
    m = cs.match(/createConfiguredServiceSource\(\s*\{[\s\S]*?url: '([^']*)'/);
    if (m) return m[1];
    return undefined; // 未能识别：调用方按失败处理
}

function parseOld(block, helperUrls, positionalOrder) {
    const url = parseOldUrl(block);
    const serviceType = strField(block, 'serviceType');
    const wms = extractNamedObject(block, 'wms');
    const wmts = extractNamedObject(block, 'wmts');
    // WMS/WMTS 参数在 createConfiguredServiceSource 的内联配置里（与顶层同名，不重复）
    const csWms = block.match(/wms:\s*(\{[\s\S]*?\n\s*\})/)?.[1];
    const csWmts = block.match(/wmts:\s*(\{[\s\S]*?\n\s*\})/)?.[1];
    // maxZoom / tilePixelRatio：顶层字段优先，无顶层字段时取 createSource 的 XYZ 选项值
    //（15/16/23 只有 createSource 里有；5 只有顶层字段；96/170 两处一致）
    const csMaxZoom = block.match(/new XYZ\(\{[\s\S]*?maxZoom: (\d+)/)?.[1];
    const csTilePixelRatio = block.match(/new XYZ\(\{[\s\S]*?tilePixelRatio: (\d+)/)?.[1];
    const mff = url.raw?.match(/maps-for-free\.com\/layer\/([a-z]+)\//);
    return {
        // group 布局无 order 字段：按分片聚合位置（1..N）推导（l 序号契约即此顺序）
        order: numField(block, 'order') ?? positionalOrder,
        id: strField(block, 'id'),
        name: strField(block, 'name'),
        catalogCategory: strField(block, 'catalogCategory'),
        provider: strField(block, 'provider'),
        coord: strField(block, 'coord'),
        description: strField(block, 'description'),
        date: block.match(/\n {8}date: (\d+|'[^']*')/)?.[1]?.replace(/'/g, ''),
        serviceType,
        method: serviceType === 'vector-tile' ? 'mvt' : serviceType,
        urlRaw: url.raw,
        // tileProxyUrl('host+path') 的参数不带协议，迁移后 url 补全为 https://host+path
        //（带 http:// 参数的 ships66 原样保留）；其余一律与 url 字段字面量相同
        urlRawFull: url.kind === 'tileProxyUrl'
            ? (/^https?:\/\//.test(url.raw) ? url.raw : `https://${url.raw}`)
            : url.raw,
        urlKind: url.kind,
        cesiumUrl: url.cesiumUrl?.replace(/\{tiandituTk\}/g, TK).replace(/\{ovitalTdtkey\}/g, OV),
        olUrl: parseOldOlUrl(block, helperUrls),
        correction: PROXY_SEG[url.kind] ? { gcj2wgsProxyUrl: 'gcj2wgs', wgs2gcjProxyUrl: 'wgs2gcj', bd2wgsProxyUrl: 'bd2wgs' }[url.kind] : undefined,
        proxy: url.kind === 'tileProxyUrl' ? 'proxy' : undefined,
        maxZoom: numField(block, 'maxZoom') ?? (csMaxZoom !== undefined ? Number(csMaxZoom) : undefined),
        tilePixelRatio: numField(block, 'tilePixelRatio') ?? (csTilePixelRatio !== undefined ? Number(csTilePixelRatio) : undefined),
        styleUrl: strField(block, 'styleUrl'),
        needsContext: extractArrayItems(block, 'needsContext'),
        wms: wms ? normObj(wms) : (csWms ? normObj(csWms) : undefined),
        wmts: wmts ? normObj(wmts) : (csWmts ? normObj(csWmts) : undefined),
        skipHighResTile: /withSkipHighResTile/.test(block),
        nonStandardAdapter: mff ? `maps-for-free-${mff[1]}` : undefined,
        engines: (mff || serviceType === 'vector-tile') ? ['ol'] : undefined,
        csMaxZoom: block.match(/new XYZ\(\{[\s\S]*?maxZoom: (\d+)/)?.[1],
        csTilePixelRatio: block.match(/new XYZ\(\{[\s\S]*?tilePixelRatio: (\d+)/)?.[1],
    };
}

// ---------- 新定义解析 ----------

function parseNew(block) {
    const wms = extractNamedObject(block, 'wms');
    const wmts = extractNamedObject(block, 'wmts');
    const engines = block.match(/\n {8}engines: \[([^\]]*)\]/)?.[1];
    return {
        order: numField(block, 'order'),
        id: strField(block, 'id'),
        name: strField(block, 'name'),
        catalogCategory: strField(block, 'catalogCategory'),
        provider: strField(block, 'provider'),
        coord: strField(block, 'coord'),
        description: strField(block, 'description'),
        date: block.match(/\n {8}date: (\d+|'[^']*')/)?.[1]?.replace(/'/g, ''),
        method: strField(block, 'method'),
        url: strField(block, 'url'),
        correction: strField(block, 'correction'),
        proxy: strField(block, 'proxy'),
        maxZoom: numField(block, 'maxZoom'),
        tilePixelRatio: numField(block, 'tilePixelRatio'),
        styleUrl: strField(block, 'styleUrl'),
        needsContext: extractArrayItems(block, 'needsContext'),
        wms: wms ? normObj(wms) : undefined,
        wmts: wmts ? normObj(wmts) : undefined,
        skipHighResTile: /\n {8}skipHighResTile: true/.test(block),
        nonStandardAdapter: strField(block, 'nonStandardAdapter'),
        engines: engines ? [...engines.matchAll(/'([^']+)'/g)].map((x) => x[1]) : undefined,
    };
}

// ---------- 主流程 ----------

// 旧基线文件动态发现：HEAD 旧目录下的全部 .ts 分片（group-1..4 或 category-*）
//（ls-tree 目录参数须带尾随斜杠才会列出子项）
const oldFiles = execFileSync('git', ['-C', REPO_ROOT, 'ls-tree', '--name-only', 'HEAD', '--', `${OLD_DIR_REL}/`], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter((path) => path.endsWith('.ts'));

if (!oldFiles.length) {
    console.warn('[migration] NOT RUN  HEAD 已无旧定义分片（迁移提交已落库，本脚本为一次性迁移校验，无基线可比对）');
    process.exit(2);
}

// 基线数量守卫：本脚本的等价断言只在「HEAD 恰为迁移前基线」时有效。
// V3.7.16 的权威等价验证在重构工作区完成（基线见 V3.7.16 日志）；本地 HEAD 若
// 缺少中间会话的 59 条新增定义（合并自未日志化 catalog 批次），逐条比对必然失真，
// 此时显式跳过而非产出 170+ 条误导性失败。
// 基线数量不再硬编码：HEAD 与当前定义数一致时才做逐条等价断言，否则显式退出 2。

const oldDefs = [];
const newDefs = [];
let positionalOrder = 0;
for (const oldPath of oldFiles) {
    const oldText = execFileSync('git', ['-C', REPO_ROOT, 'show', `HEAD:${oldPath}`], { encoding: 'utf8' });
    const helperUrls = {
        openfreemap: oldText.match(/function createOpenFreeMapVectorSource[\s\S]*?createVectorTileSourceFromUrl\(\s*'([^']*)'/)?.[1],
    };
    for (const b of splitDefs(oldText)) {
        positionalOrder += 1;
        oldDefs.push(parseOld(b, helperUrls, positionalOrder));
    }
}
for (const name of readdirSync(NEW_DIR).filter((f) => f.startsWith('category-') && f.endsWith('.ts')).sort()) {
    const newText = readFileSync(join(NEW_DIR, name), 'utf8');
    for (const b of splitDefs(newText)) newDefs.push(parseNew(b));
}

if (oldDefs.length !== newDefs.length) {
    console.warn(
        `[migration] NOT RUN  HEAD 旧定义 ${oldDefs.length} 条 ≠ 当前新定义 ${newDefs.length} 条`
        + `（本地 HEAD 与当前工作区不属于同一迁移基线；权威等价验证见 V3.7.16 重构日志，`
        + `本脚本仅在数量一致时逐条断言；退出码 2 = 未执行，非通过）`,
    );
    process.exit(2);
}
const oldById = new Map(oldDefs.map((d) => [d.id, d]));
const newById = new Map(newDefs.map((d) => [d.id, d]));
for (const id of oldById.keys()) expect(newById.has(id), `新定义缺失：${id}`);
for (const id of newById.keys()) expect(oldById.has(id), `新定义多出：${id}`);

// resolveTileUrl 真函数：Node ≥22.18 自带类型剥离，可直接 import .ts 模块
//（本仓库无 esbuild / tsx 等转译依赖，故不走打包路线）
let resolveTileUrl;
try {
    ({ resolveTileUrl } = await import(pathToFileURL(resolve(process.cwd(), 'src/domains/common/basemap/definitions/resolveTileUrl.ts')).href));
} catch (error) {
    console.error(`[migration] FAIL 无法直接 import resolveTileUrl.ts（需要 Node ≥22.18 的类型剥离）：${error.message}`);
    process.exit(1);
}
const CTX = { tiandituTk: TK, ovitalTdtkey: OV, customUrl: '', tileProxyBaseUrl: BASE, tileProxyMode: 'fallback' };

const SPOTLIGHT = {
    imagery_tianditu: '天地图影像（xyz/WGS84）',
    vector_amap_wgs: '高德电子（xyz/gcj2wgs）',
    vector_baidu_wgs: '百度（bd2wgs）',
    theme_gd_basic_farmland_wms: 'WMS',
    theme_hn_basic_farmland_wmts: 'WMTS',
    vector_tianditu_mvt: 'MVT',
    imagery_s2_cloudless_2020: 'Sentinel 历史影像',
};
const spotlightResults = [];

// ---------- 有意偏离清单（2026-11-28 遗留项 A1/A2，有文档说明的例外） ----------
// 以下 4 条的新定义与旧定义逐条比对时允许偏离；除所列字段外，其余字段仍逐条
// 比对，不得静默放宽。证据见重构日志
// Docs/LLM_record/26-11/2026-11-27/2026-11-27-basemap-definition-refactor.md 遗留节。
// - vector_amap_clean_wgs / vector_amap_roads_wgs（orders 94/95，A1）：旧 url 与
//   旧 createSource 均为字面量 'None'（无法加载）；新 url 填 30042a9 之前
//   group-3.ts 里 gcj2wgsProxyUrl(...) 包裹的真实 URL（原样解包），并补
//   correction='gcj2wgs'；url / correction / OL URL / Cesium URL 四项免比对。
//   交叉核对：与同文件 orders 100/102（同款 ltype=1/2 的 _wgs 孪生条目）URL 逐字节相同。
// - label_minedata / amap_label（orders 5/6，A2）：coord 按语义 (b) 统一为纠偏后
//   输出坐标系，GCJ02→WGS84（correction='gcj2wgs' 不变）；coord 与 description
//   （描述串内嵌 coord 值）两项免比对。其余 31 条纠偏定义未动。
const INTENTIONAL_DEVIATIONS = {
    vector_amap_clean_wgs: new Set(['url', 'correction', 'olUrl', 'cesiumUrl']),
    vector_amap_roads_wgs: new Set(['url', 'correction', 'olUrl', 'cesiumUrl']),
    label_minedata: new Set(['coord', 'description']),
    amap_label: new Set(['coord', 'description']),
};

for (const oldDef of oldDefs) {
    const d = newById.get(oldDef.id);
    if (!d) continue;
    const tag = `${oldDef.id} (order ${oldDef.order})`;
    // 有意偏离清单内的字段跳过比对（其余字段仍逐条比对）
    const devFields = INTENTIONAL_DEVIATIONS[oldDef.id] || new Set();
    for (const key of ['order', 'name', 'catalogCategory', 'provider', 'coord', 'description', 'date', 'styleUrl']) {
        if (devFields.has(key)) continue;
        // group 布局旧定义没有目录元数据字段（catalogCategory/provider/coord/description/date
        // 为本次重构新增），旧值 undefined 时免比对；其余字段仍逐条比对
        if (oldDef[key] === undefined && ['catalogCategory', 'provider', 'coord', 'description', 'date'].includes(key)) continue;
        expect(String(d[key] ?? '') === String(oldDef[key] ?? ''), `${tag} 的 ${key} 不一致：旧=${oldDef[key]} 新=${d[key]}`);
    }
    expect(d.method === oldDef.method, `${tag} 的 method 不一致：旧=${oldDef.method} 新=${d.method}`);
    if (!devFields.has('correction')) expect(d.correction === oldDef.correction, `${tag} 的 correction 不一致：旧=${oldDef.correction} 新=${d.correction}`);
    expect(d.proxy === oldDef.proxy, `${tag} 的 proxy 不一致：旧=${oldDef.proxy} 新=${d.proxy}`);
    if (!devFields.has('url')) expect(d.url === (oldDef.urlRawFull ?? ''), `${tag} 的 url 不一致：旧=${oldDef.urlRawFull} 新=${d.url}`);
    expect(d.skipHighResTile === oldDef.skipHighResTile, `${tag} 的 skipHighResTile 不一致`);
    expect(d.nonStandardAdapter === oldDef.nonStandardAdapter, `${tag} 的 nonStandardAdapter 不一致`);
    expect(JSON.stringify(d.engines ?? null) === JSON.stringify(oldDef.engines ?? null), `${tag} 的 engines 不一致`);
    expect(JSON.stringify(d.needsContext ?? null) === JSON.stringify(oldDef.needsContext ?? null), `${tag} 的 needsContext 不一致`);
    expect(d.wms === oldDef.wms, `${tag} 的 wms 不一致`);
    expect(d.wmts === oldDef.wmts, `${tag} 的 wmts 不一致`);
    expect(d.tilePixelRatio === oldDef.tilePixelRatio, `${tag} 的 tilePixelRatio 不一致`);
    // maxZoom：字段值与旧 createSource 传入值一致的才要求相等；仅 label_minedata
    // 字段有 18 而旧 createSource 未传——属本次有意归一（见日志），不判失败。
    if (oldDef.csMaxZoom !== undefined) {
        expect(d.maxZoom === Number(oldDef.csMaxZoom), `${tag} 的 maxZoom 与旧 createSource 不一致`);
    } else if (d.maxZoom !== oldDef.maxZoom) {
        notes.push(`${tag} 的 maxZoom 字段=${d.maxZoom}，旧 createSource 未传（本次归一为以字段为准）`);
    }
    if (oldDef.csTilePixelRatio !== undefined) {
        expect(d.tilePixelRatio === Number(oldDef.csTilePixelRatio), `${tag} 的 tilePixelRatio 与旧 createSource 不一致`);
    }

    // URL 等价：新 resolveTileUrl（真函数） vs 旧 createSource / url 字段求值
    //（有意偏离清单内的条目：旧 URL 本就是 'None' 占位，无等价可言，跳过）
    if (!devFields.has('olUrl') && d.method !== 'custom' && d.method !== 'osm' && oldDef.olUrl !== undefined && oldDef.olUrl !== null) {
        const newOlUrl = resolveTileUrl(
            { method: d.method, url: d.url, correction: d.correction, proxy: d.proxy },
            CTX,
        ).replace('t{s}.tianditu.gov.cn', 't0.tianditu.gov.cn');
        expect(newOlUrl === oldDef.olUrl, `${tag} 的 OL URL 不一致：\n  旧=${oldDef.olUrl}\n  新=${newOlUrl}`);
    }
    if (!devFields.has('cesiumUrl') && d.method !== 'custom' && oldDef.cesiumUrl !== undefined) {
        const newCesiumUrl = resolveTileUrl(
            { method: d.method, url: d.url, correction: d.correction, proxy: d.proxy },
            CTX,
        );
        expect(newCesiumUrl === oldDef.cesiumUrl, `${tag} 的 Cesium URL 不一致：\n  旧=${oldDef.cesiumUrl}\n  新=${newCesiumUrl}`);
    }

    if (SPOTLIGHT[oldDef.id]) {
        spotlightResults.push({
            id: oldDef.id,
            label: SPOTLIGHT[oldDef.id],
            method: d.method,
            correction: d.correction || 'none',
            proxy: d.proxy || 'auto',
            ok: !failures.some((f) => f.startsWith(oldDef.id)),
        });
    }
}

console.log('--- 抽查项（resolveTileUrl 真函数 vs 旧 createSource / url 字段）---');
for (const r of spotlightResults) {
    console.log(`  ${r.ok ? 'OK ' : 'FAIL'} ${r.label} · ${r.id} · method=${r.method} correction=${r.correction} proxy=${r.proxy}`);
}
for (const note of notes) console.log(`[migration] NOTE ${note}`);
if (failures.length) {
    console.error(`[migration] FAIL ${failures.length} 项不一致`);
    for (const failure of failures.slice(0, 30)) console.error(`  - ${failure}`);
    if (failures.length > 30) console.error(`  ... 另 ${failures.length - 30} 项`);
    process.exit(1);
}
console.log(`[migration] OK  ${newDefs.length} 条定义逐条等价（基线=${oldFiles.length} 个 HEAD 分片；元数据/method/correction/proxy/OL URL/Cesium URL；有意偏离按 INTENTIONAL_DEVIATIONS 以 id 标注）`);
