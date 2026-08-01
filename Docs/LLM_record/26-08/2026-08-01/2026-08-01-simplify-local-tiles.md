# 2026-08-01 自定义瓦片底图简化：移除 normBase 动态上下文注入

> 日期：2026-08-01 12:30  
> 任务等级：L2

---

## 问题分析

### 核心症状
`local_tiles`（自定义瓦片底图）使用了复杂的动态 URL 拼接机制：`sourceDescriptors.ts` 声明 `needsContext: ['normBase']`，`basemapConfig.ts` 的 `createSource` 通过 `({ normBase }) =>` 从上下文动态拼接 URL。这导致：
1. 整个图层工厂链路（resolver → config → swipe composable → token pool）都需要传递 `normBase` 参数
2. `local_tiles_preset` 被排除在卷帘分析之外（因为动态 URL 不支持）
3. `MapContainer.vue` 中冗余维护了 `BASE_URL` / `NORM_BASE` 常量

### 根本原因
该瓦片源实际上是托管在 Cloudflare 的静态 XYZ 服务（`https://tiles.negiao.cc.cd/tiles/{z}/{x}/{y}.png`），URL 是固定的，完全不需要运行时动态拼接。之前的实现过度工程化。

### 受影响模块
- 底图源描述层（sourceDescriptors.ts）
- 底图配置层（basemapConfig.ts）
- resolver 工厂（basemapResolver.ts）
- 卷帘分析（useBasemapSwipe.js、ControlsPanel.vue）
- 地图容器（MapContainer.vue）
- 运行时 token 池（useRuntimeMapTokenPool.js）
- 地图下载器（MapDownloader.vue）

### 方案对比

| 方案 | 优点 | 缺点 |
|---|---|---|
| A. 保留动态 normBase | 可运行时切换本地/远程 | 无实际使用场景，增加复杂度 |
| **B. 改为静态 URL（✅ 采用）** | 与其他图层一致，简化链路 | 无 |

---

## 修改内容

1. **sourceDescriptors.ts**：移除 Cloudflare 注释和 `needsContext: ['normBase']`；`needsContext` 联合类型移除 `'normBase'`
2. **basemapConfig.ts**：`local_tiles.createSource` 改为无参 `() =>`，直接使用静态 URL；`LayerFactoryContext` 类型移除 `normBase`
3. **basemapResolver.ts**：`createLayerConfigs()` 签名移除 `normBase` 参数，context 对象移除该字段
4. **ControlsPanel.vue**：移除 `local_tiles_preset` 的卷帘排除
5. **useBasemapSwipe.js**：移除 `NORM_BASE` 解构/JSDoc/context 传递
6. **MapContainer.vue**：删除 `BASE_URL`/`NORM_BASE` 常量，所有调用点清理
7. **useRuntimeMapTokenPool.js**：移除 `NORM_BASE` 解构和传参
8. **MapDownloader.vue**：`createLayerConfigs` 调用移除第一个 `'/'` 参数

## 修改原因
将过度工程化的动态 URL 机制还原为标准的静态 XYZ 源，与其他 60+ 个底图图层保持一致的实现模式。

## 影响范围
- 底图链路（图层工厂、resolver、卷帘、token 池）
- 无配置 key 变更，无文件增删

## 解决方案
逐层移除 `normBase`/`NORM_BASE` 引用，最终 `local_tiles` 成为标准静态 URL 图层。

## 性能指标
未实测（纯代码清理，无性能影响）

## 测试方案

### Agent 已执行
- `git diff --cached` 审查 8 个文件变更一致性
- `curl` 测试瓦片 URL 可达性（`0/0/0.png` 200, `1/1/0.png` 200）
- Grep 全局确认无 `normBase`/`NORM_BASE` 残留引用

### 待用户实机验证
- 前端 dev 启动后，底图选择器中「自定义瓦片」可正常显示
- 卷帘分析对话框中「本地瓦片」预设不再被排除
- 确认无控制台报错

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/ol/basemap/constants/sourceDescriptors.ts` | 移除 needsContext 和注释 |
| `frontend/src/domains/ol/basemap/constants/basemapConfig.ts` | createSource 简化 + 类型清理 |
| `frontend/src/domains/ol/basemap/constants/basemapResolver.ts` | 工厂签名简化 |
| `frontend/src/domains/ol/basemap/composables/useBasemapSwipe.js` | 移除 NORM_BASE 依赖 |
| `frontend/src/domains/ol/components/ControlsPanel.vue` | 卷帘排除逻辑简化 |
| `frontend/src/domains/ol/components/MapContainer.vue` | 删除常量 + 调用清理 |
| `frontend/src/domains/ol/components/MapDownloader.vue` | 调用参数对齐 |
| `frontend/src/domains/ol/composables/useRuntimeMapTokenPool.js` | 解构和传参清理 |

## 遗留与风险
- ⚠️ Cloudflare 瓦片服务器目前仅有 `0/0/0.png` 和 `1/1/0.png` 两张瓦片可用，其余返回 404。需上传完整瓦片集后底图才能全覆盖显示

## 下一步建议
将 `frontend/public/tiles/` 下的完整瓦片目录上传至 Cloudflare，或配置正确的瓦片服务地址
