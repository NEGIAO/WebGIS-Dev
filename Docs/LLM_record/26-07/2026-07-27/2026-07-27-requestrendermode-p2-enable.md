# 2026-07-27 requestRenderMode P2+P3：总开关开启 + 全库补漏普查 + 参数/FPS 语义定夺

- **日期与时间**：2026-07-27 08:49（北京时间）
- **任务等级**：L3 延续（同方案 [`requestrendermode-plan.md`](../../../TODO/requestrendermode-plan.md)；用户明示「不用请求批准，直接全部执行」，据 Force_command §0 优先级 1 视为 P2/P3 一并授权）
- **基线版本**：V3.4.63 → **本次 V3.4.64**（P1 为 V3.4.61；期间并行会话占用 62/63，按规范顺延）
- **前置**：P1（V3.4.61）管理器 + 四特效接入已落地，日志 [`2026-07-27-requestrendermode-p1.md`](2026-07-27-requestrendermode-p1.md)

---

## 问题分析

P1 以 `ENABLE_REQUEST_RENDER_MODE=false` 上线，按需渲染尚未生效。P2 的风险面：置 true 后，**不经 Cesium 自动触发通道的「直改型」视觉变更**（直写 scene/globe/图元属性，而非相机/瓦片/实体增删）若无显式 `requestRender`，表现为「切了开关画面不动，直到下次相机移动才生效」。沙盒无 GPU 无法实机冒烟，改以**全库静态普查**替代：逐类扫描高危写点，核对每处是否①已有显式 requestRender、②处于连续渲染期（acquire 持有中）、③走 Entity API 自动通道。

## 修改内容

1. **总开关置 true**：`useCesiumRenderMode.js` 的 `ENABLE_REQUEST_RENDER_MODE = true`，头注释同步（回退方式不变：改回 false 一行恢复恒连续渲染）；`CesiumContainer.vue` 接入处注释同步；`frontend-structure.md` 注释同步。
2. **补漏（普查发现的唯一真实缺口）**：3D Tiles 材质模式切换 `useCesiumDataOpsHandlers.js` —— `setTilesetMaterialMode` 直写 `tileset.style` 不经自动通道，切换后补 `requestRender`；配套 `useCesiumDataImport.js` 返回对象透出既有 `getViewer` 访问器（一行，避免臆造 API）。
3. **P3-1 参数定夺**：`maximumRenderTimeChange` 维持 5 秒（命名常量 `MAX_RENDER_TIME_CHANGE_SECONDS`，即调参入口；太阳光照 ~0.2Hz 兜底刷新，时间轴拖动大步进即渲、高倍速播放时因模拟时间快速越阈值自然回到逐帧）。
4. **P3-2 FPS 显示定夺**：`debugShowFramesPerSecond` **保留常开** —— 按需模式下「空闲 FPS 骤降、交互回升」恰是验证降载生效的直接仪表；在设置处加语义注释（低 FPS=省电特性非卡顿），嫌干扰可自行改 false。

## 修改原因

用户授权全量执行；置 true 是收益兑现点（静止场景 GPU 满载→近零）。静态普查是沙盒条件下能达到的最强兜底，剩余风险由「症状轻（画面滞后一拍，相机一动即恢复）+ 一行回退」封顶。

## 影响范围

3D 渲染循环行为**自本版起真实变化**：无逐帧特效且相机静止时进入按需渲染。四特效开启期间、相机操作、图层/数据增删、实体编辑等均与此前一致（连续或自动触发）。2D/OL、后端不涉及。

## 解决方案（普查结论清单）

