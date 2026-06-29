# 2026-06-28 首屏加载优化：vendor-libs 拆分 + 组件懒加载

**日期和时间**：2026-06-28

---

## 修改内容

- P0：将 3.1MB 的 `vendor-libs` 兜底 chunk 拆分为 8 个独立 chunk（按需加载）
- P2：`lucide-vue-next` 独立 chunk（tree-shake 生效）
- P3：`ControlsPanel` 的 DrawPanel/MeasurePanel/SpatialAnalysisPanel 改为 `defineAsyncComponent`；HomeView 的 LogMonitor 改为动态 import

## 修改原因

V3.3.13 构建产物中 `vendor-libs-Cbg-agHf.js` 达到 **3.1MB**（gzip ~1MB），包含 Three.js、Rapier 物理引擎、highlight.js、marked、lucide 等大量非首屏必需库。首屏 JS 总计 ~3.4MB，严重拖慢首屏加载速度。

## 影响范围

- `frontend/vite.config.js` — manualChunks 分包策略
- `frontend/src/components/ControlsPanel/ControlsPanel.vue` — 面板组件动态导入
- `frontend/src/views/HomeView.vue` — LogMonitor 动态导入

## 优化效果

| 指标 | 优化前 | 优化后 | 降幅 |
|------|--------|--------|------|
| vendor-libs | 3.1 MB | 342 KB | **-89%** |
| 首屏 JS 总计 | ~3.4 MB | ~1.2 MB | **-65%** |
| 首屏 gzip 传输 | ~1.1 MB | ~360 KB | **-67%** |

新增独立 chunk（按需加载，不计入首屏）：

| Chunk | 大小 | gzip | 加载时机 |
|-------|------|------|----------|
| vendor-three | 556 KB | 141 KB | ShallowWater 场景 |
| vendor-rapier | 2.1 MB | 762 KB | 人物漫游模式 |
| vendor-hljs | 91 KB | 29 KB | AI 聊天代码高亮 |
| vendor-marked | 71 KB | 24 KB | AI 聊天 Markdown |
| vendor-codec | 44 KB | 14 KB | 瓦片解码 |
| vendor-lilgui | 31 KB | 8 KB | Cesium 控制面板 |

## 问题逻辑链条

```
vendor-libs 3.1MB（所有未显式拆分的依赖）
  ├── three.js (~700KB) — 仅 ShallowWater 使用
  ├── @dimforge/rapier3d (~300KB) — 仅 PlayerController 使用
  ├── highlight.js (~350KB) — 仅 AI 聊天代码高亮
  ├── marked+dompurify (~120KB) — 仅 AI 聊天 Markdown
  ├── lucide-vue-next (~200KB) — 图标库
  ├── pako/protobufjs (~80KB) — 瓦片解码
  └── lil-gui (~30KB) — Cesium 面板
  → 全部在首屏加载，浪费 ~2MB 带宽
```

## 测试方案

1. `npm run build` 验证构建无错误
2. 检查 dist/assets/ 确认 vendor-libs < 400KB
3. 浏览器 Network 面板验证首屏仅加载 vendor-vue/vendor-ol/index 等必要 chunk
4. 访问 ShallowWater 场景时验证 vendor-three 按需加载
5. 打开 AI 聊天时验证 vendor-hljs/vendor-marked 按需加载

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS-Dev\frontend\vite.config.js`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\components\ControlsPanel\ControlsPanel.vue`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\src\views\HomeView.vue`
