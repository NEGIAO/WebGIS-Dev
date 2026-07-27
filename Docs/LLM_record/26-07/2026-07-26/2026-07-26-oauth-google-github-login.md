# Google/GitHub OAuth 一键注册登录实施记录

## 日期和时间

2026-07-26 10:13

## 修改内容

- 计划新增 Google 与 GitHub OAuth 一键注册/登录能力。
- 支持已通过邮箱注册的用户在账号中心绑定或解绑对应 Google/GitHub 账号。
- 后端将新增 OAuth 授权起点、回调处理、第三方身份绑定表与账号自动创建/绑定逻辑。
- 前端将在注册/登录页增加第三方登录入口，并新增 OAuth 回调页处理 WebGIS 会话写入与跳转。
- 同步更新项目 README、前端/后端 README 与结构文档，确保新增文件和接口可追溯。

## 修改原因

当前注册页面采用“邮箱验证码 + 密码 + 昵称 + 头像”的完整注册流程，对希望快速体验 WebGIS 的用户来说步骤偏多。用户明确希望支持 Google 邮箱与 GitHub 账号一键注册登录，以降低注册门槛、提升可用性，并保留原有邮箱注册作为备用方案。

## 事件逻辑链条分析

### 核心症状

- 注册页流程偏重：首次用户需要输入昵称、邮箱、验证码、密码、确认密码并选择头像。
- 第三方账号用户无法直接复用 Google/GitHub 身份进入系统。
- 现有邮箱注册虽然安全，但对快速体验和公开演示场景不够友好。
- 有些问题啊，就是要支持已注册的用户（用邮箱注册的）绑定对应的github账号或者是Google邮箱；


### 根本原因

- 当前账号体系只支持邮箱验证码注册、邮箱密码登录、游客登录与旧账号绑定迁移。
- 数据库 `users` 表没有第三方身份映射关系，无法记录 Google/GitHub provider 用户与本地用户的绑定关系。
- 前端认证入口没有 OAuth 跳转与回调处理页面。

### 受影响模块

- 后端认证模块：`backend/api/auth/*`
- 后端数据库初始化：`backend/api/auth/schema.py`
- 后端应用路由挂载：`backend/app.py`
- 前端认证 API：`frontend/src/api/backend/auth.js`
- 前端注册/登录页：`frontend/src/views/RegisterView.vue`
- 前端路由与本地会话：`frontend/src/router/index.js`、`frontend/src/services/auth.js`
- 文档与版本记录：根 README、前端/后端 README、结构文档与本维护日志。

## 优化解决方案

1. 后端新增 `oauth_accounts` 表，使用 `(provider, provider_user_id)` 唯一识别第三方身份，避免把第三方账号字段直接塞入 `users` 表。
2. 新增 OAuth 服务模块，集中处理：
   - provider 配置读取；
   - state 签名与过期校验；
   - 授权 URL 构建；
   - code 换 access token；
   - Google/GitHub profile 获取；
   - GitHub primary verified email 获取；
   - 本地用户创建、绑定和 session 签发。
3. 第三方首次登录时：
   - 已绑定则直接登录；
   - 未绑定但 provider 邮箱已验证且本地存在同邮箱用户，则自动绑定；
   - 否则创建新的 `registered` 本地用户。
4. 前端只提供 OAuth 跳转按钮和回调页，不接触 client secret，不保存第三方 access token。
5. 登录成功后复用现有 WebGIS token/localStorage 会话机制，保证用户中心、配额、受保护 API 不需要重新设计。

6. Code Review 安全修复：
   - 自动邮箱绑定前拒绝 `admin` / `user` / `guest` / 保留名等特殊账号，防止 OAuth 间接登录管理员或游客账号。
   - 非开发环境必须显式配置 `OAUTH_STATE_SECRET`，不再使用公开固定默认密钥。
   - 登录回调不再把 WebGIS session token 和 user JSON 放入 URL，改用短期一次性 login ticket 兑换正式 session。
   - 绑定回调不再根据 state 中的 username 直接绑定，改为短期一次性 bind ticket + 当前登录 session 调用 `bind/complete` 完成绑定，收束绑定 CSRF 风险。

## 性能指标

本次不是性能优化任务，无直接响应时间/内存占用指标。预期用户注册步骤从“填写表单 + 收验证码 + 验证 + 设置密码”缩短为“点击第三方按钮 + 授权确认”。

## 测试方案

1. 后端启动验证：确认 FastAPI 无 import error，`/api/auth/oauth/{provider}/start` 可访问。
2. 数据库验证：启动后确认自动创建 `oauth_accounts` 表及索引。
3. 配置缺失验证：未配置 OAuth client id/secret 时返回可读配置错误，不发生 500。
4. Google 流程：点击 Google 登录 → 授权 → 回调 → 本地用户创建/绑定 → 写入 WebGIS token → 跳转主页。
5. GitHub 流程：验证 GitHub public email 为空时仍通过 `/user/emails` 获取 verified primary email。
6. 回归测试：邮箱注册、邮箱登录、游客登录、旧账号绑定邮箱、忘记密码仍可用。
7. 安全测试：伪造/过期/mismatch state 被拒绝；未验证邮箱不会自动绑定已有账号；日志不输出 access token/client secret。

## 修改的文件路径

预计涉及以下文件：

- `D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\schema.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\oauth.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\app.py`
- `D:\Dev\GitHub\WebGIS-Dev\backend\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend\auth.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\views\RegisterView.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\views\OAuthCallbackView.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\router\index.js`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\backend-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-oauth-google-github-login.md`
