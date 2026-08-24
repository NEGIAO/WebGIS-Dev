# 2026-08-23 路线漫游模块（RouteFly）落地实施

## 日期与时间

2026-08-23 18:05

## 任务等级

L3（方案文档 `Docs/TODO/route-fly-module-plan.md` 已获用户批准后施工）

## 问题分析

- **核心症状**：缺少"手绘线路 + 相机沿线路漫游"能力；参考 Demo `Docs/Demo/first_person_fly.html` 为单文件原型。
- **根本原因**：Demo 面向无地形的白模场景（刻意不用 clampToGround、不加载地形），无法直接满足本项目默认开地形的使用环境；且单文件形态不可维护。
- **受影响模块**：Cesium 工具面板模块体系、统一图层管理、i18n。
- **候选方案**：① 照搬 Demo——不满足贴地诉求且架构不符；② 模块化改造 + 双阶段贴地策略——采纳。
- **选定方案**：见批准的方案文档。核心：预览期直连虚线防掉帧 → 定稿 clampToGround 真贴地；飞行高度走「表面三级采样 + 离地高度」数值路径。

## 修改内容

1. 新增 `modules/route-fly/firstPersonFlyController.js`：`FirstPersonFlyController` 无头控制器——绘制（左键加点/rAF 橡皮筋/右键定稿）、**绘制期全程贴地（已确认段逐点重建贴地线 + 橡皮筋段 clampToGround 120ms 节流预览）**、表面三级采样（sampleHeight→sampleTerrainMostDetailed→globe.getHeight）、CZML 时间轴（1m:1s 基准 + LAGRANGE 插值自动降阶）、clock.onTick 相机跟随（lookAt/解锁卫生）、第一·第三人称预设、速度倍率、暂停/停止/清空、外部删除复位、destroy 全量释放；默认模型 `glb/drone.glb`（相对路径适配 './' baseUrl）。
2. 新增 `toolModules/routeFlyModule.js`：模块卡片（7 动作 + 15 控件），控件 value 全部来自控制器上报快照（预设切换后 UI 同步）；布尔控件按 LilGuiControls 规范使用 `type:'toggle'`。
3. 修改 `useCesiumToolModules.js`：routeFlyState 快照、懒加载 ensureRouteFlyController、动作/控件分发分支、cleanupTools 销毁、导出 detachRouteFlyWorkingSet、startFly 前 stopPlayer 时钟互斥守卫。
4. 修改 `CesiumContainer.vue`：ROUTE_FLY_SOURCE_ID + syncRouteFlySourceRecord 工作集桥 + remove 分支按 id 精确复位对应控制器 + 注入 syncRouteFlySource/detachRouteFlyWorkingSet。
5. i18n：zh-CN/en-US 增加 `cesium.module.routeFly.*`（title/description/sourceName/status/stats/action/control/option/tip/err/hud）。
6. 修改 `CesiumContainer.vue`（HUD）：地图底部居中悬浮状态板——状态提示语（绘制引导/就绪/漫游中/暂停）+ 航点数/总长/预计时长/倍速实时统计；`routeFlyState` 从编排器透出，pointer-events:none 不挡地图交互。
7. **路线导入导出**：`exportRoute()` 按 `exportFormat` 输出 json/kml/kmz（kmz 经 jszip 打包 KML，文件名自动带时间戳）；`importRoute()` 弹文件框解析 .json/.kml/.kmz（kml 取首个 LineString coordinates），导入后自动渲染为贴地定稿线并更新工作集；错误码 IMPORT_EMPTY/IMPORT_FAILED 接入编排器 i18n 映射。
8. **图标映射修复**：CesiumToolPanel 的 getModuleIcon/getActionIcon 补 routeFly 条目（模块 Route；动作 PenLine/Play/Pause/FastForward/Rewind/Square/FileUp/FileDown/Trash2），消除 9 个按钮同图标的辨识问题。
9. **矢量导入贴地强制（数据导入链路修复）**：用户实测拖拽 KML 进 Cesium 未贴地——根因是文件内显式 `<altitudeMode>absolute/relativeToGround</altitudeMode>` 会让 Cesium 绕过 load 期 `clampToGround:true`。双保险修复：① kmlLoader.prepareKmlText 在 XML 层剥除 altitudeMode/gx:altitudeMode/extrude 声明；② 新增 utils.forceDataSourceClampToGround 实体级兜底（折线 clampToGround、点/模型 heightReference=CLAMP、面清高度走 GroundPrimitive），geojson/kml/kmz/shp 四个加载器加载后统一调用。另确认 RouteFly 导入路线的工作集注册链路完好（applyImportFile→_reportWorkingSet(true)→syncRouteFlySourceRecord→loadedDataSources）。
10. **相机跟随统一装配（最终形态）**：飞行期间单一 rig 接管——原生 rotate/tilt 关闭，LEFT_DRAG 与 clock.onTick 由本类按视角模式自行解释：①第一人称（预设 first 或距离<2m）→ 模型隐藏、相机位置每帧钉在模型上、拖拽=转视线（lookRight/lookUp）；②第三人称 → lookAt 绕模型跟拍，拖拽改写偏航角(绕拍)/俯仰角并与滑杆双向同步；③停止/清空时 teardown 恢复原生控制器设置并解锁 lookAtTransform。模型显隐与距离联动：<2m 强制隐藏，拉远按 lastPreset 恢复。
11. **导入导出修复与增强**：actionMap 补回丢失的 importRoute/exportRoute 条目（点击无反应根因）；文件选择框改由编排器在用户手势同步栈内打开（绕过 await 后激活态过期被浏览器拦截）；导出格式三选项改为 GeoJSON/KML/KMZ（GeoJSON 为 FeatureCollection-LineString 含高程，导入解析兼容三种形态）；错误文案接入卡片描述 ⚠ 显示 + 4s 自动清除。
12. **镜头语言自解释**：偏航角滑杆新增悬停提示（0° 后方跟拍 / 90° 侧跟 / 180° 迎面倒拍），视角预设提示同步校准为「贴机头平视 / 后上方跟拍」；确认预设仅赋初值、三滑块飞行中连续可调且互不抢控制权。

