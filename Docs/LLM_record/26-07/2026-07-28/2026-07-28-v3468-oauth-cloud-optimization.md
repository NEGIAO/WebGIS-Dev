# V3.4.68 — Google/GitHub OAuth 登录接入 + 体积云画质优化

- 日期：2026-07-28
- 任务等级：L2
- 版本：V3.4.68

## 1. 问题分析

### 核心症状
1. 用户注册登录仅支持邮箱方式，缺乏主流第三方登录渠道（Google/GitHub），新用户转化门槛高
2. 体积云流畅/均衡档颗粒感明显，`cloudResolutionScale` 与 `minStepSize` 等参数偏保守，用户无法在不切极致档的情况下微调画质

### 根本原因
1. 后端 `oauth.py` / 前端 `OAuthCallbackView.vue` 在早期配置重构（V3.4.66）后断开，OAuth 链路长期处于不可用状态
2. 体积云预设自 V3.4.65 画质旋钮后未再上调采样参数，smooth/balanced 档仍使用较早的保守值

### 受影响模块
- 后端：`backend/api/auth/oauth.py`、`backend/api/auth/routes.py`
- 前端：`frontend/src/views/OAuthCallbackView.vue`、`frontend/src/views/RegisterView.vue`、`frontend/src/api/backend/auth.js`
- 云渲染：`cloudQualityPresets.js`、`ThreeGeospatialPipeline.js`、`CloudShadowPass.js`、`setupCloudIntegration.js`、`cloudModule.js`
- 风场粒子：`cesium-wind-layer/index.mjs`、`cesium-wind-layer/Wind2D.js`、`cesium-wind-layer/index.d.ts`

---

## 2. 修改内容

### 2.1 Google/GitHub OAuth 登录接入（commit ef9406d2）

#### 后端
- **`backend/api/auth/oauth.py`（+42 行，新增文件）**：
  - 实现 Google OAuth 2.0 授权码换 token + OneTap ID token 验证双通道
  - 实现 GitHub OAuth 授权码换 token + 用户信息获取
  - 首次授权自动创建本地 registered 用户，后续复用已有绑定
  - 仅 verified email 可自动注册/绑定，防未验证邮箱导致账号接管
  - OAuth state 使用 HMAC 签名 + 短 TTL（落库 `oauth_tickets` 表，多 worker 安全）

- **`backend/api/auth/routes.py`（+44 行）**：
  - 新增 `GET /api/auth/oauth/{provider}/authorize` —— 生成授权 URL（Google/GitHub）
  - 新增 `GET /api/auth/oauth/{provider}/callback` —— 回调处理，校验 state，换 token，创建/绑定用户，签发 WebGIS session
  - 新增 `POST /api/auth/oauth/google/onetap` —— Google OneTap 直接登录入口
  - 所有 OAuth 错误统一重定向到前端 OAuthCallbackView（带错误码）

#### 前端
- **`frontend/src/api/backend/auth.js`（+12 行）**：
  - 新增 `getOAuthAuthorizeUrl(provider)` / `verifyGoogleOneTap(credential)` 两个 API 函数

- **`frontend/src/views/OAuthCallbackView.vue`（364 行，重构）**：
  - 完整处理 OAuth 回调落地：解析 URL 错误码、调用后端回调端点、处理成功/失败状态
  - 成功时自动登录并跳转首页；失败时展示可操作错误提示（重试返回登录页）
  - 新增 OAuth 错误码映射（access_denied / invalid_state / email_unverified / provider_mismatch 等）
  - 加载态动画 + 自动超时保护（15s 无响应提示刷新重试）

- **`frontend/src/views/RegisterView.vue`（+82 行）**：
  - 登录/注册表单区头部新增 Google / GitHub 一键授权按钮
  - 按钮触发 `getOAuthAuthorizeUrl` 跳转第三方授权页
  - 按钮样式适配绿/蓝双主题，加载态防重复点击

- **`frontend/index.html`（+2 行）**：
  - 加载 Google Identity Services 脚本（Google OneTap 前置依赖）

#### 配置
- **`.env` / `backend/.env.example`（各 +4 行）**：
  - 新增 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 四个 L3 配置项
  - 均为可选配置，未配置时前端自动隐藏对应按钮

### 2.2 体积云画质优化（commit e9849acc）

#### 三档预设参数上调（`cloudQualityPresets.js`）

| 参数 | smooth（旧→新） | balanced（旧→新） | ultra（旧→新） |
|------|:---:|:---:|:---:|
| `cloudResolutionScale` | 0.5→**0.67** | 0.75→**0.85** | 1.0（不变） |
| `maxSteps` | 108→**144** | 156→**220** | 340（不变） |
| `maxStepsToSun` | 2→**3** | 4→**5** | 6（不变） |
| `minStepSize` | 110→**85** | 80→**60** | 50（不变） |
| `maxStepSize` | 1400→**1200** | 1200→**1100** | 1000（不变） |
| `perspectiveStepScale` | 1.03→**1.018** | 1.018→**1.01** | 1.005（不变） |
| `aerialPerspectiveScale` | 0.0→**0.35** | 0.0→**0.55** | 0.0→**0.7** |
| `atmosphereExposureDay` | 0.82→**0.9** | 0.9→**0.95** | 0.95（不变） |
| `aerialStageEnabled` | false→**true** | true（不变） | true（不变） |
| `groundAerialScale` | 0.0→**0.35** | 不变 | 不变 |

