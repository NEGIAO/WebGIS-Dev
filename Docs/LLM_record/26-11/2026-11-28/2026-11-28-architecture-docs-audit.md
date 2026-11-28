# 2026-11-28 架构文档全量核对与现状同步

- **日期与时间**：2026-11-28 15:58 – 16:05（CST）
- **任务等级**：L2（文档体系校正，跨模块但不改运行逻辑）
- **本次版本**：V3.7.18（V3.7.17 已被并发会话占用；按 Force_command §5 顺延）
- **任务来源**：用户指令：架构文档很多过时或严重不符；按实际代码与架构核对架构文档和 README，同步最新状态、架构与日期，反映真实情况。

## 问题分析（阶段一结论，先于修改落盘）

**核心症状**：`Docs/Architecture/` 中现行态文档与代码存在三类漂移：
1. **已删除文件仍被当作 SSOT**：`basemap-source-system.md` 仍称 `basemapConfig.ts` / `basemapCore.ts` / `group-1~4.ts` 是底图定义门面；这些文件在 V3.7.16 已删除，实际 SSOT 为 `domains/common/basemap/definitions/` + `catalog/`。
2. **数量与能力声明过时**：底图定义数写 205（实际 199）、预设数写 92/94（实际 181）；配置 key 写 146/139（实际 `.env.example` 147 / `catalog.py` 161）；Cesium 图层管理表仍写可见性/透明度不支持；多格式导入仍写 3D 不支持 GeoTIFF、无 CSV/TXT/WKT。
3. **身份与流程描述与现行代码相反**：`identity-auth-security.md` / `account-system-ai-quota.md` 仍写「无 token 自动铸造临时游客」「`is_temporary=True`」，现行代码是无 token 401 `GUEST_TOKEN_REQUIRED`、由 `/auth/guest/session` 签发、session 显式 `is_temporary=False`。

**根本原因**：V3.7.16 一次大批量重构合并了多会话增量，文档更新分散在过程日志与 CHANGELOG，未对现行态架构文档做统一回写；部分文档把「历史设计」与「当前实现」混写。

**受影响模块**：Architecture 现行态文档、README 架构导航、`Guide/project-structure.md` / `frontend-structure.md` / `handover.md` 文件树与计数。

**候选方案**：
- A. 把过时文档移入 `decisions/` / `TODO/archive/` 并新建现行态文档——会破坏 README 链接与结构树 SSOT，且需要改目录（L3）。
- B. 原地重写过时章节为当前实现，保留历史决策目录不动——链接稳定、符合 §4 SSOT，风险最低。
- C. 仅在每篇顶部加「已过时」提示——不满足「反映真实情况」。

**选定方案**：B。原地更新现行态文档；`decisions/` 与过程日志保持历史原样；在每篇现行态文档顶部统一加核对日期与版本标记。

## 修改内容

见下文实施小节与最终交接块；本节在动文档前写入，满足 Force_command §3「分析先行」。

## 修改原因

架构文档是接手导航与 Code Review 依据；错误 SSOT、错误数量与相反流程会直接误导后续开发。本次以当前代码为唯一事实源做回写，不扩展功能范围。

## 影响范围

文档层：`Docs/Architecture/*`、`Docs/Guide/{project-structure,frontend-structure,handover,configuration}.md`、`README.md`。不修改运行代码、配置值或 Git 状态。

## 解决方案

```mermaid
flowchart LR
    A[四组只读审计] --> B[按现行态/历史态分类]
    B --> C[P0：删除文件引用/数量/鉴权流程/能力矩阵回写]
    C --> D[P1：配置 key、域名、Node 版本、Agent 数量与日期]
    D --> E[README + 结构树 SSOT 对齐]
    E --> F[结构树/配置/类型/红线门禁]
```

## 性能指标

未实测（文档治理任务）。

## 测试方案

### Agent 已执行

- 只读审计四组：`Docs/Architecture/` 现行态 24 篇 + README + 三份 Guide 结构文档；历史 `decisions/` 不改写。
- `vue-tsc --noEmit`：0 错误；`check:basemap-catalog` OK（181 presets）；`check:layer-definitions` OK（199 definitions，order 1..199）。
- `CheckStructureTree.py --quiet`：769/769；`CheckConfigRegistry.py -q`：通过；`CheckDomainDeps.py`：0 跨域。
- 平台红线 §11.2：红线 1–8 无新增命中，红线 9 `REDLINE-CLEAN`。
- 残留过时声明扫描：`205 定义` / `1..205` / `91 预设` / `107 定义` / `Node 20` / `GPX` / `8,752` 等现行态命中已清零（仅历史 CHANGELOG 保留）。

### 待用户实机验证

1. 从 README 架构导航进入任一行，文档描述应与当前代码一致。
2. `Docs/Architecture/decisions/` 历史决策仍可追溯，未被改写。

## 变更文件清单

- `Docs/Architecture/*.md`（24 篇）：统一加 `2026-11-28 · V3.7.18` 核对标记；按审计结果回写过时章节。
- `Docs/Architecture/basemap-source-system.md`：按 V3.7.16 代码全量重写为 `common/basemap` SSOT 现状。
- `Docs/Architecture/identity-auth-security.md` / `account-system-ai-quota.md`：游客身份改为 token 必填、sessions 命中、`is_temporary=false`。
- `Docs/Architecture/multi-format-data-import.md`：补 3D GeoTIFF、CSV/TXT/WKT，修正路径与 flyTo/fit 参数。
- `Docs/Architecture/cesium-unified-layer-management.md`：可见性/透明度改为已支持，动态颜色属性改为包装而非跳过。
- `Docs/Architecture/agent-capability-system.md`：工具 schema、提示词分段、后端安全底线与核对日期对齐代码。
- `Docs/Architecture/configuration-three-tier.md` / `system-architecture.md` / `download-service.md` / `cesium-3d-effects.md` / `cesium-fluid-flood-simulation.md` / `route-planning.md`：配置键数、域名表、Node 版本、下载节点、行数/参数/文件表更正。
- `README.md`：文件数、底图数量、导入格式、Node 22、下载服务状态、架构导航核对说明。
- `Docs/Guide/{project-structure,frontend-structure,handover}.md`：定义数 199、分类计数、V3.7.18 变更行。
- 本日志。

## 遗留与风险

1. 文中代码行号仅作导航，后续改动仍可能漂移；已在统一核对标记中声明「以符号名为准」。
2. `Docs/Architecture/decisions/` 与历史过程日志保持原样，描述的是当时决策，不代表当前实现。
3. 既有 `vpn.negiao.cn` / Cloudflare Worker 文本属于此前用户裁定范围，本批未改生产端点；平台红线 9 基线仍为清理态。
