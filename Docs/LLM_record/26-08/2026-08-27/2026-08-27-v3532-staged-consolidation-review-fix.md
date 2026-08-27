# 2026-08-27 — V3.5.32 暂存区整合 Code Review 与收尾修复

> 本日志为 **V3.5.32** 主版本的整合会话记录：暂存区曾积累多次不规范的多批次改动（引擎感知迁移 P0/P1/P2、渲染崩溃修复、TOC 不同步修复等），本会话将其统一归并为单一版本 V3.5.32，完成全量 Code Review 并修复 review 发现的问题。

## 基本信息

- **日期和时间**：2026-08-27 17:45
- **日志作者**：AI Agent（Cline）
- **任务等级**：L2（暂存区整合 Review + Bug 修复 + 文档/版本号 SSOT 收敛）
- **变更类型**：代码审查修复 + 版本文档收敛

## 问题分析（事件逻辑链条）

1. **核心症状**

   - 暂存区积累了多批历史改动与多条独立提交语义（P0/P1/P2 迁移 + 两轮 Bug 修复批次），需要归并为统一的 **V3.5.32**；
   - 整合审查发现 5 处遗留缺口：根 README 第三处版本号漏改、结构树 scenePicker.js 错位且注释张冠李戴、「清空」不终止进行中交互、双击结束产生末端重复点、TODO 方案文档状态与现实矛盾。

2. **根本原因（逐项）**

   | # | 缺口 | 根因 |
   |---|---|---|
   | ① | 根 README「项目简介」行仍为 V3.5.31 | 上次会话只更新了演进表与页脚两处；但该行是 vite.config.js 正则 `/当前版本[^\d]*(\d+\.\d+\.\d+)/` 的机器读取源（注入 `__APP_VERSION__`），缺一处即违反规范 §5 且前端展示版本错误 |
   | ② | 结构树 scenePicker.js 被画在 `composables/` 层级、注释写成「坐标串解析工具 normalizeLonLatPair/parseLinePoints」 | 注释把 useCesiumRouteRendering.js 内部纯函数误安到 scenePicker.js 头上；scenePicker.js 实际位于 `composables/draw/` 内，职责是 pickEarthPoint 两级取点链；层级线画法也随之错乱 |
   | ③ | `activateInteraction('Clear')` 只调 clearAllDrawings() | 成品句柄表清理与进行中交互态（sketch/handler/previewLabel）是两条生命周期；Clear 不触达后者 |
   | ④ | 双击结束后测距虚高 / 线面末端赘点 | Cesium ScreenSpaceEventHandler 在 LEFT_DOUBLE_CLICK 前先派发两次 LEFT_CLICK，clicks 尾部出现两个几乎同位的点；右击结束无此现象 → 行为不一致 |
   | ⑤ | TODO 方案文档写「待用户批准。批准前不实施任何代码改动。」 | 文档为方案阶段产物，代码已全部实施并暂存，SSOT 状态失真 |

3. **受影响模块**

   - 前端绘制/测量引擎（useCesiumDrawMeasure.js）；
   - 版本文档 SSOT 链（README / CHANGELOG / structure 树 / TODO 方案）；
   - 构建链（vite `__APP_VERSION__` 注入源）。

## 修改内容

1. **Fix①** 根 README 第 83 行「当前版本 V3.5.31」→ **V3.5.32**（规范三处版本号全部对齐）。
2. **Fix②** frontend-structure.md 结构树：scenePicker.js 归位到 `draw/` 目录内（层级线修正），注释改为真实职责「场景取点工具（pickEarthPoint 两级取点链 pickPosition→pickEllipsoid 兜底 + Cartesian3↔经纬度换算）」；顺带将 useCesiumToolModules.js 的不通顺注释恢复为干净表述。
3. **Fix③** useCesiumDrawMeasure.js `activateInteraction('Clear')`：清空前先 `cancelActive()`，杜绝清空后仍处于绘制交互态（继续点击向已清空场景追加脏数据）。
4. **Fix④** useCesiumDrawMeasure.js：active 态新增 `clickPixels` 记录每次左击屏幕像素；finishInteraction 对末两点像素间距 ≤3px 时剔除最后一个点——双击结束与右击结束行为对齐（Point 类型豁免）。选像素阈值理由：地理距离阈值无法脱离相机高度换算（近地下厘米级间隔也是真实点），屏幕像素恒定可靠。
5. **Fix⑤** Docs/TODO/engine-aware-map-operations-migration-plan.md 状态行更新为「已实施（随 V3.5.32 落地）」并附裁决结论（进「三维数据」分组）。

## 审查通过项（无需改动的核验结论）

