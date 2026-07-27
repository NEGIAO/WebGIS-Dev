# ArcGIS 地形卡顿底层优化维护日志(LERC 解码下放 Worker,V3.4.25)

## 日期和时间

2026-07-26 23:20

## 修改内容

ArcGIS 世界地形(elevation3d Terrain3D)加载卡顿的底层修复:把每瓦片的 LERC 解压从主线程移入 Web Worker 池。

## 修改原因 / 事件逻辑链分析

### 根因:Cesium 原生 provider 在主线程同步解码 LERC

`Cesium.ArcGISTiledElevationTerrainProvider.requestTileGeometry` 的内部流程:

```
fetchArrayBuffer(tile/{z}/{y}/{x})  →  LercDecode.decode(buffer)   ← 主线程同步!
                                    →  new HeightmapTerrainData(...)
                                    →  (网格化在 Cesium worker 中进行 ✓)
```

每张 257×257 LERC 瓦片解码约 2~6ms(纯 JS 解压 + Float32 展开)。缩放/飞行时一次涌入
30~80 张瓦片,主线程被解码占满 100~400ms(与渲染帧交错) → 表现为拖动/缩放时明显卡顿。
此前的缓解手段(V3.4.x:关 Tilemap 二次请求、层级硬顶 11、SSE 动态 6/12、缓存 1000)
只减少了"解码次数",没有解决"解码在主线程"这一根本问题;SSE=6 的补丁还牺牲了地形精细度。

对照:天地图 GeoTerrainProvider 与 Cesium World Terrain 的重活(解压/转码/网格化)
均在 worker 侧,主线程只做调度,故不卡。

### 修复:包装器内重写 requestTileGeometry,LERC 解码进 Worker 池

```
主线程: inner._resource.getDerivedResource(tile/{z}/{y}/{x}, request)   ← 保留 RequestScheduler 节流/取消
        fetchArrayBuffer() → postMessage(buffer, [transfer])            ← 零拷贝
Worker:  Lerc.decode(buffer)(npm lerc 3.0.0,纯 JS UMD,无 WASM)
         mask 空洞填 0 → postMessage(pixels, [transfer])                 ← 零拷贝
主线程: new HeightmapTerrainData({ buffer: pixels, width, height,
         structure: inner._terrainDataStructure(运行时读取,带默认兜底),
         childTileMask: level>=cap ? 0 : 15 })
```

- Worker 池 2 个实例,round-robin 派发,id 关联请求;
- Worker 创建失败(CSP 等)→ 整体回退原生 `inner.requestTileGeometry` 路径(行为同现状);
- 解码失败(非 LERC 错误响应)→ reject,交给 Cesium 正常的瓦片失败/上采样处理;
- 保留增量 TileAvailability 标记与层级硬顶 11。

### 联动调整:放宽 SSE 补丁

解码离开主线程后,"移动期 SSE=12"的极端粗化补丁不再必要:
移动 12→8、静态统一 4(原初始 6 / moveEnd 4 不一致),地形更细且不再有细分风暴顾虑。

## 影响范围

- `terrain/ArcGISTerrainProvider.js`(重写 requestTileGeometry + Worker 池)
- 新增 `terrain/lercDecode.worker.js`(文件树同步:frontend-structure.md)
- `useCesiumLayers.js applyTerrainSceneFlags`(SSE 数值)
- 不影响天地图/Cesium World/椭球地形路径;不涉及后端。

## 性能指标(理论,待实测)

- 主线程每瓦片解码 2~6ms → ~0(仅 postMessage 与 HeightmapTerrainData 构造,<0.2ms);
- 缩放/飞行瓦片风暴期主线程解码累计 100~400ms → 消除,卡顿应显著缓解;
- SSE 4/8 相比 6/12:静态与移动中的地形精细度均提升。

## 测试方案

### 已执行
- 改动 JS 文件 ESLint 零告警;lerc 3.0.0 确认为纯 JS UMD(无 wasm 加载需求),Worker 内可直接 import。
- 结构复核:Worker 池提升至真正的模块作用域(工厂每次切地形都会被调用,若声明在工厂内仍会重复建池);
  Worker onerror → `_failAll` 拒绝全部挂起解码并永久回退原生路径,杜绝解码 Promise 悬死;
  瓦片 URL 派生方式(`getDerivedResource('tile/{z}/{y}/{x}')`)与 Cesium 内部一致,节流/取消语义保留。
- 文件树已同步 frontend-structure.md(新增 lercDecode.worker.js)。

### 需人工验证
1. 切换到 ArcGIS 世界地形,山区(如横断山脉)连续缩放/拖动/飞行:帧率稳定,无周期性卡顿;
2. 对照天地图地形操作手感应接近;
3. `sampleTerrainMostDetailed` 拾取高程仍正常(availability 链路未变);
4. 断网/服务 4xx 时瓦片失败降级正常,无控制台异常刷屏;
5. 关闭再开启地形、三种地形来回切换 5 次无泄漏/报错。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\ArcGISTerrainProvider.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\terrain\lercDecode.worker.js(新增)
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\layers\useCesiumLayers.js
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md(文件树)
- D:\Dev\GitHub\WebGIS-Dev\README.md / Docs\Guide\CHANGELOG.md / frontend\README.md(版本记录)
