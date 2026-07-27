# 修复规划 Sprint 首批：P0-2 类型修复 + P0-3 ticket 落库 + P1-3 日志卫生（V3.4.43）

## 日期和时间

2026-07-26 20:51（北京时间）

## 事件逻辑链条分析

- **核心症状**（三项，均出自 `Docs/TODO/bugfix-optimization-plan.md` 证据盘点）：
  ① `layerTreeBuilder.ts:389` 使用 `capabilities.edit` 但 `StandardLayerCapabilities` 未声明该字段——全库唯一 tsc 业务错误（运行时正常，类型层断裂）；
  ② OAuth 一次性 ticket 存进程内存 dict——多 uvicorn worker 下回调进程与换取进程不同、或容器滚动重启瞬间，用户遭遇"ticket 无效"（配置架构计划早已标注的已知限制）；
  ③ 前端 9 处 `console.log`——1 处在 vendored 导航控件的 catch 错误分支（级别误用），8 处集中于 `useMapSwipeTest.ts`。
- **根本原因**：① V3.4.9 编辑泛化时只加消费未补类型；② 初版 OAuth 以单 worker 假设换实现简单；③ vendored 上游代码习惯 + 测试工具的输出即功能。
- **受影响模块**：2D 图层类型层、OAuth 全流程（登录/绑定回调→前端换 session）、日志卫生。
- **解决思路**：类型补字段；ticket 迁 SQLite 短表以 DELETE 原子性替代进程锁；日志按定性分治（错误分支升 warn、dev 工具保留）。

## 修改内容

1. **P0-2**：`stores/layer/layerHelpers.ts` `StandardLayerCapabilities` 补 `edit?: boolean`（含注释溯源 V3.4.9）；连带核对该接口其余消费字段（attribute/style/label/copy/toggle/export*/openAoiPanel/zoom/remove）均已声明，无同批遗漏。
2. **P0-3**：
   - `api/auth/schema.py` 新增 `oauth_tickets` 表（`ticket TEXT PRIMARY KEY, kind, provider, payload TEXT(JSON), expires_at INTEGER` + expires 索引），随既有 schema 初始化/自愈机制建表；
   - `api/auth/oauth.py`：`create_oauth_ticket` → INSERT + 顺带 `DELETE WHERE expires_at <= now`（TTL 秒级行数极小）；`consume_oauth_ticket` → SELECT 后 DELETE，**以 `rowcount` 判定唯一占有权**（并发/跨 worker 同票仅先删成功者获 payload），过期或 kind/provider 不匹配均 400 且票已销毁（防重试爆破）；payload JSON 序列化往返；删除模块级 `_oauth_tickets` dict、`_ticket_lock` 与 `import threading`。
3. **P1-3**：`cesium-navigation/viewModels/ResetViewNavigationControl.js` catch 分支 `console.log` → `console.warn`（携带异常对象，vendored 最小改动）；`useMapSwipeTest.ts` 8 处**保留**——文件头自带 `/* eslint-disable no-console */` 意图声明、全库无生产引用、console 输出即其功能（卷帘调试工具），验收口径修正为"业务代码归零，声明式 dev 工具除外"。
4. **规划文档**：三项标记 ✅（含版本号与本日志链接）。

## 修改原因

执行既定修复规划 Sprint 首批（用户指令"开始执行下一步"）；P0-1 实机回归需用户本机操作，故先清 Agent 可独立完成的三项。

## 影响范围

OAuth 登录/绑定全流程的 ticket 存取路径（接口签名与对外行为不变，仅存储介质变更——错误提示文案一致）；auth 库新增一张秒级 TTL 小表；2D 图层类型层（纯声明补充，零运行时变化）；vendored 控件一行日志级别。

## 优化解决方案

ticket 原子性设计要点：不依赖 `BEGIN IMMEDIATE` 或 RETURNING（兼容旧 SQLite），用「先读后删、以删定胜」——DELETE 的行级原子性天然保证跨连接/跨进程互斥；类型不匹配也销毁票（安全优先：错误尝试不给第二次机会）；创建时顺带清理过期行免去后台任务。

## 性能指标

ticket 表读写为主键点查 + 秒级 TTL（常驻行数 ≈ 并发 OAuth 数，个位数）；相比内存 dict 增加一次 SQLite 往返（<1ms），对登录链路无感。

## 测试方案

- **已验**：`py_compile`（oauth.py/schema.py）；内存 SQLite 语义单测 5 场景全过（正常消费返回 payload、重复消费 invalid、kind/provider 不匹配 mismatch 且票销毁、过期 expired、create 顺带清理过期行）；ESLint（ResetViewNavigationControl.js/layerHelpers.ts）零告警；`tsc --noEmit` 业务代码零错误；`grep console.log`（排除 useMapSwipeTest）为 0；配置门禁七项全绿。
- **待实机**：Google/GitHub 登录与绑定全流程回归（ticket 换 session 正常、复用同一 ticket 二次请求 400）；`docker compose` 下重启容器后旧 ticket 正确失效；（可选）uvicorn `--workers 2` 压测回调→换取跨进程路径。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\layer\layerHelpers.ts
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\schema.py
- D:\Dev\GitHub\WebGIS-Dev\backend\api\auth\oauth.py
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\Cesium\cesium-navigation\viewModels\ResetViewNavigationControl.js
- D:\Dev\GitHub\WebGIS-Dev\Docs\TODO\bugfix-optimization-plan.md（三项勾选）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.43 三处 + 版本表保留最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.43 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-p0-fixes-batch.md（本日志）

> 备注：无文件增删，文件树不变；未执行任何 git 操作，提交由用户决策。
