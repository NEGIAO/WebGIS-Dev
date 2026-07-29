# 前端 domains 架构 Phase 8（续）：utils/gis/ 剩余文件下沉

- **日期与时间**：2026-07-29 17:15
- **任务等级**：L2
- **版本**：V3.4.95（顺延，V3.4.94 已被 Agent A 占用）

---

## 问题分析

- **核心症状**：Phase 7 迁移了 `utils/gis/parsers/` 和 `coordTransform.js`/`crsUtils.js`，但 `utils/gis/` 下仍有大量共享工具文件（decompressor、crs-engine、dataDispatcher 等）未迁移，导致 `utils/gis/` 目录仍然存在且散落。
- **根本原因**：Phase 7 只迁移了最上层的解析器，未处理依赖链深处的工具文件。
- **受影响模块**：数据导入链路（解压/格式分发/批量处理）、延迟 GIS 资源预热、OL 运行时依赖加载。

---

## 修改内容

1. `utils/gis/decompressor.ts` → `domains/common/data-import/decompressor.ts`
2. `utils/gis/crs-engine.ts` → `domains/common/data-import/crs-engine.ts`
3. `utils/gis/crsAware.js` → `domains/common/data-import/crsAware.js`
4. `utils/gis/dataDispatcher.js` → `domains/common/data-import/dataDispatcher.js`
5. `utils/gis/decompressFile.js` → `domains/common/data-import/decompressFile.js`
6. `utils/gis/loadJsZip.ts` → `domains/common/data-import/loadJsZip.ts`
7. `utils/gis/batchProcessor.js` → `domains/common/data-import/batchProcessor.js`
8. `utils/gis/archiveProcessor.js` → `domains/common/data-import/archiveProcessor.js`
9. `utils/gis/shpPacketBuilder.js` → `domains/common/data-import/shpPacketBuilder.js`
10. `utils/gis/deferredGisAssets.js` → `domains/common/data-import/deferredGisAssets.js`
11. `utils/gis/deferredGisWarmupLauncher.js` → `domains/common/data-import/deferredGisWarmupLauncher.js`
12. `utils/gis/mapRuntimeDeps.js` → `domains/common/data-import/mapRuntimeDeps.js`
13. 消费方 import 更新（5 个文件）

---

## 修改原因

- 这些文件均为跨 OL/Cesium 共享的 GIS 工具，无引擎专用依赖（`mapRuntimeDeps.js` 虽然 import OL，但它是延迟加载器，放在 common 作为预热入口合理）。
- 迁移后 `utils/gis/` 仅保留 `parsers/` 目录（Phase 7 已迁移），可以整体删除。

---

## 影响范围

- **数据导入链路**：ZIP/KMZ 解压 → 格式分发 → 批量处理
- **延迟资源预热**：`RegisterView.vue` 的 GIS 资源懒加载
- **坐标参考系**：CRS 引擎、CRS 感知层
- **Barrel 转发**：`utils/io/index.js` 和 `utils/geo/index.js`

---

## 性能指标

- 未实测（路径迁移，无算法变更）

---

## 测试方案

### Agent 已执行

- `npm run build` — ✅ 通过（26.61s）

### 待用户实机验证

1. 上传 ZIP/SHP 压缩包 → 应正常解压并解析
2. 注册页面 → GIS 资源预热应正常触发
3. 坐标系自动识别 → 应正确检测并注册投影

---

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `domains/common/data-import/decompressor.ts` | 从 `utils/gis/decompressor.ts` 迁移 |
| `domains/common/data-import/crs-engine.ts` | 从 `utils/gis/crs-engine.ts` 迁移 |
| `domains/common/data-import/crsAware.js` | 从 `utils/gis/crsAware.js` 迁移 |
| `domains/common/data-import/dataDispatcher.js` | 从 `utils/gis/dataDispatcher.js` 迁移 |
| `domains/common/data-import/decompressFile.js` | 从 `utils/gis/decompressFile.js` 迁移 |
| `domains/common/data-import/loadJsZip.ts` | 从 `utils/gis/loadJsZip.ts` 迁移 |
| `domains/common/data-import/batchProcessor.js` | 从 `utils/gis/batchProcessor.js` 迁移 |
| `domains/common/data-import/archiveProcessor.js` | 从 `utils/gis/archiveProcessor.js` 迁移 |
| `domains/common/data-import/shpPacketBuilder.js` | 从 `utils/gis/shpPacketBuilder.js` 迁移 |
| `domains/common/data-import/deferredGisAssets.js` | 从 `utils/gis/deferredGisAssets.js` 迁移 |
| `domains/common/data-import/deferredGisWarmupLauncher.js` | 从 `utils/gis/deferredGisWarmupLauncher.js` 迁移 |
| `domains/common/data-import/mapRuntimeDeps.js` | 从 `utils/gis/mapRuntimeDeps.js` 迁移 |
| `utils/io/index.js` | 转发路径更新为 `@common/data-import/` |
| `utils/geo/index.js` | 转发路径更新为 `@common/data-import/` |
| `composables/useGisLoader.ts` | import 路径更新为 `@common/data-import/` |
| `domains/common/data-import/parsers/shpParser.ts` | import 路径更新为相对路径 |
| `views/RegisterView.vue` | 动态 import 路径更新为 `@common/data-import/` |

---

## 遗留与风险

- **旧路径保留**：`utils/gis/` 目录下的文件暂保留（兼容未迁移的消费方），Phase 9 清理。
- **版本号撞车**：V3.4.94 被 Agent A 占用，本次顺延至 V3.4.95 并在日志注明。
- **`mapRuntimeDeps.js`**：虽然是 OL 专用，但作为延迟加载器放在 common 是合理的（预热入口），后续如需更严格拆分可移到 `ol/utils/`。
