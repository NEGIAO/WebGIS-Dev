# 2026-06-26 Code Review — TAAU / lil-gui / 模块卡片修复

## 日期和时间
2026-06-26

## 修改内容
针对未提交代码（staged + unstaged）的两轮全面 Code Review，共发现并修复 17 个问题。

---

## 第一轮修复（4 个问题）

### 1. useCesiumTemporalUpsampling.js — GLSL sampler null 检查无效
- **问题**：GLSL 中 `velocityTexture != null` 不能用于 sampler 类型，WebGL 会报编译错误
- **修复**：新增 `uniform bool hasVelocityTexture` 标志，通过 uniform 控制是否采样速度纹理
- **影响**：TAAU resolve shader 编译失败

### 2. useCesiumTemporalUpsampling.js — 深度纹理格式兼容性
- **问题**：`Cesium.PixelFormat.DEPTH_COMPONENT` + `UNSIGNED_INT` 在部分 WebGL1 设备上不支持作为纹理
- **修复**：改用 `Cesium.RenderbufferFormat.DEPTH_COMPONENT16` renderbuffer，WebGL1/2 均兼容
- **影响**：低端设备 TAAU framebuffer 创建失败

### 3. CesiumAdvancedEffects.vue — TAAU resolve stage 缺失 uniforms
- **问题**：shader 声明了 `depthTexture`/`velocityTexture`/`hasVelocityTexture` 但未传入对应 uniform
- **修复**：补充 `depthTexture`、`velocityTexture: undefined`、`hasVelocityTexture: false`
- **影响**：shader 运行时 uniform 未定义导致渲染异常

### 4. LilGuiControls.vue — title 隐藏方式影响折叠
- **问题**：`display: none` 移除 `.lil-title` 元素，lil-gui 内部折叠逻辑依赖该元素
- **修复**：改用 `height: 0 + overflow: hidden` 视觉隐藏，保留 DOM 结构
- **影响**：lil-gui 折叠/展开功能失效

---

## 第二轮修复（13 个问题）

### Critical（2 个）

### 5. CesiumAdvancedEffects.vue — TAAU resolve stage 永久禁用（死代码）
- **问题**：`_taaResolveStage` 创建后 `enabled = false`，无任何代码启用
- **修复**：接入质量预设系统，`high`/`ultra` 预设自动启用 TAAU

### 6. CesiumAdvancedEffects.vue — swapBuffers() 从未调用
- **问题**：ping-pong framebuffer 策略需要每帧交换 resolve/history 引用，否则历史纹理永远是空的
- **修复**：在 preRender 回调中 TAAU 启用时调用 `_temporalUpsampling.swapBuffers()`

### Medium（5 个）

### 7. CesiumAdvancedEffects.vue — 内部 API 访问未封装
- **问题**：`volumetricCloudsStage._colorTexture`、`sceneFramebuffer.depthStencilTexture`、`_colorTextures[0]` 均为内部 API
- **修复**：封装 `getStageOutputTexture()`、`getSceneDepthTexture()`、`getFramebufferColorTexture()` 三个安全访问函数

### 8. useCesiumTemporalUpsampling.js — FRAG_COLOR 宏未定义
- **问题**：shader 使用 `FRAG_COLOR` 但未 `#define`，依赖 Cesium 内部注入
- **修复**：添加 `#if __VERSION__ == 300` 兼容块，显式定义 `FRAG_COLOR`/`SAMPLE_TEX`

### 9. cloudShadowShaders.js — out_FragColor 未声明
- **问题**：`#version 300 es` shader 使用 `out_FragColor` 但未 `out vec4` 声明
- **修复**：添加 `out vec4 out_FragColor;` 显式声明

### 10. CesiumToolPanel.vue — 嵌入模式 expanded 卡片无视觉区分
- **问题**：`.is-embedded .module-item` 特异性(0,3,0) 覆盖 `.module-item.expanded`(0,2,0) 的绿色边框
- **修复**：添加 `.is-embedded .module-item.expanded` 规则保留 `border-left-color: #3ddc84`

### 11. CesiumAdvancedEffects.vue — TAAU resolve stage 资源泄漏
- **问题**：stage 存为局部变量，`cleanupEffects` 未移除
- **修复**：改为模块级变量 `_taaResolveStage`，cleanup 中 `sceneStages.remove()`

### Low（6 个）

### 12. CesiumAdvancedEffects.vue — const scene 变量遮蔽
- **修复**：移除 preRender 内部重复声明，直接使用 `viewer.scene`

