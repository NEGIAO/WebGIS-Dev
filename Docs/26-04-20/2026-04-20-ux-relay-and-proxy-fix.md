# 2026-04-20 UX Loading Relay 与通用代理修复

## 日期和时间
2026-04-20 12:24

## 修改内容
1. 前端路由守卫接力改造：
   - `router.beforeEach` 在鉴权通过且目标为 `home` 时切换提示为 `Loading Map Engine & Assets...`。
   - 对 `home` 导航启用 loading 接力标记，避免在 `finally` 中过早 `hideLoading()`。
2. 前端地图加载收口改造：
   - `HomeView.vue` 新增统一收口函数 `settleMapCoreLoading`，仅在地图核心就绪或失败时结束全局 loading。
   - 新增 `@map-core-failed` 事件处理，网络异常/初始化异常时给出错误提示并及时结束 loading，避免页面“假死”。
3. Map 初始化韧性增强：
   - `MapContainer.vue` 的 `onMounted` 主流程增加 `try-catch`。
   - 初始化失败时触发 `map-core-failed` 事件并反馈错误信息。
4. 后端新增通用流式代理：
   - 在 `backend/app.py` 增加 `GET /proxy/{target_url:path}`。
   - 自动补全 `https://`（当 target 不含协议时）。
   - 使用 `httpx` 流式转发并返回 `StreamingResponse`，减少内存占用。
   - 请求侧加入浏览器模拟头（User-Agent 等）以提升上游兼容性。
   - 响应中注入 `X-Proxy-Status`（`SUCCESS` / `TIMEOUT` / `UPSTREAM_ERROR`）便于前端调试。
5. 文档同步：更新 root/frontend/backend 的 README 树注释。

## 修改原因
1. 修复“鉴权很快结束但 Home 重资源仍在加载”造成的白屏空窗期。
2. 建立 loading 状态接力链路：路由守卫负责开启与保留，地图核心负责最终关闭。
3. 为国内网络环境提供统一、可复用、无供应商绑定的中继能力，解决多源瓦片不可达问题。

## 新的加载接力时序
1. 用户进入 `home`（或登录后重定向 `home`）。
2. `router.beforeEach` 完成鉴权后将 loading 文案切换为 `Loading Map Engine & Assets...`，并保留遮罩。
3. `HomeView` / `MapContainer` 继续加载地图核心与重资源（OpenLayers、GeoTIFF 等）。
4. 地图核心就绪时触发 `map-core-ready`，`HomeView` 调用 `hideLoading()` 完成交接。
5. 若初始化失败触发 `map-core-failed`，`HomeView` 提示错误并兜底 `hideLoading()`。

## 通用代理调用示例
### ArcGIS 示例
```text
/proxy/services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/52/103
```

### Google Maps 示例
```text
/proxy/mt0.google.com/vt?lyrs=s&x=103&y=52&z=6
```

## 影响范围
1. 鉴权路由与首屏加载体验（`home` 路径）。
2. 地图核心初始化异常处理与可观测性。
3. 后端对外中继能力（新增通用流式代理端点）。
4. 项目文档结构树准确性。

## 修改的文件路径（绝对路径）
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\backend\app.py
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-04-20\2026-04-20-ux-relay-and-proxy-fix.md
