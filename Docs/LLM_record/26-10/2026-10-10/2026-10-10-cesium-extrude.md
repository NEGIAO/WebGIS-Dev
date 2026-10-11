# 2026-10-10 Cesium 建筑白模拔高 → V3.6.13

## 日期与时间

2026-10-10（会话内执行）

## 任务等级

**L2 常规**（功能增强：单文件 `geojsonLoader.js` + 文档/版本/门禁；无新 type、无配置 key、无签名变更）

> 依据 Force_command §0：用户指令「按高度拉伸为 3D」（P1）要求遵循本规范（P2），无冲突。

## 问题分析

### 核心症状

- 抓取的建筑进 Cesium 后是贴地平面，用户要按 `height_m` 拔成白模体。

### 根本原因

- 功能缺失：`loadGeoJSON` 只做 `clampToGround` 平面加载，无高度语义。

### 受影响模块

| 模块 | 文件 |
|---|---|
| Cesium GeoJSON 加载器 | `cesium/composables/dataImport/loaders/geojsonLoader.js`（唯一代码文件） |
| 文档 SSOT | `README.md`、`CHANGELOG.md`、本日志 |

### 候选方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 预处理坐标加 z | 改坐标即改数据源语义，且 perPositionHeight 会触发贴地兜底清除 | 否决 |
| B. 加载后按 `entity.properties` 高度置 `height=0 + extrudedHeight` | 官方语义（`extrudedHeight` 体起于 `height`，引 PolygonGraphics 文档）；放贴地兜底之后，兜底不动 extrudedHeight；无高度要素原样贴地 | **选定** |

### 选定方案与理由

方案 B：通用高度键（`height_m/height/HEIGHT/Height/altitude/elevation`，米，(0,1500]），已有拉伸的不覆盖；成功 toast 追加拉伸栋数。

## 修改内容

1. **`geojsonLoader.js`**：新增 `readFeatureHeightMeters` + `extrudePolygonsByHeight`；`loadGeoJSON` 在 `forceDataSourceClampToGround` 之后调用；成功提示按拉伸数分两种文案。record 形状、函数签名零变更。
2. **文档**：README 三处 + CHANGELOG → V3.6.13。

## 修改原因

用户功能需求；2D 侧保持平面（正确），仅 3D 拔高。

## 影响范围

- 所有经此 loader 的 GeoJSON（含既有文件导入：有高度键才拔高，否则行为与原来一字不差）
- 材质/颜色未动（仍为加载器绿色半透明），如需白模配色另立项

## 解决方案

见「修改内容」。兼容性：贴地兜底清 `height/perPositionHeight` 不动 `extrudedHeight`（已读 `utils.js:174-191` 确认）；显式 `height=0` 走 Primitive 体渲染。

## 性能指标

未实测（数百栋 ConstantProperty 拉伸，常规量级）。

## 测试方案

### Agent 已执行

- 核对官方 `PolygonGraphics.extrudedHeight` 语义（体起于 `height`）与本工程地形配置（地形可切换，默认椭球）
- 通读 `geojsonLoader.js` + `utils.js` 贴地兜底 + 仓内既有 extrusion 用法（无），确认无冲突
- 无 `.ts` 新增；门禁见下；未执行 Git 写操作

### 待用户实机验证（3D）

1. 重抓一片建筑入库：toast 显示“已按高度拉伸 N 栋”，楼块立起为体块（旋转视角确认有侧面/顶面）。
2. 无高度的普通 GeoJSON 导入：仍为贴地平面，提示文案为旧版（无拉伸后缀）。
3. TOC 显隐/透明度/flyTo/移除对拉伸体可用。

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `frontend/src/domains/cesium/composables/dataImport/loaders/geojsonLoader.js` | 高度拉伸 + 提示分文案 |
| `README.md` | 三处 → V3.6.13 |
| `Docs/Guide/CHANGELOG.md` | V3.6.13 条目 |
| `Docs/LLM_record/26-10/2026-10-10/2026-10-10-cesium-extrude.md` | 本日志 |

> 无新增/删除源码文件 → 结构树无需变更。

## 遗留与风险

- 起伏地形区体底贴椭球（height=0），山地城市可能悬空/陷入；如需贴地形起底，需按面采样地形（另立项，有 `heightSampler` 可用）。
- 高度>1500m 或非法一律不拉伸（防脏数据炸视角）。
- 未实机运行。

## 门禁

- `python Scripts/CheckStructureTree.py`：通过（485 项/0 漂移；无增删文件）
- `python Scripts/CheckConfigRegistry.py`：全部通过 ✅（零配置 key）
- 平台红线自查：仅前端加载器，未碰后端/部署面 → CLEAN
- 未执行任何 Git 写操作
