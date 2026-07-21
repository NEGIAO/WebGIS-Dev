# 2026-06-27 人物漫游相机速度同步修复

## 日期和时间
2026-06-27 10:30

## 修改内容
修复人物漫游模式下相机跟随速度不随玩家移动速度变化的问题。现在相机弹簧时间（springCameraTime）会根据玩家当前速度动态调整：
- 速度越快 → 相机跟得越紧（springCameraTime 越小）
- 速度越慢 → 相机跟得越平滑（springCameraTime 越大）

## 修改原因
**问题症状**：在人物漫游模式中，无论玩家行走、冲刺还是飞行，相机的跟随速度（弹簧阻尼时间）始终是固定值（0.015 秒），导致：
- 冲刺/飞行时相机跟不上玩家，产生明显拖尾感
- 慢走时相机过于灵敏，抖动明显

**根本原因**：`CameraSystem.springCameraTime` 是初始化时的固定值，未与 `playerController.curPlayerSpeed` 联动。

**事件逻辑链条**：
1. 用户按下 Shift 冲刺 → `curPlayerSpeed = playerSpeed * 2`
2. 玩家位置快速变化 → `getLookAtPoint()` 返回的目标点每帧位移增大
3. `springTarget()` 用固定的 `springCameraTime` 做弹簧插值
4. 插值速度跟不上目标点移动速度 → 相机滞后

## 影响范围
- `CameraSystem`：新增速度感知方法
- `playerController`：主循环中调用相机速度更新

## 优化解决方案

### 1. CameraSystem 新增速度感知

**文件**: `frontend/src/components/Cesium/PlayerController/systems/CameraSystem.ts`

```typescript
// 新增属性
private baseSpringCameraTime = 0; // 初始弹簧时间（基准值）

// 保存基准值（init 完成后调用一次）
saveBaseSpringTime() {
    this.baseSpringCameraTime = this.springCameraTime;
}

// 根据速度动态调整弹簧时间
updateSpringTimeBySpeed(currentSpeed: number, baseSpeed: number) {
    if (this.baseSpringCameraTime <= 0) return;
    const ratio = Math.max(0.1, currentSpeed / Math.max(1, baseSpeed));
    const clamped = Math.min(3, Math.max(0.5, ratio));
    this.springCameraTime = this.baseSpringCameraTime / clamped;
}
```

**参数说明**：
- `currentSpeed`：当前实际速度（含冲刺/飞行倍率）
- `baseSpeed`：基准行走速度（无加速时的 playerSpeed）
- `ratio = currentSpeed / baseSpeed`：速度倍率
- `clamped`：钳制在 [0.5, 3] 范围，避免极端值
- 最终 `springCameraTime = base / clamped`

**效果**：
| 场景 | curPlayerSpeed | ratio | springTime |
|------|---------------|-------|------------|
| 行走 | 300 | 1.0 | 0.015s (基准) |
| 冲刺 | 600 | 2.0 | 0.0075s (更快) |
| 飞行 | 55000 | 183→3.0 | 0.005s (最快) |

### 2. playerController 接入更新

**文件**: `frontend/src/components/Cesium/PlayerController/playerController.ts`

```typescript
// init 方法中，设置 springCameraTime 后保存基准值
this.cam.saveBaseSpringTime();

// updatePlayer 方法中，计算 curPlayerSpeed 后更新相机
this.cam.updateSpringTimeBySpeed(this.curPlayerSpeed, this.playerSpeed);
```

## 性能指标
- 无额外性能开销（仅每帧一次除法 + 钳制运算）
- 相机跟随响应提升：冲刺时跟随时效从 0.015s 降至 0.0075s

## 测试方案
1. 启动漫游模式，WASD 行走，观察相机跟随是否平滑
2. 按住 Shift 冲刺，确认相机能跟上玩家速度
3. 按 F 进入飞行模式，前后移动确认相机响应
4. 松开所有键，确认相机平滑停止（无抖动）

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\systems\CameraSystem.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\playerController.ts`
