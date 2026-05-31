# Code Review 第三轮 — Cesium / Layer / Search / 基础设施

- **日期和时间**：2026-05-28 22:00
- **修改内容**：修复 15 项问题（Cesium 3 项 + GeoWTFS 3 项 + 前端中优 4 项 + 基础设施 5 项）
- **修改原因**：第三轮全栈 code review 发现 Cesium 3D 旋转失效、标签样式逻辑错误、Blob URL 泄漏、Dockerfile 使用 EOL Python 等问题
- **影响范围**：Cesium 3D 组件、GeoWTFS 标签渲染、数据导入、图层注册、路由、Docker 构建
- **修改的文件路径**：见下方

## 修复清单

### Cesium（3 项）
| # | 文件 | 修复 |
|---|------|------|
| 1 | `CesiumContainer.vue:386` | 右拖旋转 handler 使用 movement 直接解引用，修复 NaN |
| 2 | `CesiumContainer.vue:341` | credit-override style 元素卸载时移除 |
| 3 | `CesiumContainer.vue:331` | creditCheckInterval 存储在组件变量而非 viewer 上 |

### GeoWTFS（3 项）
| # | 文件 | 修复 |
|---|------|------|
| 4 | `GeoWTFS.js:648` | fontStyle 条件 `\|\|` → `&&` |
| 5 | `GeoWTFS.js:356` | compareArray 添加双向检查 |
| 6 | `GeoWTFS.js:152` | decode fallback 添加外层 try-catch |

### 前端中优（4 项）
| # | 文件 | 修复 |
|---|------|------|
| 7 | `useLayerDataImport.js:484` | PNG blob URL 在 image onload 后 revoke |
| 8 | `useMapState.js:1069` | stopGraticule 添加 map.removeLayer |
| 9 | `LocationSearch.vue:238` | Enter 键直接触发搜索 |
| 10 | `useManagedLayerRegistry.js:48` | emitGraphicsOverview 改为发送 featureCount |

### 基础设施（5 项）
| # | 文件 | 修复 |
|---|------|------|
| 11 | `Dockerfile:2` | Python 3.9 → 3.12 |
| 12 | `Dockerfile:5` | uv:latest → uv:0.6 |
| 13 | `eslint.config.js` | 添加 vue/no-v-html + require-explicit-emits |
| 14 | `router/index.js:89` | 删除死代码 lastNavigationPath |
| 15 | `transitRouteBuilder.js:75` | markerCoordKey toFixed(2) → toFixed(4) |
