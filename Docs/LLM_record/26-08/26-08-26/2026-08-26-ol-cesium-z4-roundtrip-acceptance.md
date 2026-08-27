# OL↔Cesium z 值往返可逆性验收测试（测试方案 6 步闭环）

- **日期和时间**：2026-08-26 18:21
- **版本归属**：V3.5.33（2026-08-26，与「统一图层管理 P2 第二批」同日，归并同版本日志）

---

## 事件逻辑链条分析

### 核心症状

业务侧提出统一验收标准：「OL 中 z 默认为 4；经 OL→Cesium（z 转相机高度）→ Cesium→OL（反解回 z）反复转换，在不做任何其它干扰操作的前提下，OL 的 z 必须保持恒定；一旦 z 出现任何变化即为失败」。需要以自动化测试证明当前 `viewScale` 链路满足该可逆性约束。

### 根本原因（需验证的风险点）

双引擎共用 URL 参数 `z`：OL 语义为缩放级别（zoom，默认 4），Cesium 语义为相机离地高度（米）。二者**数值不可直接复用**，必须经 Canonical Ground Resolution 中间层双向换算。潜在漂移来源有四处：

1. **往返路径不对称**：OL→Cesium 经 `zoom→resolution→G→height`，Cesium→OL 若走另一套公式（非严格逆变换）则每次往返累积量化误差；
2. **URL 序列化量化**：`formatZParam` 统一 `toFixed(6)`，高度米级 1e-6 反演回 zoom 的理论误差 <1e-9，需实证；
3. **类型语义混用**：OL View 实例方法委托（旧 v1 实现）对带 minZoom/自定义 resolutions 的视图不对称，是历史往返漂移的根源；
4. **字符串/数值歧义**：`Number.isFinite('4.000000')` 对字符串返回 false，测试脚本若把序列化字符串直接回传转换 API 会产生「假失败」。

### 受影响模块

| 模块 | 角色 |
|------|------|
| `frontend/src/domains/common/utils/viewScale/`（index/conversion/compat/webMercator/cesiumScale） | 被测转换核心（SSOT） |
| `frontend/src/app/HomeView.vue` `buildCesiumQueryPatchFromOl` / `syncOlFromCesiumPayload` | 真实切换链路（被测链路范本） |
| `frontend/src/domains/ol/composables/useMapState.js` / `useCesiumUrlTracking.js` `formatZParam` | URL z 6dp 序列化 |
| `frontend/src/domains/ol/components/MapContainer.vue` `INITIAL_VIEW` | z=4 默认值来源 |

## 优化解决方案

按测试方案实现自动化验收脚本 `.tmp-test/viewscale-roundtrip-z4.mjs`，**严格一比一复刻 HomeView 真实链路**：

- **步骤 1**：断言 OL 默认 z = 4（取自 MapContainer.vue `INITIAL_VIEW`，序列化后 `4.000000`）；
- **步骤 2**：`convertOlViewToCesium(zoom→resolution→G→height)`，高度经 URL `toFixed(6)` 量化后进入 Cesium；
- **步骤 3**：`convertCesiumViewToOl(Realtime 解析模型，pitch=-90)` → `canonicalScaleToOlView` 反解出 OL zoom，再次 `toFixed(6)` 序列化；
- **步骤 4/5/6**：反复执行 400 轮往返，**字符串级恒等断言**——任意一轮返回的 z 字符串都必须等于初始 `'4.000000'`，任何漂移立即失败；
- 附加：小数 zoom（5.32 / 8.716 / 12.00453）各 20 轮字符串级往返稳定，确保非整数场景同样可逆。

关键设计取舍：

- **字符串级恒等**（而非数值容差）是唯一符合「z 出现任何变化即失败」的判据；数值 double 精度下解析模型往返误差本身即 <1e-9，URL 6dp 量化吞噬，故字符串恒等可精确达成；
- **往返两侧共用同一 canonical 模型严格互逆**（nadir 正俯视下 `G=2h·tan(fovY/2)/vh` 与其逆），Realtime 解析路径零渲染、确定性可测；
- 测试仅验证**纯变换可逆性**；浏览器端射线实测（Precision）与 Terrain 场景的交互验证属另一维度（既有 viewscale-spec-suite.mjs 已覆盖）。

## 性能指标

- 400 轮往返 **max|Δzoom| = 0**（逐位恒等，非近似）；
- 小数 zoom 3×20 轮字符串级返回原值；
- 单轮往返为纯函数解析计算（无射线/渲染），400 轮毫秒级完成。

## 测试方案

```bash
cd WebGIS-Dev/frontend
node .tmp-test/viewscale-roundtrip-z4.mjs
```

- **环境**：Node.js v24.11.1，ES Module；
- **实际输出**（全部通过）：

```
② OL z=4 → Cesium height = 7512998.362 米
③ Cesium → OL z = 4.000000
∴ 反复 400 次 ol↔cesium 后，OL z 恒为 4.000000，max|Δzoom|=0.00e+0 —— 可逆 ✓
∴ 小数 zoom（5.32/8.716/12.00453）字符串级往返稳定 ✓
✅ 验收通过：默认 z=4 经多次 OL↔Cesium 转换仍恒定 4，往返完全可逆。
```

- 既有回归：`viewscale-spec-suite.mjs`（1750 组合零漂移、Cesium 解析自洽 1.78e-16、射线测量/二分/nearlyEqual）同步复跑全绿。
- 说明：`viewscale-v2.mjs`（V3.5.32 时代契约测试）当前**不再通过**——其引用 `cesiumCameraToOlView` / `olViewToCesiumCamera` 两个旧 API，已在 viewScale/ 八模块重构（V3.5.34）中由 `convertCesiumViewToOl` / `convertOlViewToCesium` 替代，`viewScaleConverter.js` 兼容入口不再导出旧名。属**工作区既有脱节状态**（非本次任务引入，本次未修改任何 src 生产代码），需要用户决策是否同步重写该旧契约测试。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\.tmp-test\viewscale-roundtrip-z4.mjs`（新增：测试方案 6 步闭环验收脚本）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（V3.5.33 追加本测试小节）

> 注：`.tmp-test/` 为既有临时测试脚本目录（含 viewscale-v2.mjs / viewscale-spec-suite.mjs），未登记于任何 README 文件树；本次仅在其内新增同类测试脚本，目录结构无变化，故三个 README 结构树与 `project-structure.md` 无需变更。本任务未修改任何 `src/` 生产代码。版本控制提交决策权归用户。