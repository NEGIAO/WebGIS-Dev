# 三层配置架构文档落档（系统运行全景，V3.4.15）

## 日期和时间

2026-07-26 19:07（北京时间）

## 事件逻辑链条分析

- **核心症状**：三层配置体系已全量落地（V3.4.6–V3.4.13），但知识分散在执行计划、配置指南与 5 篇维护日志中，缺一份「系统运行视角」的架构总览——新成员想理解"一份配置从哪来、经过谁、被谁消费、绝密为何到不了前端"需要拼读多篇文档。
- **根本原因**：落地期文档以"怎么做/怎么配"为主（计划书 + 使用手册），没有沉淀"为什么这样运转"的架构叙述；Docs/Architecture/ 已有八大功能架构文档的先例，配置体系应同规格入册。
- **受影响模块**：仅文档与导航（Docs/Architecture、根 README、project-structure），零代码变更。
- **解决思路**：按既有 Architecture 文档规格新增一篇，用 Mermaid 承载总体架构图与时序图（GitHub 原生渲染），正文分层详解 + 安全不变量 + 门禁流程 + 版本足迹，并与 configuration.md（手册）、执行计划（路线）交叉链接形成三件套。

## 修改内容

1. **新增 `Docs/Architecture/configuration-three-tier.md`**，共 9 节：
   - 总体架构图（Mermaid flowchart：配置来源三层 → backend/config 四模块 → 后端业务四域 → 三个公开 API → 前端构建期/运行期双腿 → 门禁脚本，实线=启动/构建期注入、虚线=运行时读取）；
   - 三层来源职责边界表（放什么/谁改/生效方式 + 硬性边界）；
   - backend/config 四模块职责表与两条优先级链（L1/L3：系统 env ▸ 根 .env ▸ backend/.env ▸ catalog 默认；L2：DB ▸ env ▸ 默认，绝密禁 DB）；
   - 四条关键链路（OAuth URL 推导、admin 密码链、Agent 密钥 DB 池▸env、SMTP 调用时读取与别名收敛）；
   - 前端消费（publicRuntime 单点 + 12 处底图 URL + 运行期 API）；
   - 启动/请求时序（Mermaid sequenceDiagram）；
   - 4 条安全不变量；新增 key 门禁流程；V3.4.6→13 版本足迹表。
2. **根 README**：「架构文档」表新增「三层配置架构」行；版本 V3.4.15（简介/表首/页脚三处），版本表保留最新三条（V3.4.12 行归档至 CHANGELOG）。
3. **`project-structure.md`**：Architecture 目录注释两处更新（补三层配置架构）；修复根级树 `Docs/`、`Demo/` 各一处历史重复行。
4. **CHANGELOG**：V3.4.15 条目。

## 修改原因

用户要求输出优化后系统运行架构图与详细说明；按项目惯例将其沉淀为 Docs/Architecture 正式文档（与八大功能架构同规格），避免知识只存在于对话中。

## 影响范围

纯文档与导航；不涉及 frontend/backend 代码，无运行时影响。

## 优化解决方案

架构图选 Mermaid 而非截图/外链 SVG：随仓库版本化、GitHub/IDE 原生渲染、后续演进可 diff。文档定位与既有三件套分工明确——configuration.md 管"怎么配"、执行计划管"怎么落地的"、本文管"怎么运转"，三者相互链接不重复展开。

## 性能指标

不适用（纯文档）。

## 测试方案

- Mermaid 语法：flowchart 与 sequenceDiagram 节点/边均为引号包裹文本，无保留字冲突；推送 GitHub 后确认两图正常渲染。
- 链接有效性：文内相对链接（../Guide/configuration.md、configuration-architecture-plan.md、../../README.md）与 README 新行链接路径核对无误。
- 结构一致性：project-structure.md 树中 Docs/Demo 重复行已消除，Architecture 注释与实际文件一致。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\configuration-three-tier.md（新增）
- D:\Dev\GitHub\WebGIS-Dev\README.md（架构文档表 + 版本 V3.4.15 三处 + 版本表裁剪）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（Architecture 注释 + 重复行修复）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.15 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-architecture-doc-three-tier-config.md（本日志）

> 备注：无代码变更；未执行任何 git 操作，提交由用户决策。