**视觉效果变化**：流畅/均衡档颗粒感明显降低，大气透视恢复（此前 `aerialPerspectiveScale=0` 导致大气效果几乎不可见），`aerialStageEnabled=true` 让流畅档也能看到基础大气散射。

#### 新增三个画质微调旋钮（`cloudModule.js`）

工具面板「体积云」分组新增三个独立于画质档位的旋钮：
- **云渲染分辨率**（`cloudResolutionScale`，0.5–1.0，step 0.01）：颗粒感核心参数
- **最小采样步长**（`minStepSize`，20–200m，step 1）：越细腻颗粒越少
- **远距步长增幅**（`perspectiveStepScale`，1.0–1.05，step 0.001）：值越接近 1 远处采样越密

用户可在不切极致档的情况下，按 GPU 能力现场微调颗粒感。

#### 风场粒子缩放平滑（`cesium-wind-layer/index.mjs`）

- 新增 `zoomScaleTransitionMs: 260` 缩放过渡平滑参数
- 新增 `updatePixelSizeTransition()` preRender 事件驱动，相机缩放时粒子尺寸平滑过渡（260ms ease），消除缩放时粒子大小跳变
- `percentageChanged` 阈值从 `0.01` 改为 `3e-3`（更灵敏的相机变化检测），并在注册前读取原值、销毁时恢复，避免全局副作用

#### 云纹理偏移驱动源统一（`ThreeGeospatialPipeline.js`）

- `_advanceOffsets()` 改为纯 `elapsed` 函数：`offset = speed × elapsed`（此前为 `speed × dt` 增量累加）
- 消除浮点累加误差导致的云纹理相位漂移
- 新增 `clockElapsedSeconds` 统一输出到 BSM 动态参数，确保云体与云影演化时相完全一致

#### 后处理链修复（`ThreeGeospatialPipeline.js`）

- 云分辨率/预设切换时的 stage 重建逻辑修复：不再用 `remove+add` 重排（会永久删除 Aerial stage 导致地面云影丢失），改为原位替换 Cloud stage
- 注释明确 "Keep the long-lived Aerial stage in place"，防止后续维护者重踩旧坑

---

## 3. 修改原因

1. **OAuth**：邮箱注册转化门槛高，主流用户习惯 Google/GitHub 一键登录；原有 OAuth 代码在配置链路重构后断裂，需要修复接入
2. **云画质**：V3.4.65 新增画质旋钮后用户反馈流畅/均衡档仍有明显颗粒感；`aerialPerspectiveScale=0` 导致大气效果名存实亡，需恢复
3. **风场缩放平滑**：相机缩放时粒子尺寸瞬时跳变影响视觉品质
4. **云纹理偏移**：浮点累加误差在长时间运行后导致云体与云影演化相位不一致

---

## 4. 影响范围

- **鉴权链路**：新增 OAuth 端点，不影响现有邮箱登录和 session 机制
- **云渲染**：观感提升（颗粒更细、大气恢复），GPU 负载微增（流畅档 `maxSteps` 108→144、`cloudResolutionScale` 0.5→0.67）
- **风场粒子**：缩放时粒子尺寸平滑过渡，视觉品质提升
- **配置**：4 个新 L3 key（均为可选，未配置不影响现有功能）

---

## 5. 解决方案

### 5.1 OAuth 接入方案

选型：**授权码模式（Google/GitHub）+ Google OneTap** 双通道
- 授权码模式是标准 OAuth 2.0 流程，后端换 token，不暴露 client secret
- OneTap 是 Google 特有的无跳转登录，适合已登录 Google 账号的用户
- state 参数落库（`oauth_tickets` 表）而非内存，支持多 worker 部署（HF Spaces 多 replica 场景）
- 自动注册仅对 verified email 开放，防未验证邮箱导致账号接管（延续 V3.4.4 安全约束）

### 5.2 云画质调参方案

选型：**上调低档位参数 + 新增独立微调旋钮**
- 不改变三档档位框架，仅上调 smooth/balanced 参数
- 新增三个独立旋钮让用户在档位内按 GPU 能力微调
- `aerialStageEnabled=true` + `aerialPerspectiveScale` 非零恢复大气效果

---

## 6. 性能指标

| 指标 | 改前 | 改后 | 变化 |
|------|------|------|------|
| 流畅档 GPU 像素成本（raymarch） | 0.5² = 0.25（全分辨率） | 0.67² ≈ 0.45（全分辨率） | +80% |
| 流畅档 `maxSteps` | 108 | 144 | +33% |
| 均衡档 GPU 像素成本 | 0.75² = 0.56 | 0.85² ≈ 0.72 | +29% |
| 均衡档 `maxSteps` | 156 | 220 | +41% |
| 风场粒子缩放过渡 | 瞬时跳变 | 260ms ease 平滑 | 视觉品质提升 |

