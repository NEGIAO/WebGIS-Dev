# 2026-05-29 WebGIS 全项目代码审查报告

## 日期和时间
2026-05-29 11:00

## 修改内容
对 WebGIS 项目前端和后端代码进行全面审查，识别安全漏洞、代码质量问题和架构改进点。

---

## 一、前端代码审查

### 问题 1 (严重 - 安全): 前端硬编码游客账号密码

**文件**: `frontend/src/views/RegisterView.vue`
**行号**: 319-336

```js
function fillGuestAccount() {
    mode.value = 'login';
    username.value = 'user';
    password.value = '123';
}
```

**问题描述**: 游客账号 `user` / 密码 `123` 直接写死在前端源码中，任何人查看浏览器源码即可获取。

**改进建议**:
- 将游客登录改为后端接口下发一次性 token
- 若必须保留游客模式，应由后端生成临时凭证

---

### 问题 2 (严重 - 安全): XSS 风险 -- v-html 注入未转义的用户文本

**文件**: `frontend/src/components/Shell\Message.vue`
**行号**: 40, 128-138

```html
<div class="toast-text" v-html="formatTextWithFonts(item.text)"></div>
```

**问题描述**: `formatTextWithFonts` 未对输入文本进行 HTML 实体转义，恶意标签会被直接渲染。

**改进建议**:
- 在函数中先对 `text` 进行 HTML 实体转义
- 优先使用 `{{ }}` 插值语法替代 `v-html`

---

### 问题 3 (高 - 可维护性): 超大组件严重违反单一职责原则

| 文件 | 行数 |
|------|------|
| `src/components/UserCenter/FloatingAccountPanel.vue` | 2547 |
| `src/components/Layer/TOCPanel.vue` | 2472 |
| `src/components/Map/MapContainer.vue` | 1990 |
| `src/components/Weather/WeatherChartPanel.vue` | 1883 |
| `src/views/HomeView.vue` | 1755 |
| `src/components/Chat/ChatPanelContent.vue` | 1590 |
| `src/constants/useBasemapManager.ts` | 1587 |
| `src/composables/useLayerDataImport.js` | 1428 |
| `src/stores/useLayerStore.ts` | 1110 |

**改进建议**:
- `FloatingAccountPanel.vue` 应拆分为独立子组件
- `TOCPanel.vue` 应按 Tab 拆分
- `useLayerStore.ts` 应拆分为多个独立 store

---

### 问题 4 (中高 - 安全): 天地图 API Key 硬编码在源码中

**文件**:
- `frontend/src/composables/useUserLocation.js` 第 11 行
- `frontend/.env.production` 第 14 行

**问题描述**: API Key 以硬编码默认值出现，且 `.env.production` 已被 Git 跟踪。

**改进建议**:
- 将 `.env.production` 加入 `.gitignore`
- API Key 通过后端代理注入
- 统一通过 composable 集中管理 Token

---

### 问题 5 (中 - 代码质量): 大量 console 调试语句残留

**统计**: 全项目超过 120 处 `console.log/warn/error/info` 调用

**典型案例**:
- `useMapSwipeTest.ts` - 整个文件是死代码，未被引用
- `RegisterView.vue` 第 585 行 - 将用户地理位置打印到控制台

**改进建议**:
- 删除 `useMapSwipeTest.ts` 死代码文件
- 使用 `debug` 库替代裸 `console`

---

## 二、后端代码审查

### 问题 1 (严重): 代理端点存在 SSRF 漏洞

**文件**: `backend/api/proxy.py`，第 246-333 行

**问题描述**: `/proxy/{target_url:path}` 端点允许代理到**任意 URL**，无目标地址限制。攻击者可访问内部网络资源。

**改进建议**:
- 实现目标 URL 白名单
- 拒绝所有私有 IP 段（127.0.0.0/8, 10.0.0.0/8 等）

---

### 问题 2 (严重): 硬编码管理员默认密码

**文件**: `backend/api/auth.py`，第 36 行、第 1193-1195 行

```python
DEFAULT_ADMIN_PASSWORD_LOCAL = "123456"
```

**问题描述**: 当 `SUPER_USER` 环境变量未配置时，任何人均可以 `admin/123456` 登录获得管理员权限。

**改进建议**:
- 删除硬编码默认密码
- 启动时检测 `SUPER_USER` 是否配置

---

### 问题 3 (高): 动态 SQL 拼接存在注入风险

**文件**: `backend/api/admin.py`，第 106-117 行

**问题描述**: 允许管理员对**任意表**执行 INSERT/UPDATE/DELETE 操作，包括核心表。

**改进建议**:
- 增加可操作表名白名单
- 禁止对 `users`、`sessions` 等核心表直接操作

---

### 问题 4 (高): 登录接口无速率限制

**文件**: `backend/api/auth.py`，第 1479-1596 行

**问题描述**: 登录、注册端点均无速率限制，可被暴力破解。

**改进建议**:
- 使用 `slowapi` 或自实现速率限制中间件
- 登录失败达到阈值后临时封禁 IP

---

### 问题 5 (中): 全局 HTTP 客户端禁用了 SSL 证书验证

**文件**: `backend/api/proxy.py`，第 24-29 行

```python
verify=False  # 禁用 SSL 证书验证
```

**问题描述**: 使得中间人攻击（MITM）成为可能。

**改进建议**:
- 默认启用 SSL 验证
- 仅对已知自签名证书服务单独配置

---

## 三、问题汇总

| 编号 | 严重度 | 类别 | 核心问题 | 位置 |
|------|--------|------|----------|------|
| F1 | 严重 | 安全 | 前端硬编码游客账号密码 | RegisterView.vue |
| F2 | 严重 | 安全 | v-html XSS 风险 | Message.vue |
| F3 | 高 | 可维护性 | 9 个文件超过 1000 行 | 多文件 |
| F4 | 中高 | 安全 | API Key 硬编码 | useUserLocation.js |
| F5 | 中 | 代码质量 | 120+ 处 console 残留 | 多文件 |
| B1 | 严重 | 安全 | SSRF 漏洞 | proxy.py |
| B2 | 严重 | 安全 | 硬编码管理员密码 | auth.py |
| B3 | 高 | 安全 | SQL 注入风险 | admin.py |
| B4 | 高 | 安全 | 登录无速率限制 | auth.py |
| B5 | 中 | 安全 | SSL 验证禁用 | proxy.py |

---

## 四、优先修复建议

### 立即修复（安全漏洞）
1. 移除前端硬编码游客密码，改为后端下发临时凭证
2. 修复 `formatTextWithFonts` XSS 漏洞，添加 HTML 实体转义
3. 实现 SSRF 防护，添加 URL 白名单
4. 移除管理员默认密码，强制配置环境变量

### 短期优化（1-2 周）
5. 添加登录接口速率限制
6. admin CRUD 添加表名白名单
7. 启用 SSL 证书验证
8. 清理 console 调试语句和死代码

### 长期改进（架构层面）
9. 拆分超大组件（FloatingAccountPanel、TOCPanel、MapContainer）
10. 统一 API Key 管理，通过后端代理注入
11. 消除 TypeScript 中的 `any` 类型

---

*审查完成时间: 2026-05-29 11:00*
