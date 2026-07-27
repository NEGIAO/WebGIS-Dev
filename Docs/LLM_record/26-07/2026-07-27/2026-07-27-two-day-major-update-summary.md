# WebGIS 2026-07-26 / 2026-07-27 两日重大更新总结

> 汇总范围：
> - `Docs/LLM_record/26-07/2026-07-26/`
> - `Docs/LLM_record/26-07/2026-07-27/`
>
> 这两天不是普通小修，而是一次高密度的 **架构治理 + 功能补齐 + 性能优化 + 安全收口 + 文档规范化** 冲刺。整体上，`2026-07-26` 是“大规模铺底”，`2026-07-27` 是“高风险项闭环与收账”。

---

## 0. 总体结论

### 2026-07-26：大规模铺底日

这一天完成了大量底层工程建设和功能扩展，主要是：

- 三层配置体系从方案到落地基本闭环；
- OAuth、邮箱、后台配置、部署配置完成系统化整理；
- 属性表和 2D 编辑进入稳定化阶段；
- Cesium 3D 能力大幅扩展；
- 渲染、地形、体积云、风场、流体等性能线集中推进；
- 登录页、账号中心、消息系统、Chat 面板等 UI/UX 大改；
- Force_command、Example_prompt、handover、TODO 等工程治理文档重写和合流。

可以理解为：**把 WebGIS 从“功能堆叠阶段”推进到“架构治理与体系化维护阶段”。**

### 2026-07-27：收账与高风险闭环日

这一天更像是对 07-26 大量并行成果的“查账、收口、补安全、补性能关键开关”：

- 属性表 B 簇 B1–B6 基本清账；
- requestRenderMode 从方案进入实际启用；
- Agent 平台 Key 外泄风险修复；
- `/proxy`、`download_xyz`、GCJ 纠偏等 SSRF 出站面加固；
- 在线人数从“未过期 session”改为“活跃心跳”；
- 用户中心全页签 UI / 逻辑继续优化；
- 并行会话版本号、文档、结构树、TODO 冲突继续对账。

可以理解为：**把高风险隐患和中断状态拉回可发布、可维护状态。**

---

## 1. 配置架构与部署治理

### 1.1 三层配置体系基本闭环

07-26 最大的主线之一，是围绕 L1 / L2 / L3 三层配置模型完成系统化治理。

代表日志：

- `2026-07-26-configuration-three-layer-plan-and-env-catalog.md`
- `2026-07-26-backend-unified-config-loader-phase2.md`
- `2026-07-26-frontend-public-config-phase4.md`
- `2026-07-26-config-plan-phase5-6-gatekeeper.md`
- `2026-07-26-architecture-doc-three-tier-config.md`

核心变化：

- 根目录 `.env.example` 成为 L1 配置清单入口；
- 后端统一通过 `backend/config` loader 读取配置；
- 前端公开配置通过 `publicRuntime` 派生；
- Hugging Face Secrets 最小化，L3 只保留真正敏感项；
- OAuth、SMTP、Agent、地图 token 等配置来源逐步明确；
- 新增配置 key 必须登记，防止“代码里偷偷读 env”；
- 门禁脚本开始承担配置合规检查。

意义：

> 配置从“散落在代码、env、文档里”变成“有登记、有层级、有入口、有门禁”的体系。

### 1.2 部署文档与 OAuth 回调配置收束

相关日志：

- `2026-07-26-oauth-config-derivation-fix-and-verify.md`
- `2026-07-26-oauth-google-github-login.md`
- `2026-07-26-smtp-user-tier-realign.md`

核心变化：

- Google / GitHub OAuth 登录与绑定流程落地；
- OAuth 回调地址由后端公开 URL 推导，减少手动配置错位；
- 部署配置文档补齐；
- SMTP_USER 分层错误修复；
- 本地 admin 登录 `APP_ENV` 链路修复。

意义：

> 账号系统从“本地可用”进一步走向“部署环境可解释、可配置、可排错”。

---

## 2. 账号鉴权与用户中心

### 2.1 OAuth 与邮箱账号能力增强

07-26 到 07-27，账号系统经历了多轮增强：

- 邮箱注册登录；
- Google / GitHub OAuth 一键登录；
- 第三方账号绑定 / 解绑；
- OAuth ticket 安全收束；
- 邮箱验证码语义修正；
- 管理员 / 注册用户 / 游客身份边界继续明确。

重大修复之一是 07-26 后端安全批次中验证码 `used` 语义问题：

> 错误验证码尝试耗尽后不能把验证码标成 `used=1`，否则会被后续逻辑误认为“邮箱已验证”。

