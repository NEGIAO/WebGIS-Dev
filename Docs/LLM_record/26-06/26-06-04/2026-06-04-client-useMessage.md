# 2026-06-04 前端 API 模块集成 useMessage 组件

- **日期和时间**：2026-06-04 10:06
- **版本**：3.0.x

---

## 修改内容

在前端 `api/` 目录下的多个模块中，**在保留原有 `console.error` / `console.warn` 的基础上**，新增 `useMessage` 组件的调用，使网络请求错误和业务错误能够通过前端封装的 Message 组件向用户展示可视化提示。

涉及文件：
- `api/backend/client.js` — axios 拦截器（请求错误、响应错误）
- `api/backend/location.js` — 访问追踪失败
- `api/locationSearch.js` — 天地图、Nominatim、高德搜索错误

---

## 修改原因

此前 `api/` 目录下多个模块的错误处理仅通过 `console.error` / `console.warn` 输出到浏览器控制台，用户无法在界面上感知请求失败、网络异常、搜索失败等问题。项目已封装了 `useMessage` composable 和 `Message.vue` 组件，应统一使用该方案向用户反馈错误信息。

注意：`geocoding.js`、`ipLocation.js`、`weather.js` 已经在之前集成了 `useMessage`，本次无需修改。

---

## 影响范围

- **模块**：后端 API 请求拦截器、响应拦截器
- **影响**：
  - 所有通过 `backendAPI` 发起的 HTTP 请求，在请求发送失败或服务端返回错误时，除了原有的 console 日志外，还会弹出可视化错误提示
  - 访问追踪失败时用户可看到提示
  - 天地图/Nominatim/高德搜索失败时用户可看到提示

---

## 优化解决方案

### 事件逻辑链条分析

1. **核心症状**：用户操作触发 API 请求失败时，仅在 console 中可见错误，界面上无任何反馈
2. **根本原因**：`client.js` 作为纯 JS 模块未引入 `useMessage` 组件
3. **受影响模块**：所有依赖 `backendAPI` 的业务模块（登录、图层加载、空间分析等）
4. **解决方案**：
   - **client.js**：在文件顶部引入 `useMessage`，请求拦截器 `onError` 追加 `showError`，响应拦截器错误分支追加 `showError`
   - **backend/location.js**：在 `apiLocationTrackVisit` 的 catch 中追加 `showWarning`
   - **locationSearch.js**：在 `searchWithTianditu`、`searchWithNominatim`、`searchWithAmap` 三个函数的 catch 中分别追加 `showError`
   - 保留所有原有 `console.error` / `console.warn` 调用不动

---

## 代码变更摘要

```javascript
// === client.js ===
import { useMessage } from '../../composables/useMessage';
const { error: showError } = useMessage();
// 请求拦截器 onError：showError(`请求发送失败: ...`)（无状态码，属网络层错误）
// 响应拦截器：const tag = `[${status} ${getHttpStatusMessage(status)}]`
//            console.error(`[Backend API] ${tag}`, message, error);
//            showError(`${tag} ${message}`, { duration: 6000 });
//            → 前端提示展示格式："[404 资源不存在] 请求失败，请稍后重试"

// === backend/location.js ===
import { useMessage } from '../../composables/useMessage';
// catch 中：const { warning: showWarning } = useMessage(); showWarning(...)

// === locationSearch.js ===
import { useMessage } from '../composables/useMessage';
// searchWithTianditu catch：const { error: showError } = useMessage(); showError(...)
// searchWithNominatim catch：const { error: showError2 } = useMessage(); showError2(...)
// searchWithAmap catch：const { error: showError3 } = useMessage(); showError3(...)
```

---

## 测试方案

1. 断开后端服务，触发任意 API 请求 → 验证界面上弹出 "网络异常" 错误提示
2. 后端返回 500 错误 → 验证界面上弹出对应 HTTP 错误提示
3. 后端返回 429 配额用完 → 验证**不弹出** showError（由原有 `handleApiError` 单独处理）
4. 访问追踪失败 → 验证弹出 warning 提示
5. 天地图搜索失败 → 验证弹出 "天地图搜索失败" 错误提示
6. Nominatim 搜索失败 → 验证弹出 "国际地名搜索失败" 错误提示
7. 高德搜索失败 → 验证弹出 "高德搜索失败" 错误提示
8. 正常请求 → 验证无额外弹窗

---

## 修改的文件路径

| 文件 | 变更类型 |
|------|----------|
| `WebGIS_Dev/frontend/src/api/backend/client.js` | 修改（新增 useMessage 引入和调用） |
| `WebGIS_Dev/frontend/src/api/backend/location.js` | 修改（新增 useMessage 引入和调用） |
| `WebGIS_Dev/frontend/src/api/locationSearch.js` | 修改（新增 useMessage 引入和调用） |

---

## 备注

- 本次仅处理 `client.js`，其余 147 处 console 调用分布于 30+ 文件中，后续逐步处理
- 纯 JS/TS 工具文件（如 shpParser.ts、kmlStyleParser.js、dbfParser.ts）无法直接使用 Vue composable，需通过事件总线或回调方式传递消息，留待后续方案设计