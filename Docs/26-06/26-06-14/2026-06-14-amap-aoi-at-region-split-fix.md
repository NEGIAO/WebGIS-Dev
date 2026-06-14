# 高德 AOI `@` 分区解析修复

## 日期和时间

2026-06-14 16:33

## 修改内容

- 修复高德 AOI 手动粘贴 / 搜索 AOI 解析时对 `@` 分隔独立区域的支持缺失。
- 同步修复 `amapAoiParser.js` 与 `universalAmapParser.js`，避免详情 AOI 与搜索 AOI 两条链路表现不一致。
- 更新根 README、前端 README、后端 README 的功能说明，补充本次 AOI 多区域解析能力。

## 修改原因

用户输入的高德 AOI 原始 `polyline` 可能用 `@` 分割成多个独立区域。当前解析器只按单环或单分隔符处理，导致整串坐标被错误地当成一条环，最终出现边界缺失、几何无效或直接解析失败。

## 事件逻辑链条分析

1. 用户在页面中粘贴高德详情 JSON，或通过搜索结果触发 AOI 落图。
2. 解析器读取 `polyline` / `shape` 字段后，按坐标对拆分成环。
3. 原实现只支持单一连续环或单一分隔方式，没有识别 `@` 代表的独立区域边界。
4. 当输入包含多个 `@` 分区时，后半段坐标会混入前一段环，导致坐标对失配、闭环失败或要素无法渲染。
5. 因此需要在解析阶段先拆分区域，再分别按 `_` / `;` 拆点，并在每个区域内闭环。

## 影响范围

- 前端 AOI 粘贴解析链路
- 前端高德搜索 AOI 解析链路
- 地图容器 AOI 绘制逻辑
- 前端与地图搜索相关 README 说明

## 优化解决方案

- 在 `amapAoiParser.js` 与 `universalAmapParser.js` 中新增区域切分函数，统一把 `@` 与 `|` 视为区域分隔符。
- 每个区域内部继续支持 `_` 与 `;` 作为坐标对分隔符。
- 保持闭环规则不变：闭合不足的区域自动补首点，少于 4 个点的区域直接丢弃。
- 这样可以同时修复高德详情 JSON 和搜索 AOI 数据，不再依赖上层调用方判断输入格式。

## 性能指标

本次修复只增加一次字符串分割和环遍历，属于线性开销，未引入可感知性能损耗。

## 测试方案

- 通过静态错误检查确认两个解析器文件无语法错误。
- 使用包含 3 个 `@` 分区的高德 AOI 样例验证解析器可拆出多个独立环。
- 在地图页面手动粘贴 AOI 详情 JSON，确认边界能正确绘制且不再报解析失败。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\parsers\amapAoiParser.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\parsers\universalAmapParser.js`
- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-14\2026-06-14-amap-aoi-at-region-split-fix.md`