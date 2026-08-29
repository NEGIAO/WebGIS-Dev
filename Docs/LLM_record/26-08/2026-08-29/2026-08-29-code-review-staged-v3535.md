# 2026-08-29 暂存区整合 Code Review（归并为单一版本 V3.5.35）

**日期和时间**：2026-08-29 10:40（同日第二轮复审补录：14:20）

**任务等级**：L2（暂存区多批次归并审查，先例：V3.5.34 归并模式）

## 任务背景

暂存区累积多个会话的不规范分批提交（原临时编号 V3.5.35~36 + 未记录散项），按用户指令整合为**单一版本 V3.5.35**。审查范围：22 个暂存文件（+569/-35），逐文件 `git diff --cached` 人工审阅（仅只读 git 操作，未执行任何写操作）。

## 审查发现矩阵

| # | 文件 | 批次归属 | 审查结论 |
|---|---|---|---|
| 1 | `cloud/setupCloudIntegration.js` | 云天闪烁 | ✅ WeakSet 注册/注销路径完整（就绪/teardown/失败三处对称）；backgroundColor 快照/压黑/恢复闭环 |
| 2 | `cloud/index.js` | 云天闪烁 | ✅ 出口追加 isCloudPipelineActive，无越权导出 |
| 3 | `cloud/lib/ThreeGeospatialPipeline.js` | 云天闪烁 | ✅ 仅 GLSL 区段排查注释追加，无 shader 逻辑变更 |
| 4 | `cloud/cloudQualityPresets.js` | 云天闪烁 | ✅ aerialStageEnabled 为既有键（三档 HEAD 均存在），仅补排查注释；原口语化注释（"主要bug：…"）因果已被日志结论推翻，已规范化 |
| 5 | `composables/toolModules/useCesiumToolModules.js` | 云天闪烁 | ✅ 互斥状态机闭环（开云记状态关大气/关云恢复/开大气关云）；`showGroundAtmosphere: true` 显式初始化，`=== true` 记录无 undefined 歧义；4 个调用点传参正确 |
| 6 | `composables/toolModules/atmosphereModule.js` | 大气渐隐 | ✅ disabled 联动（父开关 → 渐隐开关 → 两滑杆）与依赖链一致 |
| 7 | `components/CesiumContainer.vue` | 云天闪烁 | ✅ applyBaseAtmosphereParams skyBox 门控 + 渐隐回调逐帧兜底；1815 行 showGroundAtmosphere 直写值恒与互斥状态一致（params 已被互斥收敛），无需额外门控 |
| 8 | `composables/scene/cesiumAtmosphere.js` | 云天闪烁 | ✅ 三函数天空写入点门控完整；**用户并行补强**：restoreRealisticAtmosphere 的 `writeProps` 原会把快照 sky 的 `show` 字段一并写回（管线存活期重开天空大气的隐式旁路），已改为剥离 `show` 后仅恢复纯渲染参数（随 33.04s 构建验证） |
| 9 | `components/CesiumAdvancedEffects.vue` | 云天闪烁 | ✅ Tellux 恢复路径 show 门控；色调/亮度参数恢复不门控（无 show 副作用），判断正确 |
| 10 | `modules/fluid-simulation/FluidSimulationPanel.vue` | 云天闪烁 | ⚠️ **发现缺陷并已修复**——restoreScene 的 showGroundAtmosphere 快照恢复无云管线门控（与同函数 skyAtmosphere 守卫不对称）：洪水模拟期间开启体积云后结束模拟，快照旧值写回重开地面大气，存在单帧双大气窗口（此前仅靠 preRender 逐帧兜底兜住）。修复：补 `!isCloudPipelineActive(viewer)` 门控 |
| 11 | `components/CesiumToolPanel.vue` | 下拉修复 | ✅ 本会话产物，option 弹出层配色 + 双态回退，已验证 |
| 12 | `components/LilGuiControls.vue` | 下拉修复 | ✅ 本会话产物，lil-gui 动态下拉配色，已验证 |
| 13 | `common/chat/composables/useChatAgentConfig.js` | 未记录散项 | ✅ reload 三级优先（已保存 → dc.model → pool[0]）修复覆盖覆盖问题；saveModel(model, false, true) 第三参 isPersonalMode 语义正确（按模式隔离存储） |
| 14 | `common/layer-tree/components/TOCPanel.vue` | 未记录散项 | ✅ 关闭按钮 Lucide X 图标化（符合 UI 图标规范），样式自洽 |
| 15 | `locales/{zh-CN,en-US}.js` | 未记录散项 | ✅ shareCopied 移除 emoji（toast 文案规范化）；实测文件内容无残留空格（diff 显示的空格为终端编码伪影） |
| 16 | `README.md` / `Docs/Guide/CHANGELOG.md` | 版本文档 | ⚠️ 两会话版本号撞车（V3.5.36 云闪烁 vs V3.5.35 下拉）——已按用户指令归并为单一 V3.5.35 |
| 17 | `.github/traffic.json` | 自动统计 | ✅ 机器人自动更新，无需审阅 |

