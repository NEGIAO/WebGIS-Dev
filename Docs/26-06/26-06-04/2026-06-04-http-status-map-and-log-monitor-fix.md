# 2026-06-04 HTTP 状态码统一映射 & 日志监控识别修复

**日期和时间**：2026-06-04 00:30

---

## 修改内容

1. 新增统一 HTTP 状态码映射模块 `httpStatusMap.js`（含标准 HTTP 码 + 高德 infocode）
2. 重构 axios 响应拦截器错误处理，所有 HTTP 错误码附带中文描述
3. 统一 `locationSearch.js` 三个搜索服务（高德/天地图/Nominatim）的状态码处理逻辑
4. 修复日志监控面板（LogMonitor）将 5xx/4xx HTTP 错误误判为正常 INFO 日志的 Bug

---

## 修改原因

### 核心症状

用户在前端搜索"西南大学"时，后端返回 `503 Service Unavailable`，日志监控面板将该条记录显示为绿色（正常），无法直观识别异常。

### 事件逻辑链

```
前端搜索 "西南大学"
  → GET /api/proxy/amap/place/text?keywords=西南大学&page=1&offset=10
    → proxy_amap_place_text() [external_proxy.py:282]
      → _request_amap_json() [external_proxy.py:263]
        → _require_amap_key_or_503() [external_proxy.py:214]
          → _resolve_amap_key() [external_proxy.py:80]
            → DB 查询 api_keys 表 → 无 amap_key 记录
            → 环境变量 AMAP_WEB_SERVICE_KEY / AMAP_KEY / GAODE_KEY → 全部为空
            → 返回 ""
          → key 为空 → raise HTTPException(503, "后端未配置高德服务密钥")
```

### 根本原因

1. **后端**：高德 API Key 未在 `backend/.env` 或数据库 `api_keys` 表中配置（需用户手动填入）
2. **前端 - 状态码映射缺失**：HTTP 状态码处理分散在 `client.js`、`locationSearch.js`、`geocoding.js` 多处，各自硬编码，无统一映射表
3. **前端 - 日志监控误判**：`LogMonitor.vue` 的 `getLogClass()` 函数仅检查 `ERROR`/`FAILED`/`WARN`/`INFO` 等关键字。uvicorn 的访问日志格式为 `INFO: 10.x.x.x - "GET /path HTTP/1.1" 503 Service Unavailable`，`INFO` 在行首优先命中，返回 `log-info`（绿色），行尾的 `503` 被忽略

### 受影响模块

- 前端 API 层（`src/api/`）：所有使用 `backendAPI` 的模块
- 日志监控面板（`LogMonitor.vue`）：日志分类逻辑
- 外部服务代理（`external_proxy.py`）：高德 API 调用链

---

## 优化解决方案

### 1. 新增 `httpStatusMap.js` — 统一状态码映射模块

**路径**：`frontend/src/api/httpStatusMap.js`

提供：
- `HTTP_STATUS_MAP`：标准 HTTP 100-599 状态码 → 中文描述（80+ 个码）
- `AMAP_INFOCODE_MAP`：高德 API infocode → 中文描述（认证类 10001-10044、参数类 20000-20803、服务类 30000-30001）
- `getHttpStatusMessage(code)`：输入 HTTP 码 → 返回中文描述
- `getAmapErrorMessage(infocode)`：输入高德 infocode → 返回中文描述
- `buildHttpErrorMessage(code, detail, opts)`：生成面向用户的完整错误提示，附加端点路径
- `classifyHttpStatus(code)` / `isClientError()` / `isServerError()` / `isRetryable()`：辅助判断函数

### 2. 重构 `client.js` — axios 响应拦截器

- 错误日志格式升级为 `[Backend API] [503 服务暂不可用] 后端未配置高德服务密钥`（状态码 + 中文描述）
- `apiError` 对象新增 `status`、`statusText` 字段，下游可直接读取
- `handleApiError` 在 UI 通知中自动附加 `[503 服务暂不可用]` 标签

### 3. 统一 `locationSearch.js` 状态码处理

- Amap：7 个硬编码 infocode → `getAmapErrorMessage()` 统一查询
- 天地图/Nominatim/Amap：HTTP 状态码判断 → `getHttpStatusMessage()` 统一描述
- 503 错误现在明确提示"后端可能未配置API Key，请联系管理员"

### 4. 修复 `LogMonitor.vue` — HTTP 状态码检测优先于 INFO

**核心改动**：在 `getLogClass()` 函数中，HTTP 状态码正则检测插入在 `INFO` 关键字检测之前。

```
匹配优先级（从高到低）：
1. ERROR / FAILED        → 🔴 红色（Python 异常）
2. HTTP 5xx              → 🔴 红色（500/502/503/504）
3. HTTP 4xx              → 🟡 黄色（401/403/404/429）
4. HTTP 2xx              → 🟢 绿色（200 OK）
5. WARN                  → 🟡 黄色
6. SUCCESS               → 🟢 绿色
7. [BUILD] / [RUN] / INFO → 蓝/绿/绿
8. 无匹配               → ⚪ 灰色
```

正则 `/\b([1-5]\d{2})\b/g` 取行内最后一个匹配（状态码通常在行尾），避免端口号（如 `:30852`）干扰。

---

## 测试方案

### 测试环境

- 本地开发环境（`localhost:7860`）
- 后端不配置高德 API Key（模拟 503 场景）

### 测试步骤

1. **日志监控 503 识别**：
   - 打开日志监控面板
   - 触发一次高德 POI 搜索（如搜索"西南大学"）
   - 预期：日志行显示为红色（`log-error`），而非绿色

2. **日志监控 4xx 识别**：
   - 未登录状态下访问需鉴权的接口
   - 预期：401 日志行显示为黄色（`log-warning`）

3. **日志监控 200 识别**：
   - 正常请求健康检查 `/health`
   - 预期：200 日志行显示为绿色（`log-success`）

4. **前端错误提示**：
   - 触发 503 错误
   - 预期：UI 通知显示 `高德服务暂不可用 [503 服务暂不可用]，后端可能未配置API Key，请联系管理员`

---

## 性能指标

- 无明显性能影响，`httpStatusMap.js` 为纯静态数据 + 简单查表函数
- `LogMonitor.vue` 的 `getLogClass` 增加一次正则匹配（仅在 ERROR/FAILED 未命中时执行），开销可忽略

---

## 修改的文件路径

| 操作 | 文件绝对路径 |
|------|-------------|
| **新增** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\httpStatusMap.js` |
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\backend\client.js` |
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\locationSearch.js` |
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\api\index.js` |
| **修改** | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel\LogMonitor.vue` |

---

## 待办

- [ ] 在后端 `.env` 或管理后台配置高德 API Key（`amap_key`），解决 503 根因
- [ ] 补充 `backend/.env.example` 中的 AMAP 相关环境变量模板
- [ ] 统一 `location.py`、`ip_geo.py`、`upstream.py` 的 AMAP key 读取逻辑为数据库优先 + 环境变量降级
