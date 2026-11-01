# requestRenderMode 按需渲染方案(L3 · P1~P3 已全部实施,待实机验收)

> 渲染/性能工作流 2.2 项的调查报告与实施方案。**L3 级:未经用户批准不实施。**
> **状态(2026-07-27)**:P1 已实施 V3.4.61(管理器+四特效接入,总开关 false);
> P2+P3 已实施 **V3.4.64**(用户授权「直接全部执行」):总开关置 **true 生效**、全库静态普查唯一缺口
> (3D Tiles 材质模式)已补 requestRender、maximumRenderTimeChange=5s 维持、FPS 面板保留。
> 日志:[`P1`](../LLM_record/26-07/2026-07-27/2026-07-27-requestrendermode-p1.md) /
> [`P2+P3`](../LLM_record/26-07/2026-07-27/2026-07-27-requestrendermode-p2-enable.md)。
> 实施微调:①接口带 viewer 参数(WeakMap 按实例隔离);②流体 release 挂点 cleanup(true)→destroyFluidOnly(重建水体路径防计数泄漏);
> ③开放问题定性:高级特效相机驱动不接计数仅补开关 requestRender、FrameRate 被动采样不阻断、热带浅水独立 canvas 无需接入。
> **剩余:用户实机冒烟(清单见 P2 日志)——回归即补点 requestRender,大面积异常总开关一行回退。**
> 关联:`Docs/LLM_record/26-07/2026-07-26/2026-07-26-next-round-plan.md`(本流水规划)、
> `bugfix-optimization-plan.md`(并行流水计划,无重叠)。

## 一、实施前调查结论(只读普查,2026-07-27)

| 事实 | 依据 |
|------|------|
| 实施前全应用恒为连续渲染 | 当时全库无 `requestRenderMode` 引用;Cesium 默认 false |
| 时钟持续动画 + 太阳光照随时间 | Viewer `shouldAnimate:true`、timeline/animation 控件、`configureSolarLighting` |
| 静止无特效时整条管线仍每帧执行 | 地球渲染 + 后处理链全速跑,GPU 满负荷(笔记本发热/掉电直观) |
| 实施前已有 35 处显式 `requestRender` 调用(12 文件) | 近期优化中补齐的,按需渲染的良好基础 |
| 逐帧消费者(开启期间必须连续渲染) | 体积云管线(preRender BSM/offsets)、风场粒子(compute passes)、流体模拟(postRender 时间步)、人物漫游(逐帧位移)、洪水动画(含于流体)、CesiumAdvancedEffects(⚠️ 未验证其是否逐帧)、useCesiumFrameRate |
| 相机/瓦片/实体变化 | Cesium 在 requestRenderMode 下自动触发,无需手工覆盖 |

**收益判断**:主收益场景 = "3D 视图开启、相机静止、四大特效全关"(看底图/查属性/挂后台),
GPU 可从满载降至近零;特效开启期间无收益(本就需要连续渲染)。

## 二、方案设计

新增 `composables/interaction/useCesiumRenderMode.js`(计数器管理器):

```
acquireContinuous(tag) / releaseContinuous(tag)
  count > 0  → scene.requestRenderMode = false(连续)
  count == 0 → scene.requestRenderMode = true
               scene.maximumRenderTimeChange = 5(秒;时钟推进超过即自动重渲一帧,
               太阳光照以 ~0.2Hz 缓慢刷新,时间轴控件仍可用)
```

接入点(acquire/release 成对):

| 消费者 | acquire | release |
|--------|---------|---------|
| 体积云 | setupCloudIntegration ensurePipeline 成功 | teardownPipeline |
| 风场 | useCesiumWind loadWindFromGlobe 成功 | clearWind2D |
| 流体 | FluidSimulationPanel prepareScene(创建时) | cleanup(true) |
| 人物漫游 | usePlayerController start | stop/destroy |
| 高级特效 | 调查后按需(若逐帧) | 同左 |

保险机制:
1. **总开关常量** `ENABLE_REQUEST_RENDER_MODE`(useCesiumRenderMode 内,默认 false 上线观察,
   置 true 后生效)——出问题一键回退连续渲染;
2. 管理器销毁/异常时恢复连续渲染(fail-open);
3. 交互后兜底:已有 35 处 requestRender + Cesium 自动触发覆盖绝大多数;冒烟中发现"画面不刷新"
   的操作点逐个补 `scene.requestRender()`(预期少量)。

## 三、分阶段实施(已完成)

| 阶段 | 内容 | 预估 |
|------|------|------|
| P1 | 管理器 + 五处接入 + 总开关默认 false;ESLint/门禁/日志 | 0.5 天 |
| P2 | 总开关置 true,全功能冒烟(重点:图层增删/样式改/定位/测量绘制/属性表联动/时间轴拖动),补漏 requestRender | 0.5~1 天 |
| P3 | maximumRenderTimeChange 调参(5s 起)、debugShowFramesPerSecond 是否保留评估 | 0.5 天 |

## 四、风险与开放问题

- ⚠️ 未验证:CesiumAdvancedEffects(高度雾/HBAO/移轴)是否含逐帧动画 → P1 实施时先读代码定性;
- 遗漏逐帧消费者的表现是"该动的不动"(冻结),不会崩溃;总开关可即时回退;
- FPS 显示(debugShowFramesPerSecond)在按需模式下数值语义变化(渲染帧率≠交互流畅度),
  可能需要移到调试开关;
- 时间轴拖动/播放倍速调整时,maximumRenderTimeChange 机制保证跟手性(时间大步进即重渲)。

## 五、决策记录

- [x] 已批准并完成 P1~P3 实施(P1=V3.4.61,P2+P3=V3.4.64,总开关已置 true 生效)
- [ ] 回退选项:若实机出现大面积「画面不刷新」回归,将 `ENABLE_REQUEST_RENDER_MODE` 改回 false 恢复连续渲染

> **状态(2026-07-27 08:49 更新)**:P1~P3 全部实施完毕(P1=V3.4.61,P2+P3=V3.4.64,总开关已置 true 生效)。
> 剩余:用户实机冒烟验收(清单见 P2 日志「待用户实机验证」节)。
