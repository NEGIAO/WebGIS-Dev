# 下载任务异步化 + TTL L2 配置 + 账号绑定 实施方案（V2）

**日期**：2026-08-05  
**任务等级**：L3（跨模块架构变更：后端数据库 + 配置体系 + 前端 UI + 管理员面板 + 账号体系）  
**版本**：V2 — 基于代码探查结果修正，对齐实际文件路径与函数签名

---

## 一、需求背景

### 当前问题（代码事实）

| # | 问题 | 代码证据 |
|---|---|---|
| 1 | **TTL 是 L1 环境变量**，无法通过管理员面板动态调整 | `download.py:31` — `DEFAULT_TASK_TTL_MINUTES = get_int("DOWNLOAD_TASK_TTL_MINUTES", 30, ...)` |
| 2 | **清理定时器使用独立硬编码常量**，与配置不同步 | `task_scheduler.py:15` — `DEFAULT_MAX_AGE_HOURS = 0.5`（硬编码，不读 config） |
| 3 | **清理逻辑不过滤任务状态**，运行中任务可能被删 | `task_scheduler.py:39` — 仅按 `updated_at < cutoff` 删除，无 `status` 过滤 |
| 4 | **前端强制在线等待**：用户必须保持页面打开轮询 | `MapDownloader.vue` — 提交后轮询 + 进度条，关闭页面任务丢失 |
| 5 | **任务与账号解耦**：任何人可操作任何 task_id | `download.py:194` — `get_download_task` 无鉴权校验 |
| 6 | **无预计完成时间**：用户只能盲目等待 | 响应体 `DownloadTaskStatusResponse` 无时间估算字段 |
| 7 | **任务列表与账号绑定缺失**：无法跨 session 追踪 | `DownloadTask` 模型无 `username` 字段 |

### 目标

- TTL 改为 L2 数据库配置（`system_config` 表），管理员面板可动态调整，**无需重启**
- 清理逻辑修正：**仅清理终态任务**（success/failed/cancelled/expired），运行中任务不受影响
- **任务绑定账号**：`username` 字段关联，登录后自动看到自己的有效任务列表
- 后端估算预计完成时间，前端展示剩余时间
- 用户可离开页面，任务后台执行；回来后可查询、下载
- 管理员通过 `AdminControlPanel.vue` 配置 TTL

---

## 二、架构变更概览

```mermaid
flowchart TB
    subgraph 变更前
        A1[前端: 提交 → 轮询(保持在线) → 完成 → 下载] --> B1[后端: TTL=L1 env 30min]
        B1 --> C1[清理: 无状态过滤, updated_at+30min 无差别删]
        C1 --> D1[配置: 环境变量, 需重启]
        D1 --> E1[账号: 任务完全匿名, 任何人可操作任何 task_id]
    end

    subgraph 变更后
        A2[前端: 登录 → '我的任务'列表 → 提交/查询/下载] --> B2[后端: TTL=L2 DB 管理员可调]
        B2 --> C2[清理: 仅终态任务 + 超 TTL, 运行中不删]
        C2 --> D2[配置: AdminPanel → system_config → 动态读取]
        D2 --> E2[账号: username 绑定, 只显示自己的有效任务]
    end
```

---

## 三、配置层级说明

| 层级 | 存储位置 | 读取方式 | 本方案涉及 |
|---|---|---|---|
| L1 非密 | `.env` / `.env.local` | `get_int/get_str` → `os.getenv` | ⚠️ 降级兜底 |
| **L2 Admin+DB** | **`system_config` 表** | **`_get_system_config_value_sync`** | ✅ **TTL 主路径** |
| L3 绝密 | HF Secrets | 特殊读取 | ❌ 不涉及 |

TTL 参数属于 **L2**：管理员通过面板写入 `system_config` 表，后端运行时动态读取。L1 `DOWNLOAD_TASK_TTL_MINUTES` 保留为首次启动 fallback（当 system_config 无值时使用）。

---

## 四、详细实施步骤

### 阶段 1：TTL 参数 L2 化（后端配置读取改造）

> **目标**：`cleanup_expired_tasks` 和 `_get_expiration` 均从 `system_config` 动态读取 TTL，管理员改后立即生效。

#### 1.1 catalog.py 登记（标注 L2 层级）

