# 瓦片代理消息通知增强

**日期和时间**：2026-06-10 15:30

**修改内容**：
- 瓦片代理触发时通过全局 Message 组件弹出 toast 通知
- fallback 模式：直连失败 → 代理兜底时提示"部分瓦片直连失败，已自动切换至后端代理加速加载"
- always 模式：首次请求时提示"已启用后端代理模式，所有瓦片请求将通过后端转发"
- 5s 防抖去重，快速切换底图时只弹一次，不打断用户操作

**修改原因**：
- 原有代理机制对用户完全透明，用户无法感知瓦片是否走了后端代理
- 需要在代理触发时给用户可见的反馈，同时不能干扰已有的 fetch + AbortController 快速切换逻辑

**影响范围**：
- 瓦片加载模块（tileSource/tileLifecycle.ts）
- 不影响瓦片切换的 abort/epoch 机制
- 不影响 xyzSource / wmsSource / wmtsSource 的源创建逻辑（它们已通过 prioritizeTileSourceRequest 自动接入）

**优化解决方案**：
- 事件逻辑链分析：
  1. 核心症状：代理触发时无用户反馈，用户不知道瓦片是否走了后端
  2. 根因：tileLifecycle.ts 纯逻辑模块，未集成 UI 通知
  3. 受影响模块：tileLifecycle.ts 的 fetchTileAsBlobUrl 函数
  4. 解决方案：在 fetchTileAsBlobUrl 的两个代理分支（always / fallback）中注入 useMessage 通知

- 实施方案：
  1. 导入 `useMessage` composable
  2. 新增 `notifyProxyFallback()` 和 `notifyAlwaysProxy()` 两个通知函数
  3. 使用模块级时间戳 `lastProxyNotifyAt` 实现 5s 防抖
  4. try/catch 保护：非 Vue 上下文（SSR/测试）静默失败
  5. 通知在 fetch 之前触发，但 useMessage().info() 是同步入队（非阻塞），不影响 fetch 执行
  6. AbortController / epoch 机制完全不动，快速切换逻辑零影响

**性能指标**：
- 通知为同步入队操作（~0.01ms），不影响瓦片加载性能
- 5s 防抖避免快速切换时 toast 洪水

**测试方案**：
1. `npm run build` — 确认无编译错误
2. 设置 `VITE_TILE_PROXY_MODE=fallback`，加载 CORS 被拒的图源（如 maps-for-free.com），确认：
   - 控制台看到代理请求
   - 弹出"已自动切换至后端代理"toast
   - 快速连续切换底图，toast 只弹一次（5s 内去重）
3. 设置 `VITE_TILE_PROXY_MODE=always`，加载任意图源，确认弹出"已启用后端代理模式"toast
4. 设置 `VITE_TILE_PROXY_MODE=off`，确认无 toast、无代理请求

**修改的文件路径**：
- `frontend/src/composables/tileSource/tileLifecycle.ts` — 新增通知函数 + fetchTileAsBlobUrl 接入通知
- `README.md` — 更新 tileLifecycle.ts 描述 + 版本记录补充通知功能
- `frontend/README.md` — 更新 tileLifecycle.ts 描述
- `backend/README.md` — 补充代理通知功能说明
