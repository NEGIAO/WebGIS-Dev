# Cesium 本地化自托管 + 天空渲染修复 + 暂存区审查收敛

- **日期时间**：2026-08-22 10:31
- **任务等级**：L2

---

## 问题分析

### 核心症状

按 `Docs/Force_command.md` 对暂存区（391 个文件）做 code review，发现三类问题：

1. **文档与代码失真**：暂存的 CHANGELOG V3.5.26 条目与 README 版本演进表描述的是已被否决的中间方案（`minDurationMs` 最短持续时间 + 10s 调试覆写），而实际代码最终形态是 `hideDelayMs` 隐藏延迟 1s（HEAD commit df9d761d）。
2. **配置登记漂移**：`.env.example` 仍登记旧 key `VITE_CESIUM_CDN_BASE_URLS` / `VITE_CESIUM_CDN_ATTEMPT_TIMEOUT_MS`，而代码已更名 `VITE_CESIUM_ASSET_*` 且候选链缺省值完全不同。
3. **结构树漏登**：新增文件 `frontend/src/domains/common/data-import/cesiumWarmup.js` 未登记 `frontend-structure.md`（CheckStructureTree 报漏登 1 项）。

### 根本原因

今日多个会话连续迭代：Loading 方案经历 minDurationMs(10s) → hideDelayMs(2s→1s) 两轮演进并已单独提交（df9d761d），但暂存的 V3.5.26 文档停留在第一轮方案；Cesium 本地化批次新增配置 key 与新文件后未走完登记流程即入暂存区。

### 受影响模块

- 文档治理：README、CHANGELOG、frontend-structure.md
- 配置登记：根 `.env.example`
- 前端：Cesium 加载链路（cesium-shim / publicRuntime）、体积云渲染（AtmospherePostProcess）、云质量预设、地形默认值、空闲预热

### 附带代码审查结论

逐文件过目暂存源码 diff（useAppStore/router/HomeView/cesium-shim/publicRuntime/useCesiumLayers/cloudQualityPresets/AtmospherePostProcess/assetPaths/createCloudAtmosphere/lib-index/cesiumWarmup/package.json），未发现新的功能性 bug；本批次中唯一实质性运行时 bug（Bruneton 天空变黑，单位误换算）已在今日早前会话修复并包含于暂存区。

---

## 修改内容

### Bug 修复 / 不一致修复（本次审查会话）

1. `.env.example`：`VITE_CESIUM_CDN_BASE_URLS`/`VITE_CESIUM_CDN_ATTEMPT_TIMEOUT_MS` 更名为 `VITE_CESIUM_ASSET_BASE_URLS`（缺省 `/cesium/`）/`VITE_CESIUM_ASSET_ATTEMPT_TIMEOUT_MS`。
2. `Docs/Guide/frontend-structure.md`：common/data-import 下补登 `cesiumWarmup.js`（含功能注释）。
3. README「版本演进」表 V3.5.26 行描述修正为最终 hideDelayMs 方案。
4. CHANGELOG V3.5.26 条目标题与内容勘误，追加「后续演进」说明指向 V3.5.27。

### 文档更新（版本发布）

5. 版本号 V3.5.26 → **V3.5.27**（README 三处：项目简介 / 版本演进表首行 / 页脚）。
6. CHANGELOG 追加 V3.5.27 完整条目（涵盖暂存区内今日全部 Cesium 批次改动）。
7. 新建本维护日志。

### 纳入本次版本的既有改动（今日前序会话产出，随暂存区一并交付）

- Cesium 主库本地化：devDep `cesium@1.132`；`Build/Cesium/` → `frontend/public/cesium/`（21MB）；`publicRuntime.ts` 新增 `ASSET_BASE_URL` 上移 + `CESIUM_ASSET_BASE_URLS` 本地候选链；`cesium-shim.js` 弃用公共 CDN（BootCDN 因投毒前科移除）。
- 云大气死代码清理：`assetPaths.js` 删除 jsDelivr 分支 / 包名常量 / 废弃 `getDefaultAssetPaths`；`createCloudAtmosphere.js`、`lib/index.js` 同步收敛。
- Bug 修复：`AtmospherePostProcess.marchShadowLengthAtm` 单位误换算（km 误除 0.001 放大 1000 倍）导致 BSM 开启档天空变黑——改为直接返回 km。
- 流畅档 BSM 观感对齐：`bsmGroundScale 0.18→0.12`、`shadowPcfTaps 1→4`、`shadowResolveEnabled false→true`。
- 地形默认统一：删除 DEV 强制平面地形分支，本地/部署同为天地图世界地形。
- 新增 `cesiumWarmup.js`：map-core-ready 后 10s + idle 后台预载 Cesium 主脚本（saveData/2G 跳过）；HomeView 挂接。

