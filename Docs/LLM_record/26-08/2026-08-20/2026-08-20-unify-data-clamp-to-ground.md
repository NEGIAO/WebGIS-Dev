# 2026-08-20 导入数据统一贴地（借鉴 drawPolygon 贴地方案）（V3.5.29）

## 日期与时间
2026-08-20

## 任务等级
L2（功能增强 + Bug 修复，6 个源码文件 + 3 个版本文档 + 新增 1 个工具文件）

## 问题分析

### 核心症状
开启地形后，导入的 KML/KMZ/CZML/GeoJSON/SHP 等矢量数据（点/线/面/标注）被地形埋没、
不可见；数据若不带海拔，默认落在椭球面高度 0，真实地形开启后高度低于地形表面而被遮挡。

### 根本原因
- `kmlLoader.js` 未传 `KmlDataSource.load` 的 `clampToGround` 选项，也未对加载后实体
  施加贴地属性；`czmlLoader.js` 同样完全没有贴地处理——Cesium 域代码中无一处
  `heightReference`；
- GeoJSON/SHP 加载时虽传了 `clampToGround: true`（点/线/面已贴地），但未补
  `disableDepthTestDistance`，`depthTestAgainstTerrain` 开启或 3D Tiles 起伏下点与标注
  仍可能被深度测试遮蔽；
- 地形切换监听（`ensureTerrainRefitWatcher`）只对 3D Tiles 重配准，矢量数据源在
  「地形关闭时导入 → 后开启地形」场景下无人补贴地。

### 受影响模块
Cesium 数据导入链路（KML/KMZ/CZML/GeoJSON/SHP 加载器）、地形切换监听、
3D 场景渲染（贴地/深度测试）。

## 修改内容
1. **新增 `loaders/clampToGround.js`**（统一贴地工具，借鉴 `drawPolygon.ts` 属性组合）：
   - `isTerrainEnabled(viewer, Cesium)`：terrainProvider 非 EllipsoidTerrainProvider 即
     视为开启真实地形；
   - `clampEntityToGround(Cesium, entity)`：对点/线/面/标注/billboard/柱廊/矩形/椭圆/
     模型实体施加贴地属性：
     - 点/标注 → `heightReference: CLAMP_TO_GROUND` + `disableDepthTestDistance: Infinity`
       （与 drawPolygon 一致）；
     - 线 → `polyline.clampToGround: true`；
     - 面 → `perPositionHeight: false` + `heightReference: CLAMP_TO_GROUND`
       （`perPositionHeight === true` 即数据自带海拔时跳过，保留语义高度）；
     - billboard/corridor/rectangle/ellipse/model 同类处理；
   - 幂等：已贴地不重复修改；已设置非 NONE 高度引用（自带海拔语义）不覆盖；
   - 时间动态实体（`isConstant === false`，如 CZML 采样轨迹/回调位置）自动跳过——
     贴地会拍平动画语义高度；
   - `clampDataSourceToGround(viewer, Cesium, dataSource)`：统一入口——先判断地形，
     未开启则保持数据原始绝对高度（无地形时 CLAMP_TO_GROUND 退化椭球面 0 高，会误压
     带语义高度的数据），返回 `{ clamped, total, terrainEnabled }`。
2. `kmlLoader.js`：KML/KMZ 加载后统一接入贴地（`applyGroundClamping` 局部封装，
   贴地结果以 `console.warn('[贴地] ...')` 输出，与 tilesetLoader 日志风格一致）。
3. `czmlLoader.js`：加载后统一接入贴地。
4. `geojsonLoader.js` / `shpLoader.js`：加载后统一接入贴地（加载期已有 clampToGround，
   此处补 `disableDepthTestDistance` 硬化）。
5. `useCesiumDataImport.js`：地形切换监听（`ensureTerrainRefitWatcher`）扩展——
   3D Tiles 重配准之外，同步对 geojson/kml/kmz/shp/czml 矢量数据源补贴地
   （贴地幂等，重复执行无副作用）；汇总提示信息。

