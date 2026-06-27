# PlayerController 全面优化

**日期**: 2026-06-27 16:00
**版本**: v3.0.x
**类型**: 性能优化 + 体验改善

---

## 问题分析

UAL1_Standard.glb 模型的 PlayerController 存在四类问题：

### 1. 动画不流畅
- **无动画过渡/混合**：`playByName()` 直接硬切动画，没有 crossfade 混合
- **跳跃状态机不够健壮**：三段跳跃依赖 `animationRemoved` 事件推进，事件丢失会卡住
- **每帧重复调用**：`setAnimationByPressed` 每帧都调用 `playByName`，快速输入时产生抖动

### 2. 移动手感差
- **线性加速度**：加速/减速是线性的，没有缓入缓出效果
- **空中无控制衰减**：飞行和地面加速度一样，缺乏"空中惯性感"
- **跳跃速度覆盖**：`pendingJump` 直接设 `velU = jumpHeight`，不保留当前竖直速度
- **落地硬着陆**：竖直速度被 snap 计算覆盖，无"落地缓冲"

### 3. 相机跟随问题
- **弹簧时间突变**：冲刺/行走切换时 `springCameraTime` 跳变
- **碰撞恢复抖动**：遮挡解除时相机弹回不够平滑
- **越肩视角无过渡**：`setOverShoulder` 立即生效/关闭

### 4. 模型显示问题
- **冗余 fetch**：`loadPlayerModel` 先 `fromGltfAsync` 加载，又 `fetch(url)` 重新解析算包围盒
- **GC 压力**：`composeModelMatrixLookAt` 每帧 `new Cartesian3()`/`new Matrix3()`

---

## 优化方案

### Phase 1: 动画系统优化

**文件**: `systems/AnimationSystem.ts`

| 优化项 | 实现方式 |
|--------|----------|
| crossfade 混合 | 旧动画 speed 渐出，新动画渐入，blendDuration=0.15s |
| 跳跃超时保护 | jumpStart 超过 2s 未完成事件，强制推进到 jumpLoop |
| 输入变化检查 | 构造输入哈希，无变化则跳过 `playByName` 调用 |

### Phase 2: 移动手感优化

**文件**: `playerController.ts`, `utils/math.ts`

| 优化项 | 实现方式 |
|--------|----------|
| smoothDamp 加速 | 使用临界阻尼弹簧模型替代线性加速度 |
| 空中控制衰减 | `airControl=0.3`，空中加速度降为地面 30% |
| 跳跃速度叠加 | `velU = max(velU, 0) + jumpHeight`，保留起跳前运动状态 |
| 落地缓冲 | `velU *= landingDamping(0.3)`，模拟软着陆 |

### Phase 3: 相机系统优化

**文件**: `systems/CameraSystem.ts`

| 优化项 | 实现方式 |
|--------|----------|
| 弹簧时间平滑 | `updateSpringTimeBySpeed` 改为 smoothDamp，过渡时间 0.3s |
| 碰撞恢复优化 | `collisionLerp` 从 0.18 降至 0.12，减少微抖 |
| 越肩视角过渡 | 新增 `_overShoulderOffset`，smoothDamp 平滑横移量，过渡时间 0.2s |

### Phase 4: 模型显示优化

**文件**: `playerController.ts`, `utils/frame.ts`

| 优化项 | 实现方式 |
|--------|----------|
| 消除冗余 fetch | 使用 `Model.boundingSphere` 获取包围盒高度，无需二次 fetch |
| GC 优化 | `composeModelMatrixLookAt` 中的临时对象改为预分配 scratch |
| getCameraDirEnu | `_enuScratch`/`_enuInvScratch`/`_localDirScratch` 复用 |

---

## 修改文件清单

| 文件路径 | 修改类型 |
|----------|----------|
| `frontend/src/components/Cesium/PlayerController/utils/math.ts` | 新增 `smoothDamp` 函数 |
| `frontend/src/components/Cesium/PlayerController/systems/AnimationSystem.ts` | crossfade + 跳跃超时 + 输入检查 |
| `frontend/src/components/Cesium/PlayerController/playerController.ts` | smoothDamp 加速 + 空中控制 + 跳跃优化 + 包围盒 + scratch |
| `frontend/src/components/Cesium/PlayerController/systems/CameraSystem.ts` | 弹簧平滑 + 碰撞恢复 + 越肩过渡 |
| `frontend/src/components/Cesium/PlayerController/utils/frame.ts` | composeModelMatrixLookAt scratch 优化 |

---

## 性能指标

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 动画切换 | 硬切（0ms） | crossfade 混合（150ms） |
| 加速响应 | 线性（生硬） | smoothDamp（自然缓入缓出） |
| 冲刺切换 | 速度跳变 | 速度渐变（0.08s） |
| 越肩切换 | 立即生效 | 平滑过渡（0.2s） |
| 包围盒计算 | fetch + 解析（网络请求） | boundingSphere（内存读取） |
| 每帧 GC | ~8 个 new 对象 | 0 个（scratch 复用） |

---

## 测试方案

1. 启动开发服务器，进入人物漫游模式
2. 验证 WASD 移动的加速/减速是否平滑（缓入缓出）
3. 验证 Shift 冲刺切换是否有速度渐变
4. 验证跳跃起跳/空中/落地的动画过渡是否流畅
5. 验证第三人称相机跟随是否平滑无抖动
6. 验证越肩视角切换是否有过渡动画
7. 验证碰撞穿墙后相机恢复是否平滑
8. 验证模型显示是否正确（朝向、缩放、位置）

---

*"移动手感是玩家与虚拟世界最直接的触感连接。"*
