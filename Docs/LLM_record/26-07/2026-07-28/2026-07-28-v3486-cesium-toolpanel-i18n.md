# V3.4.86 — CesiumToolPanel + 模块配置全量中英文 i18n

> 日期：2026-07-28  
> 任务等级：L2  
> 版本号：V3.4.86  
> 范围：`CesiumToolPanel.vue` 面板 UI + toolModules 配置文案（title/label/tooltip/status）

---

## 问题分析

### 核心症状
- 英文 UI 下 3D 高级控制台壳层与模块卡片（场景/大气/体积云/风场/流体/浅水/漫游/分析）仍为中文硬编码

### 根本原因
- `locales` 仅有精简 `cesium.*` 壳层键，组件未接线；各 `*Module.js` 工厂在 `toolModules` computed 内返回中文字面量

### 受影响模块
- `frontend/src/locales/zh-CN.js` / `en-US.js`（`cesium` 大块扩展）
- `CesiumToolPanel.vue`
- `composables/toolModules/*`、`cesium-wind-layer/windModule.js`、`Analysis/analysisModule.js`
- `useCesiumToolModules.js`（语言依赖）

---

## 修改内容

1. **`cesium.*` 扩展**：壳层 UI、`status.*`、`materials.*`、`module.{scene,atmosphere,cloud,tools,wind,fluid,shallowWater,player,analysis}.*`（zh/en 叶节点 349/349 对齐）
2. **`CesiumToolPanel.vue`**：`useLocale` + 模板/tabs/材质选项/空态全量 `t('cesium.*')`
3. **模块工厂**：`import { translate as t }`，title/description/actions/controls/status 走键
4. **`useCesiumToolModules`**：`void language.value` 使语言切换重建模块文案
5. **云质量**：`quality` select 选项 label 映射 `qualitySmooth/Balanced/Ultra`；status 同

---

## 修改原因

用户明确主任务为控制面板 UI 与内部配置信息中英文；与 Weather/TOC 等既有 `translate` 模式一致。

---

## 影响范围

- 3D 工具面板可见文案与模块配置
- 无配置 key / 结构树文件增删；无 Git 写操作
- 未纳入：`CesiumContainer` toast、`PlayerGuide`、`NavTargetPicker`、`FluidSimulationPanel` 非 headless 等（可后续）

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅面板壳层 | 模块配置仍中文 | 否 |
| B. 面板 + 工厂 t() + language 依赖 | 与 weather API 一致 | ✓ |
| C. 全 Cesium 生态 toast/HUD | 范围过大 | 未选 |

---

## 性能指标

未实测（字符串替换 + computed 多读 language）

---

## 测试方案

### Agent 已执行
- [x] 面板 template 无剩余用户可见 CJK 硬编码
- [x] 模块工厂 UI 字符串已 `t()`（注释除外）
- [x] zh/en `cesium` 叶 349/349 对齐
- [x] `node --check` 相关 JS / locales
- [x] CheckStructureTree / CheckConfigRegistry

### 待用户实机
- [ ] 英文：打开 3D 高级控制台 → 四 Tab / 底图·数据·材质英文
- [ ] 英文：展开各模块 → 标题/状态/滑杆 label·tooltip 英文
- [ ] 切换语言后模块卡片文案即时刷新
- [ ] 中文路径无回归

---

## 变更文件清单

- `frontend/src/locales/zh-CN.js`
- `frontend/src/locales/en-US.js`
- `frontend/src/components/Cesium/CesiumToolPanel.vue`
- `frontend/src/components/Cesium/composables/toolModules/sceneModule.js`
- `frontend/src/components/Cesium/composables/toolModules/atmosphereModule.js`
- `frontend/src/components/Cesium/composables/toolModules/cloudModule.js`
- `frontend/src/components/Cesium/composables/toolModules/toolsModule.js`
- `frontend/src/components/Cesium/composables/toolModules/fluidModule.js`
- `frontend/src/components/Cesium/composables/toolModules/shallowWaterModule.js`
- `frontend/src/components/Cesium/composables/toolModules/playerModule.js`
- `frontend/src/components/Cesium/composables/toolModules/useCesiumToolModules.js`
- `frontend/src/components/Cesium/cesium-wind-layer/windModule.js`
- `frontend/src/components/Cesium/Analysis/analysisModule.js`
- `README.md` / `Docs/Guide/CHANGELOG.md` / 本日志

---

## 下一步建议

- CesiumContainer 拖放/坐标 toast、PlayerGuide、NavTargetPicker、Fluid 面板可见文案
- `cloudQualityPresets` 内置 `label` 字段可仅作 fallback（当前由 cloudModule 映射覆盖 select）
