/**
 * 图层定义门禁（V3.7.16 更新：定义层已迁入 common/basemap/definitions）：
 * - 每条定义必须有 order/id/url/method/catalogCategory/provider/coord/description
 * - id 与 order 唯一，order 覆盖 1..N
 * - url 必须是原始上游 URL 字面量（代理/纠偏一律走 correction/proxy 字段，
 *   定义里不得再出现 *ProxyUrl( 调用）；仅 custom 允许空 url
 * - correction != 'none' 时 proxy 不得为 'direct'
 * - wms/wmts 方法必须带齐必需参数
 * - 定义文件零引擎依赖（不得出现 ol/source、cesium、createSource、serviceType）
 * - 所有 preset stack 中的 layer id 都能解析
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const defDir = resolve(process.cwd(), 'src/domains/common/basemap/definitions');
const presetFile = resolve(process.cwd(), 'src/domains/common/basemap/basemapPresets.ts');
const defFiles = readdirSync(defDir).filter((name) => name.startsWith('category-') && name.endsWith('.ts'));
const defText = defFiles
    .map((name) => readFileSync(resolve(defDir, name), 'utf8'))
    .join('\n')
    .replace(/\r\n?/g, '\n');
const presetText = readFileSync(presetFile, 'utf8').replace(/\r\n?/g, '\n');

const failures = [];
const warnings = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

const blockRe = /\n {8}order: (\d+),\n {8}id: '([^']+)'[\s\S]*?(?=\n {8}order: \d+,|\n\];)/g;
const defs = [...defText.matchAll(blockRe)].map((m) => {
    const b = m[0];
    const field = (name) => b.match(new RegExp(`\\n {8}${name}: '([^']*)'`))?.[1];
    const url = b.match(/\n {8}url: '([^']*)'/)?.[1];
    const method = field('method');
    const correction = field('correction');
    const proxy = field('proxy');
    return {
        order: Number(m[1]),
        id: m[2],
        name: field('name'),
        url,
        method,
        correction,
        proxy,
        catalogCategory: field('catalogCategory'),
        provider: field('provider'),
        coord: field('coord'),
        description: field('description'),
        block: b,
    };
});

// 定义数不再硬编码：增删定义后只需保证 order 连续覆盖 1..N（唯一性 + 无空洞）。
// N 由实际定义数推导，避免每次增删底图都要同步改校验脚本。
const expectedCount = defs.length;
const rawOrderCount = (defText.match(/\n {8}order: \d+,/g) || []).length;
expect(rawOrderCount === expectedCount, `解析器漏读定义：正则匹配 ${defs.length} 条，order 字面量 ${rawOrderCount} 条`);
const ids = defs.map((d) => d.id);
const orders = defs.map((d) => d.order);
expect(new Set(ids).size === ids.length, '图层 id 重复');
expect(new Set(orders).size === orders.length, '图层 order 重复');
expect(
    Math.min(...orders) === 1 && Math.max(...orders) === expectedCount,
    `order 应覆盖 1..${expectedCount}（实际 ${Math.min(...orders)}..${Math.max(...orders)}）`,
);

const VALID_METHODS = new Set(['xyz', 'wmts', 'wms', 'mvt', 'osm', 'custom']);
// 与 validate.ts 口径对齐（V3.7.20）：'none' 为合法显式取值（缺省与 none 等价）
const VALID_CORRECTIONS = new Set(['none', 'gcj2wgs', 'wgs2gcj', 'bd2wgs', 'wgs2bd']);
const VALID_PROXY_MODES = new Set(['direct', 'proxy', 'auto']);
const VALID_CATEGORIES = new Set(['service', 'imagery', 'terrain', 'electronic', 'historical', 'vector']);
const VALID_COORDS = new Set(['WGS84', 'GCJ02', 'BD09', 'NONE', 'MIXED']);
const VALID_PROVIDERS = new Set([
    'AMAP', 'Google', 'Tianditu', 'Tuxin', 'Baidu', 'Tencent', 'ESRI', 'MapTiler', 'Mapbox',
    'OSM', 'Carto', 'Stadia', 'Stamen', 'OpenFreeMap', 'VersaTiles', 'MapLibre', 'Jawg', 'Protomaps', 'MFF', 'MineMap', 'GeoQ', 'Windy',
    'Sentinel', 'ESRI Wayback', 'NASA', 'Bing', 'OpenSeaMap', 'OpenRailwayMap', 'Local', 'Custom', 'Other',
]);
// 与 validate.ts 同源：coord = 纠偏后输出坐标系，错位会在模块加载时被拒。
const EXPECTED_OUTPUT_COORD = {
    gcj2wgs: 'WGS84', wgs2gcj: 'GCJ02', bd2wgs: 'WGS84', wgs2bd: 'BD09',
};

let noneCount = 0;
for (const d of defs) {
    for (const key of ['id', 'name', 'method', 'catalogCategory', 'provider', 'coord', 'description']) {
        if (!d[key]) failures.push(`${d.id || '?'} 缺少 ${key}`);
    }
    if (d.url === undefined) {
        failures.push(`${d.id} 缺少 url 字段`);
    } else if (d.url === '') {
        expect(d.method === 'custom', `${d.id} 的 url 为空（仅 custom 允许空 url）`);
    } else if (d.url === 'None') {
        noneCount += 1;
    }
    if (d.method && !VALID_METHODS.has(d.method)) failures.push(`${d.id} 的 method 非法：${d.method}`);
    if (d.catalogCategory && !VALID_CATEGORIES.has(d.catalogCategory)) failures.push(`${d.id} 的 catalogCategory 非法：${d.catalogCategory}`);
    if (d.provider && !VALID_PROVIDERS.has(d.provider)) failures.push(`${d.id} 的 provider 非法：${d.provider}`);
    if (d.coord && !VALID_COORDS.has(d.coord)) failures.push(`${d.id} 的 coord 非法：${d.coord}`);
    if (d.correction && !VALID_CORRECTIONS.has(d.correction)) failures.push(`${d.id} 的 correction 非法：${d.correction}`);
    const expectedCoord = EXPECTED_OUTPUT_COORD[d.correction];
    if (expectedCoord && d.coord !== expectedCoord) {
        failures.push(`${d.id} 的 coord 与 correction 不一致：${d.correction} 要求 ${expectedCoord}，实际 ${d.coord}`);
    }
    if (d.proxy && !VALID_PROXY_MODES.has(d.proxy)) failures.push(`${d.id} 的 proxy 非法：${d.proxy}`);
    if (d.correction && d.proxy === 'direct') failures.push(`${d.id} 纠偏 ${d.correction} 时 proxy 不得为 'direct'`);
    if (d.method === 'wms' && !/wms:\s*\{[^}]*layers:/.test(d.block)) failures.push(`${d.id} 的 wms 缺少 layers 参数`);
    if (d.method === 'wmts' && (!/wmts:\s*\{[^}]*layer:/.test(d.block) || !/wmts:\s*\{[^}]*matrixSet:/.test(d.block))) {
        failures.push(`${d.id} 的 wmts 缺少 layer 或 matrixSet 参数`);
    }
    const engines = d.block.match(/engines:\s*\[([^\]]*)\]/)?.[1] || '';
    for (const engine of engines.match(/'[a-z]+'/g) || []) {
        if (!['ol', 'cesium'].includes(engine.slice(1, -1))) failures.push(`${d.id} 的 engines 含非法值：${engine}`);
    }
}
if (noneCount > 0) warnings.push(`url 为 'None' 的占位条目共 ${noneCount} 条（2026-11-28 遗留项 A1 已清零；回潮即失败，见重构日志遗留节）`);
// 2026-11-28 遗留项 A1：基线由 2 条收紧为 0 条（orders 94/95 已修正为真实 URL），防占位回潮。
expect(noneCount === 0, `url 为 'None' 的占位条目回潮至 ${noneCount} 条（基线 0 条）`);

// 定义层零引擎依赖：不得出现旧工厂 / 旧类型 / 代理包装调用
//（用 `createSource:` / `serviceType:` 属性形态匹配，文件头注释里提及旧名不算违规）
for (const banned of ['createSource:', 'serviceType:', 'ProxyUrl(', 'ol/source', "from 'ol'", 'cesium', 'publicRuntime']) {
    expect(!defText.includes(banned), `定义文件含禁用的旧耦合：${banned}`);
}

// V3.7.33：纠偏/代理版必须与未纠偏、未代理的原始版成对；原始 GCJ02/BD09
// 也必须能在同一 URL 上找到对应 WGS 派生版。URL 规范化忽略协议与 hl（语言
// 参数不改变几何/坐标系），保留 scl/ltype 等真正区分瓦片内容的参数。
const canonUrl = (url) => {
    if (!url) return '';
    try {
        // 既有 Google 定义的历史 URL 用 `&` 直跟路径（如 /vt/lyrs=m&x=...），
        // 首个参数缺 `?`；补上后再做参数级规范化，否则 hl 无法剔除。
        const normalized = url.includes('?') ? url : url.replace('&', '?');
        const u = new URL(normalized);
        const params = [...u.searchParams.entries()]
            .filter(([key]) => key !== 'hl')
            .sort(([a], [b]) => a.localeCompare(b));
        return `${u.host}${u.pathname}?${params.map(([k, v]) => `${k}=${v}`).join('&')}`;
    } catch {
        return url;
    }
};
const byUrl = new Map();
for (const d of defs) {
    const key = canonUrl(d.url);
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(d);
}
const isRaw = (d) => (!d.correction || d.correction === 'none') && d.proxy !== 'proxy';
// 同 URL 且 correction/proxy/method/coord/category/provider 全同 = 重复定义，
// 会在目录树中出现两个等价入口（原始/纠偏配对允许同 URL，必须保留）。
for (const [urlKey, siblings] of byUrl) {
    const seen = new Map();
    for (const d of siblings) {
        const payload = [d.correction || 'none', d.proxy || 'auto', d.method, d.coord, d.catalogCategory, d.provider].join('|');
        if (seen.has(payload)) {
            failures.push(`同 URL 重复定义：${seen.get(payload)} 与 ${d.id}（${urlKey}）`);
        } else {
            seen.set(payload, d.id);
        }
    }
}
for (const d of defs) {
    const siblings = byUrl.get(canonUrl(d.url)) || [];
    const derived = (d.correction && d.correction !== 'none') || d.proxy === 'proxy';
    if (derived) {
        expect(siblings.some(isRaw), `${d.id} 缺少未纠偏/未代理的原始版`);
    } else if (d.coord === 'GCJ02' || d.coord === 'BD09') {
        const correction = d.coord === 'GCJ02' ? 'gcj2wgs' : 'bd2wgs';
        expect(
            siblings.some((x) => x.correction === correction),
            `${d.id}（${d.coord}）缺少 ${correction} 派生版`,
        );
    }
}

const layerIds = new Set(ids);
const stacks = [...presetText.matchAll(/stack: \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
const missing = [...new Set(stacks.filter((id) => !layerIds.has(id)))];
expect(missing.length === 0, `preset stack 引用了未定义图层：${missing.join(', ')}`);

if (warnings.length) {
    for (const warning of warnings) console.warn(`[layer-definitions] WARN ${warning}`);
}
if (failures.length) {
    console.error('[layer-definitions] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`[layer-definitions] OK  ${defs.length} definitions, orders 1..${expectedCount}, stacks resolve`);
