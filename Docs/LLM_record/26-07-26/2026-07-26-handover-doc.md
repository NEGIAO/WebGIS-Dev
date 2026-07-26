# 交接文档 handover.md 落档（V3.4.37）

## 日期和时间

2026-07-26 20:32（北京时间）

## 事件逻辑链条分析

- **核心症状**：项目文档体系已相当完备（配置手册/架构文档 11 篇/结构树/百余篇维护日志），但缺一个「接手者第一入口」——新人（或新 AI 会话）不知道先看哪个、按什么顺序看；大量实战经验（响应式禁 Cesium 对象、版本撞车处理、JSDoc 陷阱等）只散落在各日志中。
- **根本原因**：文档按"产出物"组织（每次任务一篇），没有按"读者旅程"组织的顶层导航；坑类知识没有归集点。
- **受影响模块**：仅文档与导航。
- **解决思路**：新增 `Docs/Guide/handover.md`，定位「导航 + 独家知识」——凡既有文档已覆盖的只给链接与一句话定位，正文只沉淀三类别处没有的内容：读者旅程（30 秒认知→10 分钟跑通→按问题找文档）、高频场景代码坐标、坑清单。

## 修改内容

1. **新增 `Docs/Guide/handover.md`**（8 节）：
   - §1 三十秒认识项目 / §2 十分钟跑起来（LocalDev + 默认账号，细节链接 configuration.md）；
   - §3 文档地图：六类问题 → 对应文档链（配置三件套、OAuth、结构树、架构 11 篇、CHANGELOG→LLM_record 溯源链、Force_command+约定）；
   - §4 三大核心架构速览：三层配置（数据流图 + 唯一读取端 + 新增 key 流程）、统一图层管理（元数据入店句柄留场 + 双入口数据流 + 类型适配单点）、3D 功能模块文件夹范式（Analysis 为模板：模块定义/运行时工厂/按钮控件约定）；
   - §5 高频修改场景 → 代码坐标表（7 类场景直达入口文件，含"底图双文件对称""版本号只改 README 三处自动注入"等要点）；
   - §6 门禁与提交五步流程（CheckConfigRegistry / CheckStructureTree / ESLint+tsc / 日志版本规范 / git 权限归属用户）；
   - §7 八条「别处没写的坑」（血泪清单，见 CHANGELOG 摘要）；
   - §8 已知边界与候选增强（待实机回归指引、存量 tsc 错误定性、三项候选增强）。
2. **README**：开发文档表新增 handover 行（紧随项目结构详解）；版本 V3.4.37 三处；版本表保留最新三条。
3. **project-structure.md**：Guide 树登记 handover.md。

## 修改原因

用户要求"文档写好，方便交接"。当日完成三层配置、三维分析、统一图层管理三大架构落地，正是沉淀交接入口的最佳时点。

## 影响范围

纯文档；建立"重大架构变化时更新本文并在 CHANGELOG 留痕"的维护约定（写入文末）。

## 优化解决方案

反模式规避：交接文档最易腐烂的原因是复制细节——本文严格执行「链接不复制」，细节变更时只有链接目标在变，本文仅在架构级变化时才需动；坑清单与坐标表为增量维护（追加式），维护成本低。

## 性能指标

不适用。

## 测试方案

- 全部相对链接逐一核对目标文件存在（configuration/three-tier/plan/oauth/structure×3/CHANGELOG/dev-conventions/dev-guide/faq/.env.example、Architecture 两篇）；
- 代码坐标表与当前仓库实况核对（本会话调研结论为据）；
- 版本表三条（37/36/35）、简介与页脚 V3.4.37 一致。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\handover.md（新增）
- D:\Dev\GitHub\WebGIS-Dev\README.md（开发文档表 + 版本 V3.4.37 三处 + 版本表裁剪）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（Guide 树登记）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.37 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-handover-doc.md（本日志）

> 备注：未执行任何 git 操作，提交由用户决策。
