# 2026-08-26 — V3.5.31 暂存区整合 Code Review 与修复

- **日期与时间**：2026-08-26 11:40
- **任务等级**：L2

## 问题分析

- **核心症状**：暂存区为多次不规范 commit 的堆叠（内部曾自行编号 V3.5.31~V3.5.34，README 版本演进表出现 5 行且 V3.5.33 重复两次），需按用户指令整合为单一版本 **V3.5.31**；同时对全部暂存代码做规范审查并修复潜在 bug。
- **根本原因**：多会话并行推进统一图层管理 P0~P2 与 viewScale 重构两条线，各自升版但未及时提交，版本号治理失控；部分跨模块接线（HomeView ↔ CesiumContainer 暴露方法、compat 层旧签名）存在单元级错配。
- **受影响模块**：`app/HomeView.vue`（2D↔3D 视图尺度同步）、`common/utils/viewScale/*`、`chat/agent/mapCommandAdapters.js` 调用链（未改动调用方，修 compat 层）。

## 审查结论（事件逻辑链条）

通读全部暂存 diff（约 6100 行新增 / 1950 行删除），交叉验证要点：

1. `readQueryValue("z")` 在 HomeView 有本地定义（L131），非未定义引用 ✅
2. `camera.pitch` 来自 useCesiumUrlTracking 已 `toDegrees`（度），与 cesiumScale 的度语义一致 ✅
3. `folder-clear-layers` 三路分发顺序（cesium → rsvc → dispatcher 通用收集）经节点 id 前缀验证无串扰 ✅
4. LayerPanel 删除的 7 props / SidePanel 删除的中继在模板中确认零残留；MapDownloader 只 emit close，删除的死中继安全 ✅
5. CesiumToolPanel 删除的 data 列表 UI 及采样链无残留引用；`emitOverlayFlyTo/updateOverlayOpacity` 模板有消费 ✅
6. `useMapViewUrlState` 移除 `currentView !== normalizedView` 守卫：核查 setMapView 全部调用点均为真实引擎切换（writeUrl=false 路径不经此分支），无条件 z 替换安全且必要 ✅
7. gisLoader 上传载荷 `{resources: File[]}` 与 CesiumContainer.importUserData 入参匹配 ✅
8. locale 新增键 nothingToClear/folderCleared 与 dispatcher 引用一致 ✅

## 修改内容（bug 修复）

| 级别 | 文件 | 问题与修复 |
|---|---|---|
| P1 | `app/HomeView.vue:970` | `measureGroundResolution()` 已返回 number，再取 `.groundResolution` 恒 undefined → 3D→OL 射线实测 Precision 链路完全失效。去除双重解包 |
| P1 | `viewScale/compat.js` | 旧签名别名丢失：mapCommandAdapters 传 `mapSize/cesiumFovy/clamp`，新实现只认 `viewportHeight/fovY` → 视口恒回落 768、实际 fovy 被忽略、clamp 失效。补齐三个旧参数名支持；`cesiumHeightToOlZoom` 同步改走带纬度钳制的逆变换保证严格互逆 |
| P2 | `app/HomeView.vue:1082` | Precision 校正环 `nearlyEqual(measured, targetG, 1, 1e-6)` 绝对容差 1 m/px 吞掉近距视角全部校正需求，改纯相对判定 `(1e-9, 1e-6)` |
| P2 | `viewScale/canonicalScale.js` | 全仓零引用 + 与 conversion.js 同名导出（双事实源），删除文件并同步结构树 |
| P3 | `viewScale/precision.js` | clamp 边界硬编码改为 constants SSOT（值不变） |
| P3 | `useCesiumToolModules.js` | showGroundAtmosphere 注释与取值(false)对齐 |

## 版本整合

- README「项目简介」/「版本演进」表/页脚三处统一为 V3.5.31；演进表由 5 行（含重复 V3.5.33）收敛为 2 行实义摘要行（V3.5.31 整合行 + V3.5.30）。**偏差说明**：规范要求恒定 3 行，但 V3.5.30 之前无独立版本条目可摘要（更早已整合进 V3.5.30「追认」小节），为不臆造事实保留 2 行并加注说明。
- CHANGELOG 四个临时条目（V3.5.31/32/33/34）合并为单一 `V3.5.31 (2026-08-26)` 条目，按四大主题重组，追加本会话 Code Review 修复小节。

