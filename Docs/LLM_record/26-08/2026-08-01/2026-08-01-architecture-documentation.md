# 架构文档体系建设

| 字段 | 值 |
|------|-----|
| 日期与时间 | 2026-08-01 20:00 |
| 任务等级 | L2 |

---

## 问题分析

### 核心症状

项目缺乏系统级的架构可视化文档。README 首页仅展示功能预览，无法让访问者一眼理解项目的工程化部署能力（多仓库、多平台 CI/CD、多域名部署）。

### 根本原因

项目发展过程中，架构文档只覆盖了功能级（`Docs/Architecture/` 的 11 篇功能架构），缺少系统级的：
1. 整体架构图（从源码到用户的完整链路）
2. CI/CD 流水线详解
3. 部署关系与域名映射

### 受影响模块

- README.md（首页缺少架构展示）
- Docs/Architecture/（缺少系统级文档）
- Docs/Guide/project-structure.md（文档树未更新）

### 候选方案对比

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| A. 单篇超长文档 | 集中维护 | 阅读负担重，README 嵌入困难 | ❌ |
| B. 多篇功能级文档 | 已有模式 | 仍缺少系统级视角 | ❌ |
| C. 分层多文档 + README 嵌入总览图 | 总览清晰，细节可链接，README 首页有辨识度 | 多文件维护成本 | ✅ |

### 选定方案与理由

采用方案 C：
1. `system-architecture.md` — 五层分层架构图（源码 → CI/CD → 部署 → 运行时 → 用户）作为总览
2. `cicd-pipeline.md` — 五 Job 部署时序详解
3. `deployment-relationship.md` — 域名清单 + 部署来源矩阵 + 平台能力对比
4. README 首页嵌入简化版 Mermaid 总览图 + 域名映射表

理由：
- README 首页的 Mermaid 图给访问者"第一印象"冲击
- 总览图 + 细节文档的层次结构便于不同深度阅读
- 域名映射文档解决"哪个域名对应哪个平台"的困惑

---

## 修改内容

### 新增文件

1. **Docs/Architecture/system-architecture.md** — 系统架构总览
   - 五层分层架构 Mermaid 图
   - 五层职责说明表
   - 域名全景表
   - 数据流总结

2. **Docs/Architecture/cicd-pipeline.md** — CI/CD 流水线详解
   - 流水线总览 Mermaid 图
   - 五个 Job 的逐 Job 详解（步骤表 + 设计说明）
   - 并发与幂等配置
   - Secrets 清单
   - 部署时序图

3. **Docs/Architecture/deployment-relationship.md** — 部署关系与域名映射
   - 域名全景 Mermaid 图
   - 域名清单（前端 7 + 后端 1 + 存储 1）
   - 部署来源矩阵
   - 前后端通信链路（API + 瓦片）
   - 平台能力对比表
   - 中国大陆访问策略

### 修改文件

4. **README.md**
   - 新增「🏗️ 系统架构」章节（位于项目结构之后、文档导航之前）
   - 嵌入简化版 Mermaid 分层架构图
   - 新增域名映射简表
   - 架构文档导航拆分为「系统级架构」与「功能架构」两组
   - 版本号 V3.5.4 → V3.5.5（简介段 + 版本表 + 页脚，三处）

5. **Docs/Guide/project-structure.md**
   - Docs 文档树中 Architecture/ 展开为完整文件清单（含功能注释）

6. **Docs/Guide/CHANGELOG.md**
   - 顶部追加 V3.5.5 完整条目

---

## 修改原因

1. **项目复杂度已超越功能展示阶段** — 多仓库、多平台、多域名的部署架构本身就是技术亮点，应在 README 首页展示
2. **降低接手者认知负担** — 架构图让新会话/新协作者零成本理解项目全貌
3. **工程化能力的可视化表达** — GitHub Actions 分发到 5+ 平台是少见的技术实践，值得在首页呈现

---

## 影响范围

| 范围 | 说明 |
|------|------|
| README 首页 | 新增架构章节，版本号更新 |
| Docs/Architecture/ | 新增 3 篇系统级文档 |
| Docs/Guide/ | project-structure.md 文档树更新，CHANGELOG.md 条目追加 |

---

## 性能指标

不适用（文档体系建设，无性能相关改动）。

---

## 测试方案

### Agent 已执行

- [x] 验证 deploy.yml 的 Job 结构与文档描述一致
- [x] 验证 .env 中的实际域名（`negiao-webgis.hf.space`）与文档一致
- [x] 验证 basemapConfig.ts 中的瓦片域名（`tiles.negiao.cc.cd`）与文档一致
- [x] 验证 publicRuntime.ts 的 API 通信模式（`VITE_TILE_PROXY_MODE=fallback`）与文档描述一致
- [x] 确认 Mermaid 语法符合 GitHub 渲染规范（使用 `flowchart TB/LR`，节点内换行用 `<br/>` 或引号包裹）
- [x] 版本号三处一致性检查（简介段 + 版本表 + 页脚）

### 待用户实机验证

- [ ] 访问 README 首页确认 Mermaid 图正常渲染
- [ ] 点击架构文档链接确认跳转正确
- [ ] 确认 Cloudflare / Vercel / Posit 等外部平台域名仍为有效状态

---

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `README.md` | 新增架构章节 + Mermaid 图 + 域名映射 + 版本号三处更新 |
| `Docs/Architecture/system-architecture.md` | 新增：系统架构总览（五层分层架构图） |
| `Docs/Architecture/cicd-pipeline.md` | 新增：CI/CD 流水线详解 |
| `Docs/Architecture/deployment-relationship.md` | 新增：部署关系与域名映射 |
| `Docs/Guide/project-structure.md` | 更新：Architecture/ 文档树展开 |
| `Docs/Guide/CHANGELOG.md` | 更新：V3.5.5 条目追加 |

---

## 遗留与风险

1. **外部平台域名未逐一验证** — Cloudflare Pages、Vercel、Posit Connect 的域名是基于用户分析文档编写，未在代码中找到直接配置（这些平台可能由 NEGIAO.github.io 仓库独立配置）
2. **HF Static Space URL** — 文档中使用的 `negiao-web.static.hf.space` 是基于 deploy.yml 的 `NEGIAO/Web` Space 推导，实际 HF Static Space URL 格式可能不同
3. **Mermaid 渲染** — GitHub 对复杂 Mermaid 图的渲染表现需在实机确认，特别是 `subgraph` 嵌套和 `direction` 控制

---

## 日志路径

`Docs/LLM_record/26-08/2026-08-01/2026-08-01-architecture-documentation.md`
