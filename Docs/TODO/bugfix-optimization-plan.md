# 修 Bug 与优化规划（2026-07 · 滚动维护）

> 状态：规划定稿，按优先级滚动执行；每完成一项在本文勾选并链接维护日志。
> 盘点方法：全库 TODO/FIXME 扫描 + `tsc --noEmit` 全量 + 近日维护日志「待实机回归/风险」归集 +
> 大文件统计 + 后端安全面走查。基线版本 V3.4.37（2026-07-26）。
> **2026-07-26 合并**：原并行会话的 `next-sprint-bugfix-and-optimization.md`（属性表 B1–B6 + 容器/架构 O 项 + Phase 3）
> 已全量并入本文（B 簇 → P0-4，容器二轮 → P3-1，T2 分域/门禁 CI → P3-3/P3-4，性能项 → P2-4/P3-5/P3-6），
> 该文件删除。本文为**唯一**滚动修复优化规划（Force_command §2.5 指定登记处）。

---

## P0 — Bug 与回归风险（先做，1 个工作日内）

### P0-1 实机回归欠账（当日大改的验证闭环）⚠️ 最高优先
- **问题**：三层配置/前端 env 归一/三维分析/统一图层管理均只过静态验证（沙盒无 vite/uvicorn）。
- **清单**（合并版）：①启动日志 6 行「[配置]」摘要 + 旧 frontend/.env.local 自动清理；②admin 环境密钥徽章卡；
  ③3D 导入四类数据 → 卡片/TOC 双入口互通、矢量透明度反复 0↔100% 无衰减；④通视/限高两工具；
  ⑤`npm run build` 后 `grep -r "SUPER_USER\|SECRET\|SMTP_" dist/assets` 为空；⑥2D↔3D 往返无残留、2D TOC 零回归。
- **方案**：人工按单回归，发现问题即修（每 bug 单独日志）。验收 = 六项全绿后 git 提交推送，CI/Pages 构建通过。

### ✅ P0-2 `layerTreeBuilder.ts:389` tsc 真实错误 【已完成 V3.4.43 · 日志 2026-07-26-p0-fixes-batch.md】
- **问题**：`Property 'edit' does not exist on type 'StandardLayerCapabilities'` ——V3.4.9 编辑泛化时
  节点用了 `capabilities.edit`，但 `StandardLayerCapabilities` 接口未声明该字段（运行时正常，类型断裂）。
- **方案**：在类型定义补 `edit?: boolean`（连带核对 style/label 等同批字段是否齐全）；全项目 tsc 后仅剩 cesium 模块解析类环境噪音。
- **工作量**：0.5h ｜ **验收**：`tsc --noEmit` 业务代码零错误。

### ✅ P0-3 OAuth 内存 ticket 多 worker 隐患 【已完成 V3.4.43 · 方案 a 落库 · 同上日志】
- **问题**：`oauth.py` 一次性 ticket 存进程内存（配置架构计划已标注）；uvicorn 多 worker 或容器重启瞬间会导致
  回调换 ticket 失败（用户看到"ticket 无效"）。当前 HF 单 worker 未爆，属埋雷。
- **方案**（二选一，倾向 a）：a) ticket 落 SQLite 短表（复用 auth 库，TTL 120s + 启动清理）；
  b) 显式固定 `workers=1` 并在部署文档声明限制。
- **工作量**：a 约 2–3h ｜ **验收**：双 worker 压测下 OAuth 全流程通过；重启窗口失败率仅限秒级。

### P0-4 属性表 Bug 簇（B1–B6，并入自原 next-sprint 计划）