这类问题直接影响账号安全。

### 2.2 在线人数真实化

07-27 重点日志：

- `2026-07-27-online-users-presence-fix.md`

问题：

- 原来的“在线人数”实际统计的是未过期 session；
- session TTL 很长，所以用户关闭页面后仍可能被算在线；
- 用户感知像随机数。

修复：

- `sessions` 表增加 `last_seen_at`；
- 鉴权请求节流触活；
- 在线统计改为“未过期且最近 5 分钟有活跃请求”；
- 前端现有公告栏 / 账号面板轮询自然成为心跳载体。

意义：

> 在线人数从“近似登录过的人”变成更接近真实在线用户。

### 2.3 账号中心 UI / 逻辑持续优化

相关日志：

- `2026-07-26-account-panel-height-fix.md`
- `2026-07-26-account-panel-header-blurbg-fix.md`
- `2026-07-27-usercenter-tabs-ui-logic-optimization.md`

核心变化：

- 修复账号面板高度溢出、页脚被裁剪；
- 修复账号面板头部白字落白底不可见；
- 用户中心 Overview / Preferences / Security / API 等页签继续优化；
- 留言提交失败不丢输入；
- 头像保存状态与默认值同源；
- OAuth 解绑二段确认；
- 表单回车提交和密码强度提示；
- 页签图标、OAuth 品牌名规范化。

意义：

> 用户中心从“功能可用”走向“体验可用、状态可信、交互更完整”。

---

## 3. 属性表与 2D 图层编辑

### 3.1 属性表稳定化批次

07-26 属性表相关日志很多，主要包括：

- `2026-07-26-attribute-table-stability-and-features.md`
- `2026-07-26-attribute-table-revision-contract-and-csv.md`
- `2026-07-26-attribute-table-interaction-round2.md`
- `2026-07-26-attribute-table-column-alignment-fix.md`
- `2026-07-26-b1-stable-feature-id-writeback.md`

核心成果：

- 属性表列对齐修复；
- CSV 导出增强；
- 数据 revision 契约明确；
- statsField 图层记忆；
- Shift range 多选链路逐步核验；
- 稳定 featureId 写回要素本体；
- 不再依赖 `feature_${index}` 这种会随排序/筛选变化的临时 id。

其中 B1 很关键：

> 无稳定 ID 的要素首次进入系统时，会生成稳定 `_gid` 并写回要素本体，避免排序、筛选、刷新后选中和高亮错位。

### 3.2 高级 2D 绘制与编辑能力移植

相关日志：

- `2026-07-26-advanced-2d-editing-port.md`
- `2026-07-26-unified-layer-editing.md`

核心变化：

- DrawPanel 与 TOC 管理入口统一；
- 上传、搜索、行政区划等矢量图层开放编辑；
- 高级绘制工具与几何编辑链路纳入统一图层治理。

意义：

> 2D 侧从“显示数据”进一步走向“可管理、可编辑、可交互”的图层平台。

### 3.3 07-27 B 簇正式清账

07-27 关键日志：

- `2026-07-27-b3-shift-range-verify-and-highlight-lookup-fix.md`
- `2026-07-27-b4-cesium-view-extent-sync-closeout.md`

B3：

- Shift range 多选链路静态核验完成；
- 补高亮查找器扫描兜底；
- 解决属性 ID 未写入 OL id 时高亮静默丢目标的问题。

B4：

- 3D 模式属性表视图筛选接通；
- Cesium 相机视域同步到属性表筛选范围；
- 跨反经线 / 望天等不可解情况诚实降级；
- 并行撞车旧副本 `useCesiumAttrExtentSync` 清账。

意义：

> 属性表 B1–B6 代码侧全清，V3.5.0 前只剩真实数据端到端验收。

---

## 4. Cesium / 3D 能力平台化

### 4.1 三维分析能力扩展

相关日志：

- `2026-07-26-cesium-analysis-visibility-heightlimit.md`

新增或强化：

- 三维通视分析；
- 限高分析；
- Cesium 工具面板内三维分析能力整合。

### 4.2 Cesium 统一图层管理

相关日志：

- `2026-07-26-cesium-unified-layer-mgmt-design.md`
- `2026-07-26-cesium-unified-layer-mgmt-impl.md`

核心架构：

> 元数据入店，句柄留场。

也就是：

- Store 只存可序列化的图层元数据；
- Cesium 原生对象句柄不进响应式 Store；
- 3D 导入数据可以进入侧栏 TOC；
- 支持可见性、透明度、图层操作；
- 与 2D 图层管理逐渐统一体验。

意义：

> 3D 数据从“单独加载展示”走向“可被 TOC 管理的正式图层资产”。

