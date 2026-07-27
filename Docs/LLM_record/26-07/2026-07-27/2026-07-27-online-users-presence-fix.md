# 2026-07-27 在线人数真实化：会话活跃心跳（online-users-presence-fix）

- **日期和时间**：2026-07-27 08:39
- **所属版本**：V3.4.60（规划取号 V3.4.54，发现并行会话已推进至 V3.4.59，按 Force_command §5 后完成者顺延；代码内注释已同步为 V3.4.60）
- **任务等级**：L2
- **变更类型**：Bug 修复（统计语义缺陷）；纯后端改动，前端零变更
- **用户反馈原话**：「（账号面板）2 人在线——这个地方换成实时数据，现在好像是随机的啊，真实的实现这个功能」

---

## 问题分析（事件逻辑链条）

| 环节 | 内容 |
|------|------|
| 核心症状 | 账号面板速览条「X 人在线」与总览页「在线用户」数值与实际在线人数不符，用户感觉像随机数 |
| 排查结论 | **数字并非随机、也非 mock**：前端 `FloatingAccountPanel` → `apiStatisticsRealtime` → 后端 `/statistics/realtime` → `_get_realtime_global_stats_sync()`，全链路真实。假象来自统计语义错误 |
| 根本原因 | 后端「在线」判定为 `SELECT COUNT(DISTINCT username) FROM sessions WHERE expires_at > now`，而会话 TTL = `AUTH_SESSION_EXPIRE_HOURS = 72` 小时。即：**过去 3 天内登录过且未显式退出的任何人都被计为「在线」**——未过期 ≠ 在线。关闭浏览器不销毁会话，数字只随登录/过期/退出缓慢漂移，与当下真实在线毫无对应 |
| 受影响模块 | `sessions` 表（schema 迁移）；鉴权链单点 `_get_session_sync`（心跳写入）；`/statistics/realtime` 三条在线查询（`online_users` / `online_sessions` / `online_by_role`）。前端零改动。admin.py:287 的「会话总数」语义为全量计数，不属在线，不动 |

## 候选方案对比

| 方案 | 说明 | 结论 |
|---|---|---|
| a) WebSocket 在线簿 | 连接即在线、断开即离线，实时性最好 | 弃：项目无 WS 基础设施，为一个数字引入长连接栈不成比例 |
| b) 新增前端心跳接口 | 前端定时 POST /heartbeat | 弃：需要新端点 + 前端改动；且**现有轮询已是天然心跳**（见下），再加一路属重复流量 |
| c) **会话活跃时间戳 + 现有请求即心跳**（选定） | `sessions` 加 `last_seen_at`，鉴权单点节流触活，在线 = 「未过期 **且** N 分钟内有请求」 | ✅ 纯后端、零新端点、零前端改动、SQLite 原生可承载 |

**方案 c 成立的关键前提（已逐一核实）**：

1. 所有带鉴权端点都经 `require_login` → `_get_session_sync(token)` 单点验证（`dependencies.py`），心跳只需埋在这一处；
2. 登录态页面存在**持续的带票据轮询**：`PersistentAnnouncementBar` 每 20s 拉 `/announcement/current`（require_login），`FloatingAccountPanel` 挂载即每 30s 拉 `/statistics/center` + `/statistics/realtime`（require_login，面板开合不影响定时器）。即：**App 开着 ⇒ 至少每 20~30s 一次鉴权请求 ⇒ 心跳自然刷新**；
3. 全库时间戳统一走 `_iso()`（UTC isoformat），同格式字符串字典序 = 时间序，现有 `expires_at > ?` 已是字符串比较先例，新查询同法可行。

## 选定方案实施设计

**① `auth/constants.py`** — 新增两个模块常量（普通常量，非配置 key，无需登记 .env）：

- `SESSION_TOUCH_THROTTLE_SECONDS = 60`：心跳写节流——距上次 `last_seen_at` 不足 60s 不写库，避免每请求一次 UPDATE 的写放大（每 token 每分钟至多 1 写）；
- `ONLINE_WINDOW_MINUTES = 5`：在线判定窗口。**约束：窗口(300s) ≫ 节流(60s) + 轮询间隔(30s)**，活跃用户的 `last_seen_at` 滞后上界 60s，永远不会因节流被误判离线；关闭页面后至多 5 分钟从在线名单消失。