| # | 问题 | 现象/风险 | 修复思路 | 状态 |
|---|------|-----------|----------|------|
| B1 | featureId 依赖 `feature_${index}` 兜底 | 数据无稳定 id 的图层，行序变化后选中/高亮错位到别的要素 | `ensureStableFeatureId` 首次分配写回要素本体（OL setId+`_gid` / 普通对象镜像 properties），useAttrStore 兜底副本删除走归一化单点 | ✅ V3.4.56（07-27 对账补录，日志 2026-07-26-b1-stable-feature-id-writeback.md） |
| B2 | 数据集签名不含 geometry | 几何编辑后行 extent 不刷新 | revision 契约强制替换 | ✅ V3.4.40 |
| B3 | Shift range 多选透传未实测 | 属性表透传 mode='range'，下游 featureStyleStore 的 range 语义未验证 | 端到端五环静态核验全绿（表侧 displayRows 区间→批量 append→store range 追加契约）；顺修高亮查找器无扫描兜底缺口（MapContainer findManagedFeature 补 getId/`_gid` 退化路径）；实机 7 步清单待用户执行 | ✅ V3.4.59（日志 2026-07-27-b3-shift-range-verify-and-highlight-lookup-fix.md） |
| B4 | 3D 模式属性表视图筛选不可用 | 已有提示，功能缺失 | `useCesiumAttrViewExtentSync`（moveEnd+首帧，视域不可解/跨反经线诚实 null 降级）→ 容器双路 stop → 表格动态「范围不可用」态；并行撞车旧副本 `useCesiumAttrExtentSync` 已确认零引用且当前文件系统不存在，仅保留新名实现 | ✅ V3.4.62（收账核验，日志 2026-07-27-b4-cesium-view-extent-sync-closeout.md） |
| B5 | email_service 注释误导 | lru_cache 快照与注释不符 | 改注释 | ✅ V3.4.40 |
| B6 | statsField 不随图层记忆 | 切图层统计字段重置 | 组件内 Map 记忆 | ✅ V3.4.40 |

- 验收口径：每项修复附「复现步骤 → 修后表现」到日志；**B 簇全清后打 V3.5.0 小版本线**（属性表 + 配置 + 架构治理聚合里程碑）。
- 📌 状态（2026-07-27 V3.4.62）：**B1–B6 代码侧全清**。V3.5.0 打线前置条件 = B1（4 步）/B3（7 步）/B4（6 步）实机清单验证通过（见各日志），由用户冒烟后拍板。

## P1 — 安全与稳定（本周内）

### ✅ P1-1 后端 CORS 全开收敛 【已完成 · 日志 2026-07-26-p1-cors-style-batch.md】
- **问题**：`app.py` `allow_origins=["*"]`（旁边躺着注释掉的白名单代码）；生产面直接暴露。
- **方案**：新增 L1 key `CORS_ALLOWED_ORIGINS`（登记 catalog + 根 .env.example，逗号分隔；空值=沿用 `*` 保持兼容），
  `app.py` 经统一 loader 读取；生产 HF Variables 配 Pages 域名 + localhost。
- **工作量**：1h ｜ **验收**：本地跨域正常；生产仅白名单来源可跨域；门禁脚本通过（新 key 已登记）。

### ✅ P1-2 tileset 透明度 × 材质模式合成收编 【已完成 · 同上日志：WeakMap 二元状态 + alpha 注入 shader/style + TRANSLUCENT 通道】
- **问题**：两者各写 `tileset.style`，语义"最后操作生效"（设计文档已标注一期妥协）。
- **方案**：`dataSourceDisplay.js` 内建 style 合成器（materialMode + alpha 二元生成），
  `applyTilesetMaterial` 改调合成器；元数据店补 `materialMode` 字段联动。
- **工作量**：2h ｜ **验收**：调透明→切材质→再调透明，两者叠加生效不互吞。

### ✅ P1-3 前端 console.log 清理 【已完成 V3.4.43：业务代码归零；useMapSwipeTest 定性 dev 工具保留（自带 eslint-disable）】
- **方案**：改 `console.warn/error` 或删除；开发期调试日志统一走带开关的轻量 logger（可选）。
- **工作量**：0.5h ｜ **验收**：`grep -rn "console\.log(" frontend/src` 为 0（构建产物更干净）。

### ✅ 后端 code review Bug 批次 14 项 【已完成 V3.4.53 · 日志 2026-07-26-backend-security-bugfix-batch.md】
- 验证码 `used=1` 误判→免验证码注册、OAuth ticket 先删后判致 GitHub 登录挂、`/monitor/logs/stream` 匿名可读日志/PII、
  非 ASCII `compare_digest`→500、`get_bool` fail-open、agent `top_p`/`extra_body` 未透传 + `stream` 覆盖、
  `temperature/top_p=0` 折叠、空间分析 500→400、泰森 2 点/共线、游客记录并发 UPSERT、验证码 30s 节流绕过、
  高德 IP 定位 URL 注入、`online_by_role` 在线管理员计数恒 0。**均无 schema/配置 key/文件增删**。

