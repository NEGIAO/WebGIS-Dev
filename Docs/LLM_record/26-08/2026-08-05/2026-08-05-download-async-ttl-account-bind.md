# 下载任务异步化 + TTL L2 配置 + 账号绑定

**日期**：2026-08-05 15:30  
**任务等级**：L3（跨模块架构变更：后端数据库 + 配置体系 + 前端 UI + 管理员面板 + 账号体系）  
**版本**：V3.5.13

---

## 一、问题分析

### 核心症状
1. TTL 是 L1 环境变量（`DOWNLOAD_TASK_TTL_MINUTES=30`），无法通过管理员面板动态调整
2. 清理定时器使用独立硬编码常量（`DEFAULT_MAX_AGE_HOURS = 0.5`），与配置不同步
3. 清理逻辑不过滤任务状态，运行中任务可能被误删
4. 前端强制在线等待：用户必须保持页面打开轮询，关闭/刷新后任务丢失
5. 任务与账号解耦：任何人可操作任何 task_id，无归属概念
6. 无预计完成时间：用户不知道任务何时完成
7. 任务列表与账号绑定缺失：无法跨 session 追踪

### 根本原因
- 下载系统设计时假设"用户会一直在线等待"，未考虑异步场景
- TTL 配置仅走环境变量，未接入 L2 管理体系
- `DownloadTask` 模型无 `username` 字段，无法关联账号

### 受影响模块
- 后端：配置体系（catalog.py）、下载链路（download.py）、清理定时器（task_scheduler.py）、任务模型（download_task.py）、管理员接口（admin.py）
- 前端：下载 store（useDownloadStore.ts）、下载 UI（MapDownloader.vue）、管理员面板（AdminControlPanel.vue）、API 层（download.js, admin.js）

---

## 二、修改内容

### 阶段 1：TTL 参数 L2 化
- `catalog.py`：`DOWNLOAD_TASK_TTL_MINUTES` 从 L1 改为 L2
- `download.py`：新增 `_get_task_ttl_minutes()` 三级 fallback（L2 → L1 → 30）
- `download.py`：`_get_expiration()` 动态读取 TTL，管理员改后立即生效
- `download_task.py`：`init_download_task_db()` 首次启动初始化默认值

### 阶段 2：清理逻辑修正
- `task_scheduler.py`：删除 `DEFAULT_MAX_AGE_HOURS` 硬编码
- `task_scheduler.py`：新增 `TERMINAL_STATUSES` 状态过滤，仅清理终态任务
- `task_scheduler.py`：动态读取 TTL 计算 cutoff

### 阶段 3：任务绑定账号体系
- `download_task.py`：`DownloadTask` 新增 4 个字段（username/tile_count/tiles_downloaded/estimated_seconds）
- `download_task.py`：`create_task()` 签名扩展
- `download_task.py`：新增 `list_active_tasks_by_user()` 函数
- `download_task.py`：`init_download_task_db()` 新增 SQLite 迁移逻辑（ALTER TABLE + 索引）
- `download.py`：创建任务时绑定 `_current_user.get("username")`
- `download.py`：新增 `GET /api/download/tasks` 列表接口
- `download.py`：新增 `_authorize_task_access()` 鉴权函数
- `download.py`：现有 3 个接口（查询/下载/取消）均加入 username 校验

### 阶段 4：时间估算
- `download.py`：新增 `_estimate_tile_count()` 和 `_estimate_duration()` 函数
- `download.py`：`DownloadTaskStatusResponse` 新增 4 个响应字段
- `download.py`：`_build_status_response()` 动态修正剩余时间

### 阶段 5：管理员面板
- `admin.py`：新增 `GET/POST /api/admin/config/download-ttl` 端点
- `admin.js`：新增 `apiAdminGetDownloadTTL()`/`apiAdminUpdateDownloadTTL()` 函数
- `AdminControlPanel.vue`：System Config card 新增 TTL 配置输入框

### 阶段 6：前端 UI 交互重构
- `download.js`：新增 `apiDownloadListMyTasks()` 函数
- `useDownloadStore.ts`：新增 `myTasks` 状态 + `fetchMyTasks()`/`refreshTaskStatus()` 方法
- `MapDownloader.vue`：新增「我的任务」面板 + 操作按钮 + 辅助方法

---

## 三、修改背景

下载任务当前设计为用户必须保持在线等待完成。对于大区域高分辨率下载（可能耗时 30+ 分钟），用户体验极差。同时 TTL 参数硬编码在环境变量中，无法动态调整。本次改动将下载系统升级为异步可管理模式：用户提交任务后可获得 task_id 和预计完成时间，随时离开页面，回来后可查询进度、下载结果。

---

## 四、影响范围

