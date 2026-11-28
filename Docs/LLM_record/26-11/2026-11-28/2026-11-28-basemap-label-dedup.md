# 2026-11-28 预设 label 去冗余（定义 name 保持详细）（V3.7.26）

- **日期与时间**：2026-11-28 12:26 – 12:55（CST，含范围澄清往返）
- **任务等级**：L2（148 条预设 label 批量修订）
- **本次版本**：V3.7.26
- **任务来源**：用户指令——一二级分类已承载类别与来源、条目徽标已承载坐标与代理，预设 `label`（目录条目显示文本）中的同类信息属冗余，全部清理。
- **范围澄清（最终口径）**：任务期间曾误清理定义 `name` 并两度往返；最终经用户确认——**预设 `label` 才是冗余载体（目录条目文本），定义 `name` 服务于图层管理器的排序与显示，保持原始详细值不动**。最终变更仅 `basemapPresets.ts` 123 处 label；定义文件与 809239cca 原始值逐条一致（174/174 校验）。

## 问题分析

**核心症状**：目录条目显示的 label（来自 `basemapPresets.ts`）普遍携带服务商前缀（高德/Google/天地图/MapTiler/Stamen/ESRI/Windy/…）、坐标后缀（(GCJ)/(WGS)/（WGS））与「256」前缀——与目录层级、坐标/代理徽标重复。

**判定规则**：去「服务商前缀 / 坐标后缀 / 256 前缀」，保留区分本质（简洁/纯道路/地貌+路网/深灰/海洋/年份/512/无道路 等）；**provider 为 Other 的条目其 label 是唯一来源线索，原样保留**（Yandex卫星/欧空局地形/船舶网/黑白版画/国家地理 等）。

**受影响模块**：`basemapPresets.ts`（148 条预设 label）。定义 `name` 明确不参与本任务（图层管理器无层级上下文，name 必须自证来源）。

## 修改内容

1. **预设 label（123 处替换，25 条本就无冗余的原样保留）**；示例：
   - `高德256 地貌(GCJ)` → `地貌`；`Google标准电子(WGS)` → `标准电子`；`高德简洁底图+纯道路（WGS）` → `简洁底图+纯道路`；
   - `天地图影像` → `影像`；`Stamen水彩` → `水彩`；`MapTiler影像HD` → `影像HD`；`ESRI深灰` → `深灰`；
   - `谷歌代理` / `OSM代理` → `后端代理`；`星图影像` → `影像`（星图=Tuxin 中文名）；`MineMap注记` → `注记`。
2. **定义 `name` 全量恢复为原始详细值**（148 处回写，26 条本就一致）——示例：`高德地图(GCJ)`、`高德简洁电子(512 GCJ)`、`ESRI深灰色底图`、`MFF水体`、`Sentinel无云2020`；图层管理器行名保持完整来源与区分信息。
3. id/order/stack/URL 全部未动——`?l` 契约与预设结构不变。

## 修改原因

目录条目文本与层级/徽标信息重复；label 只保留该条目区别于同组兄弟条目的本质；而定义 name 的消费面（图层管理器）无分类上下文，详细名是清晰标识的必要条件。

## 影响范围

目录树条目文本、`BASEMAP_OPTIONS`/`currentLayerLabel`（触发按钮显示）、搜索关键词（label 参与搜索）。不影响：id/order 契约、加载行为、图层管理器行名（定义 name 保持原样）。

## 性能指标

不适用（纯数据字段）。

## 测试方案

### Agent 已执行

- 替换后全量重提取：label 列零冗余残留（provider=Other 合理保留除外）。
- 定义 name 与 809239cca 原始值逐条比对：**174/174 一致**。
- `check-layer-definitions`（name 非空 174）/ `check-basemap-catalog`（148 条 label 结构解析 + 20 recommended）/ 结构树（769/769）/ 配置登记 / 分域依赖：**全绿**。
- `vue-tsc --noEmit`：**0 错误**。

### 待用户实机验证

1. 目录条目文本简洁（如「地貌」「标准电子」「影像」「简洁底图+纯道路」），坐标/代理由徽标表达。
2. 图层管理器行名保持完整详细（如「高德简洁电子(512 GCJ)」「ESRI深灰色底图」），来源/坐标/协议一目了然。
3. 搜索（如「地貌」「水系」）仍可命中；触发按钮显示当前底图 label 正常；`?l=` 编号直达不变。

## 变更文件清单

- `frontend/src/domains/common/basemap/basemapPresets.ts`——123 处 label 去冗余
- `frontend/src/domains/common/basemap/definitions/category-{service,imagery,terrain,electronic,historical,vector}.ts`——name 恢复原始详细值（与暂存基线一致，最终零 diff）
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.26 三处版本号 + 条目
- 本日志

## 遗留与风险

1. **触发按钮/搜索的来源弱化**：`currentLayerLabel` 只显示 label——去服务商后触发按钮不再自证来源（如「标准」）；若需要可让触发按钮补显示 provider（另立任务）。
2. **定义 description 仍有「name · provider / coord」拼接**（tooltip 显示），同类冗余未纳入本次；如需清理请指示。
3. label 去冗余后部分同组条目同名（GCJ/WGS 成对），靠坐标徽标区分——与设计一致。