**② `auth/schema.py`** — sessions 表迁移（沿用既有 `PRAGMA table_info` + `ALTER TABLE` 模式）：

- `last_seen_at TEXT NOT NULL DEFAULT ''` 列 + `idx_sessions_last_seen` 索引；
- 存量行回填 `last_seen_at = created_at`（一次性 UPDATE WHERE ''）：旧僵尸会话 created_at 久远 → 正确判离线；仍在用的旧会话首次请求即被心跳刷新 → 正确判在线。

**③ `auth/session.py`** — 心跳：

- `_create_session_sync`：INSERT 时写入 `last_seen_at = now`（登录即在线）；
- `_get_session_sync`：SELECT 补 `last_seen_at` 列；过期检查通过后，若 `last_seen_at` 为空或距今 > 节流阈值 → `UPDATE sessions SET last_seen_at = now`。空串经 `_safe_parse_iso` 返回 None 走「立即写」分支，天然兜底。

**④ `api/statistics.py`** — 三条在线查询统一改写：

```sql
WHERE expires_at > :now AND last_seen_at > :cutoff   -- cutoff = now − ONLINE_WINDOW_MINUTES
```

（`online_users`、`online_sessions`、`online_by_role` 三处；`ONLINE_WINDOW_MINUTES` 自 `auth.constants` 导入。）

### 边界情况核查表

| 场景 | 行为 |
|---|---|
| 游客临时会话（`token=""`，不入 sessions 表） | 从不计入在线——与改前一致 |
| 多标签页同一用户 | `COUNT(DISTINCT username)` 去重，不虚增 |
| 同用户多设备 | `online_sessions` 计连接数、`online_users` 计人数，语义各自正确 |
| 旧会话 `last_seen_at=''`（迁移回填遗漏的极端情形） | 空串 < 任何 ISO 串 → 判离线；一旦发请求即触活 |
| 心跳写失败 | 不影响鉴权主流程（触活包在会话验证成功之后，异常不外抛） |

### 不做什么

- 不加 WebSocket / SSE；不新增任何 HTTP 端点；不改前端任何文件；
- 不把两个常量做成 .env 配置 key（YAGNI，避免配置面膨胀；如日后需调窗口再按登记流程升级）；
- 不动 admin.py「会话总数」（语义本就是全量）；不动 `guest_identity_records.last_seen_at`（另一套访客画像体系，互不相干）。

---

## 修改内容

按设计 ①②③④ 全量落地，与方案零偏差：

1. `auth/constants.py`：新增 `SESSION_TOUCH_THROTTLE_SECONDS = 60`、`ONLINE_WINDOW_MINUTES = 5`（含窗口 ≫ 节流 + 轮询的约束注释）；
2. `auth/schema.py`：sessions 迁移——`last_seen_at TEXT NOT NULL DEFAULT ''` 列、存量回填 `= created_at`（仅列首建时执行一次）、`idx_sessions_last_seen` 索引（幂等）；
3. `auth/session.py`：`_create_session_sync` INSERT 补 `last_seen_at = now`（登录即在线）；`_get_session_sync` SELECT 补列 + 过期检查通过后节流触活（空串→None→立即写；UPDATE 包 try/except，心跳失败不阻断鉴权）；
4. `auth/__init__.py`：门面 re-export `ONLINE_WINDOW_MINUTES`（import 列表 + `__all__`）；
5. `api/statistics.py`：`datetime` 导入补 `timedelta`；`api.auth` 导入补 `ONLINE_WINDOW_MINUTES`；`_get_realtime_global_stats_sync` 计算 `online_cutoff_iso` 并在三条在线查询追加 `AND last_seen_at > ?`。

## 修改原因

见文首用户反馈原话与问题分析——「在线」数字与真实在线无对应属统计语义缺陷（功能性 Bug），且账号面板速览条/总览页/管理面板在线会话三处 UI 均受其误导。

## 影响范围

