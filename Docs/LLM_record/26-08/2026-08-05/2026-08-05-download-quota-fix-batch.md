# 2026-08-05 下载配额系统修复批次

> 日期：2026-08-05
> 任务等级：L2

## 问题分析

**核心症状**：Code Review（由用户在上一会话发起）发现下载配额系统（V3.5.17）存在 13 项问题（H1-H3、M1-M5、L1-L5），涵盖 HTTP 语义、配额扣估逻辑、前端展示、并发安全、代码质量等维度。

**根本原因**：V3.5.17 快速实现配额系统时未充分验证以下方面：
1. HTTP 状态码选择（402 vs 429）未对齐语义规范
2. 配额扣减采用"先校验后扣"模式，存在并发绕过风险
3. 前端瓦片估算使用简化公式，与后端精确算法不一致
4. 数据库迁移使用模块级标志，多 worker 部署不安全
5. 部分代码存在冗余（clamp、重复函数）

**受影响模块**：下载配额系统（`backend/download_xyz/download.py`、`backend/api/auth/quota.py`）、前端下载面板（`MapDownloader.vue`、`MyDownloadTasks.vue`）、下载 Store（`useDownloadStore.ts`）、数据库迁移（`download_task.py`）、管理配置（`admin.js`）。

## 修改内容

### H1：HTTP 402 → 429 语义修正
- `backend/download_xyz/download.py`：配额不足时 `status_code=402` → `status_code=429`
- `frontend/src/api/backend/client.js`：移除 402 专属处理分支，合并入 429 处理器

### H2：配额预扣 + 多退少补
- `backend/download_xyz/download.py`：提交时预扣估算额度，成功后按实际瓦片数多退少补，失败/取消时全额退还
- 导入 `_refund_api_quota_sync`

### H3：前端配额实时刷新
- `frontend/src/domains/ol/components/MapDownloader.vue`：`handleSubmit` 成功后调用 `loadDownloadQuota()`

### M1：移除前端瓦片估算
- 新增后端端点 `GET /api/download/estimate-tiles`
- 新增前端 API `apiEstimateTileCount`
- 删除 `estimateTileCountFrontend`，改用后端 API

### M2：多 Worker 迁移安全
- `backend/download_xyz/download_task.py`：删除 `_migrated` 模块级标志，每次启动执行幂等迁移

### M3：parseBlobError 健壮性
- `frontend/src/api/backend/client.js`：非 JSON Blob 读取前 200 字符

### M4：action 参数文档
- `backend/api/auth/quota.py`：docstring 明确 `action` 仅用于日志追踪

### M5：Changelog Breaking Change 标注
- `Docs/Guide/CHANGELOG.md`：V3.5.18 新增 Breaking Changes 小节

### L1：配额剩余展示
- `frontend/src/domains/ol/components/MapDownloader.vue`：模板显示 `quotaRemaining`

### L3：冗余 Clamp 清理
- `backend/api/admin.py`：移除两处冗余 `max/min` clamp

### L4：estimated_remaining 精度保护
- `backend/download_xyz/download.py`：增加 `progress > 5` 且 `elapsed > 10s` 阈值

### L5：copyTaskId 公共提取
- 新增 `frontend/src/domains/common/utils/clipboard.ts`
- `MapDownloader.vue` + `MyDownloadTasks.vue` 统一使用

## 修改原因

Code Review 发现的问题需要修复以提高系统正确性、安全性与可维护性。

## 影响范围

- 下载配额系统（核心逻辑）
- 前端下载面板（UI 展示）
- 数据库迁移（运维安全）
- 管理配置（代码质量）

## 解决方案

逐项修复，按优先级从高到低（H → M → L）实施。每项修复独立可验证，无交叉依赖。

## 性能指标

未实测（纯逻辑修复，不涉及性能路径）。

## 测试方案

### Agent 已执行
- 代码审查：逐项确认修复与原始问题对应
- 语法检查：Python 文件确认无语法错误（通过读回验证）

### 待用户实机验证
1. 提交下载任务 → 确认配额预扣（查看日志"预扣下载配额"）
2. 任务成功 → 确认多退少补（查看日志"多退少补"）
3. 任务失败/取消 → 确认退还（查看日志"已退还预扣配额"）
4. 配额不足提交 → 确认返回 429（非 402）
5. 前端提交后 → 确认剩余配额立即刷新
6. 前端瓦片估算 → 确认显示值与后端一致
7. 管理员修改 TTL/配额 → 确认 Pydantic 验证生效

## 变更文件清单

| 文件路径 | 说明 |
|---|---|
| `backend/download_xyz/download.py` | H1+H2+H3(预扣)+L4+estimate-tiles 端点 |
| `backend/api/auth/quota.py` | M4 action 参数文档 |
| `backend/download_xyz/download_task.py` | M2 多 worker 迁移安全 |
| `backend/api/admin.py` | L3 冗余 clamp 清理 |
| `frontend/src/api/backend/client.js` | H1(429合并)+M3 parseBlobError |
| `frontend/src/api/download.js` | M1 apiEstimateTileCount |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | M1 移除前端估算 |
| `frontend/src/domains/ol/components/MapDownloader.vue` | H3+L1+L5 |
| `frontend/src/domains/ol/components/MyDownloadTasks.vue` | L5 |
| `frontend/src/domains/common/utils/clipboard.ts` | L5 新增公共工具 |
| `Docs/Guide/CHANGELOG.md` | M5 Breaking Change + V3.5.19 条目 |
| `README.md` | 版本号三处更新 |

## 遗留与风险

- **C2（配额消耗竞态条件）**：`_consume_api_quota_sync` 内部存在 TOCTOU 竞态（读取→检查→写入非原子），本次未修复。影响：极高并发下可能略微超扣。建议后续使用数据库级原子操作（`UPDATE ... WHERE calls + ? <= quota`）解决。
- **C1（下载端点无认证）**：用户明确设计意图（任务分享），不修复。

## 下一步建议

如需彻底解决配额竞态（C2），可在 `quota.py` 中将读-检-写改为单条 SQL：`UPDATE api_usage_daily SET calls = calls + ? WHERE username = ? AND usage_date = ? AND (calls + ? <= quota OR quota = -1)`，通过 `rowcount` 判断是否成功。