### P1-4 后端 code review 遗留安全/性能簇（V3.4.53 未纳入，需设计决策 / 行为变更 / 实机验证）
- **[P0 安全] 代理 SSRF 加固**：`/proxy/{target_url:path}`（无 host 白名单、默认 `PROXY_RATE_LIMIT=0` 无限流、
  私网 IP 过滤可被 `2130706433`/`127.1` 等非点分十进制字面量绕过）、`/proxy/gcj2wgs/`（无界磁盘缓存 +
  无响应体大小上限 + Pillow 解压炸弹）、`download_xyz` 瓦片模板无 host 校验。方案：统一 host 白名单 +
  `getaddrinfo` 解析后拒私网 + 响应体/像素上限 + 缓存 LRU/TTL。**需先定「允许代理的瓦片源」清单（L3）**。
- ✅ **[P0 安全] agent `override_base_url` 致平台 Key 外泄** 【已完成 V3.4.63 · L3 方案 `agent-override-key-leak-plan.md`
  · 日志 2026-07-27-agent-override-base-url-key-leak-fix.md】成立面经逐行核实纠偏为 `/chat/completions` + `/models`
  两处（`/chat/default-proxy` 只接受 override_model 不成立；漏列的 `/chat/proxy` 无 Key 泄漏，其 SSRF 面归上一条）。
  落地：`_validate_override_base_url` 单点护栏（成对校验 fail-closed + 仅 https + 私网/回环拒绝，`_coerce_ip_literal`
  按 inet_aton 归一堵死 `2130706433`/`0x7f000001`/`127.1`/`0177.0.0.1` 绕过 + 可选 host 白名单默认关）、前端成对透传、
  新增两个默认即安全的 L1 key。单测 23/23 + 双门禁全绿；**实机回归待用户**。
- **[P1] Agent 配额 check-then-consume 竞态 + 可伪造 quota_subject**：precheck 与 consume 非原子、
  guest quota_subject 基于可伪造的 XFF / `X-Guest-Device-Id`。方案：单条 `INSERT ... ON CONFLICT ... WHERE calls < limit` 原子扣减 + 服务端签发游客 cookie。
- **[P1] `require_login` 的 `?s=1`/`X-Share-Mode` 分享模式旁路**：无 token 时凭客户端头即得游客 session。
  方案：拆 `require_login_or_share`，`require_login` fail-closed，仅确需端点显式放行。
- **[P1] 游客 uid 无 device-id 时随机化**：`_build_guest_uid` 无 device-id 回退 `secrets.token_urlsafe` →
  每请求新 quota 桶（配额形同虚设）+ `guest_identity_records` 无界增长。方案：无 device-id 时仅按 ip+UA 派生。
- **[P1] SMTP 明文（无 STARTTLS）**：`email_service` 走明文端口 `login`，凭据与验证码可被链路监听。
  方案：改 `SMTP_SSL(465)` 或 `starttls()`；需按阿里云 DirectMail 实际端口/TLS 实机验证。
- **[P1] 损坏恢复锁外竞态**：`auth/db.py` 的 `_db_file_is_corrupted` 检查在 `_recovery_lock` 外，
  二线程可对刚重建库重跑销毁式恢复致数据丢失；`.dump` 行式导入丢含换行的 TEXT 行。方案：检查/建表/导入全移入锁内并重验。
- **[P2 性能] SQLite 每请求新建连接 + 重复 DDL**：`get_auth_db_connection` 每调重跑 WAL/foreign_keys PRAGMA、
  多处 `CREATE TABLE IF NOT EXISTS` 每调执行（`/me`、map-tokens、每条 chat 各 ~5–10 连接）。
  方案：线程本地连接复用 + 模块级 `_tables_ready` 幂等（须与损坏恢复配合，勿在库被重建后误跳 DDL）。
- **[P2] 管理员 GET 回显 L3 明文 / 表浏览器裸 dump 密钥**：`GET /api/admin/api-keys/{name}` 回显 `key_value`、
  `/api/admin/db/table/{sessions|api_keys|users}/rows` 回显 token/密钥/密码哈希。方案：列脱敏白名单 + 仅回显掩码前缀。
