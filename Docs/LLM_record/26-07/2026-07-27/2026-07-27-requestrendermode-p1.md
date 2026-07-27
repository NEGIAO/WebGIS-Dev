# 2026-07-27 requestRenderMode 按需渲染 P1：计数器管理器 + 四特效接入（总开关默认关）

- **日期与时间**：2026-07-27 08:36（北京时间）
- **任务等级**：L3（渲染架构变更；方案 [`Docs/TODO/requestrendermode-plan.md`](../../../TODO/requestrendermode-plan.md) 已获用户批准 P1）
- **基线版本**：代码基线 V3.4.54 → **本次 V3.4.61**（实施期间并行会话连续推进 55–60：对账补录 55–58、B3 收账 59、在线人数 60；按规范「后完成者顺延」两次顺延后取 61）
- **所属流水**：渲染/性能优化（交接文档 [`2026-07-26-handover-rendering-optimization.md`](../../26-07-26/2026-07-26-handover-rendering-optimization.md)，路线图 2.2 项）

---

## 问题分析

**核心症状**：3D 视图全程连续渲染——静止、无任何特效时（看底图/查属性/挂后台）整条渲染管线仍每帧全速执行，GPU 满负荷，笔记本发热/掉电直观。

**根本原因**：全库无 `requestRenderMode` 引用（Cesium 默认 false=连续渲染）；Viewer 以 `shouldAnimate:true` 创建、时钟持续动画 + 太阳光照随时间，渲染循环恒全速。逐帧特效（体积云/风场/流体/漫游）与「静止看图」共用同一渲染策略，缺少按需降载机制。

**受影响模块**：Cesium 渲染循环（CesiumContainer initViewer）、四大逐帧特效生命周期（体积云/风场/流体/人物漫游）、高级特效面板开关链路。

## 修改内容

1. **新建 `composables/interaction/useCesiumRenderMode.js`**（计数器管理器）：
   - `acquireContinuous(viewer, tag)` / `releaseContinuous(viewer, tag)`：计数 >0 → `requestRenderMode=false`（连续）；归零 → `requestRenderMode=true` + `maximumRenderTimeChange=5`（秒，时钟推进超阈值自动重渲，太阳光照约 0.2Hz 低频刷新、时间轴拖动/播放仍跟手）+ 补渲一帧；
   - 总开关 `ENABLE_REQUEST_RENDER_MODE` **默认 false**（P1 接入期零行为变化，P2 置 true 生效，一行回退）；
   - 保险：异常 fail-open 回退连续渲染；release 容忍未配对调用（失败清理路径安全，计数不为负）；状态 WeakMap 按 viewer 隔离（token 重试重建 viewer 无跨实例残留）；
   - `initRequestRenderMode(viewer)` 初始化入口 + `getContinuousRenderSnapshot(viewer)` 调试快照（P2 排查「画面不刷新」用）。
2. **四处逐帧消费者 acquire/release 成对接入**：
   - 体积云 `setupCloudIntegration.js`：`pipeline = instance` 后 acquire（tag `volumetric-cloud`）；`teardownPipeline` 与 init 失败 catch 双路 release；
   - 风场 `useCesiumWind.js`：`wind2D.value = wind` 后 acquire（`wind-field`）；`clearWind2D` release（入口保证实例存在，恰好配对）；
   - 流体 `FluidSimulationPanel.vue`：`FluidRenderer` 构造成功后 acquire（`fluid-sim`）；`destroyFluidOnly` release（见「解决方案」挂点微调说明）；
   - 人物漫游 `usePlayerController.js`：`playerInstance = player` 后 acquire（`player-roam`）；`stopPlayer` 实例存在分支 release（启动失败走 catch→stopPlayer 自动归还）。
3. **第五处（高级特效）按调查结论处理**：`CesiumAdvancedEffects.vue` 三个 stage（高度雾/HBAO/移轴）+ 大气增强均为**相机驱动、无时间动画**，preRender 监听只在真实渲染帧执行 → **不接计数**；但 stage 的 enabled/uniform 在 preRender 内同步，按需模式下切开关不会自发渲染 → 在 `handleEffectGuiChange` 与 `syncExternalControls` 补 `requestSceneRender()` 触发一帧（连续模式下无害 no-op）。
4. `CesiumContainer.vue` initViewer 内调用 `initRequestRenderMode(viewer)`；`composables/index.js` barrel 登记 5 个导出。

## 修改原因

路线图 2.2 主收益场景 =「3D 开启、相机静止、四特效全关」，GPU 可从满载降至近零；特效开启期间本就需要连续渲染，无收益也无损失。P1 以默认关闭的开关先把接线铺好，P2 置 true 冒烟，风险与收益分离。

## 影响范围

Cesium 渲染模式管理（新增，默认不生效）、四特效启停路径（各加一行计数调用，行为等价）、高级特效开关（多一次 requestRender，连续模式无感）。**不涉及**：2D/OL 链路、鉴权、图层管理语义、后端、BSM 四不变量相关代码（云影管线内部零改动）。

## 解决方案（候选对比与决策）

