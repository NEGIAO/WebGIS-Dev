# Docs/Demo —— 功能演示与样例数据（**非文档**）

> ⚠️ **本目录不是文档目录。** 它是可独立打开的功能演示页与三维样例数据的存放处，不参与 `Docs/` 的文档体系（不受 `project-structure.md` 的文档树治理约束）。

---

## 一、这里有什么

| 内容 | 数量 | 说明 |
|---|---:|---|
| `*.html` | 20 | 独立可打开的功能演示页（无需构建，直接用浏览器打开） |
| `DrawManager.js` | 1 | 绘制管理器参考实现，被 `draw_manager.html` 引用 |
| `data/` | 381 `.b3dm` + 285 `.json` + 13 `.glb` | 3D Tiles 瓦片与模型样例，供演示页加载 |
| `textures/` | 图片资源 | 演示用贴图 |

**演示页清单（按能力归类）**：

- **三维特效**：`atmosphere.html`（大气）、`mapTheme.html`（地图主题）、`buildingShade.html`（建筑阴影）
- **空间分析**：`slopeAnaysis.html`（坡度）、`submergeAnalysis.html`（淹没）、`height_limit_analysis.html`（限高）、`3dHeatMap.html`（热力）
- **数据可视化**：`2dWindField.html`（风场）、`odFlyLine.html`（OD 飞线）、`immensePointLoader.html`（海量点）、`dynamicLable.html`（动态标注）、`customDashArrow.html`（虚线箭头）
- **交互与漫游**：`first_person_fly.html`（第一人称漫游）、`draw_manager.html`（绘制管理）、`nearGroundBox.html`（近地面盒）
- **坐标与底图**：`amapRectify.html`（高德纠偏）、`beidou.html`（北斗）

---

## 二、`data/` 与 `textures/` 不在仓库里

这两个目录被根 `.gitignore` 排除：

```gitignore
Docs/Demo/data
Docs/Demo/textures
```

**因此 clone 后演示页会加载失败**——这是预期行为，不是 bug。需要复现某个演示时，自行把对应瓦片 / 模型放进 `data/`。

> 全量数据约 **260 MB**，不适合入库。

---

## 三、为什么本目录没有被迁走

V3.6.37 文档治理时评估过把 `Docs/Demo/` 迁到根级 `sandbox/` 或 `examples/`，**结论是不迁**：

1. 20 个 HTML 以**相对路径**引用 `data/`、`textures/`，迁移必断链；
2. `data/` 与 `textures/` 已被 gitignore，**不在仓库内**，迁移对仓库体积零收益；
3. 迁到根级会给根目录新增一个非标准目录，与「根级目录树唯一权威」的简洁性冲突。

**替代做法**：就地保留 + 本文件声明语义 + 在 `Guide/project-structure.md` 中标注「非文档」。

---

## 四、这些演示的用途

它们不是产品功能，而是**参考实现**：新增类似能力（如新的空间分析工具）时，先在这里找到对应演示，确认交互形态与参数含义，再迁移进 `frontend/src/domains/cesium/` 的正式模块。

历史方案文档中多处引用本目录，例如：

- `Docs/TODO/route-fly-module-plan.md` 参考 `first_person_fly.html`
- `Docs/TODO/cesium-toolpanel-migration-plan.md` 参考 `draw_manager.html`

---

## 相关文档

| 文档 | 用途 |
|---|---|
| [`../Guide/project-structure.md`](../Guide/project-structure.md) | 目录树（含本目录的定位标注） |
| [`../Force_command.md`](../Force_command.md) | Agent 行为规范 |
