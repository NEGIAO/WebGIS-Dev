/**
 * 底图目录编号兼容校验（阶段 1 门禁）。
 *
 * 校验 BASEMAP_PRESETS 的数量下界、唯一性与首部锚点，确保新增分类元数据时
 * URL 参数 l 的 1-based 编号契约不被破坏；追加新预设到末尾无需改本脚本。
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

// 174 是连续删除重复/失效预设后的冻结基线，只允许追加不允许回退；
// 末项 id 不再硬编码，否则每加一个新预设都要改门禁。
const MIN_PRESET_COUNT = 174;
expect(ids.length >= MIN_PRESET_COUNT, `预设数量不得回退到 ${MIN_PRESET_COUNT} 以下，实际 ${ids.length}`);
expect(new Set(ids).size === ids.length, '存在重复 preset id');
expect(ids[0] === 'local_tiles_preset', `首个预设应为 local_tiles_preset，实际 ${ids[0]}`);
expect(ids[1] === 'custom', `第二个预设应为 custom，实际 ${ids[1]}`);
expect(Boolean(ids.at(-1)), '末个预设 id 为空');

const amap = ids.filter((id) => id.startsWith('vector_amap_256_ltype_'));
const google = ids.filter((id) => id.startsWith('vector_google_combo_'));
expect(amap.length === 20, `AMAP 256 组合应为 20，实际 ${amap.length}`);
// 删除 Google 标准电子与 PB纯路网两对重复组合后，组合数 30→26（各 15→13）。
expect(google.length === 26, `Google 组合应为 26，实际 ${google.length}`);
expect(amap.filter((id) => /_gcj_preset$/.test(id)).length === 10, 'AMAP GCJ 组合应为 10');
expect(amap.filter((id) => /_wgs_preset$/.test(id)).length === 10, 'AMAP WGS 组合应为 10');
expect(google.filter((id) => /_gcj_preset$/.test(id)).length === 13, 'Google GCJ 组合应为 13');
expect(google.filter((id) => /_wgs_preset$/.test(id)).length === 13, 'Google WGS 组合应为 13');

// V3.7.27：精选底图显式清单校验——每个推荐 id 必须存在于预设表且无重复。
const recommendedFile = resolve(
    process.cwd(),
    'src/domains/common/basemap/definitions/category-recommended.ts',
);
const recommendedSource = readFileSync(recommendedFile, 'utf8');
const recommendedIds = [...recommendedSource.matchAll(/presetId:\s*'([^']+)'/g)].map((m) => m[1]);
expect(recommendedIds.length > 0, '精选底图清单为空');
expect(
    new Set(recommendedIds).size === recommendedIds.length,
    '精选底图清单存在重复 preset id',
);
for (const recommendedId of recommendedIds) {
    expect(ids.includes(recommendedId), `精选底图 ${recommendedId} 在 basemapPresets.ts 中不存在`);
}

if (failures.length) {
    console.error('[basemap-catalog] FAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`[basemap-catalog] OK  ${ids.length} presets, ${amap.length} AMAP + ${google.length} Google combos, ${recommendedIds.length} recommended`);