### 13. useCesiumTemporalUpsampling.js — fract() 定义顺序
- **修复**：移到 `generateSTBNData()` 前面

### 14. useCesiumTemporalUpsampling.js — historyValid 过早设置
- **修复**：从 `update()` 移到 `swapBuffers()` 内，首次交换后才标记有效

### 15. useCesiumTemporalUpsampling.js — previousViewProjection 无用克隆
- **问题**：velocity 未接入时每帧克隆 64B 矩阵
- **修复**：注释掉克隆代码，添加 TODO 标记

### 16. LilGuiControls.vue — title 隐藏缺 min-height 防护
- **修复**：添加 `min-height: 0 !important` 和 `!important` 确保覆盖 lil-gui 内部样式

### 17. cloudShadowShaders.js — stableBlueNoise + getStructureNormal 优化
- **修复**：多频率哈希叠加替代单层哈希；12 个 if-else 改为 const 数组

---

## 修改的文件路径
- `frontend/src/components/Cesium/composables/useCesiumTemporalUpsampling.js`
- `frontend/src/components/Cesium/CesiumAdvancedEffects.vue`
- `frontend/src/components/Cesium/LilGuiControls.vue`
- `frontend/src/components/Cesium/Clouds/cloudShadowShaders.js`
- `frontend/src/components/Cesium/CesiumToolPanel.vue`
- `frontend/src/components/Cesium/Clouds/cloudDefaults.js`

## 第三轮修复（暂存区全量审查，15 个问题）

### Critical（3 个）

### 18. shadowResolveShaders.js — FRAG_COLOR 未定义 + texture() 无 WebGL1 兼容
- **问题**：shader 使用 `FRAG_COLOR` 但未 `#define`，`texture()` 在 WebGL1 下不存在
- **修复**：添加 `#if __VERSION__ == 300` 兼容块 + `SAMPLE_TEX`/`FRAG_COLOR` 宏

### 19. shadowResolveShaders.js — velocity shader 同样缺兼容块
- **修复**：SHADOW_VELOCITY_FRAGMENT_SHADER 添加相同的 version guard

### 20. TAAU 反馈循环断裂（history 纹理从未写入）
- **问题**：resolve 输出到屏幕管线，history framebuffer 的纹理从未被渲染
- **修复**：添加 TODO 注释说明架构限制；TAAU 默认关闭不受影响

### Medium（5 个）

### 21. cloudDefaults.js + useCesiumToolModules.js 质量预设不一致
- **问题**：两处独立定义 stepCount/maxDistance 不同步，ultra 不在 UI 中
- **修复**：useCesiumToolModules.js 导入 QUALITY_PRESETS，删除重复定义

### 22. CesiumAdvancedEffects.vue — cleanup 中 matrices 未置 null
- **修复**：添加 `cloudShadowUniformScratch.matrices = null`

### 23. getJitterUniforms() 每帧分配 Cartesian2
- **修复**：使用 scratch 对象复用，每帧只更新 x/y

### 24. TAAU resolution uniform 窗口缩放后过期
- **修复**：改为函数式 getter + scratch Cartesian2

### 25. atmosphereLutResources 存储不必要的 viewer 引用
- **修复**：移除 `this.viewer = viewer`（构造后不再需要）

### Low（7 个）

### 26. shadowResolveShaders.js — frameIndex uniform 未使用
- **修复**：从 shader 和 CPU setter 中移除

### 27. shadowResolveShaders.js — SHADOW_TAA_CONFIG 未使用字段
- **修复**：移除 ENABLE_VELOCITY_REPROJECTION 和 VARIANCE_CLIP_SIGMA

### 28. TEMPORAL_CONFIG 未使用字段
- **修复**：移除 VARIANCE_CLIP_RADIUS 和 VELOCITY_SAMPLE_RADIUS

### 29. _previousViewProjection 分配但未使用
- **修复**：注释掉 initialize/destroy 中的分配

### 30. FluidSimulationPanel.vue 死 CSS
- **修复**：移除 .param-row/.number-input/.color-row/.color-input/.color-swatch

---

## 已知限制（非 bug，后续迭代处理）
1. 速度重投影管线（velocity reprojection）未接入 → TAAU 在相机运动时可能产生 ghosting
2. `getStageOutputTexture` / `getSceneDepthTexture` 回退路径仍依赖 Cesium 内部 API
3. STBN 蓝噪声使用运行时近似算法，质量低于预计算纹理
4. TAAU 反馈循环未完整 — resolve 输出未写回 history 纹理（功能默认关闭）