## 修改原因

用户需求：手绘贴地线路加入图层管理，相机沿线第一/第三人称漫游动画；Demo 单文件需模块化为 toolModules 卡片并经 lil-gui 声明式控件配置。

## 影响范围

- Cesium 工具面板（新增「路线漫游」卡片）
- 统一图层管理（新增 route_fly_working 托管数据源条目）
- 人物漫游模块（起飞互斥：startFly 先 stopPlayer）
- 语言包（zh/en 各增一个 section）

## 解决方案

复刻 planarRoute 成熟范式（懒加载 chunk / onStateChange patch / 工作集桥 / handleToolAction+ControlChange 分发），控制器内部完整迁移 Demo 已验证的四个修正点（trackedEntity 不设、heading ?? 0 优先级、orientation CallbackProperty 分层、multiplier 承载速度）。

## 性能指标

未实测。设计层保障：预览期规避 GroundPolylinePrimitive 每帧重建；MOUSE_MOVE 拾取 rAF 节流；贴合建筑关闭时走异步批量地形采样避免逐点离屏渲染。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npm run lint` 0 error（修复 unused viewer / 常量 ?? 两处） | ① 开地形绘制跨山线路：预览虚线流畅、右键后定稿线贴山体 |
| `CheckStructureTree.py` ✅ 459=459 | ② 开始漫游：模型/相机沿线路移动，速度滑块即时生效 |
| `CheckConfigRegistry.py` ✅ | ③ 第一/第三人称预设切换、相机锁定开关自由观察 |
| lil-gui schema 审查：toggle/text/select/range 与渲染器能力匹配 | ④ 图层管理出现「手绘漫游路线」，TOC 删除后可重绘；与人物漫游互斥 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| frontend/src/domains/cesium/modules/route-fly/firstPersonFlyController.js | 新增：路线漫游无头控制器 |
| frontend/src/domains/cesium/composables/toolModules/routeFlyModule.js | 新增：模块卡片声明 |
| frontend/src/domains/cesium/composables/toolModules/useCesiumToolModules.js | 注册模块/分发/清理/互斥 |
| frontend/src/domains/cesium/components/CesiumContainer.vue | 工作集桥 + 删除分支按 id 复位 |
| frontend/src/locales/zh-CN.js / en-US.js | cesium.module.routeFly.* 键 |
| Docs/Guide/frontend-structure.md | 结构树两处登记 |
| Docs/TODO/route-fly-module-plan.md | L3 方案文档（已批准） |

## 遗留与风险

1. `sampleTerrainMostDetailed` 在项目自定义地形提供者下的表现 ⚠️ 未验证（有 globe.getHeight 兜底）。
2. 模型 URI 默认 `glb/drone.glb`（public/glb 已就位）；加载失败时自动降级纯相机漫游。
3. 与 planarRoute 同时飞行时的 clock 争用未做双向守卫（仅 routeFly→player 方向），后续如需要可在 startFly 再停 planarRoute 的时钟。

---

**关联**：方案文档 [Docs/TODO/route-fly-module-plan.md](../../TODO/route-fly-module-plan.md)｜同日前置任务 [2026-08-23-ui-unify-code-review](./2026-08-23-ui-unify-code-review.md)
