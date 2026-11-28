# 2026-11-28 Code Review 发现 Bug 修复（V3.7.27）

- **日期与时间**：2026-11-28 12:35 – （CST）
- **任务等级**：L2（多文件 Bug 修复，按评审结论实施）
- **本次版本**：V3.7.27（V3.7.23–26 已被并行会话占用，按 §5 顺延）
- **审查依据**：本会话 L0 只读 Code Review（三路并行 agent + 独立核验），报告见会话输出
- **并发说明**：并行会话持续编辑 README / CHANGELOG / 两个面板组件，本会话动手前已逐一读取当前工作区代码重新核验，仅修复**当前实际代码**中仍存在的 Bug

## 问题分析

**核心症状**：L0 评审发现 4 个 P1、4 个 P2、6 个 P3。本次仅修复经当前代码复验仍存在的**功能性 Bug**，不处理文档措辞、代码风格、死代码清理等非 functional 项（按 Force_command §2-5 禁止越权扩大范围）。

**当前代码复验结果**（逐条以工作区实际代码为准，不采信暂存区快照）：

| 问题 | 复验位置 | 当前状态 |
|---|---|---|
| 游客 token DB 故障误判 401 | `auth/dependencies.py:125-131` | ✅ 仍存在 |
| `Search` 保留名 ESLint error | 两个面板 `.ts` 组件注册 | ✅ 仍存在（2 errors 实测） |
| Cesium MVT / 空 URL custom 绕过禁用守卫 | `CesiumToolPanel.ts:525-531` | ✅ 仍存在 |
| OL 搜索按钮触屏目标 <40px | `LayerControlPanel.vue:1172` | ✅ 仍存在 |
| Wayback `number:0` 污染数字搜索 | `useWaybackCatalog.ts:23` + `registry.ts:152` | ✅ 仍存在 |
| 迁移脚本恒 SKIP | `check-basemap-migration.mjs` | ✅ 仍存在 |

已由并行会话解决、本次不重复处理：V3.7.24 版本号同步、架构文档缓存描述（部分）、ESRI 归类、Wayback 双引擎接入。

**根本原因与修复方案**：

1. **P1 游客 DB 故障误踢**：`verify_guest_token_active` fail-closed 把 DB 异常与 token 失效混为一谈，调用方统一返回 `SESSION_EXPIRED` → 前端强制登出。方案：新增 `guest_token_store` 的三态查询 `check_guest_token_status`，区分 `valid / invalid / db_error`；游客分支捕获 DB 异常抛 503 `AUTH_DB_UNAVAILABLE`，与登录 token 分支对齐。
2. **P1 ESLint 保留名**：`Search` 是 HTML 保留标签，Vue 组件注册触发 `vue/no-reserved-component-names`。方案：两个面板注册名改为 `SearchIcon`，模板同步。
3. **P2 Cesium 禁用守卫绕过**：`isUnsupportedCategory` 只作用于分类头，前 20 条 MVT 落在「精选底图」且搜索结果直通 `selectCatalogEntry`。方案：在 `selectCatalogEntry` 入口统一守卫 `tags.includes('vector')` 与 `custom` 空 URL；搜索结果按钮 `:disabled` 复用同一判定。
4. **P2 触屏目标**：`.panel-search-toggle` 无 `min-height`，coarse 下约 35px。方案：coarse 块补 `min-height:40px`。
5. **P3 Wayback 搜索污染**：动态条目 `number:0`，数字 token `"0"` 命中全部 199 条。方案：`searchBasemapCatalog` 对 `number<=0` 的条目跳过数字编号精确匹配；`entryTitle` 对动态项不显示 `0 · `。
6. **P1 迁移脚本恒 SKIP**：脚本依赖 `git show HEAD` 取旧基线，HEAD 已非迁移前状态。方案：SKIP 时设 `process.exitCode = 2` 并明确标注「未执行」，让门禁无法静默通过；登记 `check:basemap-migration` 到 package.json。

## 修改内容

