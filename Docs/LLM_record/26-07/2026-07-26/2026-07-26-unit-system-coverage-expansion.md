# 2026-07-26 单位制覆盖面扩展（unit-system-coverage-expansion）

- **日期和时间**：2026-07-27 03:30
- **所属版本**：V3.4.45
- **变更类型**：功能完善（执行《下一步修复与优化规划》P1-2）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | V3.4.33 落地的单位制偏好仅覆盖测量工具；路线规划（公交/驾车）与 3D 漫游导航 HUD 的距离展示仍硬编码公制（模板拼 " km" 后缀 / 本地 formatDistance） |
| 根本原因 | 各展示点在 units.js 出现前各自格式化，未统一消费入口 |
| 受影响的模块 | 公交规划面板、驾车规划面板、3D 漫游导航 HUD |
| 解决方案 | 三处展示层接入 `formatDistanceMeasure`；`distanceKm` 字段更名 `distanceText`（值为带单位展示文本），避免字段名与内容不符 |

## 修改内容

1. **BusPlannerPanel.vue**：`TransitSegment`/`RouteCandidate` 接口 `distanceKm: string` → `distanceText: string`（注释注明跟随偏好单位制）；候选线路总里程与分段距离生成改 `formatDistanceMeasure(米值)`；模板两处去掉硬编码 " km" 后缀。
2. **DrivingPlannerPanel.vue**：`ParsedRouteResult` 接口同步更名；总里程生成 `formatDistanceMeasure(parsed.distanceKm * 1000)`（上游解析器输出为 km 数值，×1000 转米）；模板去后缀；debug 面板 `rawDistance` 保留原始值。
3. **NavGuideHUD.vue**：本地 `formatDistance` 改为直通 `formatDistanceMeasure`（英制偏好下漫游目标距离显示 ft/mi），import 路径 `../../../utils/units`。

## 修改原因

执行规划 P1-2；用户指示"继续执行"，实机通道（Chrome 扩展）仍未连接，选取纯代码可完成项。

## 影响范围

- 三处距离展示跟随账号中心单位偏好即时切换（units.js 每次调用实时读缓存）
- 不影响：路线规划请求/渲染逻辑、距离数值计算（仅展示层）、驾车 debug 原始值

## 优化解决方案（实施步骤）

1. grep 扫描 "km/公里/toFixed" 定位硬编码展示点，确认三处为本轮范围（空间分析参数与坐标面板属输入型单位，需双向换算，留待后续）。
2. 字段更名而非保名改义（`distanceKm` 装英里文本会撒谎），TS 接口/生成处/模板 9 处同步。
3. 行尾自适应脚本批量落盘（CRLF 保持）。

## 性能指标

- 展示层格式化调用，无可测开销。

## 测试方案

- **静态验证（已执行，全部通过）**：3 组件 compiler-sfc（parse+compileScript+compileStyle）；ESLint 零告警；`distanceKm` 展示层残留为 0（仅存驾车解析器源数据字段，语义为 km 数值输入，合理保留）。
- **实机复核项（并入 P0 回归清单）**：① 偏好切英制 → 公交规划某线路：总里程与分段距离显示 mi/ft；② 驾车规划总里程同步；③ 3D 漫游设导航目标，HUD 距离显示英制；④ 切回公制即时恢复 m/km。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Routing\BusPlannerPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Routing\DrivingPlannerPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\PlayerController\NavGuideHUD.vue`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-next-bugfix-optimization-plan.md`（P1-2 标注部分完成）
- `D:\Dev\GitHub\WebGIS-Dev\README.md` / `Docs\Guide\CHANGELOG.md`（版本 V3.4.45）
- 本日志（新增）
