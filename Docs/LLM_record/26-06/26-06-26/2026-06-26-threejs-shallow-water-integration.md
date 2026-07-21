# 2026-06-26 Three.js 热带浅水场景集成 Cesium 控制中心

## 日期和时间
2026-06-26 11:00

## 修改内容
将 Three.js 热带浅水场景（焦散/折射/物理吸色/体积云/闪电）集成到 CesiumToolPanel 控制中心，作为可叠加的演示场景模块。

## 修改原因
用户希望在 WebGIS 项目中集成一个高品质的 Three.js 海洋场景效果，用于展示热带浅水的视觉效果，包括：
1. **焦散 (Caustics)** - 海底光影效果
2. **折射 (Refraction)** - 水面折射真实感
3. **物理吸色 (Beer-Lambert)** - 浅水见底、深水渐变效果
4. **体积云 + 闪电** - 大气效果增强
5. **键盘飞行控制** - 场景漫游

## 问题分析与逻辑链条

### 核心症状
- Three.js 和 Cesium 是两个独立的 3D 引擎，不能直接混合使用
- 需要一种方式让两者协同工作或独立运行

### 根本原因
- 两个引擎都有自己的渲染管线、相机系统和场景管理
- 直接在 Cesium 中使用 Three.js 的 ShaderMaterial 需要大量适配工作

### 受影响模块
- `frontend/src/components/Cesium/` - Cesium 模块目录
- 需要新增独立的 Three.js 水效果模块

### 解决方案设计

**核心思路**：将 Three.js 场景作为透明叠加层覆盖在 Cesium 上方，通过 CesiumToolPanel 统一控制。

### 架构设计

```
┌─────────────────────────────────────────────┐
│            CesiumContainer.vue              │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │         Cesium Canvas (底层)          │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  Three.js Canvas (透明叠加层)         │  │
│  │  - ShallowWaterOverlay.vue            │  │
│  │  - 水面/焦散/体积云/闪电              │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  CesiumToolPanel (控制中心)           │  │
│  │  - "热带浅水"模块卡片                │  │
│  │  - 启用/关闭 + 参数调节              │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 核心组件

1. **ShallowWaterOverlay.vue** - 叠加层组件（透明背景覆盖 Cesium）
2. **useShallowWater.js** - 组合式函数，封装 Three.js 逻辑
3. **shaders/*.glsl.js** - 着色器代码模块（JS 导出格式）
4. **utils/textures.js** - 程序化纹理生成

### 文件结构

```
frontend/src/components/Cesium/
├── ShallowWater/
│   ├── ShallowWaterOverlay.vue    # 叠加层组件
│   ├── composables/
│   │   └── useShallowWater.js     # Three.js 场景逻辑
│   ├── shaders/
│   │   ├── caustics.glsl.js       # 焦散着色器
│   │   ├── waterSurface.glsl.js   # 水面着色器
│   │   └── clouds.glsl.js         # 体积云着色器
│   └── utils/
│       └── textures.js            # 程序化纹理生成
├── CesiumContainer.vue            # 集成入口
└── composables/
    └── useCesiumToolModules.js    # 注册热带浅水模块
```

## 实施步骤

### 阶段一：创建基础架构
1. 创建 `ShallowWater/` 目录结构
2. 实现 `useShallowWater.js` 基础框架
3. 创建 `ShallowWaterScene.vue` 组件壳

### 阶段二：移植核心效果
1. 移植焦散着色器 (CAUSTIC_GLSL)
2. 移植水面 ShaderMaterial
3. 移植程序化纹理生成函数

### 阶段三：集成体积云和闪电
1. 移植体积云穹顶着色器
2. 实现闪电效果系统
3. 添加键盘飞行控制

### 阶段四：UI 集成
1. 创建控制面板（清澈度/焦散/水色等参数）
2. 集成到 CesiumToolPanel
3. 添加开关和状态管理

### 阶段五：测试与优化
1. 性能测试和优化
2. 响应式适配
3. 文档更新

## 性能指标
- 目标帧率：60 FPS（独立运行时）
- 内存占用：< 200MB（包含纹理和几何体）
- 初始化时间：< 3 秒

## 测试方案
1. **功能测试**
   - 验证所有视觉效果正常显示
   - 测试参数调节（清澈度、焦散强度、水色等）
   - 验证键盘飞行控制响应

2. **集成测试**
   - 测试与 Cesium 场景的叠加效果
   - 验证性能不相互影响
   - 测试开关功能

3. **兼容性测试**
   - Chrome/Firefox/Edge 浏览器
   - 不同 GPU 硬件（NVIDIA/AMD/Intel）

## 修改的文件路径
- `frontend/src/components/Cesium/ShallowWater/` (新增目录)
- `frontend/src/components/Cesium/ShallowWater/ShallowWaterOverlay.vue` - 叠加层组件（透明背景覆盖 Cesium）
- `frontend/src/components/Cesium/ShallowWater/composables/useShallowWater.js` - Three.js 场景生命周期管理
- `frontend/src/components/Cesium/ShallowWater/shaders/caustics.glsl.js` - 焦散着色器（TDM caustic）
- `frontend/src/components/Cesium/ShallowWater/shaders/waterSurface.glsl.js` - 水面着色器（折射/Beer-Lambert/菲涅尔/泡沫）
- `frontend/src/components/Cesium/ShallowWater/shaders/clouds.glsl.js` - 体积云着色器（光线步进 + 闪电）
- `frontend/src/components/Cesium/ShallowWater/utils/textures.js` - 程序化纹理（法线贴图/沙地/噪声）
- `frontend/src/components/Cesium/CesiumContainer.vue` - 集成入口（导入 ShallowWaterOverlay + shallowWaterVisible/Params）
- `frontend/src/components/Cesium/composables/useCesiumToolModules.js` - 注册热带浅水模块（shallowWaterVisible/Params + 控件定义 + 事件处理）
