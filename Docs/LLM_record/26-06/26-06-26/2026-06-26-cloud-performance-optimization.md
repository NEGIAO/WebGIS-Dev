# 2026-06-26 体积云性能优化 (V3.3.9)

## 日期和时间
2026-06-26 20:00

## 问题描述

体积云功能开启后计算量巨大，导致界面卡死。

## 问题分析

### 性能瓶颈

1. **主循环步数过高**：默认 48 步，ultra 档位 128 步
2. **阴影计算昂贵**：
   - `marchSunOpticalDepth`：6 步 ray march
   - `marchBeerShadowOpticalDepth`：10 步 ray march
   - `sampleBsmShadow`：纹理采样 + 矩阵运算
3. **大气计算昂贵**：每步都调用 `GetSunAndSkyScalarIrradiance`
4. **无 LOD 优化**：远处云层与近处云层同样计算

## 优化方案

### 1. 减少阴影计算步数

| 函数 | 修改前 | 修改后 | 效果 |
|------|--------|--------|------|
| `marchSunOpticalDepth` | 6 步 | 3 步 | -50% |
| `marchBeerShadowOpticalDepth` | 10 步 | 4 步 | -60% |

### 2. 自适应步长

```glsl
// 空白区域跳大步
if (emptySteps >= maxEmptySteps) {
    stepSize = clamp(stepSize * 3.0, 500.0, 8000.0);
    emptySteps = 0;
} else {
    stepSize *= 1.018;
}
```

### 3. LOD 优化（距离 + 质量等级）

```glsl
// 根据距离和质量等级动态调整步数
float lodDistanceScale = 1.0 + (3.0 - u_qualityLevel) * 0.5;
if (nearDistance > 150000.0 * lodDistanceScale) {
    distanceFactor = 0.4;
} else if (nearDistance > 80000.0 * lodDistanceScale) {
    distanceFactor = 0.6;
} else if (nearDistance > 40000.0 * lodDistanceScale) {
    distanceFactor = 0.8;
}

// 远处云层禁用昂贵的阴影计算
float shadowDistanceThreshold = mix(100000.0, 50000.0, (3.0 - u_qualityLevel) / 3.0);
bool enableDetailedShadows = nearDistance < shadowDistanceThreshold;
```

### 4. 更激进的早期终止

```glsl
// 已经足够厚，提前终止
if (i > 64 && alpha > 0.95) {
    break;
}
```

### 5. 分辨率缩放模块

新增 `useCesiumResolutionScaling.js`：
- 低分辨率渲染（1/2 或 1/4）
- 双边上采样保留边缘
- 动态分辨率调整（根据帧率自动调节）

## 新增文件

1. `frontend/src/components/Cesium/composables/useCesiumResolutionScaling.js`

## 修改文件

1. `frontend/src/components/Cesium/CesiumAdvancedEffects.vue`
   - 减少阴影计算步数
   - 添加 LOD 优化
   - 添加质量等级 uniform
   - 更激进的早期终止

2. `frontend/src/components/Cesium/Clouds/cloudDefaults.js`
   - 更新质量预设参数

## 性能对比

| 场景 | 修改前 | 修改后 | 提升 |
|------|--------|--------|------|
| 近距离云层（<50km） | 48 步 × 16 阴影步 | 48 步 × 7 阴影步 | ~55% |
| 中距离云层（50-100km） | 48 步 × 16 阴影步 | 38 步 × 7 阴影步 | ~65% |
| 远距离云层（>100km） | 48 步 × 16 阴影步 | 19 步 × 0 阴影步 | ~85% |

## 质量预设

| 档位 | stepCount | maxDistance | LOD 灵敏度 | 适用场景 |
|------|-----------|------------|------------|----------|
| low (性能) | 32 | 260km | 高 | 低端设备 |
| medium (均衡) | 56 | 360km | 中 | 默认 |
| high (精细) | 88 | 520km | 低 | 高端设备 |
| ultra (极致) | 128 | 720km | 极低 | 旗舰设备 |

## 测试方案

1. 开启体积云，观察帧率是否稳定在 30fps 以上
2. 切换不同质量档位，验证效果
3. 远距离观察云层，确认 LOD 生效
4. 开启 BSM 阴影，验证性能影响

---

*"性能优化是一门平衡的艺术——在画质和帧率之间找到最佳平衡点。"*
