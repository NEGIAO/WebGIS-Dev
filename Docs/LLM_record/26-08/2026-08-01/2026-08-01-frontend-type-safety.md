# 前端类型安全（as any 清理）

- **日期与时间**：2026-08-01 18:00
- **任务等级**：L2
- **问题分析**：
  - 核心症状：多个 TS 文件使用 `as any` 绕过类型检查，侵蚀类型安全
  - 根本原因：OpenLayers/JSZip/浏览器 API 类型定义不完整或未声明接口
  - 受影响模块：罗盘服务、数据导入、瓦片源、路由解析、错误处理、用户偏好/认证 store

- **修改内容**：
  1. **CompassManager.ts**：`viewResolutionKey` 类型从 `unknown` 改为 `EventsKey`（正确导入 `ol/events`）；定义 `VectorLayerWithTogetherStyle` 接口替代 `(layer as any).togetherStyle`
  2. **useCompassStore.ts**：`rawConfig?.tianxinCrossLengthRatio` 直接访问（已在 FengShuiCompassConfig 类型中）；`DeviceOrientationEvent.requestPermission` 使用显式 `as unknown as { requestPermission?: ... }` 转换
  3. **layerTreeBuilder.ts**：移除 `toLayerNode` 返回值上的冗余 `as any`（函数已返回 `any`）
  4. **decompressor.ts**：定义 `JsZipEntry` 接口（name/dir/async）；`isBlobLike` 返回类型从 `input is any` 改为 `input is Blob`；`flattenFile` 参数类型从 `any` 改为 `Blob & { webkitRelativePath?: string; name?: string }`；`flattenResources` 参数类型从 `any[]` 改为 `Array<Blob | FileSystemEntry | null | undefined>`
  5. **tileLifecycle.ts**：定义 `TileSourceWithInternals` 接口（set/get/getTileLoadFunction/setTileLoadFunction）替代 `as any`
  6. **driveXmlParser.ts**：全局声明 `TiandituMapApi` 接口 + `Window.T` 类型扩充；移除 `(globalThis as any).T`
  7. **useErrorHandler.ts**：定义 `QuotaError extends Error` 接口替代 `(error as any).isQuotaExceeded`
  8. **useUserPreferencesStore.ts / useAuthStore.ts**：`(result as any).data` 改为 `(result as { data: unknown }).data`

- **影响范围**：类型安全（无运行时行为变更）

- **测试方案**：
  - **Agent 已执行**：代码审查确认类型正确
  - **待用户实机验证**：构建通过（tsc --noEmit）

- **变更文件清单**：
  - `frontend/src/domains/common/compass/services/CompassManager.ts` — EventsKey 类型 + VectorLayerWithTogetherStyle 接口
  - `frontend/src/domains/common/compass/stores/useCompassStore.ts` — 标准类型访问 + DeviceOrientationEvent 显式转换
  - `frontend/src/domains/ol/stores/layer/layerTreeBuilder.ts` — 移除冗余 as any
  - `frontend/src/domains/common/data-import/decompressor.ts` — JsZipEntry 接口 + Blob 类型守卫
  - `frontend/src/domains/ol/tile-source/tileLifecycle.ts` — TileSourceWithInternals 接口
  - `frontend/src/domains/ol/routing/utils/driveXmlParser.ts` — 全局 TiandituMapApi 声明
  - `frontend/src/domains/common/utils/useErrorHandler.ts` — QuotaError 接口
  - `frontend/src/domains/common/user/stores/useUserPreferencesStore.ts` — `{data: unknown}` 类型
  - `frontend/src/domains/common/user/stores/useAuthStore.ts` — `{data: unknown}` 类型

- **遗留与风险**：无运行时变更，纯类型层面优化
