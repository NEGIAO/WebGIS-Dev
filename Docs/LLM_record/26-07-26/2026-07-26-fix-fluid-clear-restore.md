# 水体流体"清除"未还原场景状态修复维护日志(V3.4.26)

## 日期和时间

2026-07-26 23:55

## 修改内容

修复水体流体效果点击「清除」后,画面上的"效果层"依然存在的问题。

## 修改原因 / 事件逻辑链分析

### 现象

1. 点击「捕捉高度图」的瞬间(尚未选点、尚无水体),画面即出现一层整体效果变化;
2. 点击「清除」后,水体消失,但这层效果不消失。

### 链路与根因

```
startPickHeightMap()
  └─ prepareScene(viewer)
       ├─ 快照并翻转 8 个全场景开关:
       │    viewer.shadows=true、resolutionScale=1、msaaSamples=4、
       │    globe.depthTestAgainstTerrain=true、logarithmicDepthBuffer=true、
       │    highDynamicRange=true、fog.enabled=true、
       │    globe.showGroundAtmosphere=true、skyAtmosphere.show=true、
       │    globe.enableLighting=true
       └─ postProcessStages.add(skyStage)   ← 全屏大气/色调后处理(1-exp(-2.2c) 曲线)
                                               "一打开就有一层效果"的直接来源

clearFluid()
  └─ cleanup(false)          ← restoreSceneState=false
       ├─ 销毁 FluidRenderer(水体本体,正常)
       ├─ 移除 skyStage(正常)
       └─ ✘ restoreScene() 不执行 —— 8 个场景开关全部残留
            (HDR 色调偏移 + 全球昼夜光照 + 阴影 + 地气,视觉上就是"效果没关掉")

closePanel()
  └─ cleanup(true) → restoreScene()  ← 唯一还原路径;但面板以 headless 模式挂载,
                                        工具面板只暴露 pick/floodSim/clear,close 永远不会触发
```

根因:`clearFluid()` 使用 `cleanup(false)`,场景快照还原(`restoreScene`)被跳过,
而还原入口 `closePanel()` 在 headless 集成下不可达。

### 修复

`clearFluid()` 改调 `cleanup(true)`:清除水体的同时还原全部场景开关快照
(快照在 restoreScene 内置空,下次捕捉会重新快照,重复开关无状态污染)。
`FluidRenderer.destroy()` 本身(primitives/监听/纹理/高度图)经查完整,无需改动。

## 影响范围

- `FluidSimulation/FluidSimulationPanel.vue` 单行语义修复;不涉及运行时渲染管线、不涉及后端、无文件增删。

## 优化解决方案(实施步骤)

1. `clearFluid()`:`cleanup(false)` → `cleanup(true)`,并补注释说明 headless 集成下清除即还原。

## 性能指标

- 无性能影响;清除后 HDR/阴影/MSAA 等重开销开关随之关闭,场景回到流体开启前的性能水平(此前残留反而白耗)。

## 测试方案

### 已执行
- ESLint 零告警;链路复核:cleanup(true) → restoreScene 置空 sceneSnapshot,再次捕捉重新快照,反复 开/清 无累积污染。

### 需人工验证
1. 打开水体流体 → 点「捕捉高度图」→ 选点生成水体 → 点「清除」:水体与整屏效果层全部消失,画面回到开启前观感(色调/光照/阴影一致);
2. 未选点仅处于"等待选点"状态时直接点「清除」:效果层同样消失;
3. 反复 捕捉→清除 5 次:无残留、无报错;
4. 洪水模拟进行中点「清除」:动画停止且场景还原。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\FluidSimulation\FluidSimulationPanel.vue
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
