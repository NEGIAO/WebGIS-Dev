# 2026-07-26 用户中心偏好设置真实落地（preferences-implementation）

- **日期和时间**：2026-07-27 01:05
- **所属版本**：V3.4.33
- **变更类型**：前端功能实现（偏好消费链路打通）+ 1 处 UI 对比度修复

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | 用户反馈偏好设置"好多都没有实现"。排查确认：`default_basemap`（默认底图）、`unit_system`（单位制）、`preferred_agent_model`（偏好模型）三项在全站代码中只有 API 序列化层出现，**零消费方**——保存成功但对应用行为无任何影响；`language` 项无任何 i18n 基础设施 |
| 根本原因 | `useUserPreferencesStore` 建设完善（后端同步 + localStorage runtime 缓存 + main.js bootstrap），但各功能模块从未接入读取；属"存储层完工、消费层缺席" |
| 受影响的模块 | 2D 地图初始化（MapContainer）、测量工具（useDrawMeasure）、AI 对话模型选择（useChatAgentConfig）、偏好页文案（PreferencesTab）、新增 utils/units.js |
| 解决方案 | 逐项打通消费链路，消费方统一读取 store 写入的 runtime 缓存（同步、零 Pinia 依赖、不阻塞初始化）；语言项不做假实现，如实标注现状 |

---

## 修改内容

1. **默认底图（default_basemap）→ 生效**
   - `MapContainer.vue` 初始化底图优先级重排：URL `l=/layer=` 显式参数 > 用户偏好 > 管理员全局默认（`default_basemap_index`）> 硬编码默认。
   - 新增 `readPreferredBasemapId()`：同步读 `webgis_pref_default_basemap` runtime 缓存（store bootstrap 已写入），避免地图启动等待偏好接口。
   - 合法性校验：偏好 id 经 `getLayerIndexById` 验证，不在图源注册表中时自动回退管理员默认。
2. **单位制（unit_system）→ 生效**
   - 新建 `utils/units.js`（规范第 6 条独立封装）：`readPreferredUnitSystem()`（读 runtime 缓存，回退 metric）、`formatDistanceMeasure(meters)`（公制 >100m 转 km；英制 >=1mi 转 mi、否则 ft）、`formatAreaMeasure(sqMeters)`（公制 >10000m² 转 km²；英制 >=1acre 转 acre、否则 ft²）。
   - `useDrawMeasure.js` 的 `formatLength/formatArea` 接入工具函数；每次测量实时读偏好——**保存偏好后无需刷新，下一次测量即用新单位**。
3. **偏好 Agent 模型（preferred_agent_model）→ 生效**
   - `useChatAgentConfig.js` 引入 store 导出的轻量函数 `readCachedPreferredAgentModel()`（无 Pinia 依赖）。
   - 三条链路统一优先级为「账号偏好（在可用列表中时锁定优先）> 后端配置 > localStorage 上次选择 > 首个可聊模型」：① 个人 Key 模式 `reloadAgentConfig` 的模型挑选；② 后端代理模式 modelName 为空时的回退；③ `loadAvailableModels` 草稿模型补齐链（命中偏好即选定并同步本地缓存）。
4. **语言（language）→ 如实化**
   - 确认 store 的 `applyRuntimePreferences` 已实现 `document.documentElement.lang` 标记（bootstrap/保存时生效）。
   - 不做无 i18n 基础设施下的假实现；偏好页描述改为"当前界面以中文为主，该偏好用于页面语言标记与后续多语言支持"。
5. **偏好页描述纠偏**（PreferencesTab.vue，仅文案）
   - 底图："保存后下次进入（或刷新）自动应用；分享链接中的底图参数优先"。
   - 单位制："测量工具的距离/面积单位：公制（m/km）或英制（ft/mi/acre）"。
   - 模型："AI 助手将优先使用该模型（在可用列表中时生效）"。
6. **顺手修复（用户当轮反馈）**：账号中心头部全屏/刷新钮在品牌渐变横幅上几乎不可见（白 14% 半透明底 + 30% 白描边对比度不足）→ 改实底白（92%）+ 品牌色图标 + 投影 + hover 提亮，并清理被覆盖的旧 hover 规则。

## 修改原因

用户明确要求把未实现的偏好项实现好；期间追加反馈全屏按钮不可见。