---

## 修改原因

规范 §7 DoD 要求门禁通过、结构树同步、配置登记一致；SSOT 原则要求文档描述与仓库实际代码唯一对齐。暂存区即将整体提交，必须在提交前消除三处失真，避免历史文档固化错误方案名。

---

## 影响范围

- Cesium 加载链路（自托管 + 预热）
- 体积云渲染管线（天空/云影）
- 地形默认选择
- 配置登记表与结构树文档

## 解决方案

- 文档失真：以 HEAD commit df9d761d 的实际代码为准回写描述，V3.5.26 条目保留排查过程但显式标注方案演进去向（不重写历史，只补勘误注）。
- 配置漂移：按规范 §3 登记前置原则同步 `.env.example`（前端 VITE_ key 不进 catalog.py，与既有 122 key 结构一致）。
- 结构树漏登：补行并通过 CheckStructureTree 复验。

## 性能指标

未实测（预热收益依赖网络环境；预期切换 3D 时主脚本命中 HTTP 缓存）。CF brotli 后传输约 1.2~1.4MB 的估算待用户实机 Network 面板确认。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `npm run build` 通过（22~30s，含 cesium-shim 独立 5KB chunk 产物确认） | 2D 首页停留 >10s，Network 过滤 `Cesium.js` 应后台完成下载，控制台出现 `[CesiumWarmup]` |
| `npx eslint` 全部涉改文件零告警 | 切换 3D 应秒开（缓存命中）；断网缓存清空场景首次切换正常加载本地 `/cesium/Cesium.js` |
| `python CheckConfigRegistry.py` ✅（122 key） | 均衡/极致档天空恢复蓝色渐变且丁达尔光柱正常 |
| `python CheckStructureTree.py` ✅（补登后 0 漏登） | 流畅档手动开 BSM 后云影浓度/软硬与均衡档一致 |
| 全 src 无 jsdelivr/unpkg/bootcdn 残留（grep 复核） | dev 模式 Cesium 默认加载天地图地形（无 token 时降级提示） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `.env.example` | Cesium 两个配置 key 更名并对齐本地化缺省值 |
| `README.md` | 三处版本号 → V3.5.27；演进表加 V3.5.27 行、修正 V3.5.26 行描述 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.27 完整条目；V3.5.26 条目勘误+演进标注 |
| `Docs/Guide/frontend-structure.md` | 补登 cesiumWarmup.js |
| `Docs/LLM_record/26-08/2026-08-22/2026-08-22-cesium-selfhost-and-review.md` | 本日志 |

> 暂存区内其余 386 个文件为今日前序会话的代码/资源改动（Cesium 21MB 静态资源为主体），已在上方「纳入本次版本的既有改动」节归类说明，此处不重复罗列。

## 遗留与风险

- `frontend/public/cesium/` 21MB 二进制入库使仓库显著增重、clone 变慢——已知取舍（GitHub Pages + CF 边缘缓存的可靠性收益），后续若不可接受可改 CI 构建期从 npm 包拷贝。
- 云大气模块的 LensFlare 资产（DirtMask/StarBurst 等）仍取自本地 `Assets/Textures/LensFlare/`（随主库本地化一并落地），无需额外处理。
- `waitForCriticalTileReady` 就绪门槛弱（单瓦片即就绪）的根因级增强仍挂 TODO（见 Docs/TODO/bugfix-optimization-plan.md，如未登记建议补记）。
- CF 侧 `/cesium/*` 长 TTL Cache Rule 尚未配置，属部署面操作需用户在 CF 控制台执行。

---

## 增量审查（2026-08-22 10:45 · 续审会话，同任务追加）

