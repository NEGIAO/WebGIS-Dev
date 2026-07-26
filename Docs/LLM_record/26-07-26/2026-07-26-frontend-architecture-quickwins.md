# 前端架构快赢三项：barrel 注册规范 + 结构树门禁 + api 收敛标注（V3.4.31）

## 日期和时间

2026-07-26 20:15

## 修改内容

- `composables/map/features/README.md`：新增「新增模块必须双层注册」规范章节——barrel 转发链为 map/index → 领域 barrel → 模块，`features/index.js` 不在链上；只注册一处会得到 undefined 且 ESLint 不报错（V3.4.29 实际踩坑成文）。
- 新增根目录 `CheckStructureTree.py`：结构树漂移门禁，按文件名双向 diff `frontend-structure.md` 与 `frontend/src` 实际文件（漏登记/幽灵条目），存在漂移退出码 1；与 CheckConfigRegistry.py 同族。**首跑即检出 26 项漏登记 + 3 项幽灵条目**（当日高速迭代积累），价值当场验证。
- api/ 收敛（受挂载盘禁止 rm/mv 限制，物理删除/改名降级为标注 + 用户命令）：
  - `api/backend.js` 转发壳头部标注 DEPRECATED，注明删除后 `api/backend` 无后缀导入自动解析到 `backend/index.js` 零改动兼容，待用户执行 `git rm frontend/src/api/backend.js`；
  - `api/weather.js` 头部与文件树注释消歧：本文件为高德天气前端业务封装，与 `api/backend/weather.js`（后端天气代理）同名不同义。

## 修改原因

前端架构评审（frontend-structure.md 全量走查 + 量化：features/ 41 文件平铺、utils/ 21 文件平铺、api 三层 barrel 与同名 weather 两义、js:ts=257:85）后按「变动最小优先」原则落地 T0/T1 快赢项。

## 事件逻辑链条分析

核心症状与根因：结构规范依赖人肉执行（树同步、barrel 双层注册）且存在演进遗留重复（api 转发壳、同名文件）。处理：规范成文 + 门禁脚本化 + 遗留项标注收敛路径。受影响模块：composables/map/features/README.md、api/backend.js、api/weather.js、根目录门禁脚本、两份结构树文档。

## 优化解决方案（实施步骤）

评审定级（T0 文档级 / T1 小改 / T2 批量 / T3 结构性）→ 执行 T0 两项与 T1 标注版 → 门禁首跑报告漂移 → ESLint 验证 → 落档。T2/T3 路线：utils 与 features 分域、dataImport 双目录消歧、容器二轮拆分（V3.4.29 路线图）、Cesium 库级代码迁 src/lib、TS 化 + vue-tsc 门禁。

## 性能指标

不适用（文档 + 门禁 + 注释级改动，零运行时行为变化）。

## 测试方案

- `python CheckStructureTree.py`：输出统计与漂移清单，退出码 1（存在漂移）/0（一致）/2（路径缺失）——已验证首跑检出 26+3；
- ESLint：api/weather.js、api/backend.js 零告警；
- 后续（用户执行 `git rm frontend/src/api/backend.js` 后）：`npm run dev` 冒烟确认 8 处 `api/backend` 导入自动落到目录 index。

## 后续补记（同日 20:35）：barrel 链两层化（T1-4 落地）

前置核验：ESM `export *` 重名会静默丢弃，但重名项（routeService 的 3 个 createRoute* 与 usePositionCodeTool）均 re-export 自同一原始模块——同源绑定不构成歧义；唯一真实缺口为 features/index 漏登 `tileHDRendering/toggleTileHDRendering`（已补）。改造：`map/index.js` 以 `export * from './features'` 替代 basemapSystem/layerManager/interactionHandlers 三行转发；领域 barrel 文件保留（LayerControlPanel 等直接导入方无感）；features/README 注册规则由"双层"改写为"单层 + 历史背景"。回归：旧链路导出 62 项全部可达、ESLint 零告警。涉改：`composables/map/index.js`、`features/index.js`、`features/README.md`。

## 后续补记（同日 20:25）：漂移清零

首报 26+3 项全部处置：真实新文件 6 项补录进树（`cesiumTocActions.js`、`cesiumLayerNodeBuilder.ts`、`cesiumLayers.ts`、`dataSourceDisplay.js`、`index.d.ts`、`units.js`）；`fluidruntime.js` 大小写修正为 `fluidRuntime.js`；20 个资产/数据文件（罗盘 Explanation JSON×5、themes×5、types×3、导航 svgPaths×4、浅水 shaders×3）归入脚本 `SUMMARIZED_DIR_SUFFIXES` 概括目录豁免（文档保持目录级登记的原设计）；脚本改为「仅扫描树条目本体（# 注释段除外）」消除 Three.js/交叉引用等散文误报。终态：文档 382 ⇄ 磁盘 382，双向零漂移，退出码 0。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\CheckStructureTree.py（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\README.md
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend.js（DEPRECATED 标注）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\weather.js（消歧注释）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（登记门禁脚本）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（backend.js/weather.js 注释更新）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.31）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.31 版本段）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-frontend-architecture-quickwins.md（本日志）
