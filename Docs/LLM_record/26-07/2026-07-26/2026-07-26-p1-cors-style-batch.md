# 修复规划 P1 收官：CORS 白名单收敛 + tileset 外观单点合成（V3.4.47）

## 日期和时间

2026-07-26 20:58（北京时间）

## 事件逻辑链条分析

- **核心症状**（两项，出自 `Docs/TODO/bugfix-optimization-plan.md`）：
  ① `app.py` 全局 CORS `allow_origins=["*"]` 硬编码全开（旁有一段注释掉的白名单尝试），生产面直接暴露且不受三层配置体系管辖；
  ② tileset 透明度（统一图层管理写 style）与材质模式（`applyTilesetMaterial` 开头清 style/customShader）互写外观，一期妥协为"最后操作生效"——调透明后切材质丢透明、heightStyle 模式下调透明会覆盖分层配色，且 customShader 模式（pureWhite/baimo/gradient）shader 内固定 `material.alpha=1.0`，透明度对其完全无效。
- **根本原因**：① CORS 早于统一配置体系存在；② 材质与透明度由两条演进线各自为政，无共享状态与合成出口；customShader 的不透明渲染通道特性（alpha 需 TRANSLUCENT 声明）未被处理。
- **受影响模块**：后端 CORS 中间件装配；tilesetLoader 材质构建、dataSourceDisplay 类型适配、ops handler 材质切换链。
- **解决思路**：① CORS 收敛为已登记 L1 key，空值兼容；② 外观"单点合成"——WeakMap 记录 (mode, alpha) 二元状态，任一变化都调用同一合成函数以完整二元组重建 style/customShader。

## 修改内容

1. **P1-1 CORS**：
   - `backend/config/catalog.py` 登记 `CORS_ALLOWED_ORIGINS`（L1，默认空）；根 `.env.example` L1 段登记（含生产示例注释）；
   - `app.py` 导入 `get_str`，解析逗号分隔清单（strip + 去尾斜杠），空 → `["*"]` 兼容旧行为；白名单启用时启动日志打印来源数量与清单；删除废弃注释代码块。
2. **P1-2 外观合成**：
   - `loaders/tilesetLoader.js`：`applyTilesetMaterial(tileset, mode, Cesium, alpha=1)` 增第四参（钳制 0~1）——`heightStyle` 经 `buildHeightStyle(Cesium, alpha)` 将各分层色改为 `color('rgb(...)', a)`；`buildCustomShader(mode, Cesium, alpha)` 为 pureWhite/baimo/gradient 注入 `material.alpha = a`，并在 a<1 时显式 `translucencyMode: TRANSLUCENT`（a=1 用 INHERIT，零回归）；`none` 且 a<1 走白色乘 alpha 的 style；
   - `dataSourceDisplay.js`：新增模块级 `tilesetAppearanceState`（WeakMap<tileset, {mode:'none', alpha:1}>，随句柄 GC）与导出 `setTilesetMaterialMode(Cesium, record, mode)`；`setRecordOpacity` 的 3dtiles 分支改为更新 state.alpha 后调合成器（删除本地 style 直写）；
   - `useCesiumDataOpsHandlers.js`：`handleDataSetMaterial` 由直调 `dataImport.applyTilesetMaterial` 改为 `setTilesetMaterialMode`（材质切换保留当前透明度）。
3. **规划文档**：P1-1 / P1-2 勾选（P0-2/P0-3/P1-1/P1-2/P1-3 至此全清，剩 P0-1 实机回归与 P2/P3）。

## 修改原因

执行修复规划 Sprint 2 剩余两项（用户指令"继续"）；P1-2 同时兑现统一图层管理设计文档中"style 互写风险 → adapter 单点合成"的既定对策。

## 影响范围

后端跨域策略装配（默认行为不变，配置后收紧）；tileset 外观链路（透明度 × 4 种材质模式的全组合语义升级为叠加生效）；数据页签材质按钮与图层管理透明度滑杆两条入口共用合成状态。

## 优化解决方案

合成器关键决策：alpha 融入每种模式自身的表达（style 颜色第二参 / shader 文本插值）而非外挂第二层 style——因 Cesium 中 customShader 会压制 style 颜色，外挂方案对三种 shader 模式无效；`TRANSLUCENT` 通道仅在 a<1 时声明，a=1 走 INHERIT 保证既有渲染路径零扰动；WeakMap 状态随 tileset 句柄 GC，移除数据源零清理成本。

## 性能指标

CORS 解析为启动期一次性；外观合成为参数变化时单次 style/shader 重建（与原实现同量级），无每帧成本。shader 文本随 alpha 变化重建 CustomShader——滑杆拖动频率下（每帧至多一次）可接受，实机若见卡顿可加 uniform 化优化（记为潜在 P2）。

## 测试方案

- **已验**：py_compile（app.py/catalog.py）；配置门禁七项全绿（新 key 已登记）；CORS 解析断言 3 场景（空→*、混杂空格尾斜杠、单值）；前端 3 改动文件 ESLint 零告警。
- **待实机**：
  1. 本地不配 `CORS_ALLOWED_ORIGINS` → 前端跨域一切如旧；配置后非白名单来源被拒（curl -H Origin 验证）；
  2. 加载样例城市 → 调透明 60% → 依次切换四种材质：各模式均保持 60% 半透明；再拉回 100% → 材质完整还原；
  3. heightStyle 模式下调透明：分层配色保持且整体变淡（不再被白色 style 覆盖）；
  4. HF 生产 Variables 配置白名单后 Pages 正常访问。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\backend\app.py
- D:\Dev\GitHub\WebGIS-Dev\backend\config\catalog.py
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\loaders\tilesetLoader.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\dataSourceDisplay.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\composables\dataImport\useCesiumDataOpsHandlers.js
- D:\Dev\GitHub\WebGIS-Dev\Docs\TODO\bugfix-optimization-plan.md（P1-1/P1-2 勾选）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.47 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.47 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-p1-cors-style-batch.md（本日志）

> 备注：无文件增删，文件树不变；未执行任何 git 操作，提交由用户决策。
