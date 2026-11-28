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

const blockRe = /\n        order: (\d+),\n        id: '([^']+)'[\s\S]*?(?=\n        order: \d+,|\n\];)/g;
const defs = [...defText.matchAll(blockRe)].map((m) => {
    const b = m[0];
    const field = (name) => b.match(new RegExp(`\\n        ${name}: '([^']*)'`))?.[1];
    const url = b.match(/\n        url: '([^']*)'/)?.[1];
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

expect(defs.length === 174, `图层定义应为 174，实际 ${defs.length}`);
const ids = defs.map((d) => d.id);
const orders = defs.map((d) => d.order);
expect(new Set(ids).size === ids.length, '图层 id 重复');
expect(new Set(orders).size === orders.length, '图层 order 重复');
expect(Math.min(...orders) === 1 && Math.max(...orders) === 174, 'order 应覆盖 1..174');

const VALID_METHODS = new Set(['xyz', 'wmts', 'wms', 'mvt', 'osm', 'custom']);
const VALID_CORRECTIONS = new Set(['gcj2wgs', 'wgs2gcj', 'bd2wgs', 'wgs2bd']);
const VALID_PROXY_MODES = new Set(['direct', 'proxy', 'auto']);

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
    if (d.correction && !VALID_CORRECTIONS.has(d.correction)) failures.push(`${d.id} 的 correction 非法：${d.correction}`);
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
if (noneCount > 0) warnings.push(`url 为 'None' 的占位条目共 ${noneCount} 条（已知既有问题，见 Docs/TODO/bugfix-optimization-plan.md）`);
expect(noneCount <= 2, `url 为 'None' 的占位条目新增至 ${noneCount} 条（基线 2 条）`);

// 定义层零引擎依赖：不得出现旧工厂 / 旧类型 / 代理包装调用
//（用 `createSource:` / `serviceType:` 属性形态匹配，文件头注释里提及旧名不算违规）
for (const banned of ['createSource:', 'serviceType:', 'ProxyUrl(', 'ol/source', "from 'ol'", 'cesium', 'publicRuntime']) {
    expect(!defText.includes(banned), `定义文件含禁用的旧耦合：${banned}`);
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

console.log(`[layer-definitions] OK  ${defs.length} definitions, orders 1..174, stacks resolve`);
