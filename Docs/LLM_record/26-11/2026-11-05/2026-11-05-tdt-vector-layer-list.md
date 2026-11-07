# 天地图矢量抓取清单扩至 20 层并修正图层语义

- **日期与时间**：2026-11-05 11:20
- **任务等级**：L2
- **版本**：V3.6.42

---

## 一、问题分析

### 1.1 症状

数据导入面板（`TencentBuildingPanel.vue` 天地图 tab）的「矢量图层」多选清单仍是初版 **12 层**，且语义描述沿用旧逆向结论：

- 可选层只有 `BI/BV/CE/CK/BM/BK/AA/AB/AP/AD/AM/respt`，**无法勾选**铁路（`BA`）、水面轮廓（`AN`）、低 zoom 水系（`AR`/`AW`）、行政地名点（`AF`）、街道地名点（`CA`）、河流注记（`BN`）、补充 POI（`AX`）；
- `AP` 仍标「区级行政区划面」，`CK` 仍标「土地利用/绿地面」，`BI` 的 `B1` 仍被描述为区划类字段——与 2026-11-05 完成的官方样式审计（`Docs` 外笔记 `tdt_style_analysis.md` / `tdt_layer_catalog.json`）结论不一致。

### 1.2 根因

| 层 | 位置 | 问题 |
|---|---|---|
| 字典（SSOT） | `frontend/src/domains/common/data-import/parsers/tdtVectorLayers.js` | `ALL_TDT_VECTOR_LAYERS` 硬编码 12 码；`TDT_VECTOR_LAYER_META` 缺 8 层、4 条语义过时 |
| 拓扑分派 | `.../parsers/tdtVectorTopology.js` | `topoTdtVectorLayers` 只对 `CE/AP/CK/BM/BV` 与 `BI/AD/respt` 特判，其余一律 `topoLines`。新点层（`AF/CA/BN/AX`）会因 `type!==1` 被整体丢弃；水面多边形 `AR` 同样被丢 |
| UI 注释 | `.../components/TencentBuildingPanel.vue` | 注释写死「12 层」，与清单长度脱钩（仅注释，不影响运行） |

即：**清单扩层必须同时扩拓扑分派**，否则勾了也不出数据——这正是后端 CLI 早期「未列图层静默丢弃」的同型缺陷。

### 1.3 受影响模块

数据导入面板（天地图 tab）→ 天地图矢量抓取 composable（`useTdtBuildingFetch`）→ 解析器（`tdtVectorFetcher`）→ 拓扑（`tdtVectorTopology`）→ 入库/统计展示。i18n 文案中「默认仅建筑 CE」仍成立（`selectedLayers` 初值 `['CE']` 不改）。

### 1.4 候选方案

| 方案 | 做法 | 问题 |
|---|---|---|
| A 仅改字典 | 只补 20 码与文案 | 新点层/水面被 `topoLines` 丢弃，勾选无效 |
| B 字典 + 拓扑分派（选定） | 字典扩 20 码 + 拓扑新增点层集合与面层直出 | 改动集中在两文件，无签名变化 |
| C 扩到全部 75 码 | UI 列 75 个复选框 | 低置信度底图层噪声大、无对应拓扑策略，交互不可用 |

**选 B**：与后端 mjs `DEFAULT_LAYERS`（20 码）严格对齐，CLI 与前端可选集一致。

---

## 二、解决方案（实施前计划）

1. `tdtVectorLayers.js`：`ALL_TDT_VECTOR_LAYERS` 由 12 扩到 20（顺序同 mjs `DEFAULT_LAYERS`）；补 8 条 META；修正 `AP/CK/BM/BV/AA/BI/CE` 的 label/desc/keys；「全部图层（N 层）」改为按数组长度计算，避免再次写死。
2. `tdtVectorTopology.js`：点层分支由 `BI/AD/respt` 扩为 `BI/AD/respt/AF/CA/BN/AX`；面层直出由 `BV` 扩为 `BV/AR`；其余仍走 `topoLines`（`BA/AN/AW/AA/AB/AM/BK`）。
3. `TencentBuildingPanel.vue`：两处「12 层」注释改为「20 层（按字典动态）」。
4. 收尾：日志、版本号 `V3.6.41 → V3.6.42`（README 三处 + CHANGELOG）、门禁脚本。

> 不在本次范围：后端 mjs 的 CE/CK/BM 属性全量透传（前端 `tdtVectorTopology` 仍只保留 `height_m/floors/A6/name`）——按 §2.5 记入 `Docs/TODO/bugfix-optimization-plan.md`，不顺手改。

---

## 三、修改内容

| # | 文件 | 修改 |
|---|---|---|
| 1 | `parsers/tdtVectorLayers.js` | `ALL_TDT_VECTOR_LAYERS` 12 → **20**（`BI BV CE CK BM BK AA AB AP AD AM respt` + `BA AN AR AW AF CA BN AX`，顺序同 CLI `DEFAULT_LAYERS`）；`TDT_VECTOR_LAYER_META` 补 8 条、修正 7 条（`AP/BI/CK/BM/BV/AA/CE`）；文件头注释改写为审计来源；`tdtVectorLayerOptions()` 的「全部图层（N 层）」改为按数组长度计算 |
| 2 | `parsers/tdtVectorTopology.js` | 分派：点层 `BI/AD/respt` → `BI/AD/respt/AF/CA/BN/AX`；面层直出 `BV` → `BV/AR`；`topoPoints` 新增 `CA`(F5) / `AF`(B7+O4) / `BN`(B7+S8) / `AX`(Z5+A6) 去重键，并对 AF/BN/AX 叠加坐标（重名保护）；显式注明 AD 不叠加坐标的原因（跨瓦量化坐标不等会重复计数） |
| 3 | `components/TencentBuildingPanel.vue` | 两处「12 层」注释改为按字典动态表述（`全量分层明细`、`txb-layer-grid`） |

