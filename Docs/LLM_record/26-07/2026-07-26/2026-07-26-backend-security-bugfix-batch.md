# 后端安全与正确性 Bug 修复批次（Code Review 驱动）

- **日期与时间**：2026-07-26 21:41
- **任务等级**：L2（多文件 Bug 修复 / 无新增删除文件、无 schema 变更、无新增配置 key）
- **基线版本**：V3.4.52 → **本次 V3.4.53**
- **触发**：用户要求「后端代码 code review 一下，修复优化」。经用户确认口径为
  **「明确 bug + 低风险优化」**（中大型重构仅登记 TODO，不动手）；规划 P2-3（高德 v5 升级）本次不做。

---

## 1. 问题分析（症状 → 根因 → 受影响模块）

对 `backend/` 全量 Python（66 文件）分域走查，聚焦安全面（鉴权 / OAuth / 代理 / 密钥）、
正确性 bug、崩溃路径与规范符合度。逐条**读实际代码核实行号与触发链**后，纳入本批修复的为
「已确证、可外科手术式最小改动、且不改变正常流程行为」的 **14 项**（第一轮 S1–S11 共 11 项；
应用户「继续检查并优化后端 py」指令的第二轮追加 S12–S14 共 3 项，折叠进同一 V3.4.53 批次）；
其余（SSRF、配额原子性、连接池化、损坏恢复竞态、SMTP 明文等）因需设计决策或行为变更，
按 Force_command §2.5 登记 `Docs/TODO/bugfix-optimization-plan.md` 待排期（见本日志 §5）。

> 复核心得：第二轮逐一比对当前磁盘代码发现 `gcj_rectify/fetch.py` 已较早期审查结果重构
>（已具超时配置与 `aclose` 路径），**审查报告行号存在时效性**——故第二轮每项均重新读码确认，
> 未沿用旧行号盲改。

### 核心症状与根因

| # | 症状 | 根本原因 | 受影响模块 |
|---|------|----------|-----------|
| S1 | 可对**他人未注册邮箱**免验证码完成注册（占用 / 阻断 / 连带 OAuth 自动关联劫持） | 验证码暴力破解耗尽时置 `used=1`，而 `is_email_verified_for_purpose` 把任意 `used=1` 视为「已验证成功」——`used` 标记语义在「验证成功」与「被烧毁」之间二义 | 鉴权（verification/register） |
| S2 | **GitHub OAuth 登录 100% 失败** | `consume_oauth_ticket` 先无条件 `DELETE` 再判 provider；登录换票按 (`google`,`github`) 顺序试探同一 ticket，google 探测即把 GitHub 票删除并抛「类型不匹配」，github 探测已查无此票 | 鉴权（oauth/login exchange） |
| S3 | `/monitor/logs/stream` **匿名可读**全进程日志（含 INFO 打印的邮箱等 PII / 异常堆栈；线上还用 L3 `LOG` token 代理 Space 日志） | 路由与端点均无鉴权依赖，`_LOG_token()` 仅校验服务端是否配置、非调用方授权 | 系统监控 |
| S4 | 含非 ASCII 字符的密码 / 验证码 → **HTTP 500** 而非 401/400（且能借状态码区分保留账号） | `hmac.compare_digest(str,str)` / `secrets.compare_digest(str,str)` 收到含非 ASCII 的 str 抛 `TypeError` | 鉴权（login/verify） |
| S5 | catalog 登记的**布尔默认值形同虚设**（如 `PROXY_VERIFY_SSL` 未设环境变量时静默 fail-open 关闭 TLS 校验） | `get_bool(default: bool=False)` 无法区分「显式传 False」与「未传」，故从不回退 catalog 默认（与 get_int/get_float 不一致） | 配置层 |
| S6 | Agent 的 thinking / `top_p` 配置**从未到达上游** | `_call_upstream_chat_with_key_candidates` 接收 `top_p`/`extra_body` 却未透传给内层 `_call_upstream_chat` | AI 对话 |
| S7 | 用户显式设 `temperature=0`/`top_p=0`（确定性输出）被**静默改回默认值** | `float(runtime.get("temperature") or DEFAULT)` 中 `0.0 or DEFAULT` == DEFAULT | AI 对话 |
| S8 | 不支持的空间分析类型返回 **500 + 误导性 ERROR 堆栈**，本应 400 | `except Exception` 兜底捕获了同 `try` 内主动抛出的 `HTTPException(400)` 并重写为 500 | 空间分析 |
| S9 | 恰好 2 个点 / 任意共线点集做泰森多边形**必然报错**，违背「至少 2 点」契约 | 用 `convex_hull` 判退化——2 点凸包必为 LineString、共线亦然，命中「退化」分支直接 raise | 空间分析 |
| S10 | 同一新游客并发首次访问 → **500「记录访问失败」且该次访问丢失** | `guest_identity_records`（`guest_uid UNIQUE`）用「先 SELECT 判存在再分支 INSERT」，并发下双方都判不存在，后一 INSERT 触发 UNIQUE 冲突 IntegrityError | 访问统计 |
| S11 | 「烧码后立即重发」可绕过 30 秒发送节流刷验证码邮件 | 30 秒节流仅统计 `used=0 且未过期` 的码；码被验证 / 烧毁置 `used=1` 后不再计入窗口 | 鉴权（verification） |

