# Cesium 人物漫游对齐上游 0.2.1 + 审查加固

## 日期与时间

2026-10-20 13:25

## 任务等级

L2（常规：功能优化 + Bug 修复 + 代码审查 + 版本更新）

## 问题分析

**核心症状**

1. 人物漫游长时间、远距离运行后，站立/碰撞出现细微抖动，地形坡度上偶发上下弹跳。
2. 地形碰撞重建（接近矩形边界时重采样）存在 `clearStaticColliders() → addStaticColliders()` 的异步空窗期，期间场景没有碰撞体，角色可能坠落，随后被最低高度保护瞬移回地面。
3. `setEnableZoom(true)` 会同时开启 Cesium 原生 dolly 与项目自定义滚轮缩放，形成双重缩放。
4. 换模型（`switchPlayerModel`）后碰撞胶囊不随模型 scale 变化，碰撞体与视觉不一致。
5. 销毁路径残留 `kinematicBySource` / `activeKinematicSource` 引用与动画监听。

**根本原因**

- 本地模块迁移自 `hh-hang/cesium-player-controller`（Cesium 版，最新 0.2.1），长期未跟进上游。上游已加入「局部系重锚（rebase）」「贴地修正与竖直速度解耦」「原子替换地形碰撞」等机制，本地缺失。
- Rapier 内部使用 f32，局部坐标绝对值随远离锚点增大而精度下降；同时固定锚点的 ENU 局部 Up 与真实竖直逐渐偏离，重力方向失真。
- 地形重建先删后异步加，天然存在无碰撞窗口。
- `setEnableZoom` 直接写入 `sscc.enableZoom = e`，与 `takeOver()` 中「原生缩放关闭、滚轮走自定义」的约定冲突。

**受影响模块**

- `frontend/src/domains/cesium/modules/player-controller/`（控制器、物理系统、类型、组合式封装）。

## 修改内容

1. **局部系重锚**：`PhysicsSystem.rebase(newAnchorEcef)`；`playerController` 增 `physicsRebaseDistance`（默认 10000m，Infinity 关闭）、`maybeRebase()` 每帧判定、公开 `rebase()/setRebaseDistance()/getRebaseDistance()`；`types.ts` 增 `rebaseDistance?`。
2. **静态碰撞线框变换感知**：`buildStaticDebugLinesEcef` 叠加 collider（及父级）平移/旋转后再转 ECEF。
3. **贴地修正解耦**：新增 `groundCorrectionU` 独立位移，`velU = 0`；小落差按 `stepSmoothFactor(12)` 渐进、大落差一次到位；`physics.step()` 移到帧首。
4. **物理步长同步**：`step(delta?)` 设置 `world.timestep`。
5. **地形碰撞原子替换**：新增 `replaceStaticColliders`，先解析新地形再替换；全部解析失败时保留旧碰撞体；`usePlayerController.js` 改用它。
6. **双重缩放修复**：`setEnableZoom` 始终关闭原生 dolly。
7. **热路径优化**：`getCameraDirEnu` 改用 ENU 正交基列向量点积，去掉每帧 `Matrix4.inverse`；删除随之无用的 scratch 字段。
8. **清理与健壮性**：删除死字段 `decelBase`；`PhysicsSystem.destroy()` 补清 `kinematicBySource`/`activeKinematicSource`；`playerController.destroy()` 调 `animation.reset()`；`switchPlayerModel` 胶囊随 scale 同步并 `updateCharacterShape`；`waitForModelReady` reject 携带 Error；新增 `setFirstPersonCameraOffset`。

## 修改原因

- 漫游是长时运行场景，精度与重力方向偏差会随时间累积；重锚是上游针对「全球漫游」给出的根因级方案。
- 贴地速度注入会在台阶/坡度上放大为速度尖峰，是弹跳的直接来源；改为位移修正更稳定。
- 地形重建空窗期是可见的坠落风险，原子替换可从机制上消除。
- 双重缩放、胶囊不同步、销毁残留均为审查中发现的真实缺陷，修复成本低、收益明确。

## 影响范围

- 仅 Cesium 引擎的人物漫游模块；不改 OL 引擎、不改后端、不改部署。
- 运行时行为：默认 10km 触发一次重锚（位置不变，无感知）；贴地跟随更平滑；地形重建不再有坠落窗口；滚轮缩放不再叠加。
- 未新增/删除文件（日志文件除外），文件树结构不变。

## 解决方案

**方案对比**

