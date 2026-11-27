/**
 * 图层定义门禁：
 * - 每条定义必须有 order/id/url/catalogCategory/provider/coord/description
 * - id 与 order 唯一，order 覆盖 1..N
 * - url 必须是字面量或代理包装的字面量（不允许生成函数）
 * - 所有 preset stack 中的 layer id 都能解析
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const defDir = resolve(process.cwd(), 'src/domains/ol/basemap/constants/definitions');
const presetFile = resolve(process.cwd(), 'src/domains/common/basemap/basemapPresets.ts');
const defFiles = readdirSync(defDir).filter((name) => name.startsWith('category-') && name.endsWith('.ts'));
const defText = defFiles
    .map((name) => readFileSync(resolve(defDir, name), 'utf8'))
    .join('\n')
    .replace(/\r\n?/g, '\n');
const presetText = readFileSync(presetFile, 'utf8').replace(/\r\n?/g, '\n');

const failures = [];
const expect = (ok, msg) => { if (!ok) failures.push(msg); };

const blockRe = /\n        order: (\d+),\n        id: '([^']+)'[\s\S]*?(?=\n        order: \d+,|\n\];)/g;
const defs = [...defText.matchAll(blockRe)].map((m) => {
    const b = m[0];
    const field = (name) => b.match(new RegExp(`\\n        ${name}: '([^']*)'`))?.[1];
    const urlExpr = b.match(/\n        url: ([\s\S]*?),\n        (?:tilePixelRatio|serviceType|styleUrl|needsContext|wms|wmts|createSource)/)?.[1]?.trim() ?? '';
    return {
        order: Number(m[1]),
        id: m[2],
        name: field('name'),
        urlExpr,
        catalogCategory: field('catalogCategory'),
        provider: field('provider'),
        coord: field('coord'),
        description: field('description'),
    };
});

expect(defs.length === 174, `图层定义应为 174，实际 ${defs.length}`);
const ids = defs.map((d) => d.id);
const orders = defs.map((d) => d.order);
expect(new Set(ids).size === ids.length, '图层 id 重复');
expect(new Set(orders).size === orders.length, '图层 order 重复');
expect(Math.min(...orders) === 1 && Math.max(...orders) === 174, 'order 应覆盖 1..174');

for (const d of defs) {
    for (const key of ['id', 'name', 'urlExpr', 'catalogCategory', 'provider', 'coord', 'description']) {
        if (!d[key]) failures.push(`${d.id || '?'} 缺少 ${key}`);
    }
    const normalized = d.urlExpr.replace(/\s+/g, ' ');
    const urlOk = normalized.startsWith("'") || /^(gcj2wgsProxyUrl|wgs2gcjProxyUrl|bd2wgsProxyUrl|tileProxyUrl)\(\s*'/.test(normalized);
    if (!urlOk) failures.push(`${d.id} 的 url 不是完整字面量：${normalized}`);
}

const layerIds = new Set(ids);
const stacks = [...presetText.matchAll(/stack: \[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
const missing = [...new Set(stacks.filter((id) => !layerIds.has(id)))];
expect(missing.length === 0, `preset stack 引用了未定义图层：${missing.join(', ')}`);

if (failures.length) {
    console.error('[layer-definitions] FAIL');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log(`[layer-definitions] OK  ${defs.length} definitions, ${defFiles.length} category files, stacks resolved`);