**文件**：`backend/config/catalog.py`

将现有 `DOWNLOAD_TASK_TTL_MINUTES` 条目修改为：

```python
"DOWNLOAD_TASK_TTL_MINUTES": {
    "layer": "L2",
    "default": 30,
    "secret": False,
    "description": "下载任务存活分钟数（从最后活动时间起算，管理员面板可调，写入 system_config）",
},
```

#### 1.2 后端动态读取函数

**文件**：`backend/download_xyz/download.py`（新增函数）

```python
from api.auth.system_config import _get_system_config_value_sync

def _get_task_ttl_minutes() -> int:
    """从 L2 system_config 读取 TTL，fallback 到 L1 env，最终默认 30 分钟"""
    raw = _get_system_config_value_sync("download_task_ttl_minutes", "")
    if raw:
        try:
            return max(1, min(1440, int(raw)))
        except (ValueError, TypeError):
            pass
    return DEFAULT_TASK_TTL_MINUTES  # L1 env fallback
```

#### 1.3 运行时替换

**文件**：`backend/download_xyz/download.py`

- `download.py:530` — `_get_expiration()` 中将 `DEFAULT_TASK_TTL_MINUTES` 替换为 `_get_task_ttl_minutes()`
- `task_scheduler.py:21` — `cleanup_expired_tasks()` 中：
  - 删除模块级常量 `DEFAULT_MAX_AGE_HOURS = 0.5`
  - 函数内部调用 `_get_task_ttl_minutes()` 计算 cutoff

```python
# task_scheduler.py 改造后
from .download import _get_task_ttl_minutes

def cleanup_expired_tasks() -> int:
    ttl_minutes = _get_task_ttl_minutes()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)
    # ... 后续逻辑不变
```

#### 1.4 首次启动初始化默认值

**文件**：`backend/download_xyz/download_task.py` — `init_download_task_db()` 中追加

```python
from api.auth.system_config import _get_system_config_value_sync, _set_system_config_value_sync

def init_download_task_db() -> None:
    SQLModel.metadata.create_all(_engine)
    # TTL L2 默认值初始化
    if not _get_system_config_value_sync("download_task_ttl_minutes", ""):
        _set_system_config_value_sync("download_task_ttl_minutes", "30")
```

---

### 阶段 2：清理逻辑修正（仅清理终态任务）

> **目标**：清理定时器只删除已结束（success/failed/cancelled/expired）且超 TTL 的任务，运行中任务不受影响。

**文件**：`backend/download_xyz/task_scheduler.py`

```python
TERMINAL_STATUSES = {"success", "failed", "cancelled", "expired"}
RUNNING_STATUSES = {"pending", "downloading", "stitching"}

def cleanup_expired_tasks() -> int:
    ttl_minutes = _get_task_ttl_minutes()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl_minutes)
    engine = get_engine()

    with Session(engine) as session:
        # 仅查询终态且超时的任务
        pending = session.exec(
            select(DownloadTask.id).where(
                DownloadTask.updated_at < cutoff,
                DownloadTask.status.in_(TERMINAL_STATUSES)
            ).limit(1)
        ).first()
        if pending is None:
            return 0

        tasks = list(session.exec(
            select(DownloadTask).where(
                DownloadTask.updated_at < cutoff,
                DownloadTask.status.in_(TERMINAL_STATUSES)
            )
        ))
        removed_count = 0
        for task in tasks:
            if task.file_path and os.path.exists(task.file_path):
                try:
                    os.remove(task.file_path)
                except OSError:
                    logger.warning("Failed to remove file: %s", task.file_path)
            session.delete(task)
            removed_count += 1
        session.commit()

    return removed_count
```

---

### 阶段 3：任务绑定账号体系（数据库变更 + 接口改造）

> **目标**：`DownloadTask` 新增 `username` 字段，创建任务时绑定，查询时过滤。

#### 3.1 DownloadTask 模型变更

**文件**：`backend/download_xyz/download_task.py`

