# 2026-10-19 Cesium 导入体验 bug 修复包 + GLB 地理保真 + 落地页环章缓旋（V3.6.21）

> 任务要求：code review 暂存区代码并把其归档为版本 3.6.21；规范依据 `Docs/Force_command.md`。

## 日期与时间

2026-10-19 15:05

## 任务等级

L2（多文件 Bug 修复 + 版本归档；新建 `yieldUi.js` 属功能支撑文件，未涉及架构调整）

## 问题分析

### 症状 1：GLTF 坐标弹窗"还没输入就被关闭"
- 实测复现（无头浏览器探针）：干净会话中拖入 GLB 弹窗打开后 12s 稳定不关；确认流程成功关闭属设计内。唯一"未输入就关"的现实触发器 = 遮罩层 `@click.self` 静默取消——关顶部错误通知堆栈、误触地图都会命中。
- 根本原因：「弹窗唯一显式取消途径是背景点击」这一静默通道 + 缺键盘取消通道。
- 受影响模块：`CesiumDataImportDialog.vue` / `CesiumContainer.vue`。

### 症状 2：坐标提交失败一次，输入全丢
- 链路：`loadGltfWithUserCoords` catch 中 `revokeBlobUrl(blobUrl)` + `pendingGltfFile.value = null` → 弹窗由 `visible` 派生被动关闭 → 坏模型/网络失败 = 文件、坐标、弹窗一齐消失，只能重新拖拽。
- 同根：`confirmGltfReposition` 的 `finally` 无条件 `repositionTarget.value = null`，且旧实体在 try 开头已被 `entities.remove / primitives.remove`，Entity 路径失败后旧模型不回挂（仅图元路径曾做过回挂）。

### 症状 3：多文件导入第二 GLB 无声废除先到者
- `loadDataFiles` → `loadGLTF` 分支命中 `pendingGltfFile` 占位时直接 `revokeBlobUrl(pendingGltfFile.value.blobUrl)` 并被新文件覆盖——后到者静默废除先到者，无提示。

### 症状 4：加载中可无限连点"确认放置"
- busy 状态无防线，重复提交产生重复实体请求。

### 附带：GLB 最小像素尺寸语义
- `minimumPixelSize: 64` 恒显使小模型（树/设备）在国家尺度也看得见且缩放不变，与地理保真相悖；本轮按暂存裁决反转默认：gltfLoader 取消默认恒显、模型管理器默认 0 + 显式传参开启。

## 修改内容

1. **CesiumDataImportDialog.vue**：删除遮罩 `@click.self` 取消；新增 `busy` / `loadError` props；busy 冻结三个输入框 + 两按钮，确认钮转"加载中…"；失败行内 `.dialog-load-error` 展示（可重试说明）；Esc 显式取消（visible watch 挂/卸窗口监听，`onBeforeUnmount` 清理，busy 中忽略）；警示 emoji ⚠️ 去除，改 icons（@lucide/vue TriangleAlert，图标规范）。
2. **CesiumContainer.vue**：接线 `:busy="gltfLoading"` / `:load-error="gltfLoadError"`；顺带清理重复注释。
3. **useCesiumDataImport.js**：
   - 新增 `gltfLoading` / `gltfLoadError` refs 并导出；
   - `loadGltfWithUserCoords` 失败仅记录错误文本，**不撤销 blob、不清 pendingGltfFile**（弹窗保留可重试）；`cancelPendingGltf` 撤销时清错误信息；
   - `confirmGltfReposition` 失败保留 `repositionTarget`；引入 `swapped` 位：新模型成功替换前的失败把旧实体回挂（Entity 路径 `entities.add`，图元路径 `primitives.add`——补齐旧实现缺失的 Entity 回挂），替换成功后的失败不回滚（防双份挂载）；
   - 多文件第二 GLB：撤销**新**文件 blob + `message.info` 提示先确认/取消，返回 `{ skipped: true, file }` 标记（三个调用方均不消费返回值，无下游影响）；
   - `loadDataFiles` 外层统一 `withImportMask`（内部拆出 `importFilesInternal`）。
