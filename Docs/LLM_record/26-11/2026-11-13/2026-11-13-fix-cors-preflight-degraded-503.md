# 跨源预检被降级 503 掩盖导致的 CORS 报错（presence/offline）

- **日期与时间**：2026-11-13 17:51
- **任务等级**：L2（缺陷修复，跨前后端定位，改动集中在后端中间件层）
- **版本**：V3.6.59

---

## 一、问题分析

### 现象

`https://webgis.negiao.cn` 关闭页面时，控制台报：

> Access to fetch at `https://negiao-webgis.hf.space/api/statistics/presence/offline` from origin `https://webgis.negiao.cn` has been blocked by CORS policy: Response to preflight request doesn't pass access control check: The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.

### 请求链路（前端）

`useRealtimeStats.ts` 的 `_sendPresenceBeacon()` 在 `pagehide` / `beforeunload` 时调用：

```ts
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization, 'X-Guest-Device-Id' },
  credentials: 'include',
  body: '{}',
  keepalive: true,
})
```

`Content-Type: application/json` 与自定义头都属非简单请求 → 必然触发 **OPTIONS 预检**；`credentials: 'include'` 要求响应带 `Access-Control-Allow-Credentials: true`。

### 根因（两个缺陷叠加）

**缺陷 1：中间件顺序反了。**

Starlette 的 `add_middleware` 实现是 `user_middleware.insert(0, ...)`，即**最后注册的中间件最外层**。原代码先 `app.add_middleware(CORSMiddleware, ...)`，之后才用 `@app.middleware("http")` 声明 `check_startup_state`，实际栈是：

```
check_startup_state → CORS → 路由
```

**缺陷 2：预检误依赖数据库。**

`check_startup_state` 对**每个**请求（含 OPTIONS 预检）先执行 `init_auth_storage()`；数据库抖动/降级时它**直接返回 503**，该响应不经过 CORS 层，因此不带任何 `Access-Control-*` 头。

两者叠加的后果：后端明明返回 503，浏览器却只报「预检未通过 CORS 校验」，**真实故障被完全掩盖**。这也是本次最初被判断为前端问题的原因。

### 复现证据（TestClient，修复前）

| 场景 | 状态码 | CORS 头 |
|---|---:|---|
| 预检（正常态） | 200 | ACAO + ACAC: true |
| 预检（降级态） | **503** | **无任何 CORS 头** |

---

## 二、修改内容

### 2.1 `backend/app.py`（三处）

| # | 改动 | 作用 |
|---|---|---|
| 1 | `app.add_middleware(CORSMiddleware, ...)` 移到 `check_startup_state` 定义**之后**，并写清 `insert(0)` 语义 | 栈变为 `CORS → check_startup_state → 路由`；降级 503 也带 CORS 头，浏览器显示真实状态码 |
| 2 | `check_startup_state` 对 `request.method == "OPTIONS"` 直接 `call_next`，不触碰存储 | 预检彻底不依赖数据库可用性（根因消除） |
| 3 | 新增 `_cors_headers_for(request)`，在 `global_exception_handler` 的 500 响应上补头 | `ServerErrorMiddleware` 恒在最外层，兜底 500 原本同样丢 CORS 头 |

### 2.2 可观测性：`LoggingCORSMiddleware`

继承 `CORSMiddleware`，仅覆写 `preflight_response`，预检被拒（400）时打一条 WARNING（每个来源仅一次，`_warned_unknown_origins` 去重）。

必要性：预检被拒后浏览器**不会发出真实请求**，服务端除 CORS 层外没有任何代码被执行 —— 此前 CORS 拒绝在日志里**零信号**，无法区分「后端没放行」与「后端没收到」。这是本次排查耗时的主因。

覆写若因上游改名而失效，只是日志不再输出，不影响 CORS 功能本身。

### 2.3 新增测试 `backend/tests/test_cors_middleware.py`

用 stdlib `unittest`（本机 venv 无 pytest，既有 `test_sqlite_recovery.py` 同为 unittest 风格）：

1. 预检正常态回显精确 Origin + ACAC；
2. **降级态预检仍返回 200**（缺陷直接复现）；
3. 降级态 503 带 CORS 头；
4. 白名单外来源不回显 ACAO，且服务端留 WARNING；
5. 兜底 500 带 CORS 头；
6. **顺序契约**：`user_middleware[0]` 必须是 `CORSMiddleware` 子类（防止有人再次把注册顺序改回去）。

---

## 三、修改原因

1. CORS 是浏览器侧约束，一旦响应缺头，浏览器**只报 CORS 失败、不暴露真实状态码**，必须保证「任何响应都带 CORS 头」，包括错误响应。
2. 预检是纯协议层握手，**不应依赖任何业务资源（数据库/缓存）**；把存储检查放在预检之前是设计错误。
3. CORS 拒绝在服务端零日志，属可观测性缺口，直接导致本次误判方向。

---

## 四、影响范围

| 模块 | 影响 |
|---|---|
| 全部跨源 API | 仅错误响应新增 CORS 头；正常响应不变 |
| 预检 OPTIONS | 不再触发 `init_auth_storage()`，少一次存储检查 |
| SSE / presence beacon | 预检在任何后端状态下均可用 |
| 同源访问 | 不受影响（无 Origin 头时行为不变） |
| 安全性 | 白名单语义不变：非登记来源仍不回显 ACAO，无通配回退 |

