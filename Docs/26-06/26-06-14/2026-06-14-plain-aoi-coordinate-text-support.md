# 纯坐标串 AOI 文本解析支持

## 日期和时间

2026-06-14 16:33

## 修改内容

- 新增对双引号包围的纯坐标串 AOI 文本解析支持。
- 支持 `;` 分隔坐标对、`@` 分隔独立区域，并在解析时自动闭合首尾坐标。
- 手动 AOI 注入在缺少名称时自动生成随机名称，避免空标题图层。

## 修改原因

用户输入的 AOI 不一定都是标准 JSON。有一类输入是直接贴入的坐标串，外层可能带双引号，每个坐标对用分号分隔，多个独立区域用 `@` 分隔，且首尾坐标相同。现有入口只识别 JSON 载荷，无法直接处理这种文本。

## 事件逻辑链条分析

1. 用户从外部复制 AOI 坐标文本到输入框。
2. 文本不是 JSON，因此原解析入口会直接报“不是有效的 JSON 对象”。
3. 即使坐标文本本身是合法边界串，也没有机会进入环构建逻辑。
4. 需要在万能解析器中增加纯文本分支：先去掉外层引号，再按 `@` 分区域、按 `;` / `_` 分点，并自动闭环。
5. 对于没有名称的数据，使用自动生成名称，保证图层仍可渲染并便于后续区分。

## 影响范围

- 前端 AOI 手动注入弹窗 / 输入框
- 前端 AOI 解析共享入口
- 地图容器 AOI 绘制与图层命名
- 项目 README 功能说明

## 优化解决方案

- 在 `universalAmapParser.js` 中新增纯坐标串识别与解析分支。
- 保持 `@` 多区域和 `;` 坐标分隔兼容，并继续复用闭环函数。
- 在 `useMapSearchAndCoordinateInput.js` 中为无名称 AOI 提供随机名称兜底。

## 性能指标

本次修复仅增加字符串判断与一次解析分支选择，属于常数级额外开销。

## 测试方案

- 输入单区域坐标串，确认能解析并绘制闭环 AOI。
- 输入带 `@` 的多区域坐标串，确认能拆成多个独立环。
- 输入不带名称的纯文本，确认图层名称自动生成且不报错。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\parsers\universalAmapParser.js`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useMapSearchAndCoordinateInput.js`
- `D:\Dev\GitHub\WebGIS_Dev\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\frontend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\backend\README.md`
- `D:\Dev\GitHub\WebGIS_Dev\Docs\26-06\26-06-14\2026-06-14-plain-aoi-coordinate-text-support.md`