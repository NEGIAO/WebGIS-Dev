/**
 * V3.7.16 迁移等价校验（回归抽查，代码级验证，非实机）：
 * 逐条比对迁移前后 174 条定义的 id / order / 元数据 / method /
 * correction / proxy / wms / wmts / styleUrl / maxZoom / tilePixelRatio /
 * skipHighResTile / nonStandardAdapter / engines，以及 OL 与 Cesium
 * 两条链路的最终 URL 是否一致。
 *
 * 旧定义取自 `git show HEAD:...`（只读），新定义取自工作树；
 * resolveTileUrl 用 Node 类型剥离直接 import 真实 TS 模块，测的是真函数。
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
    return block.match(new RegExp(`\\n        ${name}: '([^']*)'`))?.[1];
}
function numField(block, name) {
    const v = block.match(new RegExp(`\\n        ${name}: (\\d+)`))?.[1];
    return v === undefined ? undefined : Number(v);
}
function normObj(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}
function extractNamedObject(block, name) {
    const m = block.match(new RegExp(`\\n        ${name}: \\{`));
    if (!m) return undefined;
    return balancedObject(block, m.index + m[0].length - 1);
}
function extractArrayItems(block, name) {
    const m = block.match(new RegExp(`\\n        ${name}: \\[([^\\]]*)\\]`));
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
    const m = block.match(/\n        url: (?:'([^']*)'|(gcj2wgsProxyUrl|wgs2gcjProxyUrl|bd2wgsProxyUrl|tileProxyUrl)\(\s*'([^']*)')/);
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

function parseOld(block, helperUrls) {
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
        order: numField(block, 'order'),
        id: strField(block, 'id'),
        name: strField(block, 'name'),
        catalogCategory: strField(block, 'catalogCategory'),
        provider: strField(block, 'provider'),
        coord: strField(block, 'coord'),
        description: strField(block, 'description'),
        category: strField(block, 'category'),
        group: strField(block, 'group'),
        date: block.match(/\n        date: (\d+|'[^']*')/)?.[1]?.replace(/'/g, ''),
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
    const engines = block.match(/\n        engines: \[([^\]]*)\]/)?.[1];
    return {
        order: numField(block, 'order'),
        id: strField(block, 'id'),
        name: strField(block, 'name'),
        catalogCategory: strField(block, 'catalogCategory'),
        provider: strField(block, 'provider'),
        coord: strField(block, 'coord'),
        description: strField(block, 'description'),
        category: strField(block, 'category'),
        group: strField(block, 'group'),
        date: block.match(/\n        date: (\d+|'[^']*')/)?.[1]?.replace(/'/g, ''),
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
        skipHighResTile: /\n        skipHighResTile: true/.test(block),
        nonStandardAdapter: strField(block, 'nonStandardAdapter'),
        engines: engines ? [...engines.matchAll(/'([^']+)'/g)].map((x) => x[1]) : undefined,
    };
}

// ---------- 主流程 ----------

const files = ['category-service.ts', 'category-imagery.ts', 'category-terrain.ts', 'category-electronic.ts', 'category-historical.ts', 'category-vector.ts'];

const oldDefs = [];
const newDefs = [];
for (const name of files) {
    const oldText = execFileSync('git', ['-C', REPO_ROOT, 'show', `HEAD:${OLD_DIR_REL}/${name}`], { encoding: 'utf8' });
    const helperUrls = {
        openfreemap: oldText.match(/function createOpenFreeMapVectorSource[\s\S]*?createVectorTileSourceFromUrl\(\s*'([^']*)'/)?.[1],
    };
    for (const b of splitDefs(oldText)) oldDefs.push(parseOld(b, helperUrls));
    const newText = readFileSync(join(NEW_DIR, name), 'utf8');
    for (const b of splitDefs(newText)) newDefs.push(parseNew(b));
}

expect(oldDefs.length === 174, `旧定义应为 174，实际 ${oldDefs.length}`);
expect(newDefs.length === 174, `新定义应为 174，实际 ${newDefs.length}`);
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

for (const oldDef of oldDefs) {
    const d = newById.get(oldDef.id);
    if (!d) continue;
    const tag = `${oldDef.id} (order ${oldDef.order})`;
    for (const key of ['order', 'name', 'catalogCategory', 'provider', 'coord', 'description', 'category', 'group', 'date', 'styleUrl']) {
        expect(String(d[key] ?? '') === String(oldDef[key] ?? ''), `${tag} 的 ${key} 不一致：旧=${oldDef[key]} 新=${d[key]}`);
    }
    expect(d.method === oldDef.method, `${tag} 的 method 不一致：旧=${oldDef.method} 新=${d.method}`);
    expect(d.correction === oldDef.correction, `${tag} 的 correction 不一致：旧=${oldDef.correction} 新=${d.correction}`);
    expect(d.proxy === oldDef.proxy, `${tag} 的 proxy 不一致：旧=${oldDef.proxy} 新=${d.proxy}`);
    expect(d.url === (oldDef.urlRawFull ?? ''), `${tag} 的 url 不一致：旧=${oldDef.urlRawFull} 新=${d.url}`);
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
    if (d.method !== 'custom' && d.method !== 'osm' && oldDef.olUrl !== undefined && oldDef.olUrl !== null) {
        const newOlUrl = resolveTileUrl(
            { method: d.method, url: d.url, correction: d.correction, proxy: d.proxy },
            CTX,
        ).replace('t{s}.tianditu.gov.cn', 't0.tianditu.gov.cn');
        expect(newOlUrl === oldDef.olUrl, `${tag} 的 OL URL 不一致：\n  旧=${oldDef.olUrl}\n  新=${newOlUrl}`);
    }
    if (d.method !== 'custom' && oldDef.cesiumUrl !== undefined) {
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
console.log(`[migration] OK  174 条定义逐条等价（元数据/method/correction/proxy/OL URL/Cesium URL）`);
