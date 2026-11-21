# 2026-11-21 管理面敏感值掩码：API 密钥/表浏览器不再下发明文

- **日期与时间**：2026-11-21 13:10
- **任务等级**：L2（Bug 修复 / 安全加固）
- **版本**：V3.7.6
- **关联**：`bugfix-optimization-plan.md` P1-4 [P2] 管理员 GET 回显 L3 明文 / 表浏览器裸 dump 密钥；顺带核验销项 [P1] 损坏恢复锁外竞态

## 问题分析

### 核心症状

1. `GET /api/admin/api-keys/{name}` 与 `GET /api/admin/api-keys/status` 把上游 LLM 供应商密钥**明文**放进每次响应（面板前端虽有「默认掩码 + reveal」交互，但明文常驻传输层：反代日志 / DevTools / 截屏均可截获）。
2. `GET /api/admin/db/table/{table}/rows` 表浏览器 `SELECT rowid, *` 裸 dump：`sessions.token`、`users.password_hash`、`api_keys.key_value` 全量回显。

### 根本原因

明文的「下发粒度」错了——常态接口全量下发、无按需拉取通道；且表浏览器无敏感列概念。

### 受影响模块

`backend/api/api_keys_management.py`、`backend/api/admin.py`、`backend/core`（新增掩码器）、前端 `ApiKeysManagementPanel.ts`、`api/backend/admin.ts`、双语文案。

### 候选方案对比

| 方案 | 评价 |
|---|---|
| A：服务端永远掩码，删除面板 reveal/copy | UX 回归，破坏「管理员复制密钥用于别处」既有工作流 → 否决 |
| **B（选定）：默认掩码下发 + 新增 `GET /{name}/reveal` 逐 key 显式拉取** | 保留查看/复制 UX；明文从「每次全量下发」变「按需单点请求」，请求本身即审计信号；常态暴露面收敛 |
| C：仅前端改进 | 不解决传输层暴露 → 否决 |

### 防回归设计

新增**掩码回写拦截**（`assert_no_masked_writeback`）：表浏览器 update/insert 若把掩码占位值（含 `****`）写回敏感列 → 400。防御「UI 把掩码读值误当明文保存」造成密钥被静默覆盖为 `sk-ab****xy` 的数据污染。

## 修改内容

1. **feat**：`backend/core/secret_masking.py` —— `mask_secret`（前 4 后 4，≤8 位整体打码，空值返空保「未配置」语义）、`is_sensitive_column`（精确集 + token/password/secret/credential/key_value 子串，大小写不敏感）、`mask_sensitive_row`、`assert_no_masked_writeback`。
2. **fix**：`/status` 与 `GET /{key_name}` 的 `key_value` 改掩码下发（`_list_api_keys_sync` 源头掩码）；响应 note 同步更新。
3. **feat**：新增 `GET /api/admin/api-keys/{key_name}/reveal`（require_admin）——明文逐 key 显式拉取。
4. **fix**：表浏览器 `_list_table_rows_sync` 逐行掩码敏感列后下发。
5. **fix**：`_insert_row_sync` / `_update_rows_sync` 增掩码占位值回写拦截（400）。
6. **feat（前端）**：`apiAdminRevealApiKey`；面板 `plainKeys` 明文缓存（随状态重载失效）、`toggleReveal` 改按需拉取（失败 toast `apiKeys.revealFailed`）、`copyKey` 改拉明文后复制、`displayKeyValue` 兼容历史明文形态兜底掩码。
7. **i18n**：中英 `apiKeys.revealFailed`。
8. **docs**：顺带核验销项旧台账「损坏恢复锁外竞态」——当前代码损坏检查已在锁内（RLock 双保险）；`.dump`「行式导入丢换行」为过时描述（现行 `_import_sql` 将整个 dump 经 sqlite3 CLI stdin 导入，CLI 正确解析多行 TEXT，无 Python 行切分路径）。

## 影响范围

管理面板（密钥状态/查看/复制）、管理表浏览器读、表编辑写闸；**不影响**密钥设置流（用户输入新值 POST /set 不变）、备份列表（原已脱敏）、`/map-tokens` 运行时下发（前端直连地图服务需要真实值，属功能语义非泄密面，不动）。

## 解决方案

见「候选方案对比」B + 防回归设计；实施细节见「修改内容」。

## 性能指标

不涉及（掩码为 O(1) 字符串操作，响应体变小）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `pytest tests/test_secret_masking.py tests/test_guest_identity.py` → **30/30 绿**（10 新测：长短值/空值掩码、列判定精确+子串+大小写+非敏感反例、行掩码不就地改、None 保留、掩码回写拦截四态） | ① 打开管理面板 → 密钥列表显示掩码值；点「显示」→ 明文出现（Network 见 `/reveal` 请求）；点「隐藏」→ 复掩码；「复制」→ 剪贴板为完整明文 |
| `vue-tsc --noEmit` → 0 错误；`eslint`（4 文件）→ 0 problems | ② 表浏览器查看 sessions / users / api_keys 表 → token / password_hash / key_value 列为掩码；其他列（username 等）原样 |
| `CheckStructureTree.py` → 738+2 补录后复验通过 | ③ 表浏览器编辑某行把 token 改成含 `****` 的值 → 400 拒绝并提示；改成正常值 → 成功 |
| `CheckConfigRegistry.py` → 全绿（无新 key） | ④ 密钥「设置新值」流程不受影响（输入新明文 → 保存 → 列表显示新掩码） |
| §11.2 红线扫描 → 除已知假阳性 `maxRayDistance` 外零命中 | ⑤ 越权确认：非管理员访问 `/reveal` → 401/403 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/core/secret_masking.py` | **新增**：掩码器 + 敏感列判定 + 回写拦截 |
| `backend/api/api_keys_management.py` | status/GET 掩码化 + reveal 端点 |
| `backend/api/admin.py` | 表浏览器行掩码 + insert/update 回写拦截 |
| `backend/tests/test_secret_masking.py` | **新增**：10 单测 |
| `frontend/src/api/backend/admin.ts` | + `apiAdminRevealApiKey` |
| `frontend/src/domains/common/user/components/ApiKeysManagementPanel.ts` | reveal 按需拉取 + 明文缓存 + 兜底掩码 |
| `frontend/src/locales/zh-CN/admin.ts`、`en-US/admin.ts` | + `apiKeys.revealFailed` |
| `Docs/Guide/backend-structure.md` | 补录 2 新文件 |
| `Docs/TODO/bugfix-optimization-plan.md` | P2 销项 + P1 锁外竞态核验销项 |
| `README.md`、`Docs/Guide/CHANGELOG.md` | 版本三处（V3.7.6）+ 条目 |
| `Docs/LLM_record/26-11/2026-11-21/2026-11-21-admin-secret-masking.md` | 本日志 |

## 遗留与风险

1. `/map-tokens` 运行时端点仍返回真实 token（前端直连地图服务所必需，属功能语义）；其暴露面由既有 `require_api_access_or_guest` + 来源校验约束，未在本任务范围。
2. 表浏览器按**列名**判定敏感——未来新增敏感列若命名不含 token/password/secret/credential/key_value 关键词，需手动加入精确集合（子串规则已尽量覆盖）。
3. `/status` 掩码化后，若外部脚本曾依赖明文（未发现此用例），需改走 `/reveal`。
4. 并行会话观察：本会话期间 `bugfix-optimization-plan.md` 再次被外部写入（Edit 报 modified-since-read），重读后完成编辑——与台账「移动靶」记录一致，提交前请以最后一次磁盘内容为准复核。
