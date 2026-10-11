# 2026-10-10 建筑抓取三修 → V3.6.12

## 日期与时间

2026-10-10（会话内执行）

## 任务等级

**L2 常规**（Bug 修复×2 + 首页文案×1；依据 Force_command §1，多文件默认 L2）

> 依据 Force_command §0：用户三连问（P1）要求遵循本规范（P2），无冲突。

## 问题分析

### 核心症状

1. eslint `no-dupe-keys`：`zh-CN.js` shell 内 `buildings` 重复（用户贴图 732 行）。
2. 自动入库 OL 有效、Cesium 无效（抓取完成后 3D 无新图层）。
3. 首页缺建筑抓取功能说明。

### 根本原因

1. V3.6.11 在 shell 下加了 flat `buildings: '建筑抓取'`，又加了 `buildings: {...}` 对象——同对象重键（en 同病，先行一并修）。
2. 抓取器输出顶层裸字符串 `crs: 'WGS84'`。以 Cesium 官方 `GeoJsonDataSource.load`（main 分支，已在线核对）为准：`crs` 有定义即要求 `.properties`，否则抛 `RuntimeError("crs.properties is undefined.")` → `loadDataFile` catch 报加载失败 → 3D 无入库；OL 解析器忽略该成员故 2D 正常。两引擎行为差的 divergence 点有据。
3. 功能缺文案：Landing 9 卡无建筑项。

### 受影响模块

| 模块 | 文件 |
|---|---|
| 文案 | `locales/zh-CN.js`、`locales/en-US.js`、`locales/core.js` |
| 入库 sanitizer | `common/data-import/useTencentBuildingFetch.js`（新增 `toSpecGeoJSON`，打包/下载两处调用；抓取器本体不动，与 Node 脚本共用） |
| 首页 | `app/LandingView.vue`（feature10 卡 + Building2 图标） |
| 文档 SSOT | `README.md`、`CHANGELOG.md`、本日志 |

### 候选方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 改抓取器去掉 crs | 影响 Node 落盘脚本 + 逆向笔记对应关系 | 否决：blast radius 大 |
| B. 打包/下载点剥离非标准 crs（抓取器不动） | 两处调用一函数；数据本就是 WGS-84，两引擎默认即此 | **选定** |

## 修改内容

1. **去重键**：删 shell 下 flat `buildings`（中英各 1 行），保留 `buildings: {...}` 对象；`topbar.buildings` 分属另一对象，无冲突（已 grep 核对各剩 2 处分属）。
2. **`toSpecGeoJSON`**：顶层 `crs` 非对象时剥离（对象形式保留，防未来合规 crs）；`buildImportFile` + `downloadResult` 调用，入库文件与下载文件同步规范（下载文件二次导入两引擎通用）。
3. **首页**：`FEATURES` + `feature10`（Building2，与 TopBar 同图标），`core.js` 中英标题/描述各 1 组。
4. **文档**：README 三处 + CHANGELOG → V3.6.12。

## 修改原因

用户报障 + 补文案；en 重键用户未贴但同病，先行修（ Force_command §2.5 顺手改的反例？不——同文件同类错误，属同一 Bug 范畴，非扩范围）。

## 影响范围

- 抓取入库文件内容（去顶层 crs；坐标/属性零改）
- 落地页 +1 卡；其余 9 卡不动
- 抓取器/Node 脚本/后端零改

## 解决方案

见「修改内容」。crs 证据链：抓取器 `:293` 输出 `crs:'WGS84'` → Cesium `load()` crs 分支抛错 → `geojsonLoader:33` 未走到 `dataSources.add`。

## 性能指标

未实测。

## 测试方案

### Agent 已执行

- 在线核对 Cesium main 分支 `GeoJsonDataSource.js` crs 分支源码
- 通读 `useCesiumDataOpsHandlers:22` → `loadDataFiles` → `loadDataFile:375` geojson 分支 → `geojsonLoader` 全文件，确认除 crs 外无其他 divergence（如扩展名、File 读取均支持）
- `buildings:` 重键 grep 核对（分属对象，无残留）；`tsc`：无 `.ts` 新增
- 门禁见下；未执行 Git 写操作

### 待用户实机验证

1. eslint 重键告警消失（保存即验）。
2. 落地页出现第 10 卡「建筑白模抓取」，中英切换正常。
3. **3D 下重抓一次**：应出现 `GeoJSON "腾讯建筑白模…" 加载成功` 且 TOC 三维数据分组有条目，可显隐/透明度/flyTo/移除；2D 回归一次。
4. 下载的 `.geojson` 文本无顶层 `crs`，可被工具箱二次导入。

## 变更文件清单

| 路径 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js`、`en-US.js` | 删 shell flat buildings 重键 |
| `frontend/src/domains/common/data-import/useTencentBuildingFetch.js` | `toSpecGeoJSON` + 两处调用 |
| `frontend/src/app/LandingView.vue`、`frontend/src/locales/core.js` | feature10 卡 + 中英键 |
| `README.md` | 三处 → V3.6.12 |
| `Docs/Guide/CHANGELOG.md` | V3.6.12 条目 |
| `Docs/LLM_record/26-10/2026-10-10/2026-10-10-building-fixes-v3612.md` | 本日志 |

> 无新增/删除源码文件 → 结构树无需变更。

## 遗留与风险

- `shell.buildings.import` 键仍残留（按钮已删，V3.6.11 遗留说明过），无害。
- 若 3D 仍无入库，把 `加载 "…" 失败` 的完整 toast 文本贴回（将进入 loader 内层排查，如高度/坐标异常）。
- 未实机运行。

## 门禁

- `python Scripts/CheckStructureTree.py`：通过（485 项/0 漂移；本次无增删文件）
- `python Scripts/CheckConfigRegistry.py`：全部通过 ✅（零配置 key）
- 平台红线自查：未碰后端/部署面；改动域等效 Grep 无命中 → CLEAN
- 未执行任何 Git 写操作
