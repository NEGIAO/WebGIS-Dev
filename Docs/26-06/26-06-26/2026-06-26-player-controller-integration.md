# 2026-06-26 人物漫游控制器集成

**日期**：2026-06-26 20:00
**版本**：V3.3.11
**类型**：功能集成

---

## 修改内容

集成 `cesium-player-controller` 开源库到 WebGIS 项目，实现 3D 场景中的人物漫游功能。

## 修改原因

用户希望在 Cesium 3D 场景中实现第一/第三人称人物漫游，可以在 3D Tiles 和地形上行走、跳跃、飞行，增强 3D 场景的交互体验。

## 影响范围

- Cesium 模块新增 `PlayerController/` 子目录
- `CesiumContainer.vue` 新增 composable 引入和模板组件
- `useCesiumToolModules.js` 新增人物漫游模块定义和控件处理
- `vite.config.js` 新增 cesium alias 和 optimizeDeps 配置
- 新增 `src/cesium-shim.js` Cesium ESM 垫片
- 新增 `public/glb/player/` 模型资源目录
- 新增 `@dimforge/rapier3d-compat`、`@loaders.gl/*` 依赖

## 问题分析

### 核心症状
1. 原项目 `cesium-player-controller` 是独立 npm 包，需要适配到现有 Vue 3 项目
2. 项目通过 CDN 加载 Cesium（1.122），npm 包也有 Cesium（1.120），双实例冲突导致 `renderState.lineWidth` 渲染错误
3. `Model.fromGltfAsync` 传入 `Uint8Array` 时触发 WebGL 渲染状态异常
4. 无地形时角色无法行走，一直下坠

### 根本原因
1. Vite 未配置 `cesium` alias，npm Cesium 被预打包为独立 chunk，与 CDN 版本共存
2. `Model.fromGltfAsync` 的 `Uint8Array` 路径在某些 WebGL 实现中不兼容
3. 地形碰撞体仅在有地形时创建，无地形时角色无支撑面

### 解决方案
1. 创建 `cesium-shim.js` 映射所有 Cesium 导出到 `window.Cesium`
2. Vite alias `'cesium'` → shim + `optimizeDeps.exclude` 排除预打包
3. 模型加载改为 URL 方式，包围盒计算单独 fetch
4. 无地形时自动进入飞行模式 + 最低高度保护

## 优化解决方案

### 实施步骤

1. **安装依赖**：`@dimforge/rapier3d-compat` + `@loaders.gl/core` + `@loaders.gl/gltf` + `@loaders.gl/draco`
2. **创建模块目录**：`components/Cesium/PlayerController/` 含 12 个源文件
3. **复制模型资源**：`public/glb/player/` 含 UAL1_Standard.glb（3.6M）等 4 个 GLB 文件
4. **创建 Vue 适配层**：
   - `usePlayerController.js`：composable 封装启停/状态/地形碰撞/最低高度保护
   - `playerDefaults.js`：默认配置（模型动画名/物理参数/相机参数/键位）
   - `PlayerGuidePanel.vue`：右上角悬浮键位说明面板
   - `index.js`：模块入口（懒加载导出）
5. **集成到 CesiumContainer**：import composable + 模板组件 + expose
6. **集成到 CesiumToolPanel**：useCesiumToolModules 新增 player 模块 + 调试控件
7. **解决双实例冲突**：cesium-shim.js + vite alias + optimizeDeps.exclude

### 技术决策

| 决策 | 方案 | 原因 |
|------|------|------|
| Cesium 加载方式 | CDN + shim 桥接 | 项目已有 CDN 体系，npm 包仅用于类型 |
| 物理引擎 | Rapier（WASM） | 原库依赖，胶囊体碰撞成熟 |
| 模型加载 | URL 方式 | 避免 Uint8Array 路径的 WebGL 兼容问题 |
| 地形碰撞 | 有地形时采样，无地形时飞行 | 兼容有/无地形两种场景 |
| 最低高度保护 | 每帧检测 + reset | 防止穿地，简单可靠 |

## 修改的文件路径

### 新增文件
- `frontend/src/cesium-shim.js` — Cesium ESM 垫片
- `frontend/src/components/Cesium/PlayerController/index.js` — 模块入口
- `frontend/src/components/Cesium/PlayerController/usePlayerController.js` — Vue composable
- `frontend/src/components/Cesium/PlayerController/playerDefaults.js` — 默认配置
- `frontend/src/components/Cesium/PlayerController/PlayerGuidePanel.vue` — 键位说明面板
- `frontend/src/components/Cesium/PlayerController/playerController.ts` — 核心控制器
- `frontend/src/components/Cesium/PlayerController/dynamicObject.ts` — 动态物体句柄
- `frontend/src/components/Cesium/PlayerController/types.ts` — 类型定义
- `frontend/src/components/Cesium/PlayerController/systems/AnimationSystem.ts` — 动画系统
- `frontend/src/components/Cesium/PlayerController/systems/CameraSystem.ts` — 相机系统
- `frontend/src/components/Cesium/PlayerController/systems/InputSystem.ts` — 输入系统
- `frontend/src/components/Cesium/PlayerController/systems/PhysicsSystem.ts` — 物理系统
- `frontend/src/components/Cesium/PlayerController/utils/frame.ts` — 坐标变换
- `frontend/src/components/Cesium/PlayerController/utils/gltfGeometry.ts` — glTF 解析
- `frontend/src/components/Cesium/PlayerController/utils/math.ts` — 插值工具
- `frontend/src/components/Cesium/PlayerController/utils/mobileControls.ts` — 移动端摇杆
- `frontend/public/glb/player/UAL1_Standard.glb` — 主角模型
- `frontend/public/glb/player/football.glb` — 足球模型
- `frontend/public/glb/player/agi-hq.glb` — 建筑碰撞体
- `frontend/public/glb/player/3667783.glb` — 辅助模型

### 修改文件
- `frontend/vite.config.js` — 添加 cesium alias + optimizeDeps.exclude
- `frontend/src/components/Cesium/CesiumContainer.vue` — 引入 composable + PlayerGuidePanel
- `frontend/src/components/Cesium/composables/useCesiumToolModules.js` — 新增 player 模块 + 调试控件

## 测试方案

1. 启动开发服务器，点击控制台「人物漫游」→「启动漫游」
2. 验证 WASD 移动、Shift 冲刺、Space 跳跃
3. 验证 V 键切换第一/第三人称
4. 验证 F 键切换飞行模式
5. 验证控制台滑块实时调节速度/重力/跳跃高度
6. 验证无地形场景自动进入飞行模式
7. 验证键位说明面板显示/关闭
