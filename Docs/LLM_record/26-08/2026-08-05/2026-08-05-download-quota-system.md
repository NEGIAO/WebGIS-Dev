# V3.5.17 下载配额系统（统一 API 配额池）

- **日期与时间**：2026-08-05 16:30
- **任务等级**：L2
- **版本号**：V3.5.17

## 问题分析

### 核心症状
下载功能缺乏配额控制，任何登录用户都可以无限下载瓦片，无法防止滥用。

### 根本原因
原有系统只有 API 调用次数配额（每次调用 +1），没有针对下载这种高消耗操作的差异化控制。

### 受影响模块
- 后端配额系统（`backend/api/auth/quota.py`）
- 下载任务创建与执行（`backend/download_xyz/download.py`）
- 前端下载面板（`MapDownloader.vue`）
- API 路由（`backend/api/auth/routes.py`）

### 候选方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 独立下载额度池 | 隔离清晰 | 需要单独管理/分发逻辑，用户理解成本高 |
| B. 统一 API 配额池 + 差异化消耗 | 单一事实来源，管理员只需控制每日限额 | 需要修改现有配额逻辑 |

### 选定方案与理由
**方案 B**：统一配额池。理由：
1. 用户只需理解一个配额数字
2. 管理员通过调整每日限额即可控制整体消耗
3. 不同操作类型自然消耗不同权重（API=1，下载=tile_count/100）
4. 游客也能获得有限配额体验下载功能

## 修改内容

### 后端

1. **配额模块重构**（`backend/api/auth/quota.py`）
   - `_consume_api_quota_sync` 新增 `cost` 参数（默认 1）和 `action` 标识
   - 新增 `estimate_download_cost(tile_count)` 函数
   - 新增 `_get_tiles_per_unit()` 从 L2 配置读取

2. **下载任务配额集成**（`backend/download_xyz/download.py`）
   - `create_download_task`：提交前校验剩余配额，不足返回 402
   - `_process_download_task`：成功时消耗配额，失败/取消不消耗
   - 新增 `user_role` 参数传递

3. **配置登记**（`catalog.py` + `.env.example`）
   - 新增 `DOWNLOAD_TILES_PER_UNIT` L2 配置（默认 100）

4. **API 端点**（`routes.py`）
   - 新增 `GET /api/auth/download-quota/estimate`
   - 移除独立的下载额度管理端点

5. **清理**：移除 `download_quota.py` 模块和 `download_quota` 数据表

### 前端

6. **下载面板**（`MapDownloader.vue`）
   - 新增配额信息展示区（余额 + 预估消耗）
   - 配额不足时红色高亮提示
   - 监听 bbox/分辨率变化实时更新预估

7. **Store 扩展**（`useDownloadStore.ts`）
   - 新增 `estimatedTileCount` 计算属性
   - 新增 `estimateTileCountFrontend()` 函数

8. **错误处理**（`client.js`）
   - `parseBlobError` 新增 `DOWNLOAD_QUOTA_INSUFFICIENT` 处理

9. **i18n**：中英文各新增 7 个配额相关 key

## 修改背景
用户最初提出独立下载额度池方案，后续修正为统一 API 配额池模型。核心需求：
- 下载消耗与瓦片数正比
- 游客也能有限体验
- 管理员通过每日限额统一管控

## 影响范围
- 配额系统（所有 API 调用都通过 `_consume_api_quota_sync`，保持向后兼容）
- 下载流程（新增配额校验环节）
- 前端展示（新增配额信息 UI）

## 解决方案

### 配额消耗模型
```
普通 API 调用：cost = 1
Agent 对话：   cost = 1
底图下载：     cost = ceil(tile_count / tiles_per_unit)
```

### 下载流程
1. 用户提交下载任务
2. 后端估算 tile_count → 计算 download_cost
3. 查询用户剩余配额（`get_user_quota_snapshot_sync`）
4. 不足 → 返回 402；足够 → 创建任务
5. 后台执行下载
6. 成功 → 消耗配额；失败/取消 → 不消耗

## 性能指标
未实测（逻辑改动，无性能影响）

## 测试方案

### Agent 已执行
- `python CheckConfigRegistry.py`：通过（B2/B3/B4/F1/F2/F3 均通过）
- `python CheckStructureTree.py`：通过（仅 4 个预-existing 文档缺失）

### 待用户实机验证
1. 登录后打开下载面板，确认显示当前配额剩余
2. 调整 bbox 大小，确认预估消耗随之变化
3. 提交下载任务，确认成功后配额减少
4. 用游客账号测试有限配额下的下载行为
5. 配额不足时确认收到 402 错误提示

## 变更文件清单

| 文件路径 | 说明 |
|---------|------|
| `backend/api/auth/quota.py` | 重构：新增 cost 参数、estimate_download_cost |
| `backend/download_xyz/download.py` | 集成配额校验与消耗 |
| `backend/config/catalog.py` | 新增 DOWNLOAD_TILES_PER_UNIT 配置 |
| `.env.example` | 新增 DOWNLOAD_TILES_PER_UNIT=100 |
| `backend/api/auth/routes.py` | 新增 estimate 端点，移除独立额度端点 |
| `backend/api/auth/download_quota.py` | **删除**（不再需要独立模块） |
| `backend/api/auth/schema.py` | 移除 download_quota 表定义 |
| `frontend/src/domains/ol/components/MapDownloader.vue` | 新增配额展示 UI |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | 新增 estimatedTileCount |
| `frontend/src/api/backend/admin.js` | 保留 estimate 端点，移除独立额度 API |
| `frontend/src/api/backend/client.js` | 新增 DOWNLOAD_QUOTA_INSUFFICIENT 处理 |
| `frontend/src/locales/zh-CN.js` | 新增 7 个 i18n key |
| `frontend/src/locales/en-US.js` | 新增 7 个 i18n key |

## 遗留与风险
- 现有 `api_usage_daily.calls` 字段语义从"调用次数"变为"消耗配额"，历史数据仍兼容（因为旧调用 cost=1）
- 管理员如需给用户更多下载能力，需调整每日限额（通过现有配额配置面板）