| 类别 | 结论 |
|---|---|
| 大气/光照参数面板 | `applyBaseAtmosphereParams`/`applyAtmosphereParams`（Container watch）尾部已有 requestRender ✓ |
| 场景美化 | `useCesiumBeautify` apply/restore 尾部 ✓ |
| 数据源显隐/透明度 | 图层 store adapter `setVisible`/`setOpacity` 双触发（含矢量 rAF 合并 onApplied 回调）✓（既有） |
| 3D Tiles 材质模式 | ✗ → **本次补**（唯一缺口） |
| OSM 建筑/谷歌 3D Tiles 开关 | 公共入口 `syncOsmBuildingsLayer`/`syncGooglePhotorealistic3DTilesLayer` 尾部 ✓ |
| 地形切换/场景 flag | 切换路径显式 requestRender + provider 变更自动触发 ✓ |
| 太阳光照/真实大气配置 | `configureSolarLighting`/`configureRealisticAtmosphere` 尾部 ✓ |
| 高级特效开关 | P1 已补 `requestSceneRender()` ✓ |
| 通视/限高分析 | 全走 `viewer.entities` Entity API（Cesium 按需模式自动触发通道）；heightLimit 另有显式 ✓ |
| 流体/云/风场/漫游参数 | 特效存活期 acquire 持有 → 连续渲染，无需触发 ✓ |
| 消息岛/日志监控/工具面板 UI | 纯 DOM，与 Cesium 渲染无关 ✓ |

全库 `requestRender` 显式调用现约 50 处/15 文件（前几轮优化铺垫），本次普查后判定覆盖充分。

## 性能指标

**未实机实测**（沙盒无 GPU）。预期：3D 静止 + 特效全关时渲染频率 ≈0.2Hz，GPU 近零；FPS 面板空闲读数骤降属预期。请以实机 FPS 面板 + 任务管理器 GPU 曲线对比 V3.4.60 前后。

## 测试方案

**Agent 已执行（沙盒）**
- ESLint 触改 4 文件：0 error / 0 warning；
- 全库高危写点静态普查（上表，逐处读码核对）；
- 门禁：CheckStructureTree ✅（390/390）/ CheckConfigRegistry ✅；
- ⚠️ 实机 GPU 行为（降载幅度、Entity API 自动触发时序）沙盒无法验证。

**待用户实机验证（P2 冒烟清单）**
1. 3D 静止观察：FPS 面板数值大幅下降（预期）、拖动相机立即恢复流畅；GPU 占用显著下降；
2. 全功能过一遍：图层增删/透明度/材质模式切换、底图与地形切换、定位/测量、属性表联动定位、时间轴拖动与倍速播放、通视/限高分析、数据导入四类——**重点盯「操作后画面不刷新、动一下相机才变」**的滞后现象；
3. 四特效各开关一轮：开启即恢复连续渲染（特效动画正常），关闭后回到降载；
4. 发现滞后点：记下操作路径（补一处 `scene.requestRender()` 即愈）；若出现大面积异常，`useCesiumRenderMode.js` 总开关改回 false 即整体回退。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/components/Cesium/composables/interaction/useCesiumRenderMode.js` | 总开关 false→true + 注释同步 |
| `frontend/src/components/Cesium/CesiumContainer.vue` | 接入处注释同步；FPS 面板语义注释（P3-2 定夺：保留） |
| `frontend/src/components/Cesium/composables/dataImport/useCesiumDataOpsHandlers.js` | tileset 材质模式切换补 requestRender（普查唯一缺口） |
| `frontend/src/components/Cesium/composables/dataImport/useCesiumDataImport.js` | 返回对象透出 getViewer 访问器（一行） |
| `Docs/Guide/frontend-structure.md` | useCesiumRenderMode 注释同步（默认关→一行可回退） |
| `README.md` | 三处版本 → V3.4.64 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.64 条目 |
| `Docs/TODO/requestrendermode-plan.md` | 状态更新（P1~P3 已全部实施，待实机验收） |
| `Docs/TODO/next-session-prompt-rendering.md` | 流水快照同步 |

## 遗留与风险

1. **实机验收未做**（沙盒无 GPU）：P2 冒烟清单移交用户；症状上限为「画面滞后一拍」，回退成本一行；
2. Entity API 自动触发为 Cesium 文档行为，沙盒未能实证 ⚠️ 未验证——若通视/限高分析出现滞后，在 `analysisModule` 控件回调补 requestRender；
3. 洪水动画期间水位经 rAF 驱动 + 流体 acquire 连续渲染，无风险；漫游静止站立时人物 idle 动画依赖连续渲染——漫游期 acquire 持有 ✓；
4. 高倍速时间轴播放时按需模式自然退化为逐帧渲染（模拟时间快速越阈值），耗电与旧行为持平，属预期而非缺陷。