```python
class DownloadTask(SQLModel, table=True):
    id: str = Field(primary_key=True, index=True)
    username: Optional[str] = Field(default=None, index=True, nullable=True)  # 绑定账号（NULL = 匿名/历史任务）
    status: str = Field(default="pending", index=True)
    progress: float = Field(default=0.0)
    message: Optional[str] = None
    file_path: Optional[str] = None
    tile_count: Optional[int] = Field(default=None)  # 总瓦片数（用于时间估算）
    tiles_downloaded: Optional[int] = Field(default=None)  # 已下载瓦片数（进度细化）
    estimated_seconds: Optional[int] = Field(default=None)  # 预计总耗时（秒）
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
```

**数据迁移**（SQLite ALTER TABLE）：

```sql
-- 在 init_download_task_db() 中以代码方式执行
ALTER TABLE downloadtask ADD COLUMN username TEXT DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN tile_count INTEGER DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN tiles_downloaded INTEGER DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN estimated_seconds INTEGER DEFAULT NULL;
CREATE INDEX IF NOT EXISTS ix_downloadtask_username ON downloadtask (username);
```

> ⚠️ SQLite 旧版本不支持 `ALTER TABLE ADD COLUMN` 带约束，上述语句无 NOT NULL 故兼容。失败时 try/except 兜底。

#### 3.2 create_task 函数签名扩展

**文件**：`backend/download_xyz/download_task.py`

```python
def create_task(
    task_id: str,
    file_path: Optional[str] = None,
    username: Optional[str] = None,
    tile_count: Optional[int] = None,
    estimated_seconds: Optional[int] = None,
) -> DownloadTask:
    with Session(_engine) as session:
        task = DownloadTask(
            id=task_id,
            file_path=file_path,
            username=username,
            tile_count=tile_count,
            estimated_seconds=estimated_seconds,
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return task
```

#### 3.3 创建任务时绑定 username

**文件**：`backend/download_xyz/download.py` — `create_download_task()` 中

```python
# 从 session 提取 username（require_api_access 返回的 session dict 含 username 键）
current_username = _current_user.get("username") or None

# 估算瓦片数与时间
tile_count = _estimate_tile_count(payload.bbox, payload.resolution_m)
estimated_seconds = _estimate_duration(tile_count)

task = create_task(
    task_id,
    file_path=output_path,
    username=current_username,
    tile_count=tile_count,
    estimated_seconds=estimated_seconds,
)
```

#### 3.4 新增"我的任务"列表接口

**文件**：`backend/download_xyz/download.py`（新增路由）

```python
@router.get("/tasks", response_model=DownloadTaskListResponse)
async def list_my_tasks(
    _current_user: dict = Depends(require_api_access),
):
    """获取当前用户的有效任务列表（自动过滤过期任务）"""
    username = _current_user.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="需要登录")
    tasks = await asyncio.to_thread(_get_active_tasks_by_user, username)
    return {"tasks": [_build_status_response(t) for t in tasks]}

def _get_active_tasks_by_user(username: str) -> List[DownloadTask]:
    ttl = _get_task_ttl_minutes()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=ttl)
    with Session(_engine) as session:
        return list(session.exec(
            select(DownloadTask)
            .where(
                DownloadTask.username == username,
                DownloadTask.updated_at >= cutoff,
            )
            .order_by(DownloadTask.created_at.desc())
        ))
```

#### 3.5 现有接口鉴权加固

**文件**：`backend/download_xyz/download.py`

`get_download_task`、`download_task_file`、`cancel_download_task` 三个接口增加 username 校验：

```python
def _authorize_task_access(task: DownloadTask, username: Optional[str]) -> None:
    """校验当前用户是否有权操作该任务"""
    # 有归属的任务：仅本人可操作
    if task.username and task.username != username:
        raise HTTPException(status_code=403, detail="无权操作此任务")
    # 匿名任务（username=NULL）：仅允许无登录状态操作（向后兼容）
    if task.username is None and username is not None:
        raise HTTPException(status_code=403, detail="无权操作匿名任务")
```

---

### 阶段 4：预计完成时间估算

#### 4.1 瓦片数估算

**文件**：`backend/download_xyz/download.py`（新增函数）

```python
def _estimate_tile_count(bbox: List[float], resolution_m: float) -> int:
    """根据 bbox + 分辨率估算瓦片总数"""
    zoom = resolution_to_zoom(resolution_m, lat_deg=(bbox[1] + bbox[3]) / 2)
    min_x, max_x, min_y, max_y = bbox4326_to_tile_range(tuple(bbox), zoom)
    return (max_x - min_x + 1) * (max_y - min_y + 1)
```