**不影响**：前端代码、数据库结构、配置 key、URL 参数、业务接口语义。

---

## 五、解决方案

### 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| A. 只把 OPTIONS 放行 | 改动最小 | 降级 503 仍丢 CORS 头，浏览器仍误报 | 不足 |
| B. 只调整中间件顺序 | 覆盖 503 | 预检仍依赖数据库（根因未除） | 不足 |
| C. 顺序 + OPTIONS 放行 + 500 补头（本方案） | 覆盖全部「CORS 层之外」的响应 | 需两处额外代码 | **采纳** |
| D. 给所有响应手工加 CORS 头 | 彻底 | 与 CORSMiddleware 重复加头 → 浏览器拒绝多值 ACAO | 否决 |

### 关键技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 让 CORS 最外层的方式 | 把注册语句后移 + 注释说明 `insert(0)` | 不改第三方实现；顺序契约由测试固定 |
| 503 是否手工补头 | 否，靠中间件顺序 | 手工补会与 CORS 层重复写 ACAO，触发「多个 ACAO 值」错误 |
| 500 是否手工补头 | 是，`_cors_headers_for` | `ServerErrorMiddleware` 恒最外层，CORS 永远够不到 |
| 告警实现位置 | `CORSMiddleware` 子类覆写 `preflight_response` | 唯一能观测到「预检被拒」的位置；失效即降级为无日志，无功能风险 |

---

## 六、性能指标

未实测。改动均为请求路径上的常量级判断（`method == "OPTIONS"`、`origin in list`）。预检少一次 `init_auth_storage()` 调用，属净减少。

---

## 七、测试方案

### Agent 已执行

| 检查 | 结果 |
|---|---|
| `python -m unittest tests.test_cors_middleware -v` | **6/6 通过** |
| `python -m unittest discover -s tests` | **31/31 通过**（含既有 25 项，无回归） |
| `python -m py_compile app.py` | 通过 |
| `python Scripts/CheckConfigRegistry.py` | 通过（无新增配置 key） |
| TestClient 手工探针（修复后） | 预检正常态 200+ACAO+ACAC；预检降级态 **200+ACAO+ACAC**；降级 POST **503+ACAO+ACAC**；兜底 500 **500+ACAO+ACAC**；非白名单来源 400 且无 ACAO |

> 未执行：HF Space 线上实测（需部署后验证）。

### 待用户线上验证

1. 部署后强制刷新 `https://webgis.negiao.cn`（预检带 `Access-Control-Max-Age: 600`，旧结果可能被复用最多 10 分钟），关闭标签页，控制台不应再出现该 CORS 报错。
2. 后端若仍处于降级态，浏览器应显示 **503**（而不是 CORS 报错），便于定位真实故障。
3. 检查后端日志：若出现 `CORS 拒绝了未登记来源 …`，说明该来源未在 `CORS_ALLOWED_ORIGINS` 中登记。

---

## 八、变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/app.py` | CORS 注册后移；OPTIONS 放行；`_cors_headers_for` + 500 补头；`LoggingCORSMiddleware` + `_warn_origin_unlisted` |
| `backend/tests/test_cors_middleware.py` | 新增，6 个回归用例 |
| `Docs/Guide/CHANGELOG.md` | V3.6.59 条目 |
| `README.md` | 版本号三处 |
| 本文件 | 执行日志 |

---

## 九、遗留与风险

| # | 风险 | 等级 | 缓解 |
|---|---:|---|---|
| 1 | 浏览器可能复用旧预检结果（max-age 600s） | 低 | 文档提示强制刷新 |
| 2 | `LoggingCORSMiddleware` 覆写的是 Starlette 半私有方法 `preflight_response` | 低 | 上游改名则覆写失效，仅丢日志，不影响 CORS 功能；升级 Starlette 后建议复查 |
| 3 | HF Space 边缘代理可能自行追加 `Access-Control-Allow-Origin` | 低 | 本修复保证应用层头正确；若代理覆盖属平台侧问题，可用响应头实测确认 |

### 顺带发现（未施工）

- 游客路径的 beacon 用 `Blob(type: 'application/json')` 触发预检。若改为 `text/plain;charset=UTF-8`（后端不读 body），可降为**简单请求、完全免预检**，进一步减少一条对 CORS 的依赖。因涉及前端请求语义变更，本次未动，留作可选优化。
- `deploy/.env` 的 `CORS_ALLOWED_ORIGINS` 已含 `https://webgis.negiao.cn`；若线上 HF Space 的环境变量与此不同，需同步（新告警日志可直接指出未登记来源）。

---

## 十、下一步建议

1. 部署后按第七节实机验证，重点确认「降级时浏览器显示 503 而非 CORS 报错」。
2. 把 `backend/tests/` 接入 CI（当前 venv 无 pytest，`test_realtime_stats.py` 亦无法本地运行；建议统一为 unittest 或把 pytest 加入 dev 依赖）。
3. 可选：游客 beacon 改简单请求，消除预检依赖。