### 4.3 DataSource / Tileset 外观能力补齐

相关日志：

- `2026-07-26-vector-datasource-opacity.md`
- `2026-07-26-p1-cors-style-batch.md`

能力包括：

- Cesium DataSource 透明度；
- Tileset 材质模式与透明度合成；
- 避免“最后操作覆盖前一个操作”；
- `tileset.style` 和 `CustomShader` 外观合成收口。

意义：

> 3D 图层样式从单点功能变为可组合状态。

---

## 5. 渲染性能与 3D 性能优化

### 5.1 体积云、云影、BSM 稳定化

相关日志：

- `2026-07-26-fix-volumetric-cloud-shadow-stability.md`
- `2026-07-26-fix-cloud-shadow-ground-anchoring.md`
- `2026-07-26-fix-cloud-shadow-vertical-jitter.md`
- `2026-07-26-round1-tyndall-terrain-bsm.md`
- `2026-07-26-round2-runtime-scale-fluid-timing.md`

主要成果：

- 云影稳定性修复；
- 云影贴地锚定；
- 垂直抖动修复；
- 云分辨率运行时切换；
- 切质量预设不必重开云；
- 风场 uniform GC 优化；
- 流体场景准备时机后移，避免选点阶段画面被提前污染。

### 5.2 地形与 Worker 优化

相关日志：

- `2026-07-26-arcgis-terrain-lerc-worker.md`
- `2026-07-26-terrain-round2-wind-cleanup.md`

主要内容：

- ArcGIS 地形 LERC Worker 解码；
- 天地图地形解码优化；
- Worker 池失败回退策略；
- 地形相关性能和稳定性改善。

### 5.3 requestRenderMode：07-27 最大性能里程碑

关键日志：

- `2026-07-27-requestrendermode-p1.md`
- `2026-07-27-requestrendermode-p2-enable.md`

阶段：

#### P1：接线但默认关闭

- 新增 requestRenderMode 管理器；
- 引入 `acquireContinuous(viewer, tag)` / `releaseContinuous(viewer, tag)`；
- 体积云、风场、流体、人物漫游接入连续渲染计数；
- 总开关默认 false，零行为变化。

#### P2/P3：正式启用

- `ENABLE_REQUEST_RENDER_MODE = true`；
- 静止无特效时进入按需渲染；
- 特效开启时自动恢复连续渲染；
- `maximumRenderTimeChange = 5s`；
- FPS 面板保留，用于观察空闲降载；
- 全库高危直写点静态普查，补 3D Tiles 材质切换 requestRender。

意义：

> WebGIS 3D 从“永远每帧渲染”进入“有消费者才连续渲染”的阶段，理论上 3D 静止场景 GPU 可从持续满载降至近零。

---

## 6. 前端加载性能与部署体积优化

关键日志：

- `2026-07-26-loading-performance.md`

### 6.1 登录页首屏显著瘦身

日志中记录：

- 登录页 gzip JS 从约 `404KB` 降至约 `86.5KB`；
- 降幅约 `-79%`。

核心手段：

- 抽离 `basemapPresets.ts`，避免登录页混入 OpenLayers 重依赖；
- `useAttrStore` 避免通过大 barrel 拉入整套 map features；
- 金句库懒加载；
- Font Awesome 非阻塞加载；
- `vendor-libs` 拆分；
- geotiff、Cesium deps 等重依赖分桶。

### 6.2 ShareData 死重清理

问题：

- `import.meta.glob` 把 ShareData 全目录复制进 dist/assets，导致部署体积膨胀。

修复：

- 新增 ShareData manifest 生成脚本；
- Vite 构建前自动生成 `public/ShareData/manifest.json`；
- Loader 读取 manifest，而不是让构建器复制整目录。

意义：

> 减少 dist 冗余，避免“静态共享资源被打包为哈希副本”的部署死重。

### 6.3 Cesium CDN 多源回退

从单一 jsDelivr 改为多源尝试：

- jsDelivr；
- BootCDN；
- unpkg。

目的：

- 改善国内网络下 Cesium 加载失败概率；
- `CESIUM_BASE_URL` 随当前可用源切换。

---

## 7. 安全加固

### 7.1 07-26 后端安全 Bug 批次

关键日志：

- `2026-07-26-backend-security-bugfix-batch.md`

修复范围很广，包括：