---

## 2. 修改内容（逐条）

> 全部为最小化外科修改；每处均加中文注释说明「为何这样改 / 原缺陷触发链」。

1. **S1 修复** `api/auth/verification.py` `verify_code`：尝试次数耗尽时由 `UPDATE ... SET used=1`
   改为 **`DELETE` 该记录**。使 `used=1` 重新成为「验证成功」的唯一凭据，
   `is_email_verified_for_purpose` 不再被「烧毁的码」误判为已验证。**无需 schema 变更**。
2. **S2 修复** `api/auth/oauth.py` `consume_oauth_ticket`：改为**先校验 kind/provider/过期，
   匹配后再带 `AND kind=? AND provider=?` 条件 DELETE**（rowcount 保留唯一占有权语义）。
   provider 不匹配时**不删除**，让正确 provider 的那次试探得以成功消费。
3. **S3 修复** `api/monitor.py` `/logs/stream`：新增 `Depends(require_admin)`。
   EventSource 无法带 Authorization 头，前端须以 `?token=<会话令牌>` 传参（`_extract_token` 支持
   query token）。`/logs/config`（仅返回模式字符串、无敏感数据）保持开放以最小化前端影响。
4. **S4 修复** `api/auth/routes.py`（游客 + 管理员登录两处）与 `api/auth/verification.py`（校验处）：
   `compare_digest` 两侧统一 `.encode("utf-8")` 后按 **bytes 比较**（等长时间、不受字符集影响）。
5. **S5 修复** `config/load.py` `get_bool`：签名 `default: bool=False` → `Optional[bool]=None`；
   未显式传 default 时回退 `_catalog_default(name)`（与 get_int/get_float 对齐）。
   现有调用方均传显式 default，行为不变；仅「不传 default」的调用新增 catalog 回退。
6. **S6 修复** `api/agent_chat/upstream.py`：`_call_upstream_chat_with_key_candidates` 内层调用
   补 `top_p=top_p, extra_body=extra_body` 透传。
7. **S7 修复** `api/agent_chat/routes.py`（4 处：/chat/config 展示 2 处 + /chat/completions 送上游 2 处）：
   `x or DEFAULT` → `x if x is not None else DEFAULT`，保住合法的 0.0。
8. **S8 修复** `api/spatial/router.py`：在 `except ValueError` 前插入 `except HTTPException: raise`。
9. **S9 修复** `api/spatial/operations/voronoi.py`：改用 `multi_point.bounds`（对 2 点/共线同样有效）
   构造带 padding 的 `box` envelope，删除「convex_hull 为 Point/LineString 即 raise」的误判分支；
   零展布维度回退 1km padding（3857 下单位为米），voronoi_diagram 以带面积的 box envelope 正常切分。
10. **S10 修复** `api/statistics.py` 游客身份记录：`SELECT` + 分支 `INSERT/UPDATE` 改为单条
    **`INSERT ... ON CONFLICT(guest_uid) DO UPDATE SET ... visit_count = visit_count + 1`** 原子 UPSERT；
    `first_seen_at` 冲突时保留、`last_seen_at` 用 `excluded` 更新。
11. **S11 修复** `api/auth/verification.py` `rate_limit_check` 30 秒节流：去掉 `used=0 AND expires_at>?`
    过滤，改为统计 30 秒内**任意**发送记录（<30s 的码永不过期、不被清理，可靠计入）。

### 第二轮追加（S12–S14）

12. **S12 修复** `api/agent_chat/upstream.py` `_call_upstream_chat` 的 `extra_body` 禁用键集补入
    `"stream"`/`"stream_options"`。**由 S6 直接引出**：S6 打通了候选 key 路径的 `extra_body` 透传后，
    若用户经 `extra_body={"stream": true}` 覆盖本函数硬设的 `stream=False`，上游将改走 SSE 流式，
    而本函数以 `response.json()` 解析 → 502（且上游已计费）。加入禁用键封堵此新暴露面。