## 四、修改原因

1. 字典是前端唯一层码 SSOT，停在 12 码导致新图斑**无法勾选**；而 CLI 同日已扩到 20 码，两端可选集不一致。
2. 旧语义（AP 区级区划、B1 区划码、A6 行政区）已被官方样式 + 9 城实测推翻，继续展示属于**错误信息**。
3. 只改字典不改拓扑：新点层会被 `topoLines` 的 `type!==1` 丢弃、`AR` 多边形同理——用户勾了却拿不到数据，属静默失败，必须同批修。

## 五、影响范围

| 面 | 影响 |
|---|---|
| 数据导入面板（天地图 tab） | 多选清单 12 → 20 项；「全部图层（20 层）」；分层统计可能出现新层条目 |
| 天地图抓取链路 | 请求层码集合扩大；`topoTdtVectorLayers` 新增 5 个分支入口，原有 12 层路径不变 |
| 入库/展示 | 新层产物几何类型正确（点/线/面），`_layer`/`_tile` 标记沿用旧约定 |
| i18n | 未改。`vectorLayers` 文案「默认仅建筑 CE」仍成立（`selectedLayers` 初值 `['CE']` 未动） |
| 后端/部署 | 无影响 |

## 六、测试方案

**Agent 已执行**

| 项 | 命令/方式 | 结果 |
|---|---|---|
| 字典模块加载 | `node -e "import('./src/.../tdtVectorLayers.js')"` | 20 层 / 21 选项（含 all）/ 元数据无缺 |
| 归一化 | 同上，`normalizeTdtLayerSelection('all')` / `('ba,af')` | 20 / `BA,AF`（大小写不敏感、非法码丢弃逻辑未变） |
| 拓扑合成用例 | `topoTdtVectorLayers` 喂 5 条合成记录 | `AF/BN/AX`→`Point`、`AR`→`Polygon`、`BA`→`LineString`，`_tile` 正常 |
| ESLint | `npx eslint <3 个改动文件>` | exit 0，无告警 |
| 门禁 | `python Scripts/CheckStructureTree.py` / `CheckConfigRegistry.py` | 526:526 无漂移 / 配置全通过 |

**待用户实机验证**

1. 打开数据导入 → 天地图 tab，「矢量图层」应显示 20 个可勾选项 + 「全部图层（20 层）」。
2. 勾选 `BA AF CA BN AR` 与 `CE`，取一个小范围（如 `--delta` 等效的 0.004° 框）z12 抓取。
3. 检查分层统计：`BA/AF/CA/BN/AR` 出现且要素数 > 0；入库后 `AR` 为面、`BA` 为线、`AF/CA/BN` 为点。
4. 回归：仅勾 `CE` 抓取，结果应与改动前一致（建筑数与属性不变）。

## 七、变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/data-import/parsers/tdtVectorLayers.js` | 层字典扩至 20 码 + 语义修正 + 动态层数标签 |
| `frontend/src/domains/common/data-import/parsers/tdtVectorTopology.js` | 点层/面层分派扩展 + 新点层去重键 |
| `frontend/src/domains/common/data-import/components/TencentBuildingPanel.vue` | 两处注释同步（无逻辑改动） |
| `README.md` | 版本号三处同步 V3.6.42 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.42 条目 |
| `Docs/TODO/bugfix-optimization-plan.md` | 记录前端属性白名单与 CLI 不一致（§2.5 只记不改） |
| `Docs/LLM_record/26-11/2026-11-05/2026-11-05-tdt-vector-layer-list.md` | 本日志 |

## 八、遗留与风险

1. **前端属性仍为白名单**：`CE` 只出 `height_m/floors/A6/name`、`AP` 只出 `objectid`、`CK/BM` 只留 `S8`，与 CLI 全量透传不一致 —— 已记入 TODO，不在本次范围。
2. **低 zoom 基线层未纳入 UI**：`CC`（国道/省道 z5~11）等仍不可勾选；加它需要分组 UI，避免 75 码噪声。
3. **`AR` 走直出不做洞嵌套**：与 `BV` 同策略（每环独立面）。低 zoom 水面若含岛屿洞会表现为「洞被填」，与既有 BV 行为一致，如需修正应两处同改。
4. **实机未验证**：本次仅模块/合成用例/静态检查，浏览器内抓取需用户执行。

## 九、DoD 自查

| 项 | 状态 |
|---|---|
| 分层边界与单一职责 | ✅ 逻辑仍集中在 parsers，未在巨型 `.vue` 内堆逻辑 |
| 新增 `.ts` 无 tsc 新错 | ✅ 本次无新增文件（全部改既有 `.js/.vue`），`npx tsc --noEmit` 不适用 |
| 新建逻辑文件默认 `.ts` | ✅ 未新建 |
| 维护日志 | ✅ 本文件 |
| README 三处版本号 | ✅ 简介行 / 版本表首行 / 页脚均为 V3.6.42 |
| CHANGELOG 条目 | ✅ 已追加 |
| 结构树同步 | ✅ 无文件增删（gates 526:526） |
| 配置 key | ✅ 无新增 |
| 移动端基线 | ✅ 无新增 icon/按钮（仅多出 8 个复选框，沿用既有 `.txb-layer-item` 触屏样式） |
| 场景数据注册 | ✅ 走既有 `dataImport.load*` 链路，未新增数据源类型 |
| 门禁脚本 | ✅ 两项均通过 |
| 未执行 Git 写操作 | ✅ |
| 平台红线自查 | ✅ 未触及 backend/deploy/工作流 |
