# Tellux 大气渲染系统移植到 Cesium

## 日期和时间
2026-06-26 15:30

## 修改内容
将 Tellux 项目中的大气渲染系统完整移植到 WebGIS_Dev 的 Cesium 项目中，包括：
1. 太阳/月亮方向计算系统
2. 日夜过渡效果系统
3. 月光照明系统（含月相计算）
4. 体积云渲染系统（完全重新实现）
5. 星空渲染系统
6. 大气管理器主类
7. UI 控制面板组件
8. Vue Composable 集成

## 修改原因
1. Tellux 的大气渲染效果优秀，包括日夜过渡、月光、体积云等效果
2. 原有的 Cesium 体积云实现需要完全替换
3. 需要统一的大气管理系统来协调各组件
4. 提升 WebGIS 项目的视觉效果和用户体验

## 影响范围
- **前端大气系统**: 完全重写，替换原有的 Clouds 目录实现
- **Cesium 集成**: 新增 AtmosphereManager 管理 Cesium Globe 属性
- **UI 控制**: 新增 AtmosphereControlPanel.vue 控制面板
- **渲染管线**: 使用 Cesium PostProcessStage 实现体积云

## 优化解决方案

### 问题分析
1. Tellux 依赖 Three.js 特定库（@takram/three-atmosphere, @takram/three-clouds），无法直接移植
2. Cesium 使用自己的渲染管线和 shader 系统
3. 需要重新实现 GLSL shader 以兼容 Cesium

### 解决方案
1. **模块化架构**: 将 Tellux 的功能拆分为独立模块
   - DayNightTransition: 日夜过渡系统
   - MoonLightSystem: 月光照明系统
   - MoonPhaseCalculator: 月相计算
   - VolumetricCloudRenderer: 体积云渲染
   - StarFieldRenderer: 星空渲染

2. **算法移植**: 从 Tellux 源码提取核心算法
   - 日夜过渡: `smoothstep(sunAltitude, nightEnd, dayStart)`
   - 月相计算: `(1 - dot(sunDir, moonDir)) * 0.5`
   - 月光可见性: `smoothstep(moonAltitude, 0, 0.08)`

3. **Shader 移植**: 将 Tellux 的 GLSL shader 移植到 Cesium
   - 云密度采样: FBM 噪声
   - 光照模型: Henyey-Greenstein 相位函数
   - 日夜过渡: uniform 控制

4. **Cesium 集成**: 使用 Cesium 原生 API
   - Globe 属性控制大气效果
   - PostProcessStage 实现体积云
   - SkyAtmosphere 控制天空效果

### 实施步骤
1. 创建 atmosphere 模块目录结构
2. 实现常量定义和默认配置
3. 实现日夜过渡系统
4. 实现月光系统（含月相计算）
5. 实现体积云渲染器
6. 实现星空渲染器
7. 创建主管理器协调各组件
8. 创建 UI 控制面板
9. 创建 Vue Composable 集成

## 性能指标
- **体积云渲染**: 使用 PostProcessStage，性能开销可控
- **日夜过渡**: 基于数学计算，无额外渲染开销
- **月光系统**: 动态调整 Globe 属性，无额外渲染开销
- **星空**: 使用 Cesium 内置 skyBox，性能优秀

## 测试方案
1. **日夜过渡测试**: 旋转地球观察平滑过渡
2. **月光效果测试**: 在不同月相下观察地表照明
3. **体积云测试**: 调整覆盖度、高度、速度参数
4. **星空测试**: 在夜间和高空观察星空显示
5. **性能测试**: 确保 60fps 流畅渲染
6. **兼容性测试**: 不同浏览器和 GPU 型号

## 修改的文件路径

### 新增文件
1. `frontend/src/components/Cesium/atmosphere/atmosphereConstants.js`
   - 常量定义：日夜过渡范围、月光参数、云层参数、星空参数