13. **S13 修复** `api/agent_chat/upstream.py` `_try_get_location_from_ip_async`：高德 IP 定位 URL 由
    f-string 拼接改为 `client.get(url, params={"ip": ip, "key": amap_key})`。`ip` 源自客户端可控的
    `X-Forwarded-For`，直接拼接时 `1.1.1.1#` 会截断 key、`1.1.1.1&k=v` 会注入额外查询参数（host 固定，非 SSRF）。
14. **S14 修复** `api/statistics.py` `online_by_role`：`SELECT role ... GROUP BY role` + `normalize_role(role, None)`
    改为 `GROUP BY username, role` + 传真实 username 归一。`normalize_role` 仅凭用户名判定 admin
    （不信任 DB role 字段），传 None 使**在线管理员恒被并入 registered、「在线管理员」计数恒为 0**。

---

## 3. 修改原因（背景 / 痛点 / 动机）

- S1/S2 为**可利用的安全 / 功能 P0**：S1 允许攻击者预占或阻断他人邮箱账号，并因 OAuth 按已验证
  邮箱自动关联而放大为登录劫持；S2 使 GitHub 登录完全不可用（仅 Google 因排在探测首位而侥幸可用）。
- S3 是无鉴权的日志外泄面，CORS 又为 `*`，第三方页面经 EventSource 即可实时抓取含 PII 的日志。
- S4–S11 为确定性正确性缺陷（崩溃、静默 fail-open、配置不生效、契约违背、并发 500 与节流绕过），
  均可稳定复现且修复不触碰正常业务路径。

---

## 4. 影响范围

鉴权（注册 / 登录 / OAuth / 验证码）、系统监控日志流、配置层布尔读取、AI 对话上游参数、
空间分析（异常语义 + 泰森多边形）、访问统计（游客身份 UPSERT）。
**无 schema 变更、无新增 / 删除文件、无新增配置 key、无依赖增删**——故两门禁与结构树不受影响。

---

## 5. 解决方案（方案对比与选型）

- **S1 选型**：候选 a) 新增 `verified` 列，成功时置 1 并据此判定；b) 耗尽时删除记录。
  选 **b)**——闭合同样彻底，且**避免 schema 迁移**（保持 L2、门禁零风险），
  对既有「先 /verify-code 成功→再 /register 免验」两步流零影响。
- **S10 选型**：UPSERT 相比「加锁串行化」或「捕获 IntegrityError 重试」更简洁且由 SQLite 原子保证；
  SQLite ≥3.24 支持 `ON CONFLICT DO UPDATE`（HF / docker 运行时均满足）。
- **未纳入本批、已登记 TODO 的较大项**（需设计决策 / 行为变更 / 实机验证）：
  代理 SSRF 加固（`/proxy/**`、`/proxy/gcj2wgs/**`、`download_xyz` 模板无 host 白名单 + 私网 IP 过滤
  可被非点分十进制字面量绕过 + 无响应体大小上限 + 无界磁盘缓存）、agent `override_base_url`
  可致平台 API Key 外泄（SSRF + 凭据外泄）、Agent 配额 check-then-consume 竞态与可伪造
  quota_subject、SQLite 每请求新建连接 + 重复 DDL、损坏自动恢复的锁外竞态与潜在数据丢失、
  SMTP 明文（无 STARTTLS）、`require_login` 的 `?s=1` 分享模式旁路、游客 uid 随机化致配额旁路。

---

## 6. 性能指标

本批以正确性 / 安全为主。S10 的 UPSERT 将「每次访问 1 次 SELECT + 1 次 INSERT/UPDATE」降为
单条语句（略省一次往返）；其余非性能项。规划中的连接池化 / DDL 幂等化等性能项归 TODO（未实测）。

---

## 7. 测试方案

### Agent 已执行（沙盒内）

- `python -m py_compile` 10 个改动文件 + `compileall` 全 backend：**全部通过**。
- `python CheckConfigRegistry.py`：**7/7 全绿**（B1 无裸 os.getenv、B2 无未登记 key，证实未引入配置违规）。
- 单元级验证脚本（scratch）：
  - `guest_identity` UPSERT：连发同 `guest_uid` 3 次 → visit_count=3、first_seen 保留、last_seen 更新、
    无 IntegrityError；不同 `guest_uid` 独立计数——**通过**。
  - `compare_digest` bytes 化：对 `密码123` / 全角 `１２３４５６` 不再抛 TypeError；确认旧 str 比较确会抛——**通过**。
