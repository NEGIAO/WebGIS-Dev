# Google / GitHub OAuth 登录部署配置指南

> 📌 适用架构：前端 GitHub Pages（`https://negiao.github.io/WebGIS-Dev`）+ 后端 Hugging Face Space Docker（`https://negiao-webgis.hf.space`）。
> 本文是生产环境 OAuth 配置的完整操作手册；三层配置模型总览见 [configuration.md](configuration.md)，变量全集见根目录 `.env.example`。
> 返回 [项目结构总览](project-structure.md) · [根 README](../../README.md)

---

## 1. 工作原理（先看懂再配置）

整条链路密钥只存在于后端，前端零配置（只依赖构建时的 `VITE_BACKEND_URL`）：

```text
用户点击「使用 GitHub 继续」
  → 浏览器跳转 {后端}/api/auth/oauth/github/start
  → 后端生成 HMAC 签名 state（TTL 600s），302 到 GitHub 授权页
  → 用户在 GitHub 同意授权
  → GitHub 302 回 {后端}/api/auth/oauth/github/callback?code&state
  → 后端校验 state → code 换 access_token → 拉取 profile + verified email
  → 自动注册 / 绑定本地用户，签发一次性 ticket（TTL 120s）
  → 302 到 {前端}/#/oauth/callback?ticket=...
  → 前端 POST /api/auth/oauth/login/exchange 用 ticket 换 WebGIS session token
```

**关键规则**：第三方控制台里填写的 Authorized redirect URI，必须与后端回调地址**逐字符一致**（协议/域名/路径/无尾斜杠）。后端回调地址自 V3.4.6 起由 `BACKEND_PUBLIC_URL` 自动推导：

| Provider | 生产回调地址（默认推导） | 本地开发回调地址 |
|----------|--------------------------|------------------|
| Google | `https://negiao-webgis.hf.space/api/auth/oauth/google/callback` | `http://localhost:7860/api/auth/oauth/google/callback` |
| GitHub | `https://negiao-webgis.hf.space/api/auth/oauth/github/callback` | `http://localhost:7860/api/auth/oauth/github/callback` |

---

## 2. GitHub OAuth App 申请（逐步）

1. 登录 GitHub → 右上角头像 → **Settings**。
2. 左栏最底部 → **Developer settings** → **OAuth Apps** → **New OAuth App**。
3. 按下表填写：

   | 字段 | 填写值 | 说明 |
   |------|--------|------|
   | Application name | `NEGIAO's WebGIS` | 任意，授权页会展示给用户 |
   | Homepage URL | `https://negiao.github.io/WebGIS-Dev` | 前端地址 |
   | Application description | 可选 | |
   | Authorization callback URL | `https://negiao-webgis.hf.space/api/auth/oauth/github/callback` | ⚠️ 必须逐字符一致，结尾不要加 `/` |

4. **Register application** → 页面显示 **Client ID**，记下。
5. 点击 **Generate a new client secret** → ⚠️ Secret **只完整显示一次**，立即复制保存。
6. ⚠️ **一个 GitHub OAuth App 只能配一个 callback URL**。本地开发调试请再建一个 App（callback 填 `http://localhost:7860/api/auth/oauth/github/callback`），本地 `.env` 用第二个 App 的 ID/Secret。
7. 权限说明：后端请求 scope 为 `read:user user:email`，用户授权后可读取私有邮箱列表，但**必须存在 verified 邮箱**（优先 primary + verified），否则后端会拒绝自动注册（详见排错表）。

## 3. Google OAuth Client 申请（逐步）

