# 2026-05-27 P1 Bug 修复与性能优化

## 日期和时间
2026-05-27 16:00

## 修改内容
针对全栈 Code Review 发现的 P1 级别问题进行集中修复，涵盖内存泄漏、竞态条件、性能优化和认证缺失共 11 项。

## 修改原因
项目经过系统性 Code Review，发现多处内存泄漏、并发竞态、性能浪费和未认证端点等高优先级问题，需在 P0 安全问题之前优先修复以保证系统稳定性和资源安全。

## 影响范围
- 前端：MapContainer、FloatingAccountPanel、useMapEventHandlers
- 后端：download 模块、auth 模块、location 模块、external_proxy 模块

---

## 优化解决方案

### #11 下载 token 缓存清空策略修复
- **问题**：`_download_tokens` 超过 1000 时 `clear()` 清空所有令牌，导致活跃下载链接全部失效
- **修复**：改为只清除已过期的 token
- **文件**：`backend/download_xyz/download.py:91-96`

### #12 下载任务元数据无界增长修复
- **问题**：`_download_task_metadata` 字典永不清理，长期运行导致 OOM
- **修复**：添加 `_METADATA_MAX_SIZE = 500` 上限，超限时按创建时间淘汰最老的一半
- **文件**：`backend/download_xyz/download.py:34-35, 98-103`

### #13 访客用户名生成竞态条件修复
- **问题**：`SELECT MAX(id) + 1` 并发时两个请求可能获得相同 ID，导致 UNIQUE 约束冲突
- **修复**：改为在单条 INSERT 中使用子查询 `(SELECT COALESCE(MAX(id), 0) + 1)` 原子生成 ID，冲突时重新查询已有记录
- **文件**：`backend/api/auth.py:927-967`

### #14 API 配额消费竞态条件修复
- **问题**：先 SELECT 再 UPDATE 的两步操作不是原子的，并发请求可能同时通过配额检查
- **修复**：先执行 `INSERT ... ON CONFLICT ... DO UPDATE SET calls = calls + 1` 原子递增，再读取结果判断是否超限，超限时回滚
- **文件**：`backend/api/auth.py:1193-1269`

### #15 MapContainer resize 监听器内存泄漏修复
- **问题**：匿名箭头函数注册到 `window.resize`，`onUnmounted` 中无法移除
- **修复**：提取为命名函数 `_handleResize`，在 `onUnmounted` 中调用 `removeEventListener`
- **文件**：`frontend/src/components/MapContainer.vue:1177-1183, 1188`

### #16 FloatingAccountPanel keydown 监听器内存泄漏修复
- **问题**：匿名函数注册 `keydown` 监听，`onBeforeUnmount` 中未清理
- **修复**：提取为命名函数 `handleEscapeKey`，在 `onBeforeUnmount` 中移除
- **文件**：`frontend/src/components/FloatingAccountPanel.vue:430-434, 437`

### #17 useMapEventHandlers viewport 监听器内存泄漏修复
- **问题**：`mouseout`、`contextmenu`、`touchmove` 三个监听器用匿名函数注册，无清理机制
- **修复**：提取为命名函数，`bindMapEvents` 返回 cleanup 函数，MapContainer 在 `onUnmounted` 中调用
- **文件**：`frontend/src/composables/map/features/useMapEventHandlers.js:94,157,191`
- **文件**：`frontend/src/components/MapContainer.vue:841,1442`

### #18 MapContainer HTML 注释格式错误修复
- **问题**：`<!--` 注释缺少 `-->` 闭合，事件处理器暴露在注释外
- **修复**：修正为完整的 HTML 注释块
- **文件**：`frontend/src/components/MapContainer.vue:30-32`

### #19 location.py httpx 客户端复用优化
- **问题**：`amap_ip_locate`、`free_service_ip_locate`、`amap_reverse_geocode`、`nominatim_reverse_geocode` 每次调用创建新 `httpx.AsyncClient`，无法复用连接池
- **修复**：所有函数改为接收共享 `client` 参数，路由处理器通过 `_get_http_client(request)` 从 `app.state.http_client` 获取
- **文件**：`backend/api/location.py` 全文重构
- **附带修复**：使用 `params=` 代替 f-string 拼接 URL，避免 URL 编码问题

### #22 下载任务端点添加认证
- **问题**：`POST /api/download/tasks` 无认证，匿名用户可滥用服务器资源生成 GeoTIFF
- **修复**：添加 `Depends(require_api_access)` 依赖
- **文件**：`backend/download_xyz/download.py:99-103`

### #23 Nominatim/EPSG 端点添加认证
- **问题**：Nominatim 搜索和 EPSG proj4 查询端点无认证，可被滥用
- **修复**：添加 `Depends(require_api_access)` 依赖
- **文件**：`backend/api/external_proxy.py:495-524`

---

## 附带修复（顺手处理的 P2/P3 问题）

| 问题 | 文件 | 修复 |
|---|---|---|
| hashlib 重复导入 | `download.py:4-5` | 删除重复行 |
| `datetime.utcnow()` 已弃用 | `download.py` 4处, `task_scheduler.py` 1处 | 改为 `datetime.now(timezone.utc)` |

---

## 修改的文件路径

### 前端
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\FloatingAccountPanel.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapEventHandlers.js`

### 后端
- `d:\Dev\GitHub\WebGIS_Dev\backend\download_xyz\download.py`
- `d:\Dev\GitHub\WebGIS_Dev\backend\download_xyz\task_scheduler.py`
- `d:\Dev\GitHub\WebGIS_Dev\backend\api\auth.py`
- `d:\Dev\GitHub\WebGIS_Dev\backend\api\location.py`
- `d:\Dev\GitHub\WebGIS_Dev\backend\api\external_proxy.py`

### 日志
- `d:\Dev\GitHub\WebGIS_Dev\Docs\26-05-27\2026-05-27-p1-bugfix-optimization.md`

---

## 测试方案

1. **内存泄漏验证**：Chrome DevTools → Memory → 录制堆快照 → 反复挂载/卸载组件 → 检查监听器数量是否增长
2. **竞态条件验证**：模拟并发游客登录和 API 调用，检查是否有重复用户名或配额超限
3. **下载模块验证**：创建下载任务 → 轮询状态 → 下载文件 → 验证 token 和 metadata 正常工作
4. **认证验证**：未登录状态下访问 `/api/download/tasks`、`/api/v1/search/nominatim`、`/api/v1/geo/epsg/4326/proj4` 应返回 401
5. **编译验证**：`npm run build`（前端）、后端启动无报错
