# 渲染与性能优化工作流交接文档(2026-07-26)

> 本文档汇总当日"渲染/性能/交互"工作流的全部改动,供后续开发者或 AI 会话接手。
> 纯文档,不占版本号。当日另有并行工作流(配置架构/账号 UI/属性表等),见 CHANGELOG 其余条目。

---

## 一、改动总览

| 版本 | 主题 | 根因一句话 | 核心文件 |
|------|------|-----------|---------|
| V3.4.7 | 云影贴地锚定修复 | CSM 光空间矩阵配对错误 → texel snap 在转置框架中失效,阴影跟相机走 | Cloud/lib/CloudShadowPass.js |
| V3.4.12 | 云影垂直移动抖动 | snap 修好后暴露:BSM 噪声锚定 atlas 像素,snap 跳变整场重噪 | CloudShadowFrag.glsl.js、ShadowResolvePass.js |
| V3.4.16 | 云+风场性能 | 云 raymarch 全分辨率;BSM 运动期白算;风场 36 万粒子超载 | ThreeGeospatialPipeline.js、cesium-wind-layer/* |
| V3.4.25 | ArcGIS 地形卡顿 | Cesium 原生 provider 主线程同步解码 LERC | terrain/ArcGISTerrainProvider.js、lercDecode.worker.js |
| V3.4.26 | 流体"清除"失效 | clearFluid 走 cleanup(false) 跳过 restoreScene,8 个场景开关残留 | FluidSimulation/FluidSimulationPanel.vue |
| V3.4.30 | 消息首屏队列 | 自动关闭调度串行叠加,burst 第 N 条停留 N×duration | useMessageIslandMotion.js |
| V3.4.32 | 消息二轮打磨 | 整岛暂停/进度条/合并徽标/快排豁免/队列上限 | Shell/Message.vue、useMessage.js |
| V3.4.34 | ControlsPanel 优化 | 日志监控 index key 全列表重 patch;SSE 一错即停 | ControlsPanel/LogMonitor.vue |
| V3.4.38 | 天地图地形+风场收尾 | 天地图 inflate 主线程同病;风场监听移除失效泄漏 | terrain/decodeWorkerPool.js、geoTerrainDecode.worker.js |

每项的完整分析见同目录对应日志(文末索引)。

---

## 二、关键机制与不变量(改相关代码前必读)

### 1. BSM 云影链路(Cloud/lib/)

```
CloudShadowPass.updateShadowCascades  每帧拟合 4 级 CSM(光空间正交盒 + texel snap)
  → render()                          内容签名门控决定是否 raymarch 整张 2×2 atlas
  → publish                           矩阵与 atlas 的"配对快照"
ThreeGeospatialPipeline._syncBSM      显式驱动:render→resolve→blit→setCloudShadow(同帧同序)
消费端                                aerial/atmosphere/主云 stage 只读 published 快照
```

**四条不变量,破坏任意一条会回归"阴影抖动/粘屏/黑闪":**

1. **光空间配对**:`cameraToLight = lightOrientation × camWorld`,centerLS 回世界乘
   `invLightOrientation`;逐 cascade view 与 lightOrientation 必须同 z(toSun)同 up,
   否则 texel snap 的量化轴与阴影图轴不重合,snap 失效。
2. **世界锚定噪声**:BSM 噪声采样必须带 `u_jitterOffset`(snap 后中心 texel 计数 mod 256),
   使噪声相位随纹理网格贴住世界;去掉它,snap 跳变时整场重噪(升降抖动)。
3. **published/raw 契约**:消费端(u_shadowMatrices/Intervals/Far/Near 与 setCloudShadow)
   只能读 `getShadowXxx()` published 快照——raw `_shadowMatrices` 每帧被覆盖,与旧 atlas 错帧。
4. **签名门控**:签名 = 各 cascade snap 整数 + 量化半径 + 量化太阳方向;参数变更走
   `updateDynamicParams` 的值级检测 bump `_paramsRev`(数组必须拷贝为自有副本再比较,
   与 scratch 共享引用会让检测失效);演化偏移不入签名,由 `max(interval,8)` 帧周期刷新兜底。

**resolve 时域**:运动期 alpha 上限 0.5、reset 阈值 0.05(仅大不连续)、history 重投影
clamp 在本 cascade tile 内。锚定可信是前提;若改回激进 reset 会重新暴露重噪。

### 2. 云分辨率拆分模式(V3.4.16)

`cloudResolutionScale < 1`(smooth 0.5 / balanced 0.75 / ultra 1.0)时,云 stage 变为
PostProcessStageComposite:低分辨率 raymarch(`textureScale` + `SPLIT_CLOUD_OUTPUT` 输出
预乘云色)+ 全分辨率合成(`scene*(1-a)+cloud`)。**在 init 固化**(textureScale 是构造期
参数),切档后需重开体积云生效;=1 走原单 stage 路径。拆分模式下 in-shader TAA 与
readPixels 回读强制关闭。对外仍暴露 `pipeline.cloudStage`(composite 也有 enabled)。

### 3. 地形 Worker 解码(terrain/)

`decodeWorkerPool.js` 为通用池(ArcGIS LERC 与天地图 zlib 共用):round-robin、双向
Transferable、**Worker 创建失败或 onerror → 拒绝全部挂起并永久回退主线程路径**
(最坏情况等于旧行为,绝不悬死)。两个 worker 协议见各文件头注释。
ArcGIS 包装器保留:禁用内部 Tilemap 二次请求、增量 TileAvailability、层级硬顶(现 12)。
SSE 动态值在 `useCesiumLayers.applyTerrainSceneFlags`(现 3/6)。

### 4. 消息系统(Shell/Message.vue + 两个 composable)

- 关闭调度:并行计时 + 250ms 错峰(`max(now+duration, latest+250ms)`),严禁改回串行叠加;
- `_lifeMs` 仅首次调度写入(resume 不写),进度条动画与计时器同相位的前提;
- 暂停语义在整岛(TransitionGroup 容器事件 + `.toast-list:hover` 冻结进度条);
- dedup 不改写文本,组件按 `_dedupCount` 渲染徽标;motion 侧检测其变化重启计时;
- 队列上限 8(优先淘汰非 error/warning),快排豁免 error/warning ≥2500ms。

---

## 三、待人工 GPU/浏览器验收清单(全部改动均未实测)

**体积云(三档预设各测)**
- [ ] 中低空拖拽旋转 360°:无大面积黑影弹入/消失
- [ ] 垂直升降 100m→10km 往返:地面阴影不跳纹理、无扫描线
- [ ] 平移后静止 2s:阴影贴地、时域降噪收敛
- [ ] smooth/balanced 云边缘无明显低分辨率瑕疵;三档帧率对比(优化前后)
- [ ] 切换质量预设、开关云、开关 BSM 反复 5 次无异常

**地形**
- [ ] 天地图(默认)与 ArcGIS:山区连续缩放/拖动流畅无卡顿,细节较前更清晰
- [ ] 高程拾取(sampleTerrainMostDetailed)正常;断网瓦片失败降级正常
- [ ] 控制台无 "worker 失效" 告警(有则说明走了回退,需查 worker 打包)

**风场**
- [ ] 开启全球风场:帧率与视觉密度可接受;调粒子数无长卡顿
- [ ] 开→关→开 3 次:粒子正常,关闭后无残留监听(可断点 updateViewerParameters)

**流体**
- [ ] 捕捉→清除:整屏效果层(HDR/光照/大气)完全还原;等待选点时直接清除同样还原

**消息系统**
- [ ] 首屏 burst ~4s 错峰消完;悬停整岛冻结;重复消息角标递增;高压下 error 不被闪过

**日志监控**
- [ ] 高频日志滚动流畅;断网 3s 自动重连;手动停止不再重连

---

## 四、出问题先动哪里(调参与回退入口)

| 症状 | 入口 |
|------|------|
| 云影异常 | `cloudQualityPresets.js`:useShadowBuffer=false 直接关 BSM;shadowFar/splitLambda/fadeScale 调 cascade 几何 |
| 云太糊/性能不够 | `cloudResolutionScale`(预设)、maxSteps/minStepSize;改后重开体积云 |
| BSM 更新不及时 | CloudShadowPass 签名门控:演化刷新 `Math.max(interval, 8)` 的 8;或直接看 `_paramsRev` 是否随面板变化递增 |
| 地形回归卡顿 | 确认 worker 生效(Network 有 tile 请求但主线程无 decode 长任务);SSE 3/6 与 MAX_LEVEL_CAP=12 可回调 4/8、11 |
| 风场过载 | `useCesiumWind` particlesTextureSize(clamp 上限 512 在 Wind2D) |
| 消息滞留/闪过 | useMessageIslandMotion CLOSE_STAGGER_MS=250;useMessage FAST_MIN_IMPORTANT_MS/MAX_QUEUE |

回退粒度:每个版本的改动文件列表在对应日志"修改的文件路径"节,可按版本粒度 revert。

---

## 五、已知限制与后续建议

1. **云分辨率切档需重开云**(textureScale 构造期固化);做运行时切换需处理后处理链顺序
   (lensFlare 在云 stage 之后挂载,重建会乱序)——中等风险,评估记录见 perf 日志。
2. **cascade 0/1 的 f32 矩阵精度**:texel <1.4m 时快照量化被 f32 平移精度(~0.5m)部分抵消,
   近距离(<350m 视距)阴影理论上有亚 texel 残余,实际少有地面像素落在该区间。
3. **BSM 层高参数**:layer altitude/height 运行时变更只经 shadowBottom/TopHeight 粗同步,
   minLayerHeights 等细分参数需重建 pass 才更新(既有限制,未改)。
4. **GeoTerrainProvider._getChildTileMask 恒为 0**(`_rectangles` 恒空)——现状可用,
   语义存疑,未动;如改需理解 Cesium upsample 与 availability 的优先级。
5. 验收通过后建议按版本分批 git 提交(规范约定 Agent 不执行 git)。

---

## 六、当日本工作流日志索引(本目录)

- 2026-07-26-fix-cloud-shadow-ground-anchoring.md(V3.4.7)
- 2026-07-26-fix-cloud-shadow-vertical-jitter.md(V3.4.12)
- 2026-07-26-perf-cloud-and-wind.md(V3.4.16)
- 2026-07-26-arcgis-terrain-lerc-worker.md(V3.4.25)
- 2026-07-26-fix-fluid-clear-restore.md(V3.4.26)
- 2026-07-26-message-island-queue-ui.md(V3.4.30)
- 2026-07-26-message-island-polish-round2.md(V3.4.32)
- 2026-07-26-controlspanel-optimize.md(V3.4.34)
- 2026-07-26-terrain-round2-wind-cleanup.md(V3.4.38)

上午另有 V3.4.4 的云影同步层首轮修复日志(2026-07-26-fix-volumetric-cloud-shadow-stability.md),
其"矩阵每帧发布/双缓冲/history reset"仍在生效,与本流水后续修复叠加构成完整方案。