#### 4.2 耗时估算

**文件**：`backend/download_xyz/download.py`（新增函数）

```python
def _estimate_duration(tile_count: int) -> int:
    """估算下载总耗时（秒）
    
    模型：
      - 单瓦片下载耗时 ≈ 0.1s（含网络延迟 + 解码）
      - 并发数 = 10（MAX_CONCURRENCY）
      - 安全系数 = 1.5（应对网络波动）
      - 拼接固定开销 = 30s
    """
    download_time = (tile_count / MAX_CONCURRENCY) * 0.1 * 1.5
    return int(download_time + 30)
```

#### 4.3 进度查询时动态修正剩余时间

**文件**：`backend/download_xyz/download.py` — `_build_status_response()` 中追加

```python
# 动态修正剩余时间（基于实际速率）
estimated_remaining = None
if task.status in ("downloading", "stitching") and task.progress > 1:
    elapsed = (datetime.now(timezone.utc) - task.created_at).total_seconds()
    rate = task.progress / elapsed  # %/s
    estimated_remaining = int((100 - task.progress) / rate)
elif task.estimated_seconds:
    estimated_remaining = max(0, task.estimated_seconds - int(elapsed))
```

#### 4.4 响应体扩展

**文件**：`backend/download_xyz/download.py` — `DownloadTaskStatusResponse`

```python
class DownloadTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: float
    message: Optional[str]
    created_at: datetime
    updated_at: datetime
    file_ready: bool
    expires_at: datetime
    expires_in_seconds: int
    is_expired: bool
    download_token: Optional[str] = None
    # 新增字段
    tile_count: Optional[int] = None
    tiles_downloaded: Optional[int] = None
    estimated_total_seconds: Optional[int] = None
    estimated_remaining_seconds: Optional[int] = None
```

---

### 阶段 5：管理员面板 TTL 配置

#### 5.1 后端 API

**文件**：`backend/api/admin.py`（新增两个端点）

```python
@router.get("/config/download-ttl")
async def get_download_ttl(
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    minutes = await asyncio.to_thread(
        _get_system_config_value_sync, "download_task_ttl_minutes", "30"
    )
    return {"status": "success", "data": {"ttl_minutes": int(minutes)}}


class UpdateTtlRequest(BaseModel):
    ttl_minutes: int = Field(..., ge=1, le=1440)


@router.post("/config/download-ttl")
async def update_download_ttl(
    payload: UpdateTtlRequest,
    _session: Dict[str, Any] = Depends(require_admin),
) -> Dict[str, Any]:
    ttl = max(1, min(1440, int(payload.ttl_minutes)))
    await asyncio.to_thread(
        _set_system_config_value_sync, "download_task_ttl_minutes", str(ttl)
    )
    return {"status": "success", "message": f"下载任务 TTL 已设为 {ttl} 分钟"}
```

#### 5.2 前端 Admin API 层

**文件**：`frontend/src/api/backend/admin.js`（新增）

```javascript
/** 获取下载任务 TTL 配置（分钟） */
export const apiAdminGetDownloadTTL = () =>
  backendAPI.get('/api/admin/config/download-ttl')

/** 更新下载任务 TTL 配置（分钟） */
export const apiAdminUpdateDownloadTTL = (ttlMinutes) =>
  backendAPI.post('/api/admin/config/download-ttl', { ttl_minutes: ttlMinutes })
```

#### 5.3 前端 AdminControlPanel.vue

**文件**：`frontend/src/domains/common/user/components/AdminControlPanel.vue`

在「System Config」card 中新增：

```vue
<!-- 下载任务 TTL 配置 -->
<div class="admin-ttl-config">
  <label>{{ $t('admin.downloadTtlLabel', '下载任务存活时间') }}</label>
  <input
    type="number"
    :value="ttlMinutes"
    @change="handleTtlUpdate"
    min="1"
    max="1440"
  />
  <span class="hint">{{ $t('admin.downloadTtlHint', '分钟，从任务最后活动时间起算') }}</span>
</div>
```

---

### 阶段 6：前端 UI 交互重构

#### 6.1 新增 API 函数

**文件**：`frontend/src/api/download.js`（新增）

