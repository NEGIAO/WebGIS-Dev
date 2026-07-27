# 第 1 轮修复:天空 Tyndall 垃圾输入 + GeoTerrain 语义 + BSM 层参数运行时同步(V3.4.42)

## 日期和时间

2026-07-27 03:05

## 任务等级

L2(Bug 修复 + 参数同步补全;无文件增删、无配置 key 变更)

> 注:本任务开始时日志创建于旧平铺路径 `26-07-26/`;任务中 Force_command v2 生效,
> 已按新规范迁移至 `26-07/2026-07-26/` 并补齐新必含章节。版本号因并行会话推进顺延为 V3.4.42。

## 修改内容

执行 next-round-plan 第 1 轮(1.1~1.4):天空 pass shadowLength 路径正确性修复、
GeoTerrainProvider childTileMask 语义修正、BSM 层高/密度剖面参数运行时同步、天地图层级评估记录。

## 事件逻辑链分析

### 1.1 天空 pass 的 shadowLength 是垃圾输入(正确性 bug,非预想的热点)

查证结论修正规划中的假设:

```
AtmospherePostProcess 构造:_shadowLengthEnabled = true(默认)
管线/集成层:从未调用 atmosphere.setCloudShadowLength(...)
uniform 兜底:u_shadowLengthBuffer = _shadowLengthTexture ?? transmittanceTexture(Bruneton LUT!)
天空 shader:enabled≠0 → shadowLength = LUT.r(屏幕UV) × scale × tyndallScale(2.5)
```

即:**天空辐射每帧被喂入"把透射率查找表当阴影长度"的伪值**(0~2.5km,随屏幕 UV 变化),
造成天空亮度的隐性空间偏差;而规划中担心的 64 步 `marchShadowLengthAtm` 兜底分支
(enabled==0 才走)实际从未执行——热点假设不成立,真实问题是垃圾输入。

**修复**:
1. `u_shadowLengthEnabled` 绑定改为 `enabled && 纹理确实存在` 才为 1(杜绝 LUT 兜底被采样);
2. 修复后 BSM 开启时会落入 march 兜底 → 为其加护栏:仅在结果会被消费的像素执行
   (`isSky || applyGroundAtmosphere`,本管线 applyGround=false → 仅天空像素),
   步数 64→24(BSM OD 本就低频,视觉无差);BSM 关闭时 shadowLength=0 与旧行为一致。
   净效果:天空丁达尔从"垃圾输入"变为"正确的 BSM 行进",成本有界(天空像素 × 24 步)。

### 1.2 GeoTerrainProvider childTileMask 语义修正

`_getChildTileMask` 依赖 `_rectangles`,而 `_rectangles` 恒为空数组 → mask 恒 0
("所有子瓦片无数据"),与 `getTileDataAvailable`(level<bottomLevel 恒 true)矛盾,
现状靠 Cesium 端 availability 优先才未出错。改为明确语义:
`level + 1 < _bottomLevel ? 15 : 0`,删除死代码 `_getChildTileMask`/`tileIntersects`
与永远为空的 `_rectangles`。

### 1.3 BSM 层高/密度剖面参数运行时同步

面板运行时修改层高(altitude/height)后,主云即时生效,但 BSM 的
minLayerHeights/maxLayerHeights/间隙区间/密度剖面仍是 pass 创建时的旧值
(此前只粗同步 shadowBottom/TopHeight)→ 云体与云影层高错位。
补入 `_syncBSM` 每帧装配 + `updateDynamicParams` 值级检测(自然接入签名门控:
变了才 bump `_paramsRev` 触发重绘,不变零开销)。

### 1.4 天地图层级评估(记录,不改动)

`_bottomLevel=11` 维持:沙箱无法携带 token 实测服务在 z=13+ 的响应与瓦片体积;
盲目放宽会产生大量失败请求。留待真机验证后单独调整(评估路径:临时改 12 观察
Network 面板 z=13 命中率与 fps)。

## 影响范围

- AtmospherePostProcess(天空 Tyndall 路径)、GeoTerrainProvider、CloudShadowPass/
  ThreeGeospatialPipeline(BSM 动态参数);无文件增删、不涉及后端。

## 性能指标

- 天空 pass:每像素 1 次无效 LUT 采样消除;BSM 开启时新增天空像素 24 步行进
  (换来正确丁达尔;BSM 关闭无新增成本);
- BSM 层参数同步走签名门控,面板不动时零额外重绘。

## 测试方案

### Agent 已执行
- 4 个改动 JS 文件 ESLint 零告警;
- shader 分支推演(enabled 门控三态:有纹理/无纹理+BSM 开/全关);
- 门禁:CheckStructureTree.py / CheckConfigRegistry.py(结果见交接块)。
- **未实机运行**,以下均待用户验证。

### 待用户实机验证
1. balanced/ultra 档开 BSM:天空在云影方向出现柔和丁达尔暗带,整体亮度无异常梯度;
2. smooth 档(BSM 关):天空与修复前一致;
3. 面板拖动层 0/1 altitude/height:地面云影层高随动(此前不动);
4. 天地图地形细分行为无回归(childTileMask 改动)。

## 变更文件清单

- `frontend/src/components/Cesium/Cloud/lib/AtmosphereFromThreeGeospatial/AtmospherePostProcess.js` — shadowLength 启用门控(纹理存在才启用)、march 步数 64→24、仅消费像素计算
- `frontend/src/components/Cesium/terrain/GeoTerrainProvider.js` — childTileMask 明确语义 `_computeChildTileMask`,删除死代码(_rectangles/tileIntersects/旧 mask 函数)
- `frontend/src/components/Cesium/Cloud/lib/CloudShadowPass.js` — updateDynamicParams 增补 8 组层高/间隙/密度剖面数组(值级检测)
- `frontend/src/components/Cesium/Cloud/lib/ThreeGeospatialPipeline.js` — _syncBSM 每帧装配上述数组;scratch 扩容
- `README.md` / `Docs/Guide/CHANGELOG.md` / `frontend/README.md` — 版本记录 V3.4.42

## 遗留与风险

- 1.4 天地图 bottomLevel 放宽:需真机携 token 验证,已记录评估路径,本次不动;
- 天空丁达尔修复后 balanced/ultra 档天空观感会变(从伪值变为真实 BSM 暗带),若用户不喜可将
  tyndallScale 调低或在预设关闭(bsmTyndallScale=0);
- 第 2 轮候选(分辨率运行时切换/requestRenderMode 调查等)见 next-round-plan(旧路径日志目录)。
