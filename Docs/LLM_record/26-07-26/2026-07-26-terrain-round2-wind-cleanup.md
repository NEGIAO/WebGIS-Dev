# 地形二次调优 + 天地图解码下放 Worker + 风场收尾维护日志(V3.4.38)

## 日期和时间

2026-07-27 02:00

## 修改内容

延续 V3.4.25 的地形优化路线:天地图地形解码下放 Worker(默认地形,受众最大)、ArcGIS 参数二次调优、风场 vendored 库两处真实缺陷修复与构建产物清理、Force_command 版本说明纠偏。

## 事件逻辑链分析

### 1. GeoTerrainProvider(天地图,默认地形)——与 ArcGIS 同病的主线程解码

`requestTileGeometry` 链路:`fetchArrayBuffer → pako inflate(主线程) → _transformBuffer
(64×64 逐像素编码,主线程) → HeightmapTerrainData`。瓦片风暴期 inflate 每瓦 0.5~2ms
同样堆积在主线程。天地图是应用默认地形,受众比 ArcGIS 更大。

**修复**:复用 V3.4.25 的思路,抽通用 `decodeWorkerPool.js`(worker 工厂 + round-robin +
失效拒绝挂起并永久回退),新增 `geoTerrainDecode.worker.js`(pako inflate + int16/float
高程 → RGBA 编码,双向 Transferable);Worker 不可用回退原主线程路径。
`ArcGISTerrainProvider` 内联的 LercWorkerPool 迁移至共享池模块(行为不变)。
附带修复:`_transformBuffer` 返回 null(长度异常)时原样传给 HeightmapTerrainData 会构造异常,
改为显式 reject 交给 Cesium 瓦片失败处理。

### 2. ArcGIS 二次调优(解码离开主线程后的参数下探)

- `MAX_LEVEL_CAP` 11→12(~19m→~9.5m,山区细节更好;请求增量由 Worker 解码与 SSE 控制吸收);
- `applyTerrainSceneFlags` SSE 静态4/移动8 → 静态3/移动6。

### 3. cesium-wind-layer vendored 库两处真实缺陷

- **监听移除失效(泄漏)**:`removeEventListeners` 里 `this.updateViewerParameters.bind(this)`
  每次生成新函数,`removeEventListener` 永远匹配不上 → 风场销毁后 camera.changed/resize
  监听仍在,重复开关风场累积泄漏。改为构造时缓存 bound 引用,add/remove 同一引用。
- **percentageChanged 全局副作用**:构造时把 `viewer.camera.percentageChanged` 全局改为 0.01
  (影响整个应用所有 camera.changed 监听的触发频率),销毁不恢复。改为快照原值、销毁时恢复。
- **构建产物清理**:仅 `index.mjs` 被引用;删除未使用的 CJS 构建产物 `index.js`、`index.js.map`
  及失真的 `index.mjs.map`、重复类型 `index.d.mts`(均不在文件树登记内,树无需变更;
  index.d.ts 保留作类型参考)。

### 4. Force_command.md 版本说明纠偏

规范文档写死"当前版本 V3.4.1",与实际(V3.4.3x)严重脱节,会误导后续 Agent 判断版本号。
改为"以根 README.md 项目简介行为唯一权威来源"。

## 影响范围

- 地形模块(天地图/ArcGIS)、风场 vendored 库、规范文档;不涉及后端。
- 新增 `terrain/decodeWorkerPool.js`、`terrain/geoTerrainDecode.worker.js`,
  删除 cesium-wind-layer 4 个未引用构建产物 → 文件树同步 frontend-structure.md。

## 性能指标

- 天地图地形瓦片风暴期主线程 inflate+变换(每瓦 ~0.6~2.5ms)→ ~0;
- ArcGIS 地形精细度提升一级(SSE 3、L12),卡顿风险由 Worker 解码兜底;
- 风场反复开关不再累积 camera/resize 监听;应用级 camera.changed 触发频率在风场关闭后恢复默认。

## 测试方案

### 已执行
- ESLint 全部改动文件零告警;wind 引用核查(仅 index.mjs 被引用)后删除产物;
- Worker 协议与回退路径与 V3.4.25 同构(onerror → 拒绝挂起 + 永久回退)。

### 需人工验证
1. 默认(天地图)地形:山区连续缩放/拖动流畅,高程拾取正常;断网瓦片失败降级正常;
2. ArcGIS 地形:细节较此前更清晰,滚轮缩放无卡顿回归;
3. 风场开→关→开 3 次:粒子正常,关闭后拖动地图无多余 updateViewerParameters 触发(可断点验证);
4. `npm run dev` 构建无 wind 相关缺文件报错。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\decodeWorkerPool.js(新增)
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\geoTerrainDecode.worker.js(新增)
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\GeoTerrainProvider.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\ArcGISTerrainProvider.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\layers\useCesiumLayers.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\cesium-wind-layer\index.mjs(+ 删除 4 个未引用产物)
- D:\Dev\GitHub\WebGIS-Dev\Docs\Force_command.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md(文件树)
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