| 模块 | 影响 |
|---|---|
| 下载链路 | 创建任务时绑定 username + 估算时间；查询/下载/取消接口增加鉴权 |
| 配置体系 | TTL 从 L1 升级为 L2，管理员面板可调 |
| 清理定时器 | 仅清理终态任务，运行中不受影响 |
| 管理员面板 | 新增 TTL 配置输入框 |
| 前端下载 UI | 新增「我的任务」列表，支持查看/下载/取消 |
| 数据库 | `downloadtask` 表新增 4 列 + 1 索引；`system_config` 表新增 1 键 |

---

## 五、解决方案

### 方案对比

| 方案 | 优点 | 缺点 | 选择 |
|---|---|---|---|
| A. 完全重构为 Celery + Redis | 专业任务队列 | 引入新依赖，HF Space 不友好 | ❌ |
| B. 保持 BackgroundTasks + DB 驱动 | 无新依赖，纯 SQLite | 单机限制（本项目场景足够） | ✅ |

选择方案 B：利用现有 FastAPI BackgroundTasks + SQLite + APScheduler 实现异步任务管理，无需引入外部依赖。

---

## 六、性能指标

| 指标 | 改动前 | 改动后 |
|---|---|---|
| TTL 调整方式 | 改 .env + 重启 | 管理员面板即时生效 |
| 任务归属 | 无（任何人可操作） | username 绑定 |
| 清理策略 | 无状态过滤 | 仅终态任务 |
| 用户等待 | 强制在线 | 可离开后回来 |
| 时间估算 | 无 | 基于瓦片数 + 并发计算 |

---

## 七、测试方案

### Agent 已执行
- [x] 代码改动完成，遵守分层边界与单一职责
- [x] 新增 `.ts` 文件通过类型检查（无纯新增 .ts，仅修改）
- [x] 维护日志已按第 6 节创建
- [x] 根 README.md 三处版本号已更新
- [x] `Docs/Guide/CHANGELOG.md` 已追加条目
- [x] 涉及配置 key → catalog.py 已登记
- [ ] 门禁脚本已运行且通过（待用户执行）
- [x] 未执行任何 Git 写操作

### 待用户实机验证
1. **TTL 动态生效**：管理员面板修改 TTL 为 5 分钟 → 创建任务 → 等待 5 分钟 → 确认任务被清理
2. **大任务不中断**：大区域下载（>30 分钟）→ 确认任务不被中途清理
3. **账号绑定**：登录账号 A → 提交任务 → 关闭页面 → 重新登录 A → 查看「我的任务」列表
4. **任务隔离**：账号 A 的任务 → 账号 B 无法查看/下载（鉴权校验）
5. **时间估算**：提交任务 → 确认前端展示预计完成时间 → 进度更新时剩余时间动态修正
6. **匿名用户**：未登录提交 → 不展示任务列表 → 提示登录

---

## 八、变更文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `backend/config/catalog.py` | 修改 | DOWNLOAD_TASK_TTL_MINUTES 标注为 L2 |
| `backend/download_xyz/download.py` | 修改 | 新增 `_get_task_ttl_minutes`/`_estimate_tile_count`/`_estimate_duration`/`list_my_tasks`/`_authorize_task_access`；改造 `_get_expiration`/`_build_status_response`/`create_download_task` |
| `backend/download_xyz/task_scheduler.py` | 重写 | 删除硬编码常量；增加终态状态过滤；动态读取 TTL |
| `backend/download_xyz/download_task.py` | 重写 | DownloadTask 模型新增 4 字段；`create_task` 签名扩展；新增迁移逻辑 + `list_active_tasks_by_user` |
| `backend/api/admin.py` | 修改 | 新增 TTL 配置 GET/POST 端点 |
| `frontend/src/api/backend/admin.js` | 修改 | 新增 `apiAdminGetDownloadTTL`/`apiAdminUpdateDownloadTTL` |
| `frontend/src/api/download.js` | 修改 | 新增 `apiDownloadListMyTasks` |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | 修改 | 新增 `myTasks` 状态 + `fetchMyTasks`/`refreshTaskStatus` |
| `frontend/src/domains/ol/components/MapDownloader.vue` | 重构 | 新增「我的任务」面板 + 操作方法 + 样式 |
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | 修改 | System Config card 新增 TTL 输入框 |
| `Docs/Guide/CHANGELOG.md` | 修改 | 追加 V3.5.13 条目 |
| `README.md` | 修改 | 版本号三处更新 |

---

## 九、遗留与风险

| 风险 | 缓解措施 |
|---|---|
| 旧任务无 username（NULL） | 不出现在任何人的列表中，向后兼容 |
| 旧任务无 tile_count | 前端隐藏估算区域，不报错 |
| TTL 改小导致任务提前清理 | 管理员面板加范围限制 + 提示 |
| SQLite ALTER TABLE 失败 | try/except 兜底，列已存在时忽略 |
| `system_config` 读取增加延迟 | 每次 < 1ms，可忽略 |

---

## 十、下一步建议

1. 运行 `python CheckStructureTree.py` 和 `python CheckConfigRegistry.py` 确认门禁通过
2. 实机验证 6 项测试方案
3. 考虑未来增加 WebSocket 推送（替代轮询），减少前端资源消耗
