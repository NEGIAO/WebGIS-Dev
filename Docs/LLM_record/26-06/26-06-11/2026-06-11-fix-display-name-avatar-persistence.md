# V3.3.3 2026-06-11 昵称中文显示与头像索引持久化修复

## 日期和时间

2026-06-11 10:24

## 修改内容

- 修复账号中心昵称修改后很快被旧用户对象覆盖的问题，确保中文昵称持续展示。
- 修复用户头像索引保存后前端状态与本地会话不同步的问题。
- 补齐后端统计中心与头像接口返回的用户字段，保证返回结构能支撑前端立即刷新。
- 补齐管理员头像索引的读取链路，避免管理员头像写入 `system_config` 后又被登录态或用户中心刷新回默认值。
- 在 `system_config.py` 声明 `__all__`，明确管理员头像读写函数是模块导出接口，降低 IDE 将跨模块 helper 误判为未访问的概率。

## 修改原因

邮箱账号化后，前端优先展示 `display_name`。账号中心存在多处异步刷新用户对象的逻辑，如果某个接口仍返回旧结构或前端直接覆盖完整用户对象，就会让刚保存的中文昵称回退到内部兼容 `username`。头像索引也存在类似状态同步风险，保存成功但 UI 或本地会话未稳定更新。

## 事件逻辑链条分析

- 核心症状：中文昵称保存后短时间内消失；头像索引保存后未生效或被恢复。
- 根本原因：账号中心的用户状态来源不统一，部分接口返回的用户字段不完整时会覆盖 `display_name`、`email`、`avatar_index` 等认证字段；管理员头像只写入 `system_config`，但登录态与统计中心未回读该配置。
- 受影响模块：前端账号中心浮层、安全页、偏好头像面板、认证会话缓存；后端认证头像接口、统计中心聚合接口、系统配置读取。
- 优化方向：前端合并用户对象而不是盲目替换；头像保存后同步更新 `user.avatar_index` 与 localStorage；后端接口补齐 `display_name/email/avatar_index/requires_email_binding` 等字段。

## 影响范围

- 前端：`frontend/src/components/UserCenter/FloatingAccountPanel.vue` 及关联用户中心面板。
- 后端：`backend/api/auth/routes.py`、`backend/api/auth/system_config.py`、`backend/api/auth/__init__.py`、`backend/api/statistics.py`。
- 文档：根目录、前端、后端 README 文件树或说明如有变更需同步。

## 优化解决方案

- 排查账号中心所有写入 `user.value` 的路径，避免用缺失 `display_name` 的对象覆盖完整认证用户。
- 保存昵称和头像后立即合并最新字段到用户对象，并写回认证 session。
- 保留中文昵称原样展示，不再回退到内部兼容 `username`。
- 统计中心 `/api/statistics/center` 返回完整用户对象，不再固定返回 `avatar_index: 0`。
- 头像修改 `/api/auth/change-avatar` 返回完整用户对象，前端优先合并该对象。
- 管理员头像索引新增统一读取函数，登录、`/api/auth/me`、`/api/statistics/center` 都从 `system_config.admin_avatar_index` 回读。
- `system_config.py` 增加显式 `__all__` 导出，配合 `auth/__init__.py` 门面 re-export 使用。

## 性能指标

本次为状态一致性修复，不涉及性能优化。

## 测试方案

- 修改中文昵称后刷新账号中心，确认仍显示中文昵称。
- 修改头像索引后确认头像立即变化，并在重新打开账号中心后保持。
- 运行前端构建和后端认证模块编译。

## 实际验证

- `python -m py_compile backend/api/auth/routes.py backend/api/auth/session.py backend/api/auth/system_config.py backend/api/auth/__init__.py backend/api/statistics.py`：通过。
- `npm run build`（frontend）：通过。仍存在既有 Vite 提示：`min-enhanced.js` 非 `type="module"` 无法打包，以及部分 chunk 超过 300 kB。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-11\2026-06-11-fix-display-name-avatar-persistence.md
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\__init__.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\routes.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\system_config.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\statistics.py
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue
- D:\Dev\GitHub\WebGIS_Dev\README.md
- D:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- D:\Dev\GitHub\WebGIS_Dev\backend\README.md
