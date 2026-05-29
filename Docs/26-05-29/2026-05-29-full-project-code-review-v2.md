# 2026-05-29 全项目 Code Review 报告 (第二轮)

## 日期和时间
2026-05-29 20:30 ~ 22:00

## 审查范围
全栈审查：Composables、Stores、Components、Backend (FastAPI)

## 与第一轮的关系
第一轮审查（18:30~20:00）发现 34 项问题，修复 18 项。本轮为独立重新审查，发现 **69 项新问题**（不含第一轮已覆盖的问题）。

---

## 一、Backend 审查（31 项）


### 高优 (HIGH) — 9 项

### 中等 (MEDIUM) — 10 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| B13 | SQLite 并发写竞争 | `backend/api/auth.py:241` | 高并发下会出现 `database is locked` |
| B14 | agent_chat 每次调用重复建表 | `backend/api/agent_chat.py:426-446` | `CREATE TABLE IF NOT EXISTS` 在每次请求时执行 |
| B15 | 内存缓存非线程安全 | `backend/download_xyz/download.py:31-37` | `_download_tokens` 是普通 dict |
| B16 | IP 地理位置端点缺少认证 | `backend/api/external_proxy.py:556-581` | 未消耗配额 |
| B17 | 异常处理不一致 | `backend/app.py:119-126` | 部分返回泛化错误，部分泄露详情 |
| B18 | SQL 注入风险（f-string 拼接） | `backend/api/admin.py:87,112-114` | 虽有正则校验，但模式脆弱 |
| B19 | 游客密码硬编码 `"123"` | `backend/api/auth.py:33-34` | 结合开放代理更危险 |
| B20 | Token 通过 Query String 传递 | `backend/api/auth.py:852` | 会被日志、浏览器历史记录泄露 |
| B21 | HTTP Client 降级时未关闭连接 | `backend/api/location.py:123-128` | 泄漏连接 |
| B22 | track_visit 数据库连接未用上下文管理器 | `backend/api/location.py:457-518` | 错误处理模式脆弱 |

### 低优 (LOW) — 9 项

| # | 问题 | 文件 |
|---|------|------|
| B23 | 未使用的 `BackgroundTasks` 导入 | `backend/app.py:19` |
| B24 | `_normalize_avatar_index` 重复定义 | `auth.py:598` / `statistics.py:347` |
| B25 | `_extract_client_ip` 重复实现 5 次 | 多文件 |
| B26 | gcj_rectify 模块级 HTTP Client 未关闭 | `backend/gcj_rectify/fetch.py:5-7` |
| B27 | `print()` 代替 logger | `backend/api/proxy.py:159` |
| B28 | 空间分析无请求体大小限制 | `backend/api/spatial.py:557-623` |
| B29 | Supabase Key 变量命名歧义 | `backend/api/statistics.py:29-45` |
| B30 | 下载 Token 缓存无上限 | `backend/download_xyz/download.py:96-100` |
| B31 | visit_tracking 表与主 schema 重复 | `backend/api/location.py:463-476` |

---

## 二、Composables 审查（30 项）

### 严重 (CRITICAL) — 5 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| A1 | `onUnmounted` 在工厂函数内调用 | `useMapState.js:1082` | 使用 `useRoute()` 限制了只能在 setup 内调用，但模式脆弱 |
| A2 | `useMapSwipe` 无自动清理 | `useMapSwipe.ts:305-306` | 调用方必须手动 `dispose()`，否则 OL 事件监听泄漏 |
| A3 | `useMessage` 全局 DOM 元素永不移除 | `useMessage.js:134-146` | `#global-message-host` 永驻 DOM，HMR 时重复创建 |
| A4 | `useFluid` `applyForces()` 每帧调用两次 | `useFluid.js:224-225` | 复制粘贴 bug，力注入翻倍 |
| A5 | WMTS 服务类型错误路由到 XYZ | `useTileSourceFactory.ts:731-735` | 真正的 WMTS 服务会静默失败 |