> 用户要求按 Force_command 复审暂存区。本节为独立二轮审查的增量产出，前文由并行的第一轮收敛会话书写，内容经复核属实，予以确认。

### 二轮审查新增修复

8. **`publicRuntime.ts` 默认基址 Bug（功能性）**：原实现 `stripTrailingSlash(ASSET_BASE_URL)` 在 `VITE_BASE_URL=./`（仓库默认 `.env`）时把基址归一为绝对 `/`，拼出 `/cesium/` 绝对路径——相对部署（子路径 / 非根域名静态托管）下 Cesium 主脚本将 404 且无回退源。与本文档 CHANGELOG 声明的「默认 `{BASE_URL}/cesium/`」语义不符。修复：新增 `withTrailingSlash()` 辅助函数，默认值改为保留 `BASE_URL` 原始形态拼接——`'./'` → `'./cesium/'`、`'/WebGIS-Dev/'` → `'/WebGIS-Dev/cesium/'`、`'/'` → `'/cesium/'`，hash 路由 + 相对解析两种部署形态通吃；`.env` 显式值仍可覆写。
9. **`cesiumWarmup.js` 成功日志级别**：预热成功属正常路径，`console.warn` → `console.info`（加 eslint-disable 注释，与 cesium-shim 成功日志先例一致）；失败告警保留 warn。

### 二轮顺带发现（只记不改，已登记 Docs/TODO/bugfix-optimization-plan.md）

- `public/cesium/index.js` + `index.cjs` 为 npm 包入口误拷贝（运行时零引用，约 3MB 死重），处置权在用户 git 操作。
- CheckConfigRegistry F2 门禁对动态传参读取的 env key 存在盲区（本次更名期间未报警即为例证）。
- `.env` 显式 `VITE_CESIUM_ASSET_BASE_URLS=/cesium/` 与 `build:webgis-dev` 子路径构建组合存在 404 风险（根域名部署无影响）。
- 云资源基址 `./` 构建下同为绝对路径（既有问题，与修复 8 同根源）。

### 二轮测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `python CheckStructureTree.py` ✅（433/433） | 相对部署场景（若有）：子路径站点切 3D 应能加载本地 Cesium.js |
| `python CheckConfigRegistry.py` ✅ | 根域名正式站回归：2D→3D 切换、体积云三档天空观感 |
| `npx tsc --noEmit` ✅（业务代码零错误，仅存既知 12 项模块解析噪音） | — |
| `npx eslint publicRuntime.ts cesiumWarmup.js` ✅ 零告警 | — |
| `npm run build` ✅（含修复 8 的类型与产物验证） | — |

### 二轮变更文件清单（增量）

| 文件 | 说明 |
|---|---|
| `frontend/src/config/publicRuntime.ts` | 新增 `withTrailingSlash()`；Cesium 默认候选链保留 BASE_URL 相对形态 |
| `frontend/src/domains/common/data-import/cesiumWarmup.js` | 成功日志 warn → info |
| `Docs/TODO/bugfix-optimization-plan.md` | 追加 4 条顺带发现登记 |
| 本日志 | 追加本增量章节 |

---

## 增量 II：静态资源基址统一相对化（2026-08-22 11:00 · 用户确认多处部署后续审）

> 用户反馈：项目多处部署（根域名 + 子路径并存），必须使用相对路径。据此将二轮审查登记的「部署面」类发现升级为统一治理，覆盖全部静态资源消费方。

### 问题分析（增量）

- **核心症状**：`VITE_BASE_URL=./` 构建时，`publicRuntime.ASSET_BASE_URL` 被归一为绝对 `'/'`，下游 10 处消费方（ShareData 共享资源、cloud-atmosphere 云资源、adcode 行政区划树、images/hf-logo 静态图等）全部产出 `/xxx` 绝对路径；子路径部署下均 404。`.env` 中显式 `VITE_CESIUM_ASSET_BASE_URLS=/cesium/` 同病。
- **根本原因**：`ASSET_BASE_URL` 定义用「去尾斜杠 + 空则回退 '/'」归一化，丢失了 BASE_URL 的相对形态信息。
- **受影响模块**：配置单点（publicRuntime）、共享数据导入、云大气资源、行政区划树、用户面板图标、TopBar/Landing/Register。

