# Code Review 修复批次（H3 文档 / H8 缩放 / GBK / blob URL / H7 跨层违规）

- **日期与时间**：2026-08-04 11:07
- **任务等级**：L2（H7 跨层违规修复为主；God 组件拆解属 L3，延后）
- **问题分析**：
  - 核心症状：2026-08-04 全量代码审查产出 1 CRITICAL + 8 HIGH + 前端 11 MEDIUM，用户挑选 8 项修复：登录限流文档、跨层违规 17 处、setEnableZoom 硬编码、cesium.d.ts 83 个 any、blob URL 泄漏、GBK DBF 方块符、GPU 资源泄漏、罗盘旋转 90°、God 组件、tsconfig strict。
  - 根本原因（逐项）：
    - H3 登录限流：`high-security-fixes.md` 声称已实现限流，实际同日 `config-fix-and-cr-final.md` 已**用户刻意回滚**——当前零限流即最终意图，**文档与代码不符**，非代码缺陷。
    - H8 `playerController.ts:751` `setEnableZoom` 将 `screenSpaceCameraController.enableZoom` 硬编码为 `false`，忽略参数 `e`。
    - GBK DBF：`dbfParser.decodeString` 的 supportedEncodings 不含 GBK，GBK 走 fallback 分支全部替换为 `■`（方块符）→ 中文数据丢失。
    - blob URL：`tileLifecycle.ts` 用 `fetch()` 生成 blob URL 赋给 `img.src` 后从不 `revokeObjectURL`，瓦片切换高频创建 → 内存泄漏。
    - H7 跨层违规：common 域 19 处 `@ol/` / `@cesium-domain/` import（审查计 17，实测 19）。其中 10 处属**纯基础设施/纯数据**被物理放在 ol 域（runtimeMapTokens、viewScaleConverter、basemapPresets、BASEMAP_OPTIONS 派生、isValidLabel、useTOCStore 的 OL store 依赖）；9 处属 TOCPanel 双引擎组件与 SidePanel 懒加载路由，需 God 组件拆解。
  - 受影响模块：底图链路、瓦片加载、数据导入（DBF）、要素高亮联动、Cesium 玩家控制器、前端分层架构。
  - 候选方案对比（H7）：方案 A 纯模块迁入 common + handler 注入（解决 10 处，零行为变更）／方案 B TOCPanel 立即拆解（L3，风险高）→ 选方案 A，B 延后为独立 L3。

- **修改内容**：

  1. **H3 文档更正**：`2026-08-01-code-review-high-security-fixes.md` 顶部加更正横幅，标注登录限流与 `/api/info` 门控为同日 `config-fix-and-cr-final.md`（V3.5.5）用户刻意回滚，当前状态即最终意图。
  2. **H8 缩放开关**：`playerController.ts` `setEnableZoom(e)` 改为 `enableZoom = e`（同步 Cesium 相机控制器，传 true 恢复缩放）。
  3. **GBK DBF 修复**：`dbfParser.ts` supportedEncodings 增补 `GBK / GB2312 / CP936`，走原生 TextDecoder 解码，不再方块符替换。
  4. **blob URL 内存泄漏**：`tileLifecycle.ts` 在 `img.src = url` 前绑定 `load`/`error` 一次性监听器，成功/失败均 `revokeObjectURL`。
  5. **H7 跨层违规（10/19 处解决）**：
     - `runtimeMapTokens.js`：ol/services → **common/services**（纯基础设施，仅依赖 `@/api/backend`）；更新 9 个导入方（geocoding、CesiumContainer、TOCPanel、SidePanel、ApiKeysManagementPanel、useWeatherData、MapContainer、MapDownloader、AmapAoiInjectDialog）。
     - `viewScaleConverter.js`：ol/utils → **common/utils**（纯数学零依赖）；更新 2 个导入方（HomeView、mapCommandAdapters）。
     - `basemapPresets.ts`：ol/basemap/constants → **common/basemap**（纯数据）；更新 4 个引用方（mapContextSnapshot、useUrlParamStore、basemapConfig re-export、basemapResolver）。
     - **新增 `common/basemap/basemapOptions.ts`**：从 basemapResolver 抽离纯数据派生 `DEFAULT_BASEMAP_LAYER_INDEX` / `BASEMAP_OPTIONS`（re-export `URL_LAYER_OPTIONS`）；basemapResolver 改从 common 导入并 re-export（兼容旧 import 路径）；AdminControlPanel 改 import common。
     - `isValidLabel`：TOCTreeItem 改直接 import `@common/utils/labelValidator`（该函数本就在 common，biz/index 仅为重导出）。
     - `useTOCStore.ts` 去 OL 依赖：新增 `common/layer-tree/stores/layerRemovalHandler.ts`（`registerLayerRemovalHandler` / `notifyLayerRemoved` 回调注册表），useTOCStore 的 `removeLayerMeta` 改调用 `notifyLayerRemoved(id)`；`useFeatureStyleStore.ts`（ol 域）注册回调联动清理高亮。
  6. **延后项（L3 / 存疑待实机，详见遗留与风险）**：cesium.d.ts 83 个 any、tsconfig strict:false、罗盘 90°、GPU 泄漏、God 组件拆解、TOCPanel/SidePanel 剩余 9 处跨层违规。

