# 修 Bug 与优化规划落档（V3.4.39）

## 日期和时间

2026-07-26 20:44（北京时间）

## 事件逻辑链条分析

- **核心症状**：当日完成多条大线（配置架构/三维分析/统一图层管理/交接文档）后，用户要求规划下一步修 bug 与优化内容——需要一份**有证据支撑**的分级计划，而非拍脑袋清单。
- **根本原因**：问题信息散落四处（代码 TODO 注释、tsc 输出、各日志"待实机回归"节、设计文档风险节、faq 遗留 TODO），从未归集为可执行排期。
- **受影响模块**：仅文档（规划本身）；计划覆盖前后端多模块的后续执行。
- **解决思路**：先全库证据盘点（五种来源交叉），再按 P0–P3 分级 + 三 Sprint 排期落档 `Docs/TODO/`，滚动维护（完成勾选 + 链接日志）。

## 修改内容

1. **证据盘点结果**（写入计划文档"盘点方法"）：
   - 代码 TODO/FIXME：5 处，全部位于 cesium-navigation 内嵌包（上游遗留，tracking 场景 2 处 bug 注释）；业务代码零 TODO 残留。
   - `tsc --noEmit` 全量：过滤 cesium 模块解析环境噪音后，**唯一真实业务错误** `layerTreeBuilder.ts:389`（`capabilities.edit` 未在 `StandardLayerCapabilities` 声明，V3.4.9 编辑泛化引入）。
   - 后端安全面：`app.py` CORS `allow_origins=["*"]`（白名单代码被注释）；`oauth.py` 一次性 ticket 存进程内存（配置架构计划已标注多 worker 限制）。
   - 前端卫生：9 处 `console.log` 残留。
   - 可维护性：5 个 2000+ 行文件（CesiumToolPanel 2686 / TOCPanel 2499 / RegisterView 2198 / MapContainer 2041 / HomeView 2011）；罗盘元数据 4323 行 TS 常量疑似进主 bundle。
   - 官方遗留：faq.md TODO（高德低级 API → 高级 API）。
2. **新增 `Docs/TODO/bugfix-optimization-plan.md`**：P0（回归欠账六项合并清单 / tsc 类型修复 / OAuth ticket 落库）→ P1（CORS 白名单 key / tileset style 合成收编 / console.log 清零）→ P2（罗盘元数据懒加载 / 矢量透明度扩材质 / 高德 v5）→ P3（巨型文件渐进拆分表 + 上游 TODO 挂起）；每项含问题定位、证据坐标、方案、工作量、验收标准；附三 Sprint 执行顺序与滚动维护约定。
3. **登记**：project-structure Docs 树补 TODO 目录展开（本计划 + OverPassApiIntegration）；README 版本 V3.4.39 三处 + 版本表；CHANGELOG 条目。

## 修改原因

用户指令"规划一下下一步要进行修 bug 和优化的内容"；符合 Force_command"先分析（事件逻辑链条）后行动"的准则——本计划即后续各执行任务的分析前置。

## 影响范围

纯文档。后续按计划逐项执行时各开独立维护日志。

## 优化解决方案

计划文档三原则：证据可溯（每项标注来源坐标）、验收可判（每项有明确通过标准）、滚动可维护（完成勾选 + 新发现按 P 级插入，避免一次性计划腐烂）。P0 把"实机回归欠账"列为最高优先——当日大量静态验证需实机闭环后才可提交，这是当前最大风险敞口。

## 性能指标

不适用（规划文档）；P2-1 含性能目标（主 bundle 预期减 ~100KB+，以 analyze 报告为准）。

## 测试方案

- 盘点命令可复现：`grep -rn "TODO\|FIXME" frontend/src backend`（排除 node_modules/.venv）、`tsc --noEmit` 过滤 cesium 噪音、`grep console.log`、`wc -l` 排序、CORS/ticket 代码走查。
- 计划内引用的文件/行号与仓库实况核对一致（本会话扫描输出为据）。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\Docs\TODO\bugfix-optimization-plan.md（新增）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（TODO 目录树展开登记）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.39 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.39 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-bugfix-optimization-plan.md（本日志）

> 备注：未执行任何 git 操作，提交由用户决策。