- **[P2] 管理员今日用量按 username 查而配额按 quota_subject 记**：`_get_user_today_usage_sync` 对游客恒返回 0
  用量、角色误判。方案：经 `guest_identity_records` 映射 username→guest_uid 后再查（或存 role 于用量表）。
- 验收口径：每项独立方案文档（SSRF / override / 表脱敏属 L3 需批准）→ 实施 → 实机回归 → 日志。

## P2 — 性能与体验（下周）

### ✅ P2-1 罗盘元数据【定性关闭 · 问题不成立】静态 import 链核验：compass-data.ts 与 twentyEightConstellations.ts（合计 ~4400 行）全 src 零引用——死文件不进任何 bundle，主包无此负担；清理归 P3-3 本机执行清单（Cowork 禁 rm）
- **问题**：`twentyEightConstellations.ts` 为纯数据文件，疑似打进主 bundle（罗盘非首屏功能）。
- **方案**：先 `npm run build -- --mode analyze` 定位 chunk；若在主包 → 转 JSON + 动态 import 随罗盘面板懒加载。
- **工作量**：1–2h ｜ **验收**：主 bundle 减 ~100KB+（以 analyze 报告为准），罗盘功能无回归。

### ✅ P2-2 矢量透明度扩 PolylineOutlineMaterialProperty 【已完成 · 日志 2026-07-26-p2-batch-and-session-handoff.md】
- **问题**：贴图/特效线材质（PolylineOutline 等）暂不参与透明度（一期防守跳过）。
- **方案**：`VECTOR_COLOR_TARGETS` 扩展 `PolylineOutlineMaterialProperty`（color+outlineColor 双缩放）；其余材质维持跳过。
- **工作量**：1h ｜ **验收**：带描边线数据透明度生效，贴图材质不破坏。

### P2-3 高德低级 API → 高级 API（faq 遗留 TODO）
- **方案**：对照官方文档梳理现用端点（搜索/逆地理/IP），切 v5 高级版并解析新字段；`Docs/TODO/OverPassApiIntegration` 一并评估。
- **工作量**：0.5–1 天 ｜ **验收**：搜索/定位功能等价或增强，配额消耗持平。

### P2-4 属性表性能与体验（并入自原 next-sprint Phase 3）
- buildLayerDataset 的 searchText 惰性化（仅搜索激活时构建，签名改用属性哈希）——大图层同步成本再降；
- 列宽持久化 localStorage（跨会话记忆）；CSV 导出增加「全部行/当前视图」选项；
- 横向列虚拟化（>50 列场景；现全列渲染）。

## P3 — 可维护性债（穿插进行，每次只拆一个）

### P3-1 巨型文件渐进拆分（规范 6 单一职责）
| 文件 | 行数 | 拆分方向 |
|------|------|----------|
| `CesiumToolPanel.vue` | 2686 | 各页签拆子组件（DataTab/ModulesTab…），模块渲染已是 LilGuiControls 可直接搬 |
| `TOCPanel.vue` | 2499 | 动作处理层已外移一部分（contextActionManager/cesiumTocActions），继续拆上传/搜索区块 |
| `RegisterView.vue` | 2198 | 表单步骤组件化（登录/注册/重置/绑定四段） |
| `MapContainer.vue` | 2041 | 持续外移到 composables（既有方向，禁新增功能代码） |
| `HomeView.vue` | 2011 | 面板编排层拆 useHomePanels 类 composable |
- **原则**：只搬不改逻辑、每次一个文件一份日志、拆后 ESLint+回归；与功能迭代穿插，不集中大爆改。
- **容器二轮既有路线图**（V3.4.29 日志 `2026-07-26-container-components-slimming-round1.md`，factory 注入模式照抄一轮）：
  MapContainer：`runDeferredStartupTasks`(~170) → `activateInteraction`(~121) → `syncAttributeTableMapExtent` 段 → 尾部 `getMapExtent` 簇，目标 ~1200 行；
  CesiumContainer（现 ~915）：`bootCesium/initViewer/reset` 启动簇(~244) → `applyAtmosphereParams` 簇(~165) → `handleNavTargetSelect`(~84)，目标 ~500 行。