2. `frontend/src/components/Cesium/atmosphere/atmosphereDefaults.js`
   - 默认配置：大气、云层、Cesium Globe、SkyAtmosphere 配置

3. `frontend/src/components/Cesium/atmosphere/MoonPhaseCalculator.js`
   - 月相计算器：计算月相因子和月光可见性

4. `frontend/src/components/Cesium/atmosphere/DayNightTransition.js`
   - 日夜过渡系统：基于太阳高度角计算夜间因子，控制 Globe 属性

5. `frontend/src/components/Cesium/atmosphere/MoonLightSystem.js`
   - 月光系统：月光方向光和环境光，支持月相和可见性

6. `frontend/src/components/Cesium/atmosphere/VolumetricCloudRenderer.js`
   - 体积云渲染器：基于 PostProcessStage 的 raymarching 实现

7. `frontend/src/components/Cesium/atmosphere/StarFieldRenderer.js`
   - 星空渲染器：基于相机高度和夜间因子控制星空可见性

8. `frontend/src/components/Cesium/atmosphere/AtmosphereManager.js`
   - 大气管理器主类：协调所有子系统，提供统一 API

9. `frontend/src/components/Cesium/atmosphere/AtmosphereControlPanel.vue`
   - UI 控制面板：Vue 组件，提供大气效果控制界面

10. `frontend/src/components/Cesium/atmosphere/useCesiumAtmosphere.js`
    - Vue Composable：集成大气系统到 Vue 组件

11. `frontend/src/components/Cesium/atmosphere/index.js`
    - 索引文件：导出所有公共 API

12. `frontend/src/components/Cesium/atmosphere/shaders/cloudVertex.glsl`
    - 云层 Vertex Shader

13. `frontend/src/components/Cesium/atmosphere/shaders/cloudFragment.glsl`
    - 云层 Fragment Shader：包含 FBM 噪声、HG 相位函数、日夜过渡

14. `frontend/src/components/Cesium/atmosphere/shaders/cloudShaders.js`
    - Shader 导入文件：将 GLSL 作为字符串导出

### 废除的文件（已清空）
- `frontend/src/components/Cesium/Clouds/` 目录下的所有文件
  - CesiumVolumetricClouds.js
  - cloudShaders.js
  - cloudDefaults.js
  - cloudMath.js
  - cloudShadowResources.js
  - cloudShadowShaders.js
  - CloudShadowPrimitive.js
  - atmosphereLutResources.js
  - composables/useCesiumClouds.js
  - composables/useCesiumResolutionScaling.js
  - composables/useCesiumTemporalUpsampling.js
  - shadowResolveShaders.js

## 技术细节

### Tellux 核心算法移植

#### 1. 日夜过渡算法
```javascript
// Tellux: AtmosphereManager.ts:510-514
getNightFactor(surfaceNormal, range) {
  const sunAltitude = surfaceNormal.dot(this.sunDirection)
  const [nightEnd, dayStart] = this.normalizeRange(range)
  return 1 - THREE.MathUtils.smoothstep(sunAltitude, nightEnd, dayStart)
}

// Cesium 移植: DayNightTransition.js
calculateNightFactor(sunDirectionECEF, cameraPositionECEF) {
  const surfaceNormal = this._getSurfaceNormal(cameraPositionECEF)
  const sunAltitude = Cesium.Cartesian3.dot(surfaceNormal, sunDirectionECEF)
  const [nightEnd, dayStart] = this._normalizeRange(this._transitionRange)
  return 1 - this._smoothstep(sunAltitude, nightEnd, dayStart)
}
```

#### 2. 月相计算算法
```javascript
// Tellux: AtmosphereManager.ts:522-526
getMoonPhaseFactor(state) {
  if (!state.useMoonPhase) return 1
  return THREE.MathUtils.clamp(
    (1 - this.sunDirection.dot(this.moonDirection)) * 0.5, 0, 1
  )
}

// Cesium 移植: MoonPhaseCalculator.js
calculateMoonPhase(sunDirectionECEF, moonDirectionECEF, useMoonPhase = true) {
  if (!useMoonPhase) return 1
  const dot = Cesium.Cartesian3.dot(sunDirectionECEF, moonDirectionECEF)
  return Cesium.Math.clamp((1 - dot) * 0.5, 0, 1)
}
```