## 影响范围

- 2D 地图首次进入的默认底图选择（URL 分享链接行为不变——显式参数仍最优先）
- 测量工具的距离/面积展示单位
- AI 对话面板的初始模型选择
- 不影响：3D Cesium 底图体系（独立映射，列为后续）、后端、偏好存储协议

## 优化解决方案（实施步骤）

1. 全站 grep 三个偏好字段消费方 → 确认零消费、定位三个接入点。
2. 消费方统一走 runtime 缓存同步读取（store bootstrap 在 main.js 已挂载），避免异步依赖与初始化时序问题。
3. 单位工具做成显式参数可覆盖的纯函数（`unitSystem` 形参默认读偏好），便于单测与后续 3D 侧复用。
4. 模型优先级语义对齐偏好页描述"锁定优先使用（若可用）"——偏好置于后端配置之前。

## 性能指标

- 全部为同步 localStorage 读取（微秒级），地图/对话初始化零额外网络请求；无运行时开销变化。

## 测试方案

- **静态验证（已执行，全部通过）**：`utils/units.js`、`useDrawMeasure.js`、`useChatAgentConfig.js` 语法检查；`MapContainer.vue`、`PreferencesTab.vue`、`FloatingAccountPanel.vue` compiler-sfc 编译；ESLint 全部改动文件零告警。
- **单元断言（已执行，8/8 通过）**：50m→"50.00 m"、1500m→"1.50 km"、100m(英制)→"328.1 ft"、3218.688m(英制)→"2.00 mi"、5000m²→"5000.00 m²"、2.5km²→"2.50 km²"、1000m²(英制)→"10763.9 ft²"、8093.71m²(英制)→"2.00 acre"。
- **手动验收清单（建议执行）**：① 偏好设默认底图为某图源 → 保存 → 无 `l=` 参数刷新页面应加载该底图；带 `l=` 分享链接仍按链接参数；② 偏好切英制 → 保存 → 测距/测面即时显示 ft/mi/acre，切回公制恢复 m/km；③ 偏好设某 Agent 模型 → 重开对话面板，当前模型应为该模型（前提在可用列表中）；④ 语言切换后 `document.documentElement.lang` 变化；⑤ 账号中心头部全屏/刷新钮清晰可见、hover 有反馈；⑥ 游客（无 token）路径：偏好回退默认值，不报错。
- 预期结果：三项偏好行为可感知生效，描述与实际行为一致。

## 补记（2026-07-27 01:35 续：3D 侧默认底图接入完成）

排查确认 2D/3D 底图共用同一 preset id 体系（`URL_LAYER_OPTIONS = BASEMAP_PRESETS.map(p => p.id)`，偏好页 BASEMAP_OPTIONS 的 value 即 preset id），无需 index 换算：

1. `useUserPreferencesStore.ts` 新增导出 `readCachedPreferredBasemap()`（同步读 runtime 缓存，与 `readCachedPreferredAgentModel` 对称）。
2. `MapContainer.vue` 删除私有 `readPreferredBasemapId` helper，改用 store 导出函数（经 `stores/index.ts` barrel）。
3. `CesiumContainer.vue` 启动链接入：`restoreBasemapFromUrl()` 未命中时——用户偏好（`URL_LAYER_OPTIONS.includes` 校验合法性）优先于管理员 `default_basemap_index`；偏好命中时跳过管理员默认接口调用，减少一次启动期请求。

验证：MapContainer/CesiumContainer compiler-sfc 编译通过、store TS transpile 无诊断、ESLint 三文件零告警。追加验收项：⑦ 偏好设默认底图后进入 3D 模式（无 `l=` 参数）应加载同一底图预设；带 `l=` 分享链接仍按链接参数。

## 后续迭代建议

- 完整 i18n 体系（vue-i18n + 文案抽取）后接通语言偏好。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\utils\units.js`（新增）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\map\features\useDrawMeasure.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Map\MapContainer.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\chat\useChatAgentConfig.js`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\tabs\PreferencesTab.vue`（仅文案）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue`（按钮对比度修复）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md`（utils/units.js 补录）
- `D:\Dev\GitHub\WebGIS-Dev\README.md`（版本升至 V3.4.33）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（新增 V3.4.33 条目）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-preferences-implementation.md`（本日志，新增）
