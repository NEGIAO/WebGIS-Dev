# 2026-06-10 瓦片请求生命周期 Abort 与资源释放修复

**日期和时间**：2026-06-10 09:49

---

## 修改内容

1. 修复 `tileLifecycle.ts` 中 `AbortController` 被闭包固定引用，导致首次 abort 后同一 source 后续瓦片无法继续加载的问题。
2. 修复 `abortEpoch` 只递增 source、不写入 tile，导致新瓦片被误判为过期的问题。
3. 将瓦片超时从“只标记 ERROR”改为真正中断单个瓦片 fetch 请求，释放浏览器网络并发槽位。
4. 补齐 blob URL 在 `load`、`error`、abort 和过期结果路径下的释放逻辑，降低长时间地图浏览的内存增长风险。
5. 增加 `prioritizeTileSourceRequest()` 幂等保护，避免重复包装同一个 source。

---

## 修改原因

### 核心症状

快速切换底图或重复加载自定义图源时，旧瓦片请求需要被立即取消，新图源瓦片需要继续正常加载；长时间平移缩放地图时，blob URL 不应持续堆积。

### 根本原因

`tileLoadFunction` 创建时捕获了初始 `AbortController`，`abortTileSourceRequests()` 虽然替换了 source 上的 controller，但后续瓦片仍读取闭包里的旧 signal。`abortEpoch` 递增后，新 tile 没有写入当前 epoch，默认值 `0` 会小于 source 最新 epoch。超时逻辑只设置 tile 错误状态，没有调用 abort，无法释放底层 fetch 请求。

### 受影响模块

- 前端瓦片源工厂：`frontend/src/composables/tileSource/tileLifecycle.ts`
- 底图切换与自定义图源加载：依赖 `abortTileSourceRequests()` 停止旧 source 请求
- 第三方瓦片代理兜底：继续保留直连优先、CORS/网络错误 fallback 到 `/proxy/{URL}` 的策略

---

## 优化解决方案

1. 每次瓦片加载时动态读取 source 当前 `abortController`，并在缺失或已 abort 时补齐新 controller。
2. 在请求开始时把当前 `abortEpoch` 写入 tile，异步回调完成后再对比 source 最新 epoch，确保只丢弃真正过期的结果。
3. 为每个 tile 创建独立 timeout controller，将 source signal 与 timeout signal 组合为请求 signal，超时后主动 abort 单个 fetch。
4. 统一封装 blob URL 释放逻辑，确保图片加载成功、加载失败、请求 abort、epoch 过期时都能安全释放。
5. 使用 source 属性标记已经包装过的 tile lifecycle，重复调用时只确保 controller 存在，不再叠加 `setTileLoadFunction`。

---

## 性能指标

- 超时请求：从继续 pending 直到浏览器/网络层超时，改为 `TILE_REQUEST_TIMEOUT_MS` 到期后立即 abort。
- 并发槽位：底图切换后旧 source 的 fetch 请求可通过 source controller 立即释放。
- 内存：blob URL 在图片事件结束或请求废弃路径释放，避免瓦片浏览过程持续堆积。

---

## 测试方案

1. 运行 `./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json`，确认 TypeScript 检查通过。
2. 运行 `npm run build`，确认 Vite 生产构建通过。
3. 浏览器手测快速切换多个底图，确认旧请求取消后新底图仍能继续加载。
4. 重复加载 custom 图源，确认首次 abort 后不会出现所有新瓦片立即 ERROR。
5. 使用 CORS 失败图源，确认仍会 fallback 到 `/proxy/{URL}`。
6. DevTools Network/Memory 验证超时请求取消、blob URL 不持续堆积。

---

## 修改的文件路径

| 操作 | 文件绝对路径 |
|------|-------------|
| 修改 | `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\tileSource\tileLifecycle.ts` |
| 修改 | `d:\Dev\GitHub\WebGIS_Dev\README.md` |
| 修改 | `d:\Dev\GitHub\WebGIS_Dev\frontend\README.md` |
| 修改 | `d:\Dev\GitHub\WebGIS_Dev\backend\README.md` |
| 新增 | `d:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-10\2026-06-10-tile-lifecycle-abort-fix.md` |