## 影响范围

- 2D↔3D 引擎切换视图尺度同步链路（URL z 参数）
- AI Agent 飞行命令 zoom→height 换算链路
- TOC 右键菜单（三维数据高程/材质/重定位/拉伸）
- 版本文档 SSOT（README / CHANGELOG / frontend-structure.md）

## 解决方案

- bug 修复遵循最小侵入：不改函数签名与调用方结构，兼容层向后兼容旧参数名。
- 版本整合采用「内容合并不丢信息」策略：四个临时条目的小节结构完整保留进单一条目。

## 性能指标

未实测（本次无性能相关变更；射线测量仍仅模式切换后单次触发，不在高频事件内）。

## 测试方案

**Agent 已执行**：
- `npm run build`（vite build）✅ 35.8s 通过
- `tsc --noEmit` ✅ 0 error
- eslint 受影响 4 文件 ✅ 0 error（3 个 console warning 为 __zdebug 门控调试输出，localStorage 开关控制）
- Node ESM 实测 compat 层：旧签名（mapSize/cesiumFovy/clamp）与新签名往返均零漂移；clamp 上下限生效（zoom=-5→5×10⁷，zoom=40→1）

**待用户实机验证**：
1. 2D↔3D 反复切换，观察视角缩放程度视觉一致、URL z 为米制六位小数；
2. AI 助手发出含 zoom 的 3D 定位指令，验证飞行高度与视口匹配（非固定 768px 假设）；
3. 3D 模式下切回 2D，地图缩放级别与 3D 视角一致（射线实测链路生效）。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/app/HomeView.vue` | 修复 measureGroundResolution 双重解包；校正环容差改纯相对判定 |
| `frontend/src/domains/common/utils/viewScale/compat.js` | 补 mapSize/cesiumFovy/clamp 旧签名别名；逆变换改走纬度钳制路径 |
| `frontend/src/domains/common/utils/viewScale/precision.js` | clamp 边界接 constants SSOT |
| `frontend/src/domains/common/utils/viewScale/canonicalScale.js` | 删除（死代码/双事实源） |
| `frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js` | 注释对齐取值 |
| `README.md` | 三处版本号 → V3.5.31；演进表 5 行收敛为 2 行实义摘要 |
| `Docs/Guide/CHANGELOG.md` | 四个临时条目整合为单一 V3.5.31 条目 |
| `Docs/Guide/frontend-structure.md` | 移除 canonicalScale.js 树节点 |
| `Docs/LLM_record/26-08/2026-08-26/2026-08-26-v3531-staged-consolidation-review.md` | 本日志 |

## 零散修补（同日追加）

- **URL z 参数序列化恢复两位小数**（用户会话内指令）：HomeView / useMapState / useCesiumUrlTracking 三处 formatZParam 由 toFixed(6) 收敛回 toFixed(2)（useCesiumUrlTracking 函数体本为 2dp，仅注释失真已修正）。中间换算链保持全精度，仅序列化端量化；量化误差 ≤ 0.005 米高度 / 0.005 级 zoom，视觉无感。CHANGELOG 与 README 演进表中「6dp 字符串级往返恒等」表述同步修正。Node 实测 zoom 4/5.32/12 → z="5635542.35"/"2257233.38"/"22013.86"。

## 遗留与风险

- `frontend/.tmp-test/*.mjs` 四个测试脚手架已随暂存进入索引，未被 .gitignore 覆盖；是否随本提交入库请用户裁决（不入库则 `git restore --staged frontend/.tmp-test` 后提交）。
- contextMenu.js 三维数据菜单项标签（调整高程/材质模式等）沿用该模块既有的中文硬编码惯例（同 removeLabel 回退值风格），未接 i18n —— 如需国际化另立任务。
- HomeView 中 `__zdebug` 门控调试日志块（localStorage 开关）为验收工具，暂保留。
- remoteServices 存量空选记录（selectionTouched 机制引入前注册）执行叶子「移除」时会先全选拉平再剔除，行为符合默认全选语义但值得留意。