- 静态 + 逻辑推演：S9 泰森多边形（沙盒无 shapely 可运行，`.bounds` 对 2 点/共线有效、
  padding 后 box 有面积 → voronoi_diagram 可正常切 2+ 单元）；S2 OAuth 状态机（先判后条件删、
  不匹配不删）；S3 监控鉴权（`require_admin` 经 `_extract_token` 支持 `?token=`，与既有 5 个
  `from api.auth import` 路由同构、无循环导入）。

### 待用户实机验证（沙盒无 vite/uvicorn/shapely，需在本机回归）

1. **S1**：对一个未注册邮箱 `/send-code(register)` → `/verify-code` 连发 6 次错误码 → 再
   `/register` 传任意 `email_code`，**预期**：注册被拒（400，需有效验证码）；正常「验证成功→注册」两步流不受影响。
2. **S2**：完整走一遍 **GitHub** OAuth 登录，**预期**：成功换票登录（此前必失败）；Google 登录仍正常。
3. **S3**：未带 token 访问 `/monitor/logs/stream`，**预期** 401/403；管理员日志面板需带
   `?token=<会话令牌>`（EventSource）方可看到日志——**前端面板须相应加上该参数，请重点回归**。
4. **S4**：以非 ASCII 密码登录 `admin`，**预期** 401（非 500）。
5. **S6/S7**：设 `temperature=0` 或带 thinking `extra_body` 发起对话，**预期**上游实际收到 0 与 extra_body。
6. **S8**：`operation` 传错误值，**预期** 400（非 500）。
7. **S9**：泰森多边形传 **2 个点** 与 **3 共线点**，**预期**返回 ≥2 个单元（此前 400 退化报错）。
8. **S10**：同一新游客双标签页并发首访，**预期**无 500、visit_count 正确累加。
9. **S12**：以 `extra_body={"stream": true}` 发起对话，**预期**上游仍走非流式、正常返回（不再 502）。
10. **S13**：伪造 `X-Forwarded-For: 1.1.1.1#`，**预期** IP 定位不异常（key 不再被截断），功能等价。
11. **S14**：管理员在线时看用户中心，**预期**「在线管理员」计数为 1（此前恒 0）。
12. **门禁**：本机 `python CheckStructureTree.py`（沙盒无 frontend/src 无法运行）**预期**通过——
   本批未增删任何前端文件，结构树不受影响。

---

## 8. 变更文件清单

| 文件 | 说明 |
|------|------|
| `backend/api/auth/verification.py` | S1 耗尽即删、S4 验证码 bytes 比较、S11 30 秒节流计全量 |
| `backend/api/auth/oauth.py` | S2 ticket 先校验后条件删除 |
| `backend/api/monitor.py` | S3 `/logs/stream` 加 `require_admin` + 导入 `Depends`/`require_admin` |
| `backend/api/auth/routes.py` | S4 游客 / 管理员登录 bytes 比较 |
| `backend/config/load.py` | S5 `get_bool` 回退 catalog 默认 |
| `backend/api/agent_chat/upstream.py` | S6 透传 `top_p`/`extra_body`；S12 禁用键补 `stream`/`stream_options`；S13 IP 定位改 `params=` |
| `backend/api/agent_chat/routes.py` | S7 `temperature`/`top_p` 保住 0.0（4 处） |
| `backend/api/spatial/router.py` | S8 `except HTTPException: raise` |
| `backend/api/spatial/operations/voronoi.py` | S9 bounds envelope、去除 2 点/共线误判 |
| `backend/api/statistics.py` | S10 游客身份记录原子 UPSERT；S14 `online_by_role` 带 username 归一 |

---

## 9. 遗留与风险

- **S3 前端联动**：加鉴权后管理员日志面板须在 EventSource URL 带 `?token=`，否则面板取不到日志——
  已在待验证清单标注，请优先回归。
- **S9 运行时未跑**：沙盒无 shapely，仅静态 + 逻辑验证，需本机对 2 点 / 共线做一次实跑回归。
- **较大安全 / 性能项未在本批处理**（SSRF / 配额原子性 / 连接池化 / 损坏恢复 / SMTP 明文 等）
  已按优先级登记 `Docs/TODO/bugfix-optimization-plan.md`（新增 P0-5 安全簇、P1-4、P2-5、P3-7），
  其中**代理 SSRF 与 agent override_base_url 凭据外泄建议作为下一个会话最高优先级**。
- 未执行任何 Git 写操作；改动已备好待用户提交。