### 高优 (HIGH) — 7 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| A6 | debounce 定时器清理职责不清 | `useMapState.js:186-188` | `stopLocationContextSync` 被调用两次 |
| A7 | `deep: true` 监听大数组 | `useMessageIslandMotion.js:244` | 每个消息对象的属性变化都触发回调 |
| A8 | Blob URL 错误路径未清理 | `useKmzLoader.js:169-237` | 无 `try/finally` |
| A9 | 模块级缓存导入永不释放 | `useLayerDataImport.js:50-51` | 每个实例缓存一份模块引用 |
| A10 | `failureStateMap` 无上限增长 | `useBasemapSelectionWatcher.js:200-209` | 仅在 `resetBasemapChain` 时清理 |
| A11 | `validateBaseLayerSwitch` 内 setTimeout 未清理 | `useBasemapResilience.js:68-79` | abort 后定时器仍会触发 |
| A12 | `PerformanceObserver` 未断开 | `useMapSwipeTest.ts:134-158` | 持续观察并积累内存 |

### 中等 (MEDIUM) — 10 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| A13 | `userLayerSeed` 计数器不回收 | `useManagedLayerRegistry.js:2` | 功能无害但不美观 |
| A14 | 经纬图层用 `let` 存储，非响应式 | `useMapState.js:179,183` | 模板无法响应式感知经纬图层状态 |
| A15 | `hue.slice()` 每帧全量复制 | `useFluid.js:237` | ~60KB/帧 GC 压力，应用双缓冲 |
| A16 | SVG filter 注入后永不移除 | `useSingularity.js:41-65` | `destroy()` 不移除 DOM 元素 |
| A17 | `ripples` 数组快速点击时无限增长 | `useDelaunay.js:238-244` | 每帧每三角形遍历所有 ripple |
| A18 | resize 后不重置粒子位置 | `useGravity.js:157-159` | 超出新视口的粒子不可见 |
| A19 | `ctx` 为 null 时动画停止且不重启 | `useWave.js:37-44` | canvas 挂载后无法恢复 |
| A20 | `stopGraticule` 不移除 centerPointLayer | `useMapState.js:1069-1079` | 隐藏但不移除 |
| A21 | `labelStyleCache` 无驱逐策略 | `useCreateManagedVectorLayer.js:94` | 对比 `useRouteStepStyles.js` 有 200 上限 |
| A22 | `postrender` 无限重试 | `useMapEventHandlers.js:90-103` | WebGL 渲染器下永不移除 |

### 低优 (LOW) — 8 项

| # | 问题 | 文件 |
|---|------|------|
| A23 | `useErrorHandler` 无资源管理问题 | `useErrorHandler.ts` |
| A24 | `scanResources` 的 `eager: true` 误导 | `useSharedResourceLoader.ts:189` |
| A25 | 错误路径 blob URL 延迟清理 | `useGisLoader.ts:225-233` |
| A26 | GPS 权限对话框无超时处理 | `useUserLocation.js:381-396` |
| A27 | `tiandituTk` 参数未使用 | `usePositionCodeTool.js:36-38` |
| A28 | `verifyPromptedPoiIds` Set 无上限 | `useMapSearchAndCoordinateInput.js:108` |
| A29 | `labelStyleCache` 在 `buildManagedLayerStyle` 中无上限 | `useManagedLayerStyle.js:151` |
| A30 | `handleMouseMove` 覆盖外部 `active` 控制 | `useSingularity.js:238` |

---

## 三、Stores 审查（12 项）

### 严重 (CRITICAL) — 1 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| S1 | `onUnmounted` 守卫对 Pinia Store 永远为 false | `useDownloadStore.ts:190-194` | `getCurrentInstance()` 在 Store setup 中返回 null，`setInterval` 永不清理 |

### 高优 (HIGH) — 2 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| S2 | `ensureValidSession` 无并发保护 | `useAuthStore.ts:53-80` | 快速连续导航导致重复 API 调用和状态覆盖 |
| S3 | computed 内 `JSON.parse(JSON.stringify())` | `useCompassStore.ts:205-234` | `hudRenderConfig` 双重深拷贝，传感器旋转时性能差 |

