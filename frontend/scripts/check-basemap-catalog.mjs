/**
 * 底图目录编号兼容校验（阶段 1 门禁）。
 *
 * 校验 BASEMAP_PRESETS 的数量、唯一性与首尾 id，确保新增分类元数据时
 * URL 参数 l 的 1-based 编号契约不被破坏。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const presetFile = resolve(process.cwd(), 'src/domains/common/basemap/basemapPresets.ts');
const source = readFileSync(presetFile, 'utf8');
const ids = [...source.matchAll(/\{\s*id: '([^']+)',\s*label: '[^']+',\s*stack:/g)].map((m) => m[1]);

const failures = [];
const expect = (condition, message) => {
    if (!condition) failures.push(message);
};

expect(ids.length === 148, `预设数量应为 148，实际 ${ids.length}`);
expect(new Set(ids).size === ids.length, '存在重复 preset id');
expect(ids[0] === 'local_tiles_preset', `首个预设应为 local_tiles_preset，实际 ${ids[0]}`);
expect(ids[1] === 'custom', `第二个预设应为 custom，实际 ${ids[1]}`);
expect(
    ids.at(-1) === 'vector_google_combo_pb_hillshade_gcj_preset',
    `末个预设应为 vector_google_combo_pb_hillshade_gcj_preset，实际 ${ids.at(-1)}`,
);

const amap = ids.filter((id) => id.startsWith('vector_amap_256_ltype_'));
const google = ids.filter((id) => id.startsWith('vector_google_combo_'));
expect(amap.length === 20, `AMAP 256 组合应为 20，实际 ${amap.length}`);
expect(google.length === 30, `Google 组合应为 30，实际 ${google.length}`);
expect(amap.filter((id) => /_gcj_preset$/.test(id)).length === 10, 'AMAP GCJ 组合应为 10');
expect(amap.filter((id) => /_wgs_preset$/.test(id)).length === 10, 'AMAP WGS 组合应为 10');
expect(google.filter((id) => /_gcj_preset$/.test(id)).length === 15, 'Google GCJ 组合应为 15');
expect(google.filter((id) => /_wgs_preset$/.test(id)).length === 15, 'Google WGS 组合应为 15');

if (failures.length) {
    console.error('[basemap-catalog] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`[basemap-catalog] OK  ${ids.length} presets, ${amap.length} AMAP + ${google.length} Google combos`);