1. 打开 [Google Cloud Console](https://console.cloud.google.com/) → 顶栏项目选择器 → **New Project**（如 `webgis-oauth`）→ 创建并切换到该项目。
2. **配置同意屏幕**：左侧菜单 → **APIs & Services** → **OAuth consent screen**：
   - User Type 选 **External** → Create；
   - App name（如 `NEGIAO's WebGIS`）、User support email、Developer contact 填写自己邮箱；
   - **Authorized domains** 添加：`hf.space` 与 `github.io`；
   - Scopes 步骤保持默认即可（后端只用 `openid email profile` 非敏感 scope，无需申请审核）；
   - 完成向导后，在 consent screen 页面点 **Publish App** 将状态从 Testing 改为 **In production**。⚠️ 若停留在 Testing，只有手动添加的测试用户能登录，其他人会看到 `access_denied`。
3. **创建凭据**：**APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**：
   - Application type：**Web application**；
   - Name：任意（如 `webgis-backend`）；
   - **Authorized redirect URIs** → Add URI：`https://negiao-webgis.hf.space/api/auth/oauth/google/callback`；
   - ✅ Google 支持一个 Client 配多条 redirect URI，可同时加一条 `http://localhost:7860/api/auth/oauth/google/callback` 供本地开发共用同一 Client；
   - Authorized JavaScript origins 可留空（本项目为后端跳转式，不用 Google JS SDK）。
4. **Create** 后弹窗显示 **Client ID**（形如 `xxxx.apps.googleusercontent.com`）与 **Client secret**，复制保存。

## 4. Hugging Face Space 配置（生产核心步骤）

进入 Space 页面 → **Settings** → **Variables and secrets**。

### 4.1 Secrets（绝密，L3 层，值不会出现在仓库和日志）

逐条 **New secret** 添加：

| Secret 名称 | 值 |
|-------------|-----|
| `GOOGLE_OAUTH_CLIENT_ID` | Google 控制台的 Client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google 控制台的 Client secret |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 的 Client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App 的 Client secret |
| `OAUTH_STATE_SECRET` | 自己生成的随机长字符串（见下） |

生成 `OAUTH_STATE_SECRET`（任选其一，长度 ≥ 32 字节）：

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
# 或
openssl rand -base64 48
```

⚠️ 生产环境 `OAUTH_STATE_SECRET` **必填**：缺失时所有 OAuth 入口直接返回 503（开发环境才有内置兜底）。

### 4.2 Variables（非密，L1 层，可选）

以下变量**通常不用配**——`APP_ENV` 缺省即 `production`，两个 URL 有内建默认值（`https://negiao-webgis.hf.space` / `https://negiao.github.io/WebGIS-Dev`）。仅当 Space 改名、换自定义域名或前端迁移时才需要显式设置：

| Variable | 何时需要 | 示例 |
|----------|----------|------|
| `BACKEND_PUBLIC_URL` | Space 域名变化时 | `https://<user>-<space>.hf.space` |
| `FRONTEND_PUBLIC_URL` | 前端域名变化时 | `https://<user>.github.io/WebGIS-Dev` |
| `GOOGLE/GITHUB_OAUTH_REDIRECT_URI` | 极特殊部署需覆盖推导时 | 完整回调 URL |
| `FRONTEND_OAUTH_SUCCESS_URL` / `FRONTEND_OAUTH_FAILURE_URL` | 需覆盖前端回跳时 | `https://.../#/oauth/callback` |

改动 URL 后，记得**同步修改** Google/GitHub 控制台里的 redirect URI，两边必须一致。

### 4.3 重启与生效确认

1. 保存 Secrets 后 Space 会自动重启（未重启可手动 **Restart Space**，无需 Factory rebuild）。
2. 打开 Space **Logs**，启动时后端会打印脱敏配置摘要，确认这一行：

   ```text
   [L3] ... OAUTH_STATE_SECRET=已配置, GOOGLE_OAUTH=已配置, GITHUB_OAUTH=已配置 ...
   ```

3. 命令行快速自检（不依赖前端）：

   ```bash
   curl -sI "https://negiao-webgis.hf.space/api/auth/oauth/github/start" | head -3
   # 期望：HTTP 302/307，Location: https://github.com/login/oauth/authorize?...
   # 若 503：响应 detail 会精确指明缺少哪个变量
   ```

4. 浏览器完整验收：打开前端登录页 → 「使用 GitHub 继续」→ 授权 → 应回跳 `/#/oauth/callback` 并自动进入系统；Google 同理。

## 5. 本地开发环境配置

仓库根目录 `.env`（已被 `.gitignore` 忽略）：

```ini
APP_ENV=development
# GitHub：使用第 2 节第 6 步创建的"本地开发专用" OAuth App
GITHUB_OAUTH_CLIENT_ID=本地App的ClientID
GITHUB_OAUTH_CLIENT_SECRET=本地App的ClientSecret
# Google：可与生产共用 Client（前提是已添加 localhost 回调 URI）
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxx
```

无需配置 `OAUTH_STATE_SECRET`（development 有内置兜底）、无需配置任何 REDIRECT_URI（自动推导 `http://localhost:7860/...`）。改完重启后端生效。

## 6. 常见错误速查表

| 现象 | 原因 | 处理 |
|------|------|------|
| 503 `github OAuth 未配置：HF Secrets 缺少 GITHUB_OAUTH_CLIENT_SECRET` | 对应 Secret 未配或名称拼错 | 按 4.1 补齐，注意变量名精确匹配 |
| 503 `OAuth state secret 未配置` | 生产缺 `OAUTH_STATE_SECRET` | 生成并添加 Secret 后重启 |
| GitHub 页面报 `redirect_uri_mismatch` / `The redirect_uri MUST match...` | 控制台 callback 与后端推导值不一致 | 对照第 1 节表格逐字符核对（含 http/https、尾斜杠） |
| Google `Error 400: redirect_uri_mismatch` | 同上 | Credentials 里核对 Authorized redirect URIs |
| Google `access_denied`（非本人账号） | Consent screen 处于 Testing 状态 | Publish App 到 In production，或把用户加入 Test users |
| 回跳前端后提示 `第三方账号缺少已验证邮箱，无法自动注册或绑定` | GitHub 账号无 verified 邮箱 | GitHub Settings → Emails 完成邮箱验证后重试 |
| `OAuth state 已过期，请重新发起登录` | 授权页停留超 10 分钟（TTL 600s） | 重新点击登录按钮 |
| `OAuth ticket 无效或已过期` | ticket 为一次性且 TTL 120s（刷新回调页/重复消费） | 重新走一次登录流程 |
| `该第三方账号已绑定其他 WebGIS 用户` (409) | 此 Google/GitHub 身份已绑定别的本地账号 | 用原账号登录后在账号中心解绑，或直接用第三方一键登录 |
| 回跳到 `localhost` 而非线上前端 | 旧版本代码或 `FRONTEND_PUBLIC_URL` 配错 | 升级至 V3.4.6+，检查 4.2 变量 |
| Space 重启后仍 503 | Secret 保存在了别的 Space / 大小写不符 | Logs 里看 `[L3]` 摘要逐项核对 |

## 7. 安全要点

- Client Secret 与 `OAUTH_STATE_SECRET` 只允许存放于 HF Secrets（L3）或本地未提交的 `.env`，**严禁**写入 git、前端 `VITE_*` 变量或 Admin 面板（L2 对绝密项有硬性拦截）。
- state 采用 HMAC-SHA256 签名 + 600s TTL 防 CSRF/重放；ticket 一次性消费 + 120s TTL，明文只经前端 URL 传递一次。
- 后端不存储第三方 access token，仅用于当次拉取 profile；数据库 `oauth_accounts` 只保存 `(provider, provider_user_id)` 映射与公开资料。
- 仅 verified email 允许自动注册/绑定，防止未验证邮箱账号接管。

---

*本指南随 V3.4.6 发布；实施细节与验证记录见 `Docs/LLM_record/26-07-26/2026-07-26-oauth-config-derivation-fix-and-verify.md`。*