- 验证码 `used=1` 语义导致免验证码注册风险；
- OAuth ticket 先删后判导致 GitHub 登录失败；
- `/monitor/logs/stream` 匿名可读日志与 PII；
- 非 ASCII 密码 / 验证码 compare_digest 崩溃；
- `get_bool` fail-open 导致配置默认值失效；
- Agent 参数 `top_p` / `extra_body` 未透传；
- `temperature/top_p=0` 被默认值覆盖；
- 空间分析 400 被包装成 500；
- 泰森多边形 2 点 / 共线退化；
- 游客统计并发 UPSERT；
- 验证码节流绕过；
- 高德 IP 定位 URL 注入；
- 在线管理员计数错误。

意义：

> 这是一次偏 P0/P1 的后端正确性和安全性集中清扫。

### 7.2 Agent `override_base_url` 平台 Key 外泄修复

关键日志：

- `2026-07-27-agent-override-base-url-key-leak-fix.md`

问题非常严重：

> 用户只传 `override_base_url` 不传 `override_api_key`，后端可能把平台 Key 发送到用户指定服务器。

修复：

- `override_base_url` 与 `override_api_key` 必须成对；
- 私网、本机、危险 IP 字面量拒绝；
- 默认仅允许 HTTPS；
- 可选 host allowlist；
- 前端草稿模式也改为成对透传；
- `/models` 缓存污染修复；
- 用户配置里只存 base_url 不存 key 的持久化泄漏路径也被兜住。

意义：

> 切断平台 Key 外泄路径，是 07-27 最关键安全闭环之一。

### 7.3 SSRF S1/S2 加固

关键日志：

- `2026-07-27-proxy-ssrf-hardening-s1-s2.md`

加固对象：

- `/proxy/{target_url:path}`；
- `/proxy/gcj2wgs/**`；
- `/proxy/wgs2gcj/**`；
- `download_xyz`；
- Agent override 的共用判定能力。

核心能力：

- 新增统一 `net_guard`；
- 拒绝私网 / 回环 / 链路本地 / 保留地址；
- 支持非常规 IP 字面量归一：
  - 整数；
  - 十六进制；
  - 八进制；
  - 短点分；
- DNS 解析后复判；
- 通用代理响应体上限；
- GCJ 纠偏单瓦片字节 / 像素 / 网格数上限；
- download_xyz 模板 host 校验。

意义：

> 将多个“后端代用户访问 URL”的出口从弱过滤提升为统一安全边界。

---

## 8. UI/UX 与主题令牌治理

### 8.1 注册 / 登录页现代化

相关日志：

- `2026-07-26-register-ui-modernize.md`

主要方向：

- 登录注册页视觉现代化；
- 与 OAuth、加载性能优化协同；
- 更适配新的账号体系入口。

### 8.2 消息系统“灵动岛”打磨

相关日志：

- `2026-07-26-message-island-queue-ui.md`
- `2026-07-26-message-island-polish-round2.md`

主要成果：

- 全局消息队列；
- 动画与关闭交互优化；
- 避免消息堆叠与遮挡体验问题。

### 8.3 Chat 面板拆分与网页式体验

相关日志：

- `2026-07-26-chat-panel-split-and-enhance.md`

主要方向：

- Chat 面板拆分；
- 多会话与网页式聊天体验铺垫；
- 配置、状态、消息列表、输入栏等职责更清晰。

### 8.4 主题令牌治理

相关日志：

- `2026-07-26-toc-theme-token-merge.md`
- `2026-07-26-ui-theme-token-unification.md`
- `2026-07-26-cesium-tool-panel-token-merge.md`

成果：

- TOC 主题变量与品牌令牌合流；
- CesiumToolPanel 大量色值收敛到 `--ctp-*`；
- 控件、面板、全局主题变量逐步统一；
- 降低后续蓝/绿主题切换残留硬编码的风险。

意义：

> UI 从“局部样式堆叠”开始转向“主题令牌体系”。

---

## 9. 工程治理与协作规范

### 9.1 Force_command v2 重写

关键日志：

- `2026-07-26-force-command-rewrite.md`

重大变化：

- 明确任务分级 L0–L3；
- 明确哪些任务必须先写方案；
- 明确禁止越权 commit / push；
- 明确文档、日志、版本号、结构树收尾规则；
- 明确 SSOT 单一事实来源；
- 加入 DoD 完成清单；
- 加入会话交接块格式。

意义：

> 这是 Agent 协作模式的一次制度化升级，防止并行会话乱改、漏日志、乱版本、乱删文件。

### 9.2 Example_prompt 重写

关键日志：

- `2026-07-26-prompt-template-and-doc-cleanup.md`

作用：

- 给用户提供 Bug / 功能 / 重构 / 审计类任务启动模板；
- 与 Force_command 形成“用户怎么下达 + Agent 怎么执行”的闭环。

### 9.3 并行会话文档合流

关键日志：

