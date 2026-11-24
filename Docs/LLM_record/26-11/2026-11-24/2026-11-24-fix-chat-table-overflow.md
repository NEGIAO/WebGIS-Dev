# 2026-11-24 修复 Agent 回复表格横向溢出气泡

- **日期与时间**：2026-11-24 12:08
- **任务等级**：L2（继 V3.7.32 渲染修复后的回归修补）
- **版本**：V3.7.34

## 问题分析

### 核心症状

用户截图显示：Agent 回复中的两列表格与三列表格在聊天气泡内产生嵌套横向滚动条，
右侧列被截断，需要横向拖动才能读完；气泡本身宽度正常，溢出发生在表格层。

### 根本原因

V3.7.32 为避免长文本拥挤，在 `.markdown-body table` 上加了：

- `min-width: 420px`：表格盒模型被强制至少 420px，气泡较窄时表格自身溢出父容器；
- `display: block` + `overflow-x: auto`：把表格变成块级滚动容器，产生独立横向滚动条；
- `thead th { white-space: nowrap }`：表头不允许换行，进一步撑高最小内容宽度。

三者叠加使表格不再随气泡收缩，属于上一轮“增强可读性”引入的回归。

### 受影响模块

| 模块 | 文件 | 影响 |
|---|---|---|
| 聊天 Markdown 表格 | `common/chat/components/ChatMessageList.vue` | 表格溢出、需横向滚动 |

## 修改内容

1. `.markdown-body table` 改为 `display: table; width: 100%; max-width: 100%`，
   删除 `min-width` 与 `overflow-x`。
2. `.markdown-body th/td` 保留 `word-break: break-word` + `overflow-wrap: anywhere`，
   删除 `min-width: 90px`，让列宽完全由容器分配。
3. `.markdown-body thead th` 删除 `white-space: nowrap`，允许表头折行。

## 修改原因

Markdown 表格应像正文一样贴合气泡宽度，长中文通过换行解决，而不是用横向滚动解决。
代码块保留横向滚动是合理的（代码不应折行），表格不应沿用这一策略。

## 影响范围

- 仅影响聊天消息中的 Markdown 表格；代码块、引用、列表、公式均不变。
- 不涉及解析、消毒、地图引擎与配置。

## 解决方案

| 方案 | 做法 | 结论 |
|---|---|---|
| A. 给表格套滚动容器 | marked 输出加 wrapper | 否决：需改解析器，且仍要横向拖动 |
| B. 缩小字号 / 压缩 padding | 视觉降级 | 否决：不解决根因，可读性更差 |
| C. 表格回归文档流，列宽随容器 + 任意换行 | 三处 CSS 调整 | **采用**：无滚动条，内容完整可见 |

实施步骤：撤销 min-width/nowrap/overflow → 恢复 table 显示 → 构建验证产物 CSS。

### Mermaid 图

```mermaid
flowchart LR
  A[Agent 表格 Markdown] --> B[marked → table HTML]
  B --> C{表格宽度策略}
  C -->|旧: min-width + nowrap + overflow-x| X[表格溢出气泡 + 横向滚动条]
  C -->|新: width 100% + max-width 100% + 任意换行| Y[表格贴合气泡，列内折行]
```

## 性能指标

不适用（纯 CSS 调整，未实测）。

## 测试方案

### Agent 已执行

- 截图核对：气泡边界正常，横向滚动条来自表格自身；定位到 `min-width` / `nowrap` / `overflow-x` 三处 CSS。
- `vue-tsc --noEmit`：0 报错；ESLint（改动文件）：0 warning / 0 error。
- `CheckStructureTree.py` 746/746、`CheckConfigRegistry.py` 七项全绿、`CheckDomainDeps.py` 四方向均 0。
- 生产构建成功；产物 CSS 中表格规则为
  `.markdown-body table{table-layout:auto;...width:100%;max-width:100%;...display:table}`，
  已无 `min-width` / `overflow-x`。

### 待用户实机验证

1. 重新发送/刷新截图中的同一条 Agent 回复。
2. 预期：两列与三列表格均在气泡内完整显示，无横向滚动条，长文本自动折行。
3. 回归：代码块仍可横向滚动，公式与任务列表样式正常。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/chat/components/ChatMessageList.vue` | 表格宽度回归文档流 |
| `README.md` / `Docs/Guide/CHANGELOG.md` | 版本记录 |
| 本文件 | L2 维护日志 |

## 遗留与风险

- 极窄屏（< 320px）下三列表格列宽会很窄，但仍可读；未设断点，因为聊天侧栏最小宽度已由外层约束。
- 版本写入时 README 为 V3.7.33（并行罗盘任务持续推进），收尾需复核撞车。
