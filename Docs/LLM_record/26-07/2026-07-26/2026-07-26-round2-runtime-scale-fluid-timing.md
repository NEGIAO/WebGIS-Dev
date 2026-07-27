# 第 2 轮:云分辨率运行时切换 + 流体场景准备时机 + 风场 uniform GC(V3.4.49)

## 日期和时间

2026-07-27 03:50

## 任务等级

L2(功能改进 + 体验修正;无文件增删、无配置 key 变更)

## 问题分析(核心症状 → 根因 → 受影响模块)

### 2.1 云分辨率切档需重开体积云

- 症状:切质量预设后 `cloudResolutionScale` 只写入 params,画质/开销不变,需关-开体积云才生效。
- 根因:`textureScale` 是 PostProcessStage 构造期参数;V3.4.16 实现把拆分/全屏模式在 init 固化。
- 难点:PostProcessStageCollection 只有 add/remove(remove 即销毁,无法"摘下再挂回"),
  lensFlare stage 由集成层懒创建且排在云 stage 之后,朴素 remove+add 会把云排到 flare 后面(乱序)。

**候选方案对比**:
1. 常驻多分辨率 ray stage + uniform 名切换 —— 依赖 Cesium 未文档化的运行时名称解析行为,否;
2. 管线自行枚举并重排链上后续 stage —— remove 即销毁,无法保留 flare 实例,否;
3. **管线同步重建 + 集成层协作重建 lensFlare(选定)** ——
   init 时预构建两个 shader 变体(split/legacy)与 uniforms(纯回调,可复用),
   `setCloudResolutionScale()` 同步完成 remove→create→add;
   重建事实通过 `consumeCloudStageRebuilt()` 一次性标志暴露,
   集成层消费后销毁并按需重建 lensFlare(其 init 追加到链尾)→ 顺序恢复
   [atmosphere, aerial, cloud, flare]。理由:零未定义行为、同步无竞态、职责各归其位。

### 2.4 流体"开始选点"即整屏变色

- 症状:点「捕捉高度图」瞬间(尚未选点)画面即变一层(HDR/阴影/大气/天空后处理全开)。
- 根因:`prepareScene` 挂在 startPickHeightMap,而非水体真正创建时。
- 修复:`prepareScene` 后移至 `createFluidAtScreenPosition` 内、`new FluidRenderer` 之前
  (创建已确定,且渲染器依赖的场景状态在构造前就绪);选点/取消阶段画面保持原样。
  cleanup(true)/closePanel 的还原路径不变(snapshot 为空时 restoreScene 自然跳过)。

### 3.1 风场 uniform 回调每帧 new(GC 微优化)

- vendored index.mjs 渲染/计算 uniform 回调里 `new Cartesian2(...)` 共 8 处,每帧每 uniform
  一次分配 → GC 抖动。改为闭包 scratch 复用(参考云管线 _scratch 模式,行为不变)。

## 影响范围

体积云管线与集成层(stage 生命周期)、流体面板(时机)、风场 vendored 库(分配);不涉及后端。

## 解决方案(实施步骤)

1. `ThreeGeospatialPipeline`:init 预构建双 shader 缓存与 uniforms 缓存;新增
   `setCloudResolutionScale(scale)`(clamp 0.25~1;未变直接 return false;重建后置
   `_cloudStageRebuiltFlag`)与 `consumeCloudStageRebuilt()`;`_createCloudStage` 复用。
2. `cloudParamsApply`:`cloudResolutionScale` 从纯 scalar 写入改为调用
   `pipeline.setCloudResolutionScale`(内部同步 params)。
3. `setupCloudIntegration.scheduleApply`:applyCloudPanelParams 后消费重建标志,
   如有且 lensFlare 存在 → destroy + 置空;随后的 syncLensFlare 按需重建(恢复链序)。
4. `FluidSimulationPanel`:prepareScene 调用点从 startPickHeightMap 移到创建流程内。
5. `cesium-wind-layer/index.mjs`:8 处 uniform 回调 scratch 复用。

## 性能指标

- 切档即时生效(免重开云,省一次 ~30MB 纹理重载与数秒等待);
- 风场每帧减少 8 次小对象分配。未实测帧率数据。

## 测试方案

### Agent 已执行
- 5 个改动文件 ESLint 零告警;门禁 CheckStructureTree ✅(385/385)/ CheckConfigRegistry ✅;
- 版本号因并行会话推进顺延为 V3.4.49;
- 链序推演:无 flare(smooth/balanced)与有 flare(ultra)两种重建路径。
- **未实机运行**,以下待用户验证。

### 待用户实机验证
1. 开体积云(smooth)→ 切 balanced/ultra/再切回:画质与帧率即时变化,无需重开云;
2. ultra(lensFlare 开)下反复切档 3 次:光晕仍在且顺序正常(云在光晕之下),无报错;
3. 流体:点「捕捉高度图」画面不变;选点成功后才出现效果层;取消选点(清除)画面始终原样;
4. 风场开启拖动地图:行为与之前一致(纯分配优化)。

## 变更文件清单

- `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js` — 双 shader 缓存、setCloudResolutionScale/consumeCloudStageRebuilt
- `frontend/src/components/Cesium/Cloud/cloudParamsApply.js` — cloudResolutionScale 改走管线方法
- `frontend/src/components/Cesium/Cloud/setupCloudIntegration.js` — 重建标志消费 + lensFlare 协作重建
- `frontend/src/components/Cesium/FluidSimulation/FluidSimulationPanel.vue` — prepareScene 时机后移
- `frontend/src/components/Cesium/cesium-wind-layer/index.mjs` — uniform scratch 复用
- `README.md` / `Docs/Guide/CHANGELOG.md` / `frontend/README.md` — 版本记录

## 遗留与风险

- 切档瞬间云画面会闪一帧重建(stage 销毁重建的固有代价,可接受;如需无缝需双 stage 交叉淡入,暂不做);
- 第 2 轮剩余:2.2 requestRenderMode 调查(L3,需先出报告)、2.3 LogMonitor 虚拟滚动(视使用反馈);
- 第 0 轮 GPU 全量验收仍未执行。