- `2026-07-26-merge-parallel-planning-docs.md`

成果：

- 合并重复 TODO；
- 合并交接文档；
- 明确 `bugfix-optimization-plan.md` 为滚动修复优化主入口；
- 标注并行会话产生的历史文档；
- 修复部分版本撞号、空号、顺延记录。

意义：

> 将“多会话并行开发造成的文档分叉”重新收敛到单一主线。

---

## 10. 两天形成的阶段性里程碑

### 10.1 配置架构里程碑

`V3.4.6–V3.4.17` 左右完成：

- L1 / L2 / L3 分层；
- 后端 loader；
- 前端 publicRuntime；
- OAuth / SMTP / HF Secrets 配置治理；
- 配置门禁。

这是基础设施级里程碑。

### 10.2 属性表稳定化里程碑

`V3.4.18–V3.4.23` 与后续 B 簇继续推进：

- 数据契约；
- revision；
- CSV；
- 列对齐；
- 稳定 featureId；
- Shift range；
- 3D 视图筛选。

到 07-27，B1–B6 代码侧基本全清。

### 10.3 Cesium 平台化里程碑

`V3.4.24–V3.4.35` 起，到 07-26 大量补齐：

- 三维分析；
- Cesium 统一图层管理；
- 3D TOC；
- DataSource / Tileset 样式与透明度；
- 地形 / 体积云 / 风场 / 流体优化。

### 10.4 工程治理里程碑

`V3.4.37–V3.4.46` 附近：

- Force_command v2；
- Example_prompt；
- handover；
- TODO 合流；
- 结构树门禁；
- 配置门禁；
- 并行会话对账机制。

项目进入流程化维护阶段。

### 10.5 07-27 高风险闭环里程碑

`V3.4.61–V3.4.64` 是明显转折：

- requestRenderMode 正式启用；
- Agent Key 外泄修复；
- SSRF S1/S2 加固；
- 属性表 B 簇收账；
- 在线人数真实化。

这是从“功能增强”转向“性能、安全、稳定性收口”的阶段。

---

## 11. 仍需重点回归的风险

### 11.1 实机 GPU / 3D 行为回归

很多渲染优化在日志里明确写了：

- 沙盒无法跑真实 GPU；
- 未实机验证；
- 待用户本机回归。

尤其需要测：

- 体积云；
- 云影；
- 地形；
- 风场；
- 流体；
- requestRenderMode；
- 3D 图层透明度；
- 3D Tiles 材质模式；
- 三维分析工具。

### 11.2 requestRenderMode 的“画面不刷新”风险

按需渲染开启后，最需要观察：

> 某些操作后画面没有立即变化，动一下相机才刷新。

如果出现：

- 小范围：补对应 `scene.requestRender()`；
- 大范围：一行回退 `ENABLE_REQUEST_RENDER_MODE = false`。

### 11.3 SSRF 加固后的兼容性风险

需要实机验证：

- 常用瓦片源是否仍可代理；
- 自定义 XYZ 是否被误拦；
- GCJ 纠偏代理是否正常；
- download_xyz 是否正常；
- OAuth、Agent 自定义服务商、本地调试服务是否符合新护栏。

### 11.4 V3.5.0 前属性表端到端验收

虽然 B 簇代码侧全清，但建议用真实数据跑一遍：

- GeoJSON；
- KML/KMZ；
- SHP；
- 2D/3D 视图筛选；
- Shift 多选；
- 编辑后 extent 更新；
- 高亮 / 缩放 / 定位；
- CSV 导出；
- statsField 图层记忆。

### 11.5 文档与版本链最终核对

07-26 有大量并行会话、版本号顺延、空号补记。虽然已对账，但提交前仍建议最终核对：

- `README.md`
- `Docs/Guide/CHANGELOG.md`
- `Docs/Guide/project-structure.md`
- `Docs/Guide/frontend-structure.md`
- `Docs/Guide/backend-structure.md`
- `Docs/TODO/`

---

## 12. 最终一句话总结

> **2026-07-26 是 WebGIS 的“体系化铺底日”：配置架构、OAuth、属性表、Cesium 图层、渲染性能、UI 现代化、工程规范全面铺开。**
>
> **2026-07-27 是“高风险收口日”：属性表 B 簇清账、requestRenderMode 真正启用、Agent Key 外泄与 SSRF 风险闭环、在线状态真实化、账号中心继续打磨。**

整体状态已经接近一个新的阶段：

> **功能更完整、架构更清晰、安全边界更硬、性能目标更明确，但实机 GPU / 账号 / 安全兼容性回归仍是 V3.5.0 前最重要的下一步。**
