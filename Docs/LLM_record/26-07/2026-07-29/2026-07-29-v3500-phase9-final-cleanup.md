# 前端 domains 架构重构 Phase 9 收尾

> 日期与时间：2026-07-29 16:30
> 任务等级：L2
> 版本：V3.5.0

---

## 问题分析

**核心症状**：架构重构 Phase 1–8 完成后，仍有少量旧路径残留（`components/Routing/`、`components/Search/`、`views/`），且 `frontend-structure.md` 结构树与实际代码严重漂移（103 个文件未收录）。

**根本原因**：
1. Phase 2 迁移 Cesium 时未同时迁移 Routing 和 Search（当时这两个目录不在 Cesium 范围内）
2. Phase 4 迁移 Common Shell/Home 时 `views/` 下的认证/错误页未明确归属
3. Phase 1–8 各阶段迁移后结构树未同步更新，累积漂移

**受影响模块**：前端目录结构、结构树文档

---

## 修改内容

### 1. 迁移残留旧路径

- `components/Routing/` (3 文件) → `domains/ol/routing/components/`
- `components/Search/` (2 文件) → `domains/ol/search/components/`
- `views/` (5 文件) → `src/app/`（与 HomeView 统一入口层）

### 2. 修复相对路径断裂

迁移后发现 3 个文件使用相对路径 `../../api` 引用，新位置路径深度变化导致构建失败：
- `BusPlannerPanel.vue`: `../../api` → `@/api`
- `DrivingPlannerPanel.vue`: `../../api` → `@/api`
- `MapPointPickerCard.vue`: `../../api/locationSearch` → `@/api/locationSearch`

### 3. 更新消费方 import

- `domains/common/shell/SidePanel.vue`: 2 处 import 改用 `@ol/routing/components/` alias
- `domains/common/layer-tree/components/TOCPanel.vue`: 1 处 import 改用 `@ol/search/components/` alias
- `domains/ol/layer/components/LayerControlPanel.vue`: 1 处 lazy import 改用 `@ol/search/components/` alias
- `router/index.js`: 5 处 views 引用改用 `app/` 路径

### 4. 重建 frontend-structure.md

结构树从 311 行（仅覆盖部分文件）重建为 597 行完整树：
- 补录 103 个遗漏文件（分布在 domains/ol、domains/common 各子目录）
- 收录所有文件类型：.vue/.js/.ts/.css/.svg/.frag/.md/.json
- 删除 4 个已不存在文件条目（svgCompassGyro.js 等）
- 删除过期 `components/` 和 `composables/` 段落
- `views/` → `app/` 更新

### 5. 删除旧目录

- `frontend/src/components/` — 完全删除（Routing/Search 迁出后已空）
- `frontend/src/views/` — 完全删除（5 文件迁出后已空）

---

## 影响范围

- 前端目录结构（Routing/Search/views 迁移）
- 前端结构树文档（完整重建）
- 构建链路（修复 3 处相对路径）

---

## 解决方案

**方案对比**：
- A) 将 views/ 迁入 `domains/common/app/` — 需要 router 跨域引用，增加复杂度
- B) 将 views/ 迁入 `src/app/` 与 HomeView 同层 — router 相对路径不变，简洁 ✅

选用方案 B，保持 router 层与入口页面同层，避免跨域引用。

**实施步骤**：
1. 复制文件到新位置
2. 更新所有 import 引用
3. 验证零残留引用
4. 删除旧文件
5. 构建验证
6. 重建结构树
7. 门禁验证

---

## 性能指标

未实测（纯结构迁移，无性能影响）

---

## 测试方案

**Agent 已执行**：
- `npm run build` → ✅ `✓ built in 18.98s, 2870 modules transformed`
- `python CheckStructureTree.py` → ✅ `413 文档 = 413 实际文件，0 遗漏，0 多余`
- `python CheckConfigRegistry.py` → ✅ 配置登记门禁全部通过
- Grep 全项目确认无旧路径残留引用

**待用户实机验证**：
1. 启动 dev server 确认页面正常加载
2. 访问 /register 确认注册页正常
3. 访问 /oauth/callback 确认 OAuth 回调正常
4. 访问不存在的路由确认 404 页面正常
5. 确认路线规划面板（公交/驾车）正常显示
6. 确认地点搜索组件正常工作

---

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `frontend/src/domains/ol/routing/components/BusPlannerPanel.vue` | 从 `components/Routing/` 迁入 |
| `frontend/src/domains/ol/routing/components/DrivingPlannerPanel.vue` | 从 `components/Routing/` 迁入 |
| `frontend/src/domains/ol/routing/components/MapPointPickerCard.vue` | 从 `components/Routing/` 迁入 |
| `frontend/src/domains/ol/search/components/AmapAoiInjectDialog.vue` | 从 `components/Search/` 迁入 |
| `frontend/src/domains/ol/search/components/LocationSearch.vue` | 从 `components/Search/` 迁入 |
| `frontend/src/app/RegisterView.vue` | 从 `views/` 迁入 |
| `frontend/src/app/OAuthCallbackView.vue` | 从 `views/` 迁入 |
| `frontend/src/app/NotFoundView.vue` | 从 `views/` 迁入 |
| `frontend/src/app/TermsOfService.vue` | 从 `views/` 迁入 |
| `frontend/src/app/PrivacyPolicy.vue` | 从 `views/` 迁入 |
| `frontend/src/domains/common/shell/SidePanel.vue` | import 路径更新 |
| `frontend/src/domains/common/layer-tree/components/TOCPanel.vue` | import 路径更新 |
| `frontend/src/domains/ol/layer/components/LayerControlPanel.vue` | import 路径更新 |
| `frontend/src/router/index.js` | views → app 路径更新 |
| `Docs/Guide/frontend-structure.md` | 完整重建（311→597 行） |
| `Docs/Guide/CHANGELOG.md` | V3.5.0 条目补充 Phase 9 日志链接 |

---

## 遗留与风险

- 无旧路径残留引用
- 结构树与实际代码完全一致
- 构建通过
- 无已知风险

---

## 下一步建议

架构重构已全部完成。后续可考虑：
1. 新增功能时按领域归属直接落入 `domains/ol/`、`domains/cesium/`、`domains/common/`
2. 定期检查结构树漂移（每次文件增删改后同步）