- **tianditu_ibo_w 国界注记层双引擎闭环** ✅：OL 走 basemapConfig.ts `LAYER_SOURCE_DEFINITIONS.createSource`；Cesium 经 `basemapProviderFactory.getDescriptorById` 共享同一张定义表（xyz → UrlTemplateImageryProvider），url 字段占位符 `{s}/{x}/{y}/{z}/{tiandituTk}` 两引擎均能正确解析。
- **HomeView 3D 选点 Promise.reject 降级路径安全** ✅：RoutePlannerPanel.enablePick 中 `await props.startPointPick(type)` 有 try/catch 保护，reject 不会形成 unhandledrejection。
- **viewer 重建/卸载复位钩子已挂接** ✅：initViewer 入口（1522-1523 行）与 onUnmounted（1653-1654 行）均调用 drawMeasureFeature.reset()/routeFeature.reset()。
- **setBasemapById expose 存在** ✅：常用地点 3D 跳转的 l 参数基座切换链路成立；`olZoomToCesiumHeight({zoom, centerLat, viewportHeight})` 参数签名与 compat.js 一致 ✓。
- **locale 新键命名空间正确** ✅：`cesium.interaction3dUnsupported` / `cesium.draw3dNoSelectionDelete` 双语键均位于 cesium 块内。
- **store 元数据生命周期闭环** ✅：MANAGED_CATEGORIES 差量修剪豁免 / remove 即时删档 / registerDrawing 支持 supportsOpacity 精确到 category='draw'（route 材质透明度创建时固化，TOC 关闭滑杆）。
- **detachEntityFromScene 宿主探测实现健壮** ✅：contains 全为 === 引用比较不受 Vue 代理影响；TerrainProvider 特判复位椭球；未命中回退 type 分支 100% 向后兼容。

## 修改原因

暂存区为多批不规范提交的累积体，需要以单一 V3.5.32 提交入库；入库前的最后一轮 code review 必须同时保证：版本号三处 SSOT 对齐（否则前端构建版本展示错误）、文件树准确（后续交接者按树导航）、交互行为一致（清空/撤销语义无残留）。

## 影响范围

- 三维绘制/测量交互（清空、双击结束行为）；
- 前端构建版本号注入；
- 文档导航体系（结构树/CHANGELOG/README）。

## 解决方案

见上文逐项 Fix。技术选型说明：④ 采用「屏幕像素间距」而非「地理距离阈值」判定重复点，因后者在任意相机高度下无法取到稳定常数；③ 采用复用既有 cancelActive 幂等清理而非新造终止函数，保持单条交互生命周期出口。

## 性能指标

未实测（均为正确性/一致性修复，不含性能优化路径；clearAllDrawings 复杂度不变 O(n)）。

## 测试方案

**Agent 已执行**：
- `node --check useCesiumDrawMeasure.js` 语法校验通过；
- `python Scripts/CheckStructureTree.py` 通过（文档条目 486 = 实际文件 486，警告 0）;
- `python Scripts/CheckConfigRegistry.py` 通过（catalog 122 key，全部登记一致）；
- 全仓 grep 确认 `toFixed(6)` 残留仅在 lng/lat 序列化（与 z 序列化无关）；z 收敛 2dp 为用户既定裁决（CHANGELOG §三·验收注明），无单测依赖。

**待用户实机验证**（npm run dev，3D 模式）：
1. 绘制线/面后按「清空」→ 场景成品与草图立即消失，鼠标再次点击不再追加图形（验证 Fix③）；
2. 双击结束一条测距线 → 终点无重复赘点，读数与右击结束时一致（验证 Fix④）；
3. 关于页/页脚显示版本号为 3.5.32（vite 重启 dev 后生效，验证 Fix①）；
4. 回归：点/线/面/测距/测面四类绘制、撤销上个、TOC 显隐/透明度/移除、公交驾车路线规划全流程正常。

## 变更文件清单（本会话增量，均为工作区未暂存改动）

| 文件 | 说明 |
|---|---|
| `README.md` | 项目简介行版本号 V3.5.31 → V3.5.32 |
| `Docs/Guide/frontend-structure.md` | draw/ 树归位 scenePicker.js + 注释修正 + toolModules 注释恢复 |
| `Docs/Guide/CHANGELOG.md` | V3.5.32 条目追加「7、整合会话 Code Review」小节 |
| `Docs/TODO/engine-aware-map-operations-migration-plan.md` | 状态行同步为已实施 |
| `frontend/src/domains/cesium/composables/draw/useCesiumDrawMeasure.js` | Clear 先 cancelActive；clickPixels 像素记录 + finishInteraction 3px 去重 |
| `Docs/LLM_record/26-08/2026-08-27/2026-08-27-v3532-staged-consolidation-review-fix.md` | 本日志 |

## 遗留与风险

1. **日志路径偏差（不可在本会话修复）**：`Docs/LLM_record/2026-08-27/` 下两份日志缺少月份层级目录（规范要求 `26-08/2026-08-27/`），因文件已在暂存区而本会话禁用一切 Git 写操作，无法移动/重命名 —— 已保持原样，仅在此登记。建议后续会话获准后用 `git mv` 纠正。
2. **CORS allow_credentials=True 安全面放宽**：通配来源回显 Origin 等价 allow all（starlette ≥1.0 行为），SSE withCredentials 必需；任何站点均可带凭证跨域访问 API —— 建议生产环境配置 CORS_ALLOWED_ORIGINS 白名单收紧（记入风险台账）。
3. **URL z 序列化 6dp→2dp** 为用户裁决的变更（米级精度充裕），存量分享链接按数值解析不受影响，但旧链接重建后的量化误差 ≤ 半米级高度。
4. **3D 绘制编辑能力差距**：框选删除（delete-selected）暂不支持仅提示降级；右键删除需走 TOC。
