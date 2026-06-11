# V3.3.3 2026-06-11 邮箱账号化与旧用户兼容迁移

## 日期和时间

2026-06-11 09:30

## 修改内容

- 将新注册账号调整为邮箱唯一登录账号，用户名改为可重复、可修改的昵称/显示名。
- 新增旧用户名登录后的受限绑定邮箱流程，保证无邮箱旧用户可以完成迁移。
- 扩展认证响应字段，返回 `user_id`、`email`、`email_verified`、`display_name`、`requires_email_binding`，并保留 `username` 兼容旧逻辑。
- 前端注册/登录页改为邮箱优先交互，账号中心改为展示昵称并支持修改昵称。
- 本次属于账号体系大版本更新，项目版本提升为 `V3.3.3`。

## 修改原因

当前注册流程以 `username` 作为账号，邮箱只是可选绑定；但密码重置、身份鉴权和现代账号体系更适合以邮箱作为可验证账号标识。现有数据库已经有 `users.email` 与唯一索引，说明项目已经具备邮箱账号化基础，但注册/登录/会话语义尚未统一。

## 事件逻辑链条分析

- 核心症状：注册页要求用户名，邮箱可选；登录接口只按用户名查用户；密码重置才使用邮箱，导致“账号”和“找回身份凭据”割裂。
- 根本原因：`users.username` 被同时用作登录账号、显示名称和历史表关联键，缺少“内部不可变 ID / 邮箱账号 / 昵称展示”的职责拆分。
- 受影响模块：认证数据库初始化与迁移、注册/登录/会话接口、验证码流程、API 权限依赖、注册页、账号中心、安全设置、前后端 API 封装、README 文件结构。
- 优化方向：保留 `username` 作为兼容键，新增 `display_name` 承载昵称；新用户强制邮箱验证；旧用户用旧用户名登录后只能绑定邮箱，绑定完成后再进入完整系统。

## 影响范围

- 后端：`backend/api/auth/` 认证模型、schema、路由、会话、用户 CRUD、依赖校验。
- 前端：`frontend/src/views/RegisterView.vue`、认证 API 封装、账号中心浮层与安全页。
- 文档：根目录、前端、后端 README 文件树，以及本维护日志。

## 优化解决方案

- 数据库迁移：旧库首次迁移前自动备份 `webgis_auth.db` 及同名 WAL/SHM 文件到 `migration_backups/`；随后原地 `ALTER TABLE` 增加 `display_name` 与 `requires_email_binding`，用旧 `username` 回填昵称；保留邮箱唯一索引。无需为本次上线强制重建整库，只有数据库损坏恢复流程才会删除重建并导入恢复数据。
- 注册：后端强制校验邮箱与验证码；前端注册表单变为邮箱、昵称、密码、验证码、头像。
- 登录：邮箱登录为正式路径；旧用户名仅对未绑定邮箱的注册用户开放，返回受限 session。
- 绑定邮箱：新增绑定邮箱请求，验证当前密码与邮箱验证码，成功后更新邮箱、注销该账号所有旧 session 并签发完整 session。
- 授权：受限 session 禁止访问完整 API，避免旧用户跳过绑定流程。
- 账号展示：前端优先展示 `display_name`，保留 `username` 只做兼容字段。
- 运行环境：后端 Dockerfile 使用 `python:3.12-slim`；`backend/pyproject.toml` 的 `requires-python = ">=3.9"` 仅表示语法/依赖最低兼容线，本次实现保持兼容语法，不代表当前容器运行时是 Python 3.9。
- Code Review 修补：补充旧库迁移前自动备份；主库存在时不再启动清理 WAL/SHM，避免丢失未 checkpoint 的已提交数据；修正已预验证邮箱的过期判断为严格 `expires_at > now`；绑定邮箱后注销该账号所有旧 session；前端路由守卫拦截受限绑定 session 误入 `/home`。

## 性能指标

本次为账号体系语义迁移，不涉及性能优化；预期对请求耗时无显著影响。

## 测试方案

- 后端空库启动与 schema 初始化。
- 新用户邮箱注册、重复邮箱、未验证验证码、邮箱登录。
- 旧用户无邮箱登录后进入绑定流程；受限 session 调用受保护 API 返回 `EMAIL_BINDING_REQUIRED`。
- 邮箱绑定成功后可用邮箱登录，密码重置仍通过邮箱验证码完成。
- 前端构建验证注册页与账号中心类型/模板语法。

## 实际验证记录

- `python -m py_compile backend/api/auth/constants.py backend/api/auth/db.py backend/api/auth/models.py backend/api/auth/schema.py backend/api/auth/user.py backend/api/auth/session.py backend/api/auth/dependencies.py backend/api/auth/routes.py backend/api/auth/verification.py backend/api/auth/__init__.py`：通过。
- 后端临时旧 schema SQLite 冒烟测试：旧库迁移前生成 `migration_backups/*.pre_email_account_v333.*` 备份；旧用户 `display_name` 回填为旧 `username`；旧用户登录受限 session 调用受保护依赖返回 `EMAIL_BINDING_REQUIRED`；绑定邮箱后旧 session 全部失效，新 session 不再要求绑定。最终输出：`auth migration smoke ok C:\Users\NEGIAO\AppData\Local\Temp\tmpj3asgwyt.db backups=3`。
- `npm run build`（frontend）：通过；仅保留既有构建警告（`min-enhanced.js` 需 type=module、chunk 体积提示）。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\models.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\schema.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\user.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\session.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\routes.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\dependencies.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\constants.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\db.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\verification.py
- D:\Dev\GitHub\WebGIS_Dev\backend\api\auth\__init__.py
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend\auth.js
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend\client.js
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\views\RegisterView.vue
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\auth\useAuthIdentity.js
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useAuthStore.ts
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue
- D:\Dev\GitHub\WebGIS_Dev\frontend\src\components\UserCenter\tabs\SecurityTab.vue
- D:\Dev\GitHub\WebGIS_Dev\README.md
- D:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- D:\Dev\GitHub\WebGIS_Dev\backend\README.md
