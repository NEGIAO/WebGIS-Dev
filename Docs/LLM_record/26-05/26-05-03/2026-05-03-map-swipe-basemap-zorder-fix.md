# 2026-05-03 维护日志 - 卷帘仅裁剪底图，避免业务图层被遮挡

## 日期和时间
2026-05-03 10:30

## 修改内容
- 修复卷帘分析开启后右侧仅显示底图、TOC 业务数据被遮挡的问题。
- 收敛卷帘作用范围，使其只影响在线底图层，不裁剪业务图层、矢量图层和 TOC 图层。
- 调整右侧 compare basemap 的图层顺序，避免其压住数据层。
- 同步更新项目 README 的目录树与版本说明。

## 修改原因
卷帘功能当前通过 OpenLayers 的 prerender/postrender 对底图进行裁剪，但右侧 compare basemap 的 zIndex 设置过高，导致其渲染顺序高于业务数据层。结果是右侧区域只有底图，TOC 中的地图数据被盖住，看起来像“右侧没有对应数据”。

## 影响范围
- `frontend/src/components/MapContainer.vue`
- `frontend/src/composables/useMapSwipe.ts`
- `frontend/src/stores/useLayerStore.ts`
- `frontend/README.md`
- `README.md`
- `backend/README.md`

## 优化解决方案
1. 分析当前渲染链路，确认卷帘只应作用于在线底图层，不能扩散到业务图层。
2. 将右侧 compare basemap 的 zIndex 从“全局置顶”调整为“底图层级”，保证其始终位于业务数据层下方。
3. 保持 swipe 裁剪逻辑不变，只调整图层叠放顺序，让右侧数据层正常覆盖在底图之上。
4. 保留卷帘状态持久化与位置限制逻辑，避免引入新的交互回退。
5. 同步更新 README 目录树和版本记录，补充本次修复说明。

## 性能指标
- 本次修复不引入新的网络请求或重绘策略，性能开销保持不变。
- 图层渲染顺序调整仅影响 zIndex，不增加额外 CPU 或内存占用。

## 测试方案
1. 本地启动前端，启用卷帘分析。
2. 在 TOC 中加载任意矢量数据、用户图层或业务图层。
3. 验证左右两侧都能看到相同的业务数据叠加在底图之上。
4. 验证拖动卷帘时，仅底图随分割线裁剪，业务数据不受裁剪影响。
5. 在部署环境复测，确认右侧不再出现“只有底图、没有数据”的现象。

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useMapSwipe.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useLayerStore.ts`
- `d:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `d:\Dev\GitHub\WebGIS_Dev\README.md`
- `d:\Dev\GitHub\WebGIS_Dev\backend\README.md`