4. **yieldUi.js（新建）**：`nextPaint()` 双 rAF 遮罩上屏握手；`yieldSlice()` setTimeout(0) 协作让步；`withImportMask(text, run)` = showLoading(timeoutMs:0) → 双 rAF → 重活 → finally hideLoading。遮罩 `pointer-events:none` 仅提示不锁交互。
5. **useLayerDataImport.js（OL）**：`addUserDataLayer` 拆出 `importUploadInternal`，外层 `withImportMask`；错误收口分层——内核 catch 只做面板进度条 error 反馈 + rethrow（含不支持投影标志透传），外层统一 `message`（`UNSUPPORTED_PROJECTED_CRS_MESSAGE` 幂等 + 通用"文件解析失败"），进度条 error 覆盖全部失败路径（含原版提前 return 的不支持投影分支）。
6. **useCesiumDataOpsHandlers.js**：3D Tiles ZIP 选择入口改走 `loadDataFiles([file])`（统一遮罩与批量链路），注释对齐真实实现。
7. **gltfLoader.js / useCesiumModelManager.js**：取消 GLB 默认 `minimumPixelSize: 64`，默认地理保真（远小近现）；模型管理器 `options.minimumPixelSize > 0` 才下发恒显参数，既有显式调用（planar-route `frustum.ts` 无人机 ≥48 / 飞行控制器 32~200）不受影响。
8. **SectionTitle.vue**：节头印章外环 hover 60s 极缓旋转（`seal-turn` keyframes），`prefers-reduced-motion` 环境静止。

## 修改原因

导入链路（尤其 GLTF 拖拽定位）的失败路径会静默丢弃用户输入与文件，交互不可恢复；重活期间无任何可见反馈被误读为卡死；GLB 恒显语义与地理保真冲突。全部为实际使用中暴露的体验/数据保全缺陷。

## 影响范围

- Cesium 数据导入：GLTF/GLB 拖拽导入与重定位、多文件批量、3D Tiles ZIP、KMZ/ZIP 面板导入（遮罩链路）；
- OL 数据导入：上传/文件夹/zip/kmz/tif/矢量（遮罩与错误收口）；
- 落地页：SectionTitle 视觉（仅新增 hover 动效，布局不变）；
- GlobalLoading 组件：仅被调用（showLoading/hideLoading），组件本身未改。

## 解决方案

- 取消通道三选一：保留静默点背景 / 只按钮 / **按钮 + Esc（选定）**——静默通道是误触根源，Esc 补键盘可及性，两者皆显式。
- 失败保全策略：与「确认成功才清 state」对齐——state(`pendingGltfFile`/`repositionTarget`) 只在成功路径或显式取消时释放；错误行内化，避免"关窗即抹错"。
- 重定位回滚：**swapped 位**区分"移除旧但未换新"（可安全回滚）与"已换新"（回滚会双份挂载）两阶段。
- 遮罩握手：双 rAF 等 `showLoading` 完成合成再进重活，解决"遮罩从未可见"。
- 候选方案对比与取舍：把解析挪 worker / 流式解析属 L3 大手术（此前 zip worker 实验已按用户裁决移除），本轮不引入，仅做交互与数据保全。

## 性能指标

未实测（本轮为交互修复与反馈增强，不改动解析耗时；导入耗时理论上不变，遮罩握手增加两帧 ≈ 32ms 一次的延迟）。

## 测试方案

### Agent 已执行
- `npx eslint` 全部改动源文件：0 error；
- `npm run build` 全量通过；
- `python Scripts/CheckStructureTree.py`、`python Scripts/CheckConfigRegistry.py` 通过；
- §11.2 红线自查 4 条命令全绿。