### P3-2 cesium-navigation 内嵌包上游 TODO（tracking 场景 2 处 bug 注释）
- **定性**：上游遗留、仅实体追踪模式触发（项目暂未用 tracking）→ 挂起观察，触发时再修。

### P3-3 前端 T2 分域（需本机 mv，并入自原 next-sprint O3）
- `utils/` 21 文件分域、`composables/map/features/` 42 文件分子目录（`CheckStructureTree.py` 可即时验证）；
- 两处 `dataImport/` 目录消歧（2D 与 Cesium 同名）。挂载盘禁 rm/mv，须用户本机执行移动。｜ 半天
- 死文件清理（P2-1 核验结论）：`assets/data/compass-metadata/` 两文件全 src 零引用，本机 `git rm` 后同步结构树。

### P3-4 门禁进 CI（并入自原 next-sprint O4）
- `CheckStructureTree.py` + `CheckConfigRegistry.py` 加入 GitHub Actions（deploy.yml 前置 job，advisory→强制分两阶段）。｜ 1h

### P3-5 Cesium 库级代码迁 `src/lib/`
- Cloud/lib、内嵌 npm 包、terrain providers 迁出业务目录。

### P3-6 TS 化推进
- 第一批 stores/ 与 utils/ 纯逻辑层（js:ts=257:85）+ vue-tsc 门禁 advisory 接入。

### P3-7 H7 跨层违规清零 + TOCPanel 拆解（L3 架构级，2026-08-04 V3.5.11 已解 10/19 处）
- **已解**（V3.5.11）：`runtimeMapTokens`/`viewScaleConverter`/`basemapPresets`+`basemapOptions` 纯数据/纯基础设施迁入 common 域；`useTOCStore` 经 `layerRemovalHandler` 回调解耦 OL 依赖；`isValidLabel` 直连 common。
- **剩余 9 处**（均为 TOCPanel 双引擎组件 import + SidePanel 懒加载路由 import）：
  - `TOCPanel.vue` 7 处：`usePositionCodeTool`(ol)、`useStyleEditor`(ol)、`@ol/utils/biz/index`、`AmapAoiInjectDialog`(ol)、`MapDownloader`(ol)、`handleCesiumLayerTreeAction`(cesium)、`useCesiumLayersStore`(cesium)
  - `SidePanel.vue` 2 处：`BusPlannerPanel`/`DrivingPlannerPanel` 懒加载（ol）
- **路径**：TOCPanel（2493 行 God 组件）拆解为 OL/Cesium 双 TOC 组件 + 共享 composable，属 L3 架构级，单独立项。

### P3-8 cesium.d.ts 83 个 any → 真类型（L3 依赖变更）
- Cesium 经 CDN 加载无官方类型；手写 83 个声明属臆造 API 签名风险。
- 正确路径：迁移至 npm `cesium` 包（自带类型）或引入 `@cesium/engine` + `@cesium/widgets`；涉及 CDN shim 移除、构建配置、全局 `Cesium` 变量清理。L3 依赖变更，单独立项。

### P3-9 tsconfig strict:false → strict:true（L3 大规模重构）
- 开启 strict 将暴露大量隐式 any（2000+ 行组件普遍）。需分阶段：先 `noImplicitAny:true` 单开，收敛后再全 strict。工作量 1–2 天，单独立项。

### P3-10 存疑缺陷待实机复现（不施工，复现后升级 P 级）
- **罗盘旋转 90° / 文字倒置**：静态读码无法确认（`CompassManager.drawRadialText` 旋转逻辑为标注做法）；需实机复现后定性。
- **Cesium GPU 资源泄漏**：wind/fluid 生命周期静态审查为合理管理；需 DevTools 帧缓冲监控实机复现。

---

## 建议执行顺序

```text
Sprint 1（1 天）：P0-1 回归+修复 → 提交推送 → ✅P0-2 类型修复 → ✅P1-3 日志清理
Sprint 2（2–3 天）：✅P0-3 ticket 落库 → P0-4 B1/B3（联测类）→ B4 → P1-1 CORS 收敛 → P1-2 style 合成
Sprint 3（穿插）：P3-1 容器二轮（O1/O2 交替）→ P2-1 bundle 分析 → P2-2/P2-3/P2-4 → P3-3 分域 → P3-4 门禁 CI
```