```javascript
/** 获取当前用户的任务列表 */
export const apiDownloadListMyTasks = () =>
  backendAPI.get('/api/download/tasks')
```

#### 6.2 useDownloadStore 扩展

**文件**：`frontend/src/domains/common/data-import/stores/useDownloadStore.ts`

新增状态与方法：
- `myTasks: DownloadTaskItem[]` — 我的任务列表
- `fetchMyTasks()` — 从后端拉取列表
- `refreshTaskStatus(taskId)` — 刷新单个任务进度

#### 6.3 MapDownloader.vue 重构

**文件**：`frontend/src/domains/ol/components/MapDownloader.vue`

UI 结构调整为双栏布局：

```
┌──────────────────────────────────────────────────┐
│  MapDownloader                                   │
│  ┌─────────────────────┬───────────────────────┐ │
│  │ 我的任务            │ 新建下载任务           │ │
│  │ ┌─────────────────┐ │ ┌───────────────────┐ │ │
│  │ │ task-001 ✅ 完成 │ │ │ 底图选择          │ │ │
│  │ │ 剩余 2h 可下载   │ │ │ BBox 绘制         │ │ │
│  │ │ [下载] [删除]    │ │ │ 分辨率            │ │ │
│  │ ├─────────────────┤ │ │ [提交任务]        │ │ │
│  │ │ task-002 ⏳ 45%  │ │ └───────────────────┘ │ │
│  │ │ 预计剩余 12min  │ │                       │ │
│  │ │ [查看] [取消]    │ │                       │ │
│  │ └─────────────────┘ │                       │ │
│  └─────────────────────┴───────────────────────┘ │
└──────────────────────────────────────────────────┘
```

核心交互流程：

1. **登录后**：自动调用 `fetchMyTasks()`，展示有效任务列表
2. **提交任务**：填参数 → 提交 → 后端返回 task_id + estimated_seconds → 任务自动出现在列表
3. **离开页面**：任务后台执行，不受影响
4. **回来查看**：从列表点击 → 实时进度 + 剩余时间
5. **下载**：完成后「下载」按钮激活 → 直接下载

#### 6.4 匿名用户处理

未登录用户：
- 可提交任务（`username=NULL`）
- 不展示任务列表（无法跨 session 追踪）
- 提交后提示："登录后可管理您的下载任务"

---

## 五、变更文件清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `backend/config/catalog.py` | 修改 | DOWNLOAD_TASK_TTL_MINUTES 标注为 L2 |
| `backend/download_xyz/download.py` | 修改 | 新增 `_get_task_ttl_minutes`、`_estimate_tile_count`、`_estimate_duration`、`list_my_tasks`、`_authorize_task_access`；改造 `_get_expiration`、`_build_status_response`、`create_download_task` |
| `backend/download_xyz/task_scheduler.py` | 修改 | 删除 `DEFAULT_MAX_AGE_HOURS` 硬编码；增加终态状态过滤；动态读取 TTL |
| `backend/download_xyz/download_task.py` | 修改 | DownloadTask 模型新增 4 字段；`create_task` 签名扩展；`init_download_task_db` 增加迁移逻辑 |
| `backend/api/admin.py` | 修改 | 新增 `GET/POST /api/admin/config/download-ttl` 端点 |
| `frontend/src/api/backend/admin.js` | 修改 | 新增 `apiAdminGetDownloadTTL`、`apiAdminUpdateDownloadTTL` |
| `frontend/src/api/download.js` | 修改 | 新增 `apiDownloadListMyTasks` |
| `frontend/src/domains/common/data-import/stores/useDownloadStore.ts` | 修改 | 新增 `myTasks` 状态 + `fetchMyTasks` + `refreshTaskStatus` |
| `frontend/src/domains/ol/components/MapDownloader.vue` | 重构 | 双栏布局 + 任务列表 + 进度展示 |
| `frontend/src/domains/common/user/components/AdminControlPanel.vue` | 修改 | System Config card 新增 TTL 输入框 |
| `Docs/Guide/CHANGELOG.md` | 修改 | 追加版本条目 |
| `README.md` | 修改 | 版本号三处更新 |

---

## 六、数据迁移

### system_config 表（auth DB）

```sql
-- 首次启动时自动执行（init_download_task_db 内）
INSERT OR IGNORE INTO system_config (key, value, updated_at)
VALUES ('download_task_ttl_minutes', '30', datetime('now'));
```