#### 3. 月光强度计算
```javascript
// Tellux: AtmosphereManager.ts:441-450
moonIntensity = state.moonLight
  ? moonLightIntensity * nightFactor * moonFactor
  : 0
ambientIntensity = state.ambientLight
  ? ambientIntensity * nightFactor
  : 0

// Cesium 移植: MoonLightSystem.js
const moonIntensity = this._moonLightEnabled
  ? Math.max(0, this._moonLightIntensity) * nightFactor * moonFactor
  : 0
const ambientIntensity = this._ambientLightEnabled
  ? Math.max(0, this._ambientIntensity) * nightFactor
  : 0
```

### 体积云 Shader 移植

#### 1. 云密度采样（FBM）
```glsl
// Tellux: cloudShaders.js
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += valueNoise(p) * amplitude;
        p = p * 2.03 + vec3(17.1, 9.2, 5.4);
        amplitude *= 0.5;
    }
    return value;
}

// Cesium 移植: cloudFragment.glsl（相同实现）
```

#### 2. Henyey-Greenstein 相位函数
```glsl
// Tellux: cloudShaders.js
float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5);
    return (1.0 - g2) / (12.5663706144 * denom);
}

// Cesium 移植: cloudFragment.glsl（相同实现）
```

#### 3. 日夜过渡光照
```glsl
// Cesium 移植: cloudFragment.glsl（新增）
vec3 sunLight = sunColor * phase * u_lighting.x * topLight * u_dayLightFactor;
vec3 moonLight = moonColor * moonPhase * u_moonIntensity * (1.0 - u_dayLightFactor) * topLight;
vec3 nightAmbient = u_nightColor * u_ambientIntensity * (1.0 - u_dayLightFactor);
vec3 sampleColor = sunLight + moonLight + skyLight + nightAmbient;
```

## 集成说明

### 使用方式

1. **启用大气系统**: 在 CesiumToolPanel 的"大气渲染"模块中启用
2. **控制面板**: 使用 lil-gui 风格的控件调整参数
3. **自动渲染**: 大气系统会在每帧自动更新

### 模块功能

- **日夜过渡**: 基于太阳高度角的平滑过渡
- **月光**: 月光方向光 + 环境光，支持月相计算
- **体积云**: 基于 PostProcessStage 的 raymarching 实现
- **星空**: 基于高度的星空可见性

### 控件说明

- **大气效果**: 总开关
- **日夜过渡**: 启用/禁用日夜过渡效果
- **月光**: 启用/禁用月光，调整强度
- **体积云**: 启用/禁用云层，调整覆盖度、速度、高度
- **星空**: 启用/禁用星空，调整强度

## 后续优化建议
1. **性能优化**: 实现 LOD 和分辨率缩放
2. **效果增强**: 添加云层阴影、光轴效果
3. **交互优化**: 添加预设配置、快捷切换
4. **文档完善**: 添加 API 文档和使用示例

## 快速使用

### 启动开发服务器
```bash
cd d:\Dev\GitHub\WebGIS_Dev\frontend
npm run dev
```

### 启用大气系统
1. 打开浏览器访问 Cesium 页面
2. 点击右上角"高级控制台"
3. 切换到"模块"标签
4. 找到"大气渲染"模块
5. 开启"大气效果"总开关

### 调整参数
- **日夜过渡**: 启用/禁用日夜过渡效果
- **月光**: 调整月光强度和环境光
- **体积云**: 调整覆盖度、速度、高度
- **星空**: 调整星空强度

详见 `atmosphere/README.md`

## 版本信息
- Tellux 版本: 0.1.7
- Cesium 版本: 1.122
- 移植日期: 2026-06-26