- 重锚方案：A) 固定锚点 + 定期整体重建物理世界（成本高、会丢失动态物体状态）；B) 以玩家位置重锚并变换所有刚体/collider（成本 O(刚体数)、保留状态）→ 选 B，与上游一致。
- 地形更新：A) 先删后加（原方案，有空窗）；B) 先解析后原子替换（选 B）；C) 流式瓦片（工程量大，列为后续）。
- 贴地：A) 继续注入 `velU`（有尖峰）；B) 独立位移修正（选 B）。

**选型理由**

- 重锚保持 ECEF 不变，对渲染/相机/动画零影响，且可数学验证。
- 原子替换不改变地形采样逻辑，只调整时序，风险最低。
- 位移修正保留原有吸附距离与软着陆手感，仅消除速度尖峰。

**实施步骤**

1. 通过 jsDelivr 拉取上游 `cesium-player-controller@0.2.1` 的 `src/**`（本机 GitHub 不可达）。
2. 逐文件比对，确认本地已具备弹簧相机、越肩、Locomotion Set、事件等，锁定差异为 rebase / 贴地 / 流式地形 / 载具。
3. 移植 rebase 与线框变换，接入每帧触发与配置。
4. 重构贴地修正与步进顺序。
5. 修复审查发现的缩放、空窗、胶囊、销毁等问题。
6. 校验：tsc / eslint / 数学单测 / 门禁脚本。

## 性能指标

- `getCameraDirEnu` 每帧省去一次 `Matrix4.inverse`（约 100+ 浮点运算）；未做帧率实测，标注「未实测」。
- rebase 仅在超过阈值时触发，单次为 O(刚体/碰撞体数)，默认 10km 一次，开销可忽略。

## 测试方案

**Agent 已执行**

- `tsc --noEmit`（全项目）：0 error。
- `eslint`（4 个改动文件）：0 告警。
- rebase 仿射往返数学单测：父级/已重锚两种用例，最大 ECEF 误差 1.141e-9 m。
- `getCameraDirEnu` 点积 vs 逆矩阵投影：最大分量误差 4.441e-16。
- `python Scripts/CheckStructureTree.py`、`python Scripts/CheckConfigRegistry.py`：见门禁结果。

**待用户实机验证**

1. 启动漫游，WASD 行走 / Shift 冲刺 / 空格跳跃：确认台阶与坡面无明显上下弹跳。
2. 按 V 切第一人称、F 飞行：确认相机跟随与缩放正常，滚轮不再出现"一次滚动跳两档"。
3. 持续飞行/行走超过 10km（或临时把 `rebaseDistance` 调小到 500m）：确认跨阈值瞬间无位置跳变、无动画闪变。
4. 走到地形碰撞矩形边界触发重建：确认角色不坠落、不瞬移。
5. 若有换模型入口：确认碰撞胶囊与视觉尺寸一致。

## 变更文件清单

- `frontend/src/domains/cesium/modules/player-controller/playerController.ts`：重锚触发、贴地修正、步进顺序、缩放修复、销毁清理、新 API。
- `frontend/src/domains/cesium/modules/player-controller/systems/PhysicsSystem.ts`：`rebase`、线框变换、原子替换、`step(delta)`、销毁清理。
- `frontend/src/domains/cesium/modules/player-controller/types.ts`：`rebaseDistance?`。
- `frontend/src/domains/cesium/modules/player-controller/usePlayerController.js`：地形重建改用 `replaceStaticColliders`。
- `README.md`：版本号三处（项目简介 / 版本演进首行 / 页脚）。
- `Docs/Guide/CHANGELOG.md`：新增 V3.6.22 条目。
- `Docs/LLM_record/26-10/2026-10-20/2026-10-20-cesium-player-controller-upstream-opt.md`：本日志。

## 遗留与风险

- **流式地形碰撞**未实现：当前仍为「整块矩形重采样」，`TERRAIN_HALF=0.03rad`（约 191km）+ `64×64` → 约 6km 网格，步行精度偏粗；缩小范围会提高重建频率，需与流式方案一并评估。
- **模拟量移动轴**（上游 `getMoveAxes`）未接入：会改变现有移动手感，需产品确认。
- **载具系统**未移植：与人物漫游无关，属独立功能。
- 重锚会重置 `PhysicsSystem.onGround`（该字段本地未被移动逻辑消费），未重置 `playerIsOnGround`，以避免动画闪变；若后续有逻辑依赖 `physics.onGround` 需复核。
- 本次审查修复后 `PhysicsSystem.ts` 产生未暂存改动，需用户重新 `git add` 后再提交。