### downloadtask 表（download DB）

```sql
-- 在 init_download_task_db() 中以代码方式执行
ALTER TABLE downloadtask ADD COLUMN username TEXT DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN tile_count INTEGER DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN tiles_downloaded INTEGER DEFAULT NULL;
ALTER TABLE downloadtask ADD COLUMN estimated_seconds INTEGER DEFAULT NULL;
CREATE INDEX IF NOT EXISTS ix_downloadtask_username ON downloadtask (username);
```

> ⚠️ 迁移失败时 try/except 兜底，列已存在时忽略（`sqlite3.OperationalError: duplicate column name`）。

---

## 七、风险评估

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 旧任务无 username | 无法归属到用户 | `username=NULL` 为匿名/历史任务，不出现在任何人的列表中 |
| 旧任务无 tile_count | 估算时间不显示 | Optional 字段，为 null 时前端隐藏估算区域 |
| TTL 改小导致任务提前清理 | 用户投诉 | 管理员面板加红色警告提示；默认值 30 保守 |
| SQLite ALTER TABLE 失败 | 启动报错 | try/except 兜底，列存在时忽略 |
| 前端重构影响现有下载流程 | 用户体验回归 | 保留轮询模式作为"实时查看"选项 |
| `system_config` 读取延迟 | 每次清理/查询多一次 DB 读取 | system_config 表数据量小，读取 < 1ms，可忽略 |
| 并发任务量过大导致列表接口慢 | 用户体验下降 | 列表限制返回最近 50 条，分页加载 |

---

## 八、实施顺序

| 序号 | 阶段 | 依赖 | 独立可测试 |
|---|---|---|---|
| 1 | 阶段 1：TTL L2 化 | 无 | ✅ |
| 2 | 阶段 2：清理逻辑修正 | 阶段 1 | ✅ |
| 3 | 阶段 3：账号绑定 | 无（与阶段1并行） | ✅ |
| 4 | 阶段 4：时间估算 | 阶段 3 | ✅ |
| 5 | 阶段 5：管理员面板 | 阶段 1 | ✅ |
| 6 | 阶段 6：前端重构 | 阶段 3 + 4 + 5 | ❌ |

> **建议执行顺序**：1 → 2 → 3 → 4 → 5 → 6

---

## 九、验证方案

### Agent 已执行（实施后核对）

- [ ] `tsc --noEmit` 无新增类型错误
- [ ] `python CheckStructureTree.py` 通过
- [ ] `python CheckConfigRegistry.py` 通过
- [ ] 后端 `init_download_task_db()` 启动无报错
- [ ] 现有下载流程（创建 → 轮询 → 下载）正常

### 待用户实机验证

1. **TTL 动态生效**：管理员面板修改 TTL 为 5 分钟 → 创建任务 → 等待 5 分钟 → 确认任务被清理
2. **大任务不中断**：大区域下载（>30 分钟）→ 确认任务不被中途清理
3. **账号绑定**：登录账号 A → 提交任务 → 关闭页面 → 重新登录 A → 查看"我的任务"列表
4. **任务隔离**：账号 A 的任务 → 账号 B 无法查看/下载（鉴权校验）
5. **时间估算**：提交任务 → 确认前端展示预计完成时间 → 进度更新时剩余时间动态修正
6. **匿名用户**：未登录提交 → 不展示任务列表 → 提示登录

---

## 十、与初版（V1）的关键差异

| 维度 | V1 | V2（本版） |
|---|---|---|
| 文件名准确性 | `AdminPanel.vue` / `DownloadPanel.vue`（不存在） | `AdminControlPanel.vue` / `MapDownloader.vue`（实际文件名） |
| 清理逻辑 | 描述较简略 | 明确增加 `TERMINAL_STATUSES` 状态过滤 |
| 时间估算 | 简单公式 | 动态修正（基于实际速率）+ 固定开销 |
| 鉴权方案 | 仅描述"增加校验" | 明确 `_authorize_task_access` 函数 + 匿名任务兼容 |
| 配置读取 | 未说明 fallback 链路 | L2 → L1 → 默认 30 三级 fallback |
| 数据迁移 | SQL 伪代码 | 明确 SQLite 兼容性 + 失败兜底 |