- 冒烟回归（P0-1）中发现的任何回归**自动升为最高优先级**，逐条记录现象后即修。
- P0-4 B 簇全清后打 **V3.5.0** 里程碑（见 P0-4 验收口径）。

*完成一项 → 勾选本文 + 维护日志 + CHANGELOG；新增发现随时按 P 级插入。*

## 顺带发现登记(2026-07-26 · V3.4.54 前端加载性能会话,按 Force_command §2.5 只记不改)

- [ ] **V3.6 跨引擎 UI 统一（SidePanel 面板 Cesium 适配）**：`domains/common/shell/SidePanel.vue` 包含图层管理、绘制、路径规划、底图下载、罗盘等诸多面板，当前全部绑定 OL API，Cesium 模式下全部失灵。目标：各面板通过 MapCommandBus + 引擎 adapter 解耦，全局标识当前引擎（OL/Cesium），各面板自动切换行为。CesiumToolPanel 的已有功能也需纳入统一。属架构级专项，规划到 V3.6 实现。
- [ ] **后端 HF Space 国内不可达**(影响面最大):前端首屏已提速 79%,但国内用户登录/API/瓦片代理仍会失败。建议单独 L3 立项:后端可达性探测 + 降级策略(分享模式/游客只读)或多活方案;涉及部署面与预算,需用户决策
- [x] **CHANGELOG 缺 V3.4.52 完整条目** ✅ 07-27 对账会话已补录（连带修复五会话连环撞号：48 空号注记、53′→55、54′→56、55′→57、56′→58 顺延补录，README 推进 V3.4.58，各日志头同步注记）
- [x] **P0-2 状态与代码疑似脱节** ✅ 07-27 复核销项:`edit?: boolean` 已在 `layerHelpers.ts:22`,全量 `tsc --noEmit` 实测 12 项错误全部为 cesium 模块解析环境噪音、业务代码零错误——修复已随后续提交落地,疑虑解除
- [ ] **`next-sprint-bugfix-and-optimization.md` 残留**:本文自述该文件「已全量并入本文,该文件删除」,但文件仍存在;删除属范围外操作,提请用户执行
- [ ] `frontend/stats.html`(1.8MB 旧分析产物)与本地 `frontend/dist/` 建议加入 .gitignore(仓库瘦身,CI 全新构建不受影响;用户 2026-07-26 已表态暂不处理,留档备查)
- [ ] tiles/(307MB PNG)长尾优化候选:WebP 转码/抽稀属大工程,按需加载已成立,收益后置
- [ ] **V3.5.17 审查遗留（2026-08-11 · 合并关账会话,按 Force_command §2.5 只记不改）· 日志 [2026-08-11-v3.5.17-consolidated-review.md](../LLM_record/26-08/2026-08-11/2026-08-11-v3.5.17-consolidated-review.md)**：
  - [ ] (优先级高) **Cesium 采样范围未接线**：`request-range-sample` 事件无监听方,滑杆范围回填链路未生效;`sampledRangeMap` 兜底被 -10m 截断(采样范围与滑杆下限耦合设计未完成)。需接线 `emitSetHeight`/`setSampledRange` 并复核设计
  - [ ] (需用户决策) **baimo 白膜样例 CDN 依赖**：`loadSampleBaimoTileset` 硬编码 `https://3dtiles.negiao.cc.cd/baimo/tileset.json`(个人第三方 CDN 非标准公开源,断供即失效);采样 `rootJsonUrl` 指向工程内不存在的 `./tileset/baimo/tileset.json`(静默降级)。去向:自托管 vs 移除样例入口
  - [ ] (需设计) **sampledRangeMap 全局共享**：多数据源场景范围互相覆盖(lastRange 覆盖新加载数据源的实际范围)
  - [ ] (需设计) **模型升降级语义不清**：`/api/agent/chat/completions` + `user_metrics.tier` 既当限额级别又当模型档位,探测时会切换模型(涉数据库结构,L3)
  - [ ] (清理项) **freeQuota 后 balanceData 语义失效**：默认 AI 免费化后 `quotaData` 恒 null,`ChatPanelContent` 余额展示逻辑失去意义(数据已不返回,展示未清,仅观感问题)