### 中等 (MEDIUM) — 4 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| S4 | 直接修改嵌套响应式对象 | `useAttrStore.ts:375-376` | 绕过引用级 watcher |
| S5 | `loadPreferences` 并发竞争 | `useUserPreferencesStore.ts:129-168` | 第二个响应覆盖第一个 |
| S6 | 防抖定时器无清理路径 | `useSwipeConfigStore.ts:79-84` | HMR 时定时器仍触发 |
| S7 | `layerTree` computed 每次依赖变化都执行 | `useLayerStore.ts:103-129` | 8 个依赖中任一变化都触发序列构建 |

### 低优 (LOW) — 5 项

| # | 问题 | 文件 |
|---|------|------|
| S8 | `setLogMonitorVisible` 死代码 | `useAppStore.ts:53-55` |
| S9 | `districtNodeToLayerMeta` 死代码 | `useTOCStore.ts:295-313` |
| S10 | `setTheme` 缺少类型注解 | `useThemeStore.ts:32` |
| S11 | `useSwipeConfigStore` 未从 barrel 导出 | `stores/index.ts` |
| S12 | layer/ 子模块 14+ 函数仅内部使用 | `stores/layer/index.ts` |

---

## 四、Components 审查（26 项）

### 严重 (CRITICAL) — 3 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| D1 | 硬编码 API Key 在前端源码中 | `ChatPanelContent.vue:311` | `tp-cs24lphikpjnqg0kkctxl167xhnkv4writnf46j3cv4y0nsw` 明文暴露 |
| D2 | `onMounted` 返回清理函数（React 模式，Vue 中无效） | `MapControlsBar.vue:504-519` | 事件监听永不移除 |
| D3 | `window.addEventListener('resize')` 在模块级注册 | `MapContainer.vue:1000-1002` | HMR 时重复注册 |

### 高优 (HIGH) — 5 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| D4 | `setTimeout` 未在卸载时清理 | `SpatialAnalysisPanel.vue:544` | 组件销毁后更新 ref |
| D5 | EventSource 无重连/退避逻辑 | `LogMonitor.vue:275` | 快速切换可创建多个实例 |
| D6 | 顶层 `await` 使组件变为异步 | `MapContainer.vue:202` | 无 `<Suspense>` 边界，加载失败无回退 |
| D7 | 异步操作未检查组件是否已卸载 | `ChatPanelContent.vue:1101-1106` | 导航离开后仍更新 ref |
| D8 | 5 个几乎相同的 computed 属性 | `PalaceExplanationPanel.vue:178-221` | 应合并为 1 个 |

### 中等 (MEDIUM) — 10 项

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| D9 | `compassStore.unabaled` 疑似拼写错误 | `CompassControlPanel.vue:20` | 应为 `unavailable` 或 `enabled` |
| D10 | `pointerdown` 中 `querySelectorAll` 每次点击执行 | `LayerPanel.vue:150-156` | 应使用 ref |
| D11 | 同上 | `LayerControlPanel.vue:712-714` | 同上 |
| D12 | 500ms 轮询清除 Cesium credit | `CesiumContainer.vue:338-345` | 应用 MutationObserver |
| D13 | 访问 Cesium 私有 `_gl` 属性 | `Wind2D.js:97` | 版本升级会破坏 |
| D14 | `v-for` 使用 index 作为 key | `ChatPanelContent.vue:206` | 消息裁剪后导致错误复用 |
| D15 | 非 scoped `:root` CSS 变量 | `AttributeTable.vue:710-732` | 污染全局主题 |
| D16 | `TOCTreeItem` 无自关闭机制 | `TOCTreeItem.vue:347-354` | 依赖父组件调用 |
| D17 | 新闻轮询无错误退避 | `SidePanel.vue:448-467` | 每 10 分钟持续报错 |
| D18 | `props.node` 变化重置展开状态 | `SharedResourceTreeItem.vue:92-103` | 新引用导致意外折叠 |

### 低优 (LOW) — 8 项

