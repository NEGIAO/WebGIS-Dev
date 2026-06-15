# 2026-06-15  Google Photorealistic 3D Tiles 接入

## 修改时间
2026-06-15 15:20

## 修改内容
- 将 Cesium 中原有的 Google 影像底图入口扩展为可切换的 Google Photorealistic 3D Tiles 真实 3D 模型叠加层。
- 在 Cesium 场景中补充 Google geocoder 兼容配置，满足 Photorealistic 3D Tiles 的官方约束。
- 同步更新项目 README 结构说明，补充本次 3D Tiles 接入能力。

## 修改原因
- 用户当前需求不是普通 Google 影像，而是 Google 的真实 3D 模型 / 倾斜摄影效果。
- 仓库内原有 `google` 入口仅指向影像瓦片代理，无法满足真实 3D 场景展示。
- Cesium 官方 API 已提供 `createGooglePhotorealistic3DTileset`，适合直接接入现有 Cesium 管线。

## 影响范围
- `frontend/src/components/Cesium/composables/useCesiumLayers.js`
- `frontend/src/components/Cesium/CesiumContainer.vue`
- `frontend/README.md`
- `README.md`
- `backend/README.md`

## 问题分析
- 核心症状：`google` 相关配置实际是影像瓦片，不是 3D Tiles。
- 根本原因：图层系统把 Google 能力绑定到了 imagery provider，而 Google Photorealistic 3D Tiles 需要以 `Cesium3DTileset` 形式挂载到 `scene.primitives`。
- 受影响模块：Cesium 底图/叠加层编排、viewer 初始化、图层开关 UI、场景 globe 可见性。

## 优化解决方案
1. 保留原有 Google 影像底图入口，避免破坏现有用户习惯。
2. 新增独立的 `Google真实3D模型` 叠加层选项，使用 `createGooglePhotorealistic3DTileset` 加载。
3. 通过独立加载态、卸载态和取消令牌编号，避免重复点击导致的竞态覆盖。
4. 加载成功后隐藏 globe，关闭时恢复 globe，保持与 Photorealistic 3D Tiles 的场景预期一致。
5. 启动 Cesium viewer 时显式启用 Google geocoder 兼容配置，满足官方 API 约束。

## 性能指标
- 本次变更未做基准压测，没有新增可量化性能数据。
- 通过 `cacheBytes` 和 `maximumScreenSpaceError` 使用官方默认策略，避免额外引入非必要的性能回退。

## 测试方案
- 已执行静态语法/错误检查，确认修改文件无报错。
- 验证内容：
  1. Cesium 启动后能正常创建 viewer。
  2. 打开图层面板后可看到 `Google真实3D模型` 选项。
  3. 开启后可触发 Photorealistic 3D Tiles 加载。
  4. 关闭后 globe 恢复显示，场景不残留重复 tileset。

## 修改的文件路径
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\composables\useCesiumLayers.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\Cesium\CesiumContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md