### 解决方案

在源头重定义而非逐点修补：`ASSET_BASE_URL = withTrailingSlash(BASE_URL || './')`——保留原始形态（'./' 保持相对、'/WebGIS-Dev/' 保持绝对子路径），10 处消费方零改动自动对齐。逐一核验消费模式兼容性：

| 消费模式 | 兼容性核验 |
|---|---|
| `endsWith('/') ? : 补斜杠`（TopBar/Landing/Register/FloatingAccountPanel/PreferencesTab/tryLoadTreeFile） | './' 已带尾斜杠，原样通过 ✅ |
| `` `${ASSET_BASE_URL}/ShareData`.replace(/\/+/g,'/') `` | './/ShareData' → './ShareData' ✅ |
| `ASSET_BASE_URL.replace(/\/+$/,'') + '/images/...'`（SecurityTab） | '.' + '/images/hf-logo.svg' = './images/...' ✅ |
| `resolveWebgisCloudAssetPaths(ASSET_BASE_URL)` | 内部自带 withTrailingSlash → './cloud-atmosphere/...' ✅ |
| Cesium 默认候选链 | 简化为 `${ASSET_BASE_URL}cesium/` ✅ |

配套：`.env` / `.env.example` 的 `VITE_CESIUM_ASSET_BASE_URLS` 置空走相对默认（多处部署恒留空；注释说明覆写用法）；TODO 计划销项 1 条、改写 1 条为长期提醒。

### 增量 II 变更文件

| 文件 | 说明 |
|---|---|
| `frontend/src/config/publicRuntime.ts` | `ASSET_BASE_URL` 重定义保留相对形态；Cesium 默认链复用之 |
| `.env` / `.env.example` | `VITE_CESIUM_ASSET_BASE_URLS` 置空 + 注释更新 |
| `Docs/TODO/bugfix-optimization-plan.md` | 云资源条目销项；env 绝对值条目改写为提醒 |
| `Docs/Guide/CHANGELOG.md` | V3.5.27 条目补记统一治理 |
| 本日志 | 追加增量 II 章节 |

### 增量 II 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 门禁 ×2 ✅ / tsc --noEmit ✅ / eslint 涉改文件 ✅ / npm run build ✅ | **子路径部署实测**：`build:webgis-dev` 产物部署后切 3D 加载本地 Cesium.js、开启体积云加载 cloud-atmosphere 资源、行政区树加载，Network 面板确认均为相对路径且 200 |
| 三种 BASE_URL 形态拼接推演（'./'、'/'、'/WebGIS-Dev/'）记录于上表 | 根域名正式站回归：共享数据 ShareData、用户面板图标正常 |

### 部署面热修（2026-08-22 11:20 · 用户指令）

- **动机**：Cesium 本地化后 dist 新增 `cesium/ThirdParty/*.wasm`（basis/draco/gaussian-splat 转码器），`deploy.yml` 的 HF 同步任务 LFS 追踪清单未含 `*.wasm`，文件以裸 git blob 推送被 HF Xet pre-receive 钩子拒绝（`remote rejected ... contains binary files`），前端 Space 部署中断。
- **改动**：`.github/workflows/deploy.yml` 的 `deploy-frontend-to-hf` 任务补 `git lfs track "*.wasm"`（顺带 `*.gif`，覆盖 Cesium Widgets 内置 loading 动图）。经用户明确指示修改部署面工作流。
- **待验证**：下次 push main 触发工作流，确认 HF Space 推送成功（LFS 对象数应增加 3 个 wasm）。

### 零散修补（2026-08-22 11:40 · 用户指令）

- **icon.webp 首屏双请求优化**：① 源头瘦身——1372×1098/79.5KB 重压为 512×409/21.7KB（q80 method=6，favicon 16~32px 与 logo ≤60px 显示场景下视觉无损，回滚走 git 历史）；② `index.html` favicon 的 `type="image/x-icon"` 修正为 `image/webp`（原声明与实际 MIME 不符），并新增 `<link rel="preload" as="image">`——preload / favicon / LandingView logo 三者同 URL 合并为一次网络请求；③ 更正注释（原「TopBar 独立引用互不影响」表述已过时）。