| 决策点 | 候选 | 选定与理由 |
|---|---|---|
| 降载机制 | a) 直接全局开 requestRenderMode + 普查所有交互点补 requestRender b) 引用计数管理器，特效生命周期自声明 | **b**：a 普查面大易漏、回归风险高；b 中 Cesium 自动覆盖相机/瓦片/实体变化，既有全库显式 requestRender 天然兼容 |
| 上线策略 | a) 直接生效 b) 总开关默认 false 观察 | **b**：方案既定保险机制，出问题一行回退 |
| 管理器状态 | a) 模块级单例绑定单 viewer b) WeakMap 按 viewer 隔离 | **b**：token 重试会销毁重建 viewer，a 会把旧实例计数带入新实例 |
| 流体 release 挂点 | a) 方案表原定 `cleanup(true)` b) `destroyFluidOnly`（cleanup 内部必经路径） | **b**：重建水体路径 `createFluidAtScreenPosition→destroyFluidOnly` 不经 cleanup，挂 a 会双 acquire 单 release 泄漏计数；b 与 FluidRenderer 实例生命周期严格配对 |
| 接口签名 | 方案原型 `acquireContinuous(tag)` | 实现为 `acquireContinuous(viewer, tag)`：管理器非单 viewer 单例（配合 WeakMap 决策） |

**方案开放问题定性结论**（实施前逐文件读码）：
- `CesiumAdvancedEffects` 无逐帧动画 → 不接计数，仅补开关 requestRender（上文 3）；
- `useCesiumFrameRate` 为被动 preRender 采样，不阻断按需渲染；按需模式下 FPS 数值语义变化（渲染帧率≠交互流畅度）留 P3 处理；
- 热带浅水（ShallowWaterOverlay）为独立 Three.js canvas 自带渲染循环，不消费 Cesium 帧 → 无需接入（方案普查清单外顺带定性）。

## 性能指标

**未实测**（P1 总开关默认 false，运行时行为与改动前完全一致，属预期）。预期收益（P2 置 true 后）：3D 静止 + 四特效全关时，渲染频率降至约 0.2Hz（5s 时钟兜底重渲），GPU 占用从满载降至近零；特效开启期间与现状持平。P2 冒烟时用 `debugShowFramesPerSecond` 与任务管理器 GPU 曲线取前后对比数据。

## 测试方案

**Agent 已执行（沙盒）**
- ESLint（`node node_modules/eslint/bin/eslint.js`）8 个触改文件：0 error / 0 warning；
- `npx tsc --noEmit`：无新增报错（仅既有 cesium TS2307 模块解析基线噪音；既知基线项 layerTreeBuilder.ts:389 已由 07-27 对账会话复核销项，本次运行确认不再出现）；
- 6 处新增 import 相对路径逐一脚本解析：全部命中实际文件；
- 门禁：`CheckStructureTree.py` ✅（390/390）/ `CheckConfigRegistry.py` ✅（无新增配置 key）；
- ⚠️ 沙盒 `vite build` 不可执行：挂载 node_modules 为 Windows 安装，缺 `@rollup/rollup-linux-x64-gnu` 原生二进制（环境限制非代码问题），构建冒烟转待用户实机。

**待用户实机验证**
1. `npm run dev` / LocalDev.bat：3D 视图正常——默认开关 false，**一切 3D 行为应与改动前完全一致**（本轮验收核心就是零回归）；
2. 四特效各开→关一轮：体积云、风场、流体（创建/清除/洪水动画）、人物漫游启停无异常；
3. 高级特效面板四开关切换正常；
4. （进入 P2 时）将 `useCesiumRenderMode.js` 的 `ENABLE_REQUEST_RENDER_MODE` 置 true 后全功能冒烟：图层增删/样式修改/定位/测量绘制/属性表联动/时间轴拖动/底图切换；发现「画面不刷新」的操作点记录下来按方案补 `scene.requestRender()`（预期少量）。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/components/Cesium/composables/interaction/useCesiumRenderMode.js` | **新增**：按需渲染计数器管理器（总开关默认 false） |
| `frontend/src/components/Cesium/CesiumContainer.vue` | initViewer 接入 initRequestRenderMode + import |
| `frontend/src/components/Cesium/Cloud/setupCloudIntegration.js` | 体积云 acquire/release（含 init 失败路径归还） |
| `frontend/src/components/Cesium/cesium-wind-layer/useCesiumWind.js` | 风场 acquire/release |
| `frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue` | 流体 acquire/release（挂点 destroyFluidOnly） |
| `frontend/src/components/Cesium/PlayerController/usePlayerController.js` | 漫游 acquire/release |
| `frontend/src/components/Cesium/CesiumAdvancedEffects.vue` | 开关切换补 requestSceneRender（不接计数，定性结论） |
| `frontend/src/components/Cesium/composables/index.js` | barrel 登记新模块导出 |
| `Docs/Guide/frontend-structure.md` | 结构树登记 useCesiumRenderMode.js |
| `README.md` | 三处版本 → V3.4.61 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.61 条目 |
| `Docs/TODO/requestrendermode-plan.md` | 状态更新（P1 已实施，P2/P3 待批） |
| `Docs/TODO/next-session-prompt-rendering.md` | 流水快照同步（2.2 P1 完成） |

## 遗留与风险

1. **P2（置 true 全功能冒烟）与 P3（maximumRenderTimeChange 调参、FPS 显示语义评估）未实施**——P1 铁律范围即止；P2 需用户实机配合，节奏由用户定；
2. `viewer.scene.debugShowFramesPerSecond = true` 常开（initViewer 既有代码）：按需模式下该数值语义变化（低 FPS 是省电特性而非卡顿），P3 评估是否移入调试开关；
3. 遗漏逐帧消费者的表现是「该动的不动」（冻结）而非崩溃，且仅 P2 置 true 后才可能出现；总开关可即时回退；
4. FluidRenderer 若内部自续 requestRender，按需模式下流体存活期等效连续渲染——正确性不受影响（本就已 acquire），仅无额外省电空间；
5. 本次改动**全部未实机 GPU 验证**（沙盒无 GPU/浏览器），与本流水既有待验收项合并等待第 0 轮实测。