| # | 问题 | 文件 |
|---|------|------|
| D19 | `computed` 导入但仅用于静态数据 | `DrawPanel.vue`, `MeasurePanel.vue` |
| D20 | `shift()` O(n) 操作 | `CesiumAdvancedEffects.vue:738` |
| D21 | 下载 DOM 元素错误路径未清理 | `MapDownloader.vue:437-459` |
| D22 | 下拉菜单缺少 ARIA 属性 | `TopBar.vue:38-129` |
| D23 | 键盘可访问性不完整 | `MapSwipeController.vue:206-236` |
| D24 | `v-html` 潜在 XSS | `Message.vue:40` |
| D25 | 全局 `<style>` 元素注入 | `CesiumContainer.vue:347-358` |
| D26 | echarts 实例未 dispose | `WeatherChartPanel.vue` |

---

## 五、汇总

| 层级 | 严重 | 高优 | 中等 | 低优 | 合计 |
|------|------|------|------|------|------|
| Backend | 3 | 9 | 10 | 9 | **31** |
| Composables | 5 | 7 | 10 | 8 | **30** |
| Stores | 1 | 2 | 4 | 5 | **12** |
| Components | 3 | 5 | 10 | 8 | **26** |
| **合计** | **12** | **23** | **34** | **30** | **99** |

### 与第一轮对比

| 指标 | 第一轮 | 第二轮 |
|------|--------|--------|
| 审查范围 | Composables + Stores + Components | 全栈（含 Backend） |
| 发现问题 | 34 | 99 |
| 已修复 | 18 | 待定 |

---

## 六、优先修复建议（Top 10）

### P0 — 立即修复（安全漏洞）

1. **B1** 移除硬编码管理员密码，强制通过环境变量设置
2. **B2** 为 `/proxy/*` 端点添加认证 + SSRF 防护（内网 IP 黑名单 + 域名白名单）
3. **B3** CORS 收紧为具体域名列表
4. **D1** 从前端代码中移除硬编码 API Key，改为后端代理或环境变量注入

### P1 — 尽快修复（功能性 bug）

5. **A4** `useFluid.js:224-225` 删除重复的 `applyForces()` 调用
6. **A5** `useTileSourceFactory.ts:731-735` 为 WMTS 创建正确的 source
7. **S1** `useDownloadStore.ts` 改用 `$onAction` 或 `tryOnScopeDispose` 清理定时器
8. **D2** `MapControlsBar.vue` 将清理逻辑移至 `onBeforeUnmount`

### P2 — 计划修复（稳定性）

9. **B6** 登录端点添加速率限制（slowapi）
10. **S2** `ensureValidSession` 添加 Promise 去重

---

## 七、修改的文件清单（本轮新增发现，不含第一轮已修复文件）

### Backend（需修改）
- `backend/api/auth.py` — B1, B4, B6, B13, B19, B20
- `backend/api/proxy.py` — B2, B7, B8, B9, B27
- `backend/app.py` — B3, B5, B17, B23
- `backend/api/monitor.py` — B10
- `backend/api/spatial.py` — B12, B28
- `backend/download_xyz/download.py` — B11, B15, B30
- `backend/api/agent_chat.py` — B14
- `backend/api/external_proxy.py` — B16
- `backend/api/admin.py` — B18
- `backend/api/location.py` — B21, B22, B31
- `backend/api/statistics.py` — B24, B25, B29
- `backend/gcj_rectify/fetch.py` — B26

### Frontend Composables（需修改）
- `frontend/src/composables/Magic/useFluid.js` — A4, A15
- `frontend/src/composables/useTileSourceFactory.ts` — A5
- `frontend/src/composables/useMessage.js` — A3
- `frontend/src/composables/Magic/useSingularity.js` — A16, A30
- `frontend/src/composables/map/features/useCreateManagedVectorLayer.js` — A21
- `frontend/src/composables/map/features/useMapEventHandlers.js` — A22

### Frontend Stores（需修改）
- `frontend/src/stores/useDownloadStore.ts` — S1
- `frontend/src/stores/useAuthStore.ts` — S2
- `frontend/src/stores/useCompassStore.ts` — S3

### Frontend Components（需修改）
- `frontend/src/components/Chat/ChatPanelContent.vue` — D1, D7, D14
- `frontend/src/components/Map/MapControlsBar.vue` — D2
- `frontend/src/components/Map/MapContainer.vue` — D3, D6

---

*审查完成时间: 2026-05-29 22:00*