> ⚠️ 实测帧率数据待用户实机验证（沙盒无 GPU）。上述像素成本为理论值，实际 FPS 影响取决于具体 GPU。

---

## 7. 测试方案

### Agent 已执行
- 9 个触改 JS/Vue 文件 `node --check` 通过
- `cloudQualityPresets.js` 预设参数格式校验通过（所有键类型一致）
- 新增 3 个 cloudModule 控件字段类型与现有控件一致

### 待用户实机验证
1. **OAuth**：
   - 配置 `GOOGLE_CLIENT_ID/SECRET` 和 `GITHUB_CLIENT_ID/SECRET` 后，访问登录页应出现两个授权按钮
   - Google 授权 → 跳转 Google 账号选择 → 授权 → 自动创建账号并登录
   - GitHub 授权 → 同上
   - Google OneTap：已登录 Google 账号时，登录页应出现 OneTap 弹窗
   - 取消授权（Google/GitHub 拒绝）→ 前端展示「已取消授权」提示
   - 未配置密钥时，对应按钮自动隐藏
2. **云画质**：
   - 切换流畅档，颗粒感应比 V3.4.67 明显降低
   - 切换均衡档，大气透视应可见（此前几乎不可见）
   - 打开体积云工具面板，应看到「云渲染分辨率 / 最小采样步长 / 远距步长增幅」三个新旋钮
   - 调节三个旋钮，云颗粒感应实时变化，GPU 负载可在 FPS 面板观察
3. **风场**：
   - 开启风场粒子，缩放相机时粒子尺寸应平滑过渡（无瞬时跳变）
4. **回归**：
   - 邮箱注册/登录不受影响
   - 体积云极致档参数不变，效果应与 V3.4.67 一致
   - 关闭体积云后大气系统正常（Cesium 原生大气）

---

## 8. 变更文件清单

| 文件 | 说明 |
|------|------|
| `backend/api/auth/oauth.py` | **新增** — Google/GitHub OAuth 服务（授权码换 token / OneTap 验证 / 自动注册绑定） |
| `backend/api/auth/routes.py` | **改动** — 新增 3 个 OAuth 端点路由 |
| `frontend/src/api/backend/auth.js` | **改动** — 新增 2 个 OAuth API 函数 |
| `frontend/src/views/OAuthCallbackView.vue` | **重构** — OAuth 回调落地页（错误处理 / 加载态 / 超时保护） |
| `frontend/src/views/RegisterView.vue` | **改动** — 新增 Google/GitHub 授权按钮 |
| `frontend/index.html` | **改动** — 加载 Google Identity Services 脚本 |
| `.env` | **改动** — 新增 4 个 OAuth L3 配置占位 |
| `backend/.env.example` | **改动** — 新增 4 个 OAuth L3 配置占位 |
| `frontend/src/components/Cesium/Cloud/cloudQualityPresets.js` | **改动** — 三档预设参数上调（颗粒感 + 大气恢复） |
| `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js` | **改动** — 偏移驱动源统一 + 后处理链修复 |
| `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js` | **改动** — 时钟同步偏移输出 |
| `frontend/src/components/Cesium/Cloud/setupCloudIntegration.js` | **改动** — 时钟同步接线 |
| `frontend/src/components/Cesium/composables/toolModules/cloudModule.js` | **改动** — 新增 3 个画质微调旋钮 |
| `frontend/src/components/Cesium/cesium-wind-layer/index.mjs` | **改动** — 风场缩放平滑 + percentageChanged 守卫 |
| `frontend/src/components/Cesium/cesium-wind-layer/Wind2D.js` | **改动** — 缩放平滑参数透传 |
| `frontend/src/components/Cesium/cesium-wind-layer/index.d.ts` | **改动** — 新增 `zoomScaleTransitionMs` 类型声明 |

---

## 9. 遗留与风险

1. **OAuth 密钥需用户自行申请**：Google Client ID/Secret 需在 [Google Cloud Console](https://console.cloud.google.com/) 申请；GitHub Client ID/Secret 需在 GitHub Settings → Developer settings → OAuth Apps 申请
2. **OAuth 回调地址需在第三方平台注册**：
   - Google：`https://<后端域名>/api/auth/oauth/google/callback`
   - GitHub：`https://<后端域名>/api/auth/oauth/github/callback`
   - HF Spaces 部署时域名为 `https://NEGIAO-WebGIS.hf.space`
3. **流畅档 GPU 负载增加**：`maxSteps` 108→144、`cloudResolutionScale` 0.5→0.67，低帧率设备可能感受到 FPS 下降；用户可用新增旋钮回调
4. **Google OneTap 依赖 GIS 脚本**：`index.html` 加载 `accounts.google.com/gsi/client`，网络受限环境（如国内无 VPN）下 OneTap 可能不显示，授权码模式不受影响
5. **`clockElapsedSeconds` 输出到 BSM**：此次新增的云体-云影时钟同步，在时间轴快速拖拽时可能引发 BSM 跳变（类似 V3.4.67 时间同步的已知特性），待实机观察