## 修改原因
开启地形后导入数据不可见是高频痛点（3D 场景标配地形叠加，数据必须贴地显示）；
贴地不是导入时刻的一次性动作，地形开启/切换后需自动补齐；现有实现各格式贴地行为
不一致，需要统一入口。

## 影响范围
Cesium 3D 场景数据导入（KML/KMZ/CZML/GeoJSON/SHP）、地形切换自动贴地、
3D Tiles 重配准联动提示。

## 性能指标
未实测。贴地属性修改为一次性 O(n) 遍历（实体数），地形切换监听仅在有矢量数据源时
触发，开销可忽略。

## 测试方案
### Agent 已执行
- 编写 node 可执行单测（mock Cesium 命名空间 + 带 setter 包装的 mock 实体），实机运行：
  - `isTerrainEnabled`：真实地形/椭球地形/无 provider 三态判定 ✓
  - `clampEntityToGround`：点/线/面/标注/billboard/corridor/rectangle/ellipse/model
    贴地属性正确写入 ✓；幂等（二次执行零修改）✓；RELATIVE_TO_GROUND 与
    `perPositionHeight: true` 的自带海拔实体不覆盖 ✓；时间动态实体跳过 ✓
  - `clampDataSourceToGround`：地形关闭 → `clamped=0`；地形开启 → 2/3 实体贴地
    （动态实体跳过）；重复执行幂等 ✓
- `npx eslint`（6 个改动源文件）：0 报错；
- `python CheckStructureTree.py`、`python CheckConfigRegistry.py`：通过。

### 待用户实机验证
1. 开启地形 → 导入 KML/KMZ（含点/线/面）→ 数据贴合地形表面显示、不埋没；
   标注文字随地形起伏贴地。
2. 开启地形 → 导入 CZML（静态点线面）→ 贴地；带采样轨迹（时间动态）的 CZML
   轨迹保持原始海拔不被拍平。
3. 先导入数据（地形关闭）→ 再开启地形 → 矢量数据自动补贴地（控制台输出
   「地形已切换，N 个矢量实体已贴地」提示）。
4. 3D Tiles 切换地形后仍自动重贴地（既有行为不回退）。

## 变更文件清单
| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/clampToGround.js` | 新增：统一贴地工具（地形判断 + 点/线/面贴地属性） |
| `frontend/src/domains/cesium/composables/dataImport/loaders/kmlLoader.js` | KML/KMZ 加载后接入统一贴地 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/czmlLoader.js` | CZML 加载后接入统一贴地 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/geojsonLoader.js` | GeoJSON 加载后补 disableDepthTestDistance 硬化 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/shpLoader.js` | SHP 加载后补 disableDepthTestDistance 硬化 |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | 地形切换监听扩展：矢量数据源自动补贴地 |
| `README.md` | 版本号三处更新（V3.5.29）+ 版本演进表 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.29 条目 |
| `Docs/Guide/frontend-structure.md` | 结构树登记 clampToGround.js |

## 遗留与风险
- **GLB/GLTF 模型**：保持现有「地形采样 + 抬升放置」方案（模型贴地受
  `Model.heightReference` 深度测试/版本约束，改动风险高，未纳入本次范围）；
  另发现 `gltfLoader.js` 采样失败时会整体关闭地形
  （`viewer.terrainProvider = new EllipsoidTerrainProvider()`）——该兜底会把整个场景的
  地形关掉，属于「修 A 时发现的 B」，已记录至
  `Docs/TODO/bugfix-optimization-plan.md`（待后续单独处理）。
- **TIF 影像**：ImageryLayer 天然贴合地形表面（影像随地形起伏），无需贴地处理。
- **KML 线要素**：KML 若使用 relativeToGround 海拔（极少见），贴地会压平其相对高度；
  属可接受取舍（GIS 边界/道路类数据绝大多数高度为 0）。

## 涉及配置文件
无（不涉及环境变量/配置 key）。