1. **游客 token DB 故障**（`guest_token.py` / `dependencies.py`）：
   - 新增 `GuestTokenDbUnavailable` 异常与 `verify_guest_token_active_strict()`（DB 异常上抛）；
   - 原 `verify_guest_token_active()` 改为包装调用并保持 fail-closed（返回 None），不影响其他调用方；
   - `_build_temporary_guest_session_async` 改用 strict 版本，捕获异常返回 503 `AUTH_DB_UNAVAILABLE`；
   - `_get_session_sync` 调用补 try/except，DB 异常同样返回 503（原先裸抛 500）。
2. **ESLint 保留名**：两个面板的 `Search` 改为 `Search as SearchIcon` 导入与注册，模板 `<Search>` → `<SearchIcon>`。
3. **Cesium 守卫**：新增 `isCatalogEntryDisabled(entry)`（MVT 由 tags/category 判定、custom 无 URL 判定），`selectCatalogEntry` 入口调用，3 处目录/搜索按钮补 `:disabled`。
4. **OL 触屏**：coarse 媒体查询补 `.panel-search-toggle { min-height:40px; display:inline-flex; align-items:center; }`。
5. **Wayback 搜索**：`entryToSearchText` 对 `number<=0` 不拼入搜索文本；`searchBasemapCatalog` 数字 token 分支仅对 `number>0` 生效；`entryTitle` 动态项不显示 `0 · `。
6. **迁移脚本**：两处 SKIP 改 `process.exit(2)` 且文案由 `SKIP` 改 `NOT RUN`；头部补退出码语义说明。
7. **回归测试**：`tests/test_guest_identity.py` 新增 `test_guest_token_db_failure_is_not_treated_as_expired`。
8. **版本**：README 三处 + CHANGELOG 同步 V3.7.27。

## 验证

### Agent 已执行

- `npm run typecheck`：0 错误（中途一次报错由并行会话的 provider 类型引入，已被其修复后复验通过）。
- `npx eslint <5 个改动 TS 文件> --max-warnings=0`：0 错误（`Search` 保留名已消除）。
- `npm run check:basemap-catalog`：OK（148 presets）；`npm run check:layer-definitions`：OK（174 definitions）。
- `node scripts/check-basemap-migration.mjs`：退出码 2 / `NOT RUN`（符合新语义，未执行≠通过）。
- `pytest tests/test_guest_identity.py`：**31 passed**（含新增回归测试）。
- SSR 复验：`entryToSearchText(wayback)` 不再含裸 `0`；MVT preset（`vector_tianditu_mvt_preset`，category=recommended、tags=['vector']）被守卫正确判为禁用。

### 待用户实机验证

1. Cesium 面板展开「精选底图」/搜索 MVT，确认条目呈禁用态且点击无清空底图副作用。
2. 弱网/后端重启时游客访问，确认提示「认证服务暂时不可用」而非跳注册页。
3. 触屏设备展开 OL 面板，确认标题搜索入口 ≥40px 可点。

## 变更文件清单

- `backend/api/auth/guest_token.py`、`backend/api/auth/dependencies.py`、`backend/tests/test_guest_identity.py`
- `frontend/src/domains/cesium/components/CesiumToolPanel.ts/.vue`
- `frontend/src/domains/ol/layer/components/LayerControlPanel.ts/.vue`
- `frontend/src/domains/common/basemap/catalog/registry.ts`、`catalog/taxonomy.ts`、`ui/useBasemapCatalogUi.ts`
- `frontend/scripts/check-basemap-migration.mjs`
- `README.md`、`Docs/Guide/CHANGELOG.md`、本日志

## 遗留与风险

- 本次未处理评审中的非 functional 项（架构文档措辞漂移、硬编码颜色、死字段、P3 样式规范），按 §2-5 不越权扩大范围。
- 并行会话持续编辑 README / CHANGELOG / 两个面板组件；版本号 V3.7.27 为本次认领，若并行会话再升版本需由用户裁决。
- 迁移脚本退出码 2 属语义修正：若未来把它登记为常规门禁，CI 需将 2 识别为「未覆盖」而非失败或通过。
- **并行会话新增文件导致门禁失败**（非本次改动）：收尾时 `CheckStructureTree.py` 报 `category-recommended.ts` 漏登记（该文件 12:49 由并行会话新建、当前 `??` 未跟踪）。按 §2-5「禁止越权扩大范围」未代为补录 `frontend-structure.md`，需其所属会话在提交前同步结构树。