### 待用户实机验证
1. 拖入 1 个 GLB → 弹窗打开；再拖第 2 个 GLB → 提示"已有模型等待坐标确认，xxx 暂未导入"，先一个仍在弹窗中；
2. 填坐标提交一个坏 GLB（或断网加载远程模型）→ 弹窗**不关闭**，行内红色错误条出现，改坐标可重试；成功则照常落地；
3. 弹窗中按 Esc → 关闭；加载中按 Esc → 无反应（按钮同样灰禁）；
4. 点背景（地图/通知栏）→ 弹窗不关；
5. 工具面板「调整位置」选一个模型 → 填错坐标提交失败 → 弹窗保留 + 旧模型回挂原位；改对坐标重试成功；
6. 启动任何大数据导入（KMZ/大 SHP/大 TIF/3D Tiles ZIP）→ 顶部 GlobalLoading"正在导入数据，请稍候…"应先上屏再进入卡顿期；
7. GLB 拖入后远看应"小而不可见"、推近逐渐显现（地理保真）；模型管理器勾选任意参数（含 minimumPixelSize>0）行为不变；无人机视锥/飞行器模型仍恒显；
8. 落地页节标题 hover：印章外环缓慢旋转；系统开启"减弱动态效果"时不旋转。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/domains/cesium/components/CesiumDataImportDialog.vue` | 取消通道/busy/loadError/Esc/图标合规 |
| `frontend/src/domains/cesium/components/CesiumContainer.vue` | busy/loadError 接线 + 注释清理 |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataImport.js` | 失败保全/swapped 回滚/多文件 skip/遮罩 |
| `frontend/src/domains/cesium/composables/dataImport/useCesiumDataOpsHandlers.js` | ZIP 入口走 loadDataFiles + 注释对齐 |
| `frontend/src/domains/common/data-import/yieldUi.js` | 新建：遮罩握手与让步工具 |
| `frontend/src/domains/ol/data-import/composables/useLayerDataImport.js` | OL 遮罩 + importUploadInternal 拆分 + 缩进回正 |
| `frontend/src/domains/cesium/composables/dataImport/loaders/gltfLoader.js` | 移除默认 minimumPixelSize（地理保真） |
| `frontend/src/domains/cesium/composables/models/useCesiumModelManager.js` | 恒显参数改显式下发 |
| `frontend/src/app/components/SectionTitle.vue` | 环章 hover 缓旋 |
| `frontend/src/app/LandingView.vue` | 落地页批次（随暂存归档，本会话未改动） |
| `.github/traffic.json` | 用户自带暂存（流量统计自动更新） |
| `Docs/LLM_record/26-10/2026-10-13/2026-10-13-import-to-3d.md` | 用户自带暂存（1 行补记） |
| `README.md` | 三处版本号 → V3.6.21 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.6.21 条目 |
| `Docs/Guide/frontend-structure.md` | 补 yieldUi.js 条目 |

## 遗留与风险

1. **导入卡顿大头未解决**：同步主线程 KML/XML 解析、OL readFeatures、Cesium KmlDataSource.load、投影计算仍是冻结源；worker/流式解析为 L3 立项（此前 zip worker 实验已按用户裁决整体移除，本轮零残留）。遮罩只提供可见反馈，不降低卡顿。
2. Esc 监听为 `window` 级：若未来有与本弹窗并存的其他 Esc 敏感顶层控件，可能同时响应；当前并存场景未发现 ⚠️ 未验证。
3. `minimumPixelSize` 默认值变化为**预期行为变化**：历史上依赖"默认 64 恒显"的调用方（如有未察觉的隐式依赖）需显式传参；已排查 planar-route / 飞行控制器等显式调用不受影响。
4. `message.error('文件解析失败: ' + e.message)` 在 `e` 非 Error 时会抛 TypeError（历史同构写法，本轮未改）。
5. zipInflateWorker.js（上次会话遗留孤儿索引项）已彻底消失于工作区与索引，无历史提交，无残留引用（grep 0 命中）。

> 补记：2026-10-13 的 `2026-10-13-import-to-3d.md` 追加 1 行为用户自带暂存内容，本会话未改动其正文。