- **修改原因**：消除跨层违规使分层架构合规；修复功能缺陷（缩放不可用、GBK 数据丢失、blob URL 泄漏）；纠正审查日志与代码事实不符的文档。

- **影响范围**：底图选择/URL 参数/管理面板（basemapPresets/Options 迁移）、瓦片加载生命周期（revoke）、DBF 数据导入、TOC 图层移除联动、Cesium 玩家缩放、common 与 ol 域分层边界。

- **解决方案**：

  **H7 跨层违规（核心）**：依赖倒置——引擎域（OL）向 common 注册回调，common 零引擎域依赖。

  - 方案 A（选定）：纯模块迁入 common + handler 注入 → 解决 10 处，零行为变更。
  - 方案 B（延后）：TOCPanel 拆解为 OL/Cesium 双 TOC 组件 → L3，单独立项。

  解耦前后数据流（`useTOCStore ↔ layerRemovalHandler ↔ useFeatureStyleStore`）：

  ```mermaid
  sequenceDiagram
      participant TOC as useTOCStore（common）
      participant Reg as layerRemovalHandler（common）
      participant FSS as useFeatureStyleStore（ol）

      Note over FSS,Reg: 模块加载期（顶层代码）
      FSS->>Reg: registerLayerRemovedHandler(cb)

      Note over TOC,Reg: 运行时（用户移除图层）
      TOC->>Reg: notifyLayerRemoved(layerId)
      Reg->>FSS: cb(layerId)
      FSS->>FSS: clearHighlightsByLayer(layerId, null)
  ```

  依赖方向：引擎域 → common 注册；common 反向通知时无引擎域 import（§3 分层边界合规）。

- **性能指标**：未实测（涉及内存泄漏修复，实机运行可对比 DevTools 内存曲线；本次仅静态确认 revoke 链路）。

- **测试方案**：
  - **Agent 已执行**：
    - 跨层违规重扫：19 → 9 处（残留均属 TOCPanel/SidePanel L3 范畴）；旧路径引用 grep 零残留。
    - `npx tsc --noEmit` 通过（exit 0）。
    - `npx vite build` 通过（27.7s，仅 chunk 体积预存警告）。
    - `CheckStructureTree.py` / `CheckConfigRegistry.py` 运行，失败项均为**预存**（4 个 svgCompass 幽灵条目 + 8 处测试 B1，审查日志已登记），本次改动漏登记 0 / 配置零改动。
  - **待用户实机验证**：
    1. 底图切换、URL 参数 `l`、管理面板底图下拉正常（basemap 常量迁移无行为变化）。
    2. TOC 移除图层后该图层要素高亮仍被清除（handler 注入联动）。
    3. 导入含中文的 GBK 编码 DBF 不再显示方块符。
    4. 滚轮缩放开关（设置里切换 enableZoom）实际生效。
    5. 瓦片长时间缩放/切换，DevTools Performance/内存无持续上涨。

