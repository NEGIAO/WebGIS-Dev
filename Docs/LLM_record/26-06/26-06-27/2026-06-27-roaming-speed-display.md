# 2026-06-27 漫游坐标显示添加实时速度

## 日期和时间
2026-06-27 11:30

## 修改内容
在人物漫游模式的坐标显示区域添加实时飞行速度信息。

**显示格式**：
- 修改前：`经度: xxx, 纬度: xxx, 海拔: xxx米 (漫游)`
- 修改后：`经度: xxx, 纬度: xxx, 海拔: xxx米 | 速度: xx.x m/s (漫游)`

## 修改原因
用户在漫游模式下需要直观查看当前移动速度，但坐标显示区域只有位置信息，缺少速度反馈。

## 影响范围
- `CesiumContainer.vue`：修改 `activeCoordinateDisplay` 计算属性
- `usePlayerController.js`：暴露 `playerSpeed` ref（上一轮已添加）

## 优化解决方案

### 1. usePlayerController 暴露实时速度（已完成）

**文件**: `frontend/src/components/Cesium/PlayerController/usePlayerController.js`

```javascript
// 新增 ref
const playerSpeed = ref(0);

// preUpdate 监听器中更新
const vel = player.getVelocity();
playerSpeed.value = Math.hypot(vel.e, vel.n, vel.u);

// stopPlayer 中重置
playerSpeed.value = 0;

// 返回值中暴露
return { ..., playerSpeed, ... };
```

### 2. 坐标显示添加速度信息

**文件**: `frontend/src/components/Cesium/CesiumContainer.vue`

```javascript
const activeCoordinateDisplay = computed(() => {
    const pos = playerController.playerPosition.value;
    if (pos) {
        const lng = pos.lng.toFixed(6);
        const lat = pos.lat.toFixed(6);
        const height = pos.height.toFixed(2);
        const speed = playerController.playerSpeed.value;
        const speedStr = speed > 0.1 ? ` | 速度: ${speed.toFixed(1)} m/s` : '';
        return `经度: ${lng}, 纬度: ${lat}, 海拔: ${height}米${speedStr} (漫游)`;
    }
    return coordinateDisplay.value;
});
```

**说明**：
- 速度阈值 0.1 m/s：静止时不显示速度，避免显示 "速度: 0.0 m/s"
- 速度精度：保留 1 位小数

## 性能指标
- 每帧计算一次 `Math.hypot()`，开销可忽略
- Vue computed 自动缓存，仅依赖变化时重新计算

## 测试方案
1. 启动漫游模式，观察坐标显示是否包含速度
2. 静止时确认不显示速度（低于 0.1 m/s 阈值）
3. WASD 移动，确认速度数值变化
4. Shift 冲刺，确认速度增大
5. F 飞行模式，确认速度显示正常

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\usePlayerController.js`
