# 2026-06-27 人物漫游：最低高度调整 + 无地形行走修复

## 日期和时间
2026-06-27 18:30

## 修改内容
1. **最低地面保护高度**：从 5 米降低到 1 米（`MIN_HEIGHT = 5 → 1`）
2. **无地形时支持行走**：移除无地形强制飞行模式，改为创建平坦椭球面碰撞体，人物可在无地形场景中正常行走
3. **无地形出生高度优化**：无地形时出生高度从 500m 降低到 10m，避免高空坠落

## 修改原因
- 用户反馈最低高度 5 米过高，希望降低到 1 米以获得更贴近地面的漫游体验
- 用户反馈无地形（EllipsoidTerrainProvider）时人物完全不能行走。经分析发现两个根本原因：
  1. 无地形时代码跳过了碰撞体创建（`if (!staticCollider && !noTerrain)`），Rapier 物理世界中无地面
  2. 无地形时强制进入飞行模式（`player.isFlying = true`），导致无重力、无地面吸附

## 影响范围
- `usePlayerController.js` — 人物漫游启动逻辑、碰撞体创建、最低高度保护

## 优化解决方案

### 事件逻辑链条分析

**核心症状**：无地形时人物无法行走
**根本原因**：
1. 碰撞体创建条件 `if (!staticCollider && !noTerrain)` 导致无地形时完全跳过 → Rapier 物理世界无地面 → 人物无处可站
2. `if (noTerrain) { player.isFlying = true; }` 强制飞行 → 无重力效应 → 人物悬浮在空中

**受影响模块**：PlayerController 碰撞系统、出生点计算

### 解决方案
1. **碰撞体创建**：移除 `!noTerrain` 条件，无论有无地形都创建 terrain 类型碰撞体。PhysicsSystem 的 `terrainToTriMesh` 在无地形时会采样 height=0，生成平坦椭球面三角网
2. **移除强制飞行**：删除 `if (noTerrain) { player.isFlying = true; }`，让角色在重力作用下自然站立在平坦地面上
3. **出生高度**：无地形时用 `Math.min(heightOffset, 10)` 限制出生高度，避免从 500m 坠落
4. **最低高度**：`MIN_HEIGHT` 从 5 改为 1，更贴近地面

### 修改前后对比
```
修改前：
  无地形 → 跳过碰撞体 + 强制飞行 → 人物悬浮不能行走

修改后：
  无地形 → 创建平坦地面碰撞体(ellipsoid height=0) + 重力正常 → 人物可在平面上行走
```

## 性能指标
- 无地形碰撞体创建：64×64 平坦网格，性能开销与有地形时一致，无额外负担

## 测试方案
1. 关闭地形（使用默认 EllipsoidTerrainProvider）→ 启动漫游 → 验证人物能正常行走、重力生效
2. 关闭地形 → 验证出生高度在 ~10m 而非 500m
3. 关闭地形 → 走到边缘 → 验证不会掉出世界（最低保护 1m）
4. 开启地形 → 启动漫游 → 验证功能不受影响
5. 开启地形 → 验证最低保护高度为 terrainHeight + 1m

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\PlayerController\usePlayerController.js`