- **变更文件清单**（全部为仓库相对路径）：
  - 前端移动（文件物理迁移）：
    - `frontend/src/domains/ol/services/runtimeMapTokens.js` → `frontend/src/domains/common/services/runtimeMapTokens.js`
    - `frontend/src/domains/ol/utils/viewScaleConverter.js` → `frontend/src/domains/common/utils/viewScaleConverter.js`
    - `frontend/src/domains/ol/basemap/constants/basemapPresets.ts` → `frontend/src/domains/common/basemap/basemapPresets.ts`
  - 前端新增：
    - `frontend/src/domains/common/basemap/basemapOptions.ts` — 底图选项派生常量
    - `frontend/src/domains/common/layer-tree/stores/layerRemovalHandler.ts` — 图层移除回调注册表
  - 前端导入路径更新（15 文件）：
    - `frontend/src/api/geocoding.js`、`frontend/src/domains/cesium/components/CesiumContainer.vue`、`frontend/src/domains/common/layer-tree/components/TOCPanel.vue`、`frontend/src/domains/common/shell/SidePanel.vue`、`frontend/src/domains/common/user/components/ApiKeysManagementPanel.vue`、`frontend/src/domains/common/weather/composables/useWeatherData.js`、`frontend/src/domains/ol/components/MapContainer.vue`、`frontend/src/domains/ol/components/MapDownloader.vue`、`frontend/src/domains/ol/search/components/AmapAoiInjectDialog.vue`（runtimeMapTokens）
    - `frontend/src/app/HomeView.vue`、`frontend/src/domains/common/chat/agent/mapCommandAdapters.js`（viewScaleConverter）
    - `frontend/src/domains/common/chat/agent/mapContextSnapshot.js`、`frontend/src/domains/common/url-state/stores/useUrlParamStore.ts`、`frontend/src/domains/ol/basemap/constants/basemapConfig.ts`（basemapPresets）
    - `frontend/src/domains/common/user/components/AdminControlPanel.vue`（basemapOptions）
    - `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue`（labelValidator）
  - 前端逻辑修改：
    - `frontend/src/domains/cesium/modules/player-controller/playerController.ts` — H8 setEnableZoom
    - `frontend/src/domains/common/data-import/parsers/dbfParser.ts` — GBK 支持
    - `frontend/src/domains/ol/tile-source/tileLifecycle.ts` — blob URL revoke
    - `frontend/src/domains/ol/basemap/constants/basemapResolver.ts` — 纯数据常量改 common re-export
    - `frontend/src/domains/common/layer-tree/stores/useTOCStore.ts` — handler 注入去 OL 依赖
    - `frontend/src/domains/ol/stores/useFeatureStyleStore.ts` — 注册图层移除回调
  - 文档：
    - `Docs/LLM_record/26-08/2026-08-01/2026-08-01-code-review-high-security-fixes.md` — H3 更正横幅
    - `Docs/Guide/frontend-structure.md` — 结构树同步（3 迁入 + 2 新增登记）
    - `Docs/TODO/bugfix-optimization-plan.md` — 追加 P3-7~H7 剩余 9 处 / P3-8~cesium.d.ts 83 any / P3-9~tsconfig strict / P3-10~存疑缺陷
    - `README.md`、`Docs/Guide/CHANGELOG.md` — 版本号 V3.5.11

- **遗留与风险**：
  1. **H7 剩余 9 处跨层违规**（TOCPanel 7 + SidePanel 2）——TOCPanel 为 2493 行双引擎 God 组件，拆解属 L3 任务，已记入 [bugfix-optimization-plan](../../TODO/bugfix-optimization-plan.md) 与交接块。
  2. **cesium.d.ts 83 个 any**：Cesium 经 CDN 加载无官方类型。手写 83 个声明属臆造 API 签名风险；正确路径是迁移 npm `cesium` 包（自带类型），属 L3 依赖变更，延后。
  3. **tsconfig strict:false**：开启 strict 将暴露大量隐式 any（2000+ 行组件普遍），属 L3 大规模重构，延后。
  4. **罗盘旋转 90° / 文字倒置**：静态读码无法确认缺陷（`CompassManager.drawRadialText` 旋转逻辑为标注做法，扇区分割起点 `-Math.PI/2` 为标准），标记 **存疑待实机复现**，未臆造修复。
  5. **Cesium GPU 资源泄漏**：wind/fluid 生命周期静态审查为合理管理（`clearWind2D`/`destroyFluidOnly` 均成对清理），无法从静态确认泄漏，标记 **存疑待实机**（DevTools 帧缓冲监控）。
  6. 门禁脚本 CheckStructureTree.py / CheckConfigRegistry.py 退出码 1，均为**预存问题**（4 个 svgCompass 幽灵条目 + 8 处测试 B1），本次改动未引入新漂移。
