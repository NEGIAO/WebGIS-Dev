# 下一轮修 Bug 与优化规划(渲染/性能工作流)

> 基于 2026-07-26 交接文档(handover-rendering-optimization.md)制定;按优先级分三轮,
> 每项标注 类型/价值/风险/预估规模。执行时仍遵循 Force_command:先分析文档、再代码、后日志。

---

## 第 0 轮(前置,阻塞后续):实测验收与回归修复

| # | 内容 | 说明 |
|---|------|------|
| 0.1 | GPU 实测验收 | 跑交接文档第三节全部 checkbox(云三档/地形双源/风场/流体/消息/日志);逐项记录结果 |
| 0.2 | 回归修复 | 实测暴露的问题优先于一切新工作;修完按版本粒度提交(用户执行 git) |

不验收就继续叠改动,回归定位成本会指数上升。**本轮完成前不开启第 1/2 轮。**

---

## 第 1 轮:修 Bug / 隐患(高价值低风险优先)

| # | 内容 | 类型 | 价值 | 风险 | 规模 |
|---|------|------|------|------|------|
| 1.1 | **Tyndall 兜底热点查证**:balanced 档 `shadowLengthEnabled=false + useShadowBuffer=true` 时,AtmospherePostProcess 天空 pass 走 `marchShadowLengthAtm` 兜底——每像素 64 步 × 每步最多 4 次矩阵乘 + BSM 采样,疑似 balanced 档隐藏大热点。查证后:降步数(64→16 自适应)或预设显式关闭兜底 | 性能 | 高 | 低 | 小 |
| 1.2 | **GeoTerrainProvider childTileMask 语义修正**:`_rectangles` 恒空 → mask 恒 0(子瓦片全"无数据"),现依赖 getTileDataAvailable 兜底工作。改为 `level+1 < _bottomLevel ? 15 : 0` 的明确语义,消除 upsample/请求判定的隐患 | bug | 中 | 低 | 小 |
| 1.3 | **BSM 层高参数运行时同步**:面板改 layer altitude/height 后,BSM 的 minLayerHeights/maxLayerHeights/密度剖面仍是 pass 创建时旧值(现只粗同步 shadowBottom/TopHeight)→ 云体与云影层高错位。补进 updateDynamicParams(值级检测,天然接入签名门控) | bug | 中 | 低 | 中 |
| 1.4 | **天地图地形层级评估**:`_topLevel=5/_bottomLevel=11` 硬编码;解码已下放 Worker,评估 bottomLevel 放宽(需先确认天地图服务实际最深层级与瓦片体积) | 优化 | 中 | 中 | 小 |

## 第 2 轮:性能与体验优化

| # | 内容 | 类型 | 价值 | 风险 | 规模 |
|---|------|------|------|------|------|
| 2.1 | **云分辨率运行时切换**:切质量预设免重开体积云。方案:管线内重建 cloud stage 时同步摘除/回挂 lensFlare stage 保序(或 LensFlare 提供 detach/attach);init 缓存两种 shader 变体避免异步重建 | 体验 | 高 | 中 | 中 |
| 2.2 | **requestRenderMode 调查**:确认应用是否常开连续渲染;若是,评估"无体积云/风场/流体等连续特效时启用 requestRenderMode + 显式 requestRender"——静止场景 GPU 占用可大幅下降。涉及全应用交互点普查,先出调查报告再决定 | 性能 | 高 | 高 | 大 |
| 2.3 | **LogMonitor 虚拟滚动**:2500 行 DOM 全量渲染(V3.4.34 已修 key/裁剪,DOM 量仍在);仅渲染视口 ±30 行。使用频率不高,排在后面 | 性能 | 中 | 低 | 中 |
| 2.4 | **流体 prepareScene 时机后移**:现"开始选点"即翻全场景开关(画面先变一层);移到"水体成功创建后",选点阶段保持原画面 | 体验 | 中 | 低 | 小 |

## 第 3 轮:代码健康(可与上两轮穿插)

| # | 内容 | 说明 |
|---|------|------|
| 3.1 | 风场 uniform 回调 GC 微优化 | index.mjs 多处 uniform 每帧 `new Cartesian2`;scratch 复用(参考云管线 _scratch 模式) |
| 3.2 | cesium-wind-layer/index.d.ts 校准 | 本地改动(clamp/监听/快照)后类型声明与实现漂移;低优先 |
| 3.3 | cascade 0/1 f32 精度残余 | 交接文档已知限制 2;仅当近距(<350m)阴影实测可见抖动才处理(方案:矩阵平移改相对锚点) |

---

## 执行约定

1. 每轮开工前重读交接文档"关键机制与不变量"节,防止破坏 BSM 四不变量与 Worker 回退契约;
2. 每项独立日志 + 版本号(README 权威),改动文件列表完整,便于按版本 revert;
3. 2.2(requestRenderMode)必须"先调查报告、后动代码",影响面全应用;
4. 并行工作流(配置/账号/属性表)的遗留项(如 api/backend.js 待 git rm)归其原流水,本规划不接管。

## 建议节奏

- 半天:第 0 轮(验收 + 回归修复);
- 一天:第 1 轮全部(1.1→1.4 顺序执行);
- 一天:2.1 + 2.4 + 穿插 3.1;
- 单独排期:2.2 调查报告 → 决策 → 实施;2.3 视日志监控使用反馈决定做否。