- 账号面板速览条「X 人在线」、总览页「在线用户」、管理面板「在线会话」与 `online_by_role` 角色分布：全部改为 5 分钟活跃窗口语义，数字随真实使用即时起落（30s 轮询内可见变化）；
- 鉴权链路：每 token 每分钟至多多 1 次 UPDATE（节流保障），单点位于 `_get_session_sync`，全部鉴权端点自动受益，无需逐端点改造；
- 数据库：sessions 表加列加索引，迁移幂等可重跑，旧库首启自动回填；
- 前端 / API 契约：响应字段名与结构完全不变，前端零改动零感知。

## 性能指标

- 心跳写放大上界：活跃 token × 1 写/分钟（原为 0，SQLite 承载无虞）；统计查询增加一个 AND 条件并有 `idx_sessions_last_seen` 索引支撑。未做压测（规模不需要）。

## 测试方案

### Agent 已执行（沙盒实测，全部通过）

- `python3 -m py_compile` 五个改动文件零错误；
- **临时 DB 功能测试 7 项断言全过**（真实调用 `_init_auth_storage_sync` / `_create_session_sync` / `_get_session_sync` / `_get_realtime_global_stats_sync`）：
  T1 建会话 `last_seen_at` 初始化=created_at；T2 60s 内重复 get 不写库（节流）；T3 拨旧 2min 后 get 触活刷新；T4 alice 活跃在线=1、bob 拨旧 10min 正确离线；T5 空串 last_seen_at 判离线兜底；T6 迁移幂等重跑；T7 模拟旧库（删索引删列）→ 迁移自动加列回填 created_at + 索引重建；
- 门禁：`CheckStructureTree.py` ✅（390/390 零漂移）、`CheckConfigRegistry.py` ✅（56 key 全登记）；
- 前端 `tsc --noEmit` 零报错（全项目）；eslint 对 V3.4.55 两文件零报错（全 src 扫描因挂载盘 IO 超时未完成，本次未动前端文件，风险面已覆盖）。

### 待用户实机验证

1. 重启后端（docker compose 重启即触发迁移），登录后打开账号面板：「X 人在线」应等于当前真实活跃人数（自己=1）；
2. 另开一个无痕窗口登录第二账号 → 30s 轮询内在线数 +1；关闭该窗口 → **约 5 分钟后**在线数 -1（勿手动退出，验证的正是"关闭即离线"）；
3. 挂机 10 分钟（页面开着不操作）→ 自己仍在线（公告栏 20s 轮询即心跳，不因无操作离线）；
4. 管理面板「在线会话」与角色分布数字同步收敛。

## 变更文件清单

| 文件 | 说明 |
|------|------|
| `backend/api/auth/constants.py` | 在线判定两常量（节流 60s / 窗口 5min） |
| `backend/api/auth/schema.py` | sessions 迁移：last_seen_at 列 + 回填 + 索引 |
| `backend/api/auth/session.py` | 创建初始化 + 鉴权单点节流心跳 |
| `backend/api/auth/__init__.py` | 门面 re-export ONLINE_WINDOW_MINUTES |
| `backend/api/statistics.py` | 三条在线查询加活跃窗口条件 |
| `README.md` | 版本三处 → V3.4.60；版本演进表收敛回恒定 3 行（前会话遗留 4 行） |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.4.60 条目 |
| 本日志（新增） | — |

## 遗留与风险

1. **实机验证欠账**：上述 4 步待用户跑通（Agent 沙盒无法起 Docker 后端实测 HTTP 链路）；
2. 在线窗口 5min / 节流 60s 为普通常量非 .env key（YAGNI 决策）——若日后需线上调参，按配置登记流程升级即可；
3. 极端场景：用户网络中断但页面开着 → 轮询失败 → 5 分钟后被判离线，恢复后自动回归在线，属预期语义；
4. **V3.4.53→55 账号面板高度修复的实机验收仍未完成**（`Docs/TODO/account-panel-ui-optimization.md` 第 4 节清单）：本会话原定驱动浏览器验收，因 Chrome 扩展未连接暂缓，待用户连接扩展 + 启动 LocalDev 后另行执行；注意 V3.4.57 已在同面板动过头部（blur-bg 死类清除），验收时以当前代码状态为准。