## 整合动作

1. **缺陷修复**：FluidSimulationPanel.vue restoreScene 补 showGroundAtmosphere 云管线门控（见 #10）；
2. **注释规范化**：cloudQualityPresets.js aerialStageEnabled 排查注释改为准确因果（用户并行完成，予以采纳）；
3. **版本归并**：V3.5.36 并入 V3.5.35——CHANGELOG 单一条目（7 个变更点）、README 三处版本号、云闪烁日志文档同步说明改写；
4. **散项补录**：Chat 模型持久化 / TOC 图标化 / emoji 清理原无日志，已补入 CHANGELOG 归并条目第 6/7 点（轻量散项不单独开日志）；
5. **文档同步**：README 三处（项目简介/演进表/页脚）→ V3.5.35，演进表保留 V3.5.35/34/33 三行，V3.5.32 摘要已归档。

## 第二轮复审补录（2026-08-29 14:20）

针对 `isCloudPipelineActive` 门控机制的时序与生命周期专项复审，发现并修复 2 处：

1. **注册时序缺陷（`setupCloudIntegration.js`）**：原实现 `activePipelineViewers.add(viewer)` 在 `createCloudAtmosphere` 纹理加载（4×8MB，可达数秒）**完成后**才注册，而 `applySkyOwnedByPipeline`（天空所有权生效）在其之前执行——加载窗口期内面板滑杆/Tellux/洪水旁路写原生天空时查询仍返回 false，门控失效，白闪可复现。修复：add 提前至 `applySkyOwnedByPipeline` 之前（所有权即刻生效），teardown/失败路径的 delete 无需变动（对称覆盖）。
2. **disposed 路径回收缺失（同文件）**：`ensurePipeline` await 加载期间用户关闭体积云或组件卸载（teardown 已跑、`disposed=true`），管线实例就绪后走 `if (disposed)` 分支——原实现仅 `instance.destroy()` 即 return，WeakSet 残留（viewer 销毁后由 GC 兜底，但重建 viewer 前查询误报 active）+ 天空状态停留管线接管态（背景黑/skyBox 关）+ 连续渲染计数泄漏。修复：该分支补 `activePipelineViewers.delete` + `restoreSkyState` + `releaseContinuous`，与失败路径同口径。
3. **复审确认无缺陷项**：CSS 令牌（`--ctp-*` 8 枚 / `--toc-text-secondary` / `--brand-primary-rgb`）全数有定义；互斥状态机闭环无竞态（`handleToolControlChange` 为唯一 `cloudsEnabled`/`showGroundAtmosphere` 写入入口，同步顺序执行）；Chat reload 三级优先语义正确；`shareCopied` 无残留空格（终端编码伪影）；`restoreScene` 双门控对称。

## 测试方案

- **Agent 已执行**：
  1. 逐文件 `git diff --cached` 人工审阅（22 文件）；
  2. `git show HEAD` 交叉核验 aerialStageEnabled 等键值为既有（排除隐性行为变更）；
  3. 互斥状态机调用链核查（4 调用点 + 初始值显式性）；
  4. 第二轮：`node --check` 修改文件语法通过；生命周期矩阵推演（正常开启/关闭、加载中关闭、加载失败、viewer 重建）；
  5. 门禁脚本与 lint/build 结果见下方门禁记录。
- **待用户实机验证**：
  1. 洪水模拟运行中开启体积云 → 结束模拟 → 地面大气保持关闭（不闪）；关闭体积云后大气恢复；
  2. **体积云开启瞬间（纹理加载等待期）拖动大气面板任意滑杆** → 不出现白闪/天空重开（验证注册时序修复）；
  3. 云天闪烁与下拉修复的既定回归项（见各分项日志）。

## 遗留与风险

- traffic.json 为 CI 自动产物，随本版本一并入库属正常；
- 下拉修复日志与云闪烁日志中部分措辞按归并后版本号口径已同步，历史日志标题中的临时编号以本审查日志为准。
