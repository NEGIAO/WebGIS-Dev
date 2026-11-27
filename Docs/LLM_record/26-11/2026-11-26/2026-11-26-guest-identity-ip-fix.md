# 访客身份 IP 提取修复 · XFF 末跳取到内网代理 IP（L2）

- **日期与时间**：2026-11-26 23:49
- **任务等级**：L2（Bug 修复）
- **任务来源**：用户微信消息（2026-11-26 23:49）——「重建并给我修复检查这个bug，按照force command规范进行并提交pr」；所指 bug 为 2026-11-26 ~23:44 同一微信会话中发现的访客 token 身份 bug（用户发来 curl 签发的 guest token 追问为何 curl 能签发）。
- **分支**：`muse/dev`（从 `origin/main` dce5840 重建；旧 muse/dev 已随 main 历史重写而失效，用户本次明确指令重建并提交 PR，按 Force_command §0 优先级 1 临时豁免 §2.1 Git 写禁令，仅本次任务生效；另有 2026-11-24 的 muse/dev 由 Muse 维护、改动走 PR 的既定安排）
- **本次版本**：V3.7.18

## 问题分析

### 核心症状

1. `POST /api/auth/guest/session` 是匿名端点，curl 不带登录、不带浏览器特征即可签发 guest token——本身**按设计**（匿名签发 + 6/小时限频），不是 bug。
2. 真正的 bug：签发时派生的身份 IP 是内网代理 IP `10.16.1.43`，而非真实用户 IP。后果：
   - 所有用户共用同一个身份 IP，`guest_uid` 只靠 UA 区分——**相同 UA 的不同用户撞进同一个配额桶**（一人用掉额度，他人跟着受限；在线统计/会话 `ip` 字段也全部记成 `10.16.1.43`，地理位置解析无意义）；
   - 签发限频键 `(IP, UA)` 中的 IP 恒定，**轮换 UA 即可绕过 6/小时签发限频**，无限签发 token；
   - 反过来，所有真实用户共享同一 `(10.16.1.43, 同款 UA)` 限频桶，正常用户可能被他人触发的限流误伤。

### 根本原因

`backend/api/auth/constants.py` 的 `_extract_identity_ip` 取 `X-Forwarded-For` **末跳**（最后一个合法 IP）。其注释的前提假设是「末跳是可信反代 HF 追加的」，该假设在 HF Spaces Docker 部署下不成立：

```
客户端 → HF 边缘代理 → 容器内网代理 → uvicorn
X-Forwarded-For: <真实用户公网 IP>, 10.16.1.43
                                  ▲ 末跳是容器内网代理的 IP，不是用户
```

XFF 是按经过的代理从左向右追加的：HF 边缘代理追加的是真实用户 IP，内网代理再追加一跳后，末跳就变成了内网 IP。取末跳等于取「离容器最近的代理」，在任何多层反代部署下都不是用户。本地直连时末跳恰好是用户 IP，所以该写法在开发环境从未暴露问题。

### 受影响模块

| 位置 | 影响 |
|---|---|
| `backend/api/auth/constants.py` `_extract_identity_ip` | 根因：身份 IP 派生错误 |
| `backend/api/auth/routes.py:752` `POST /auth/guest/session` | 签发限频键 + `guest_uid` 派生 + 会话 `ip` 落库 + `resolve_ip_geo` 全部用错 IP |
| `backend/api/auth/routes.py:907` 游客登录分支 | 无 token 时配额桶 `H(IP\|UA)` 用错 IP |
| `backend/api/auth/dependencies.py:124` 无 token 兜底 | 同上：确定性配额桶用错 IP |
| `backend/api/auth/guest_token.py` `issue_limit_key` | 限频键本身无错，但输入的 IP 是错的 |

### 候选方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| **A. 从右向左取第一个公网 IP** | 跳过私网/保留/回环等非公网跳，取最右侧公网跳；无公网跳时回退到 `request.client.host`（若为公网），再无则返回 `""` | ✅ 采纳。防伪造：客户端只能在链首塞假 IP（左侧），最右侧公网跳是最后一个可信代理追加的真实用户 IP；HF 链 `真实IP, 10.16.1.43` → 取到真实 IP；直连（无 XFF）→ 取 `client.host` |
| B. 取最左侧公网 IP | 链首即用户自报 | ❌ 否决：客户端可任意伪造链首，等于把身份选择权交给攻击者 |
| C. 只信任 `request.client.host` | 不读 XFF | ❌ 否决：HF 下 `client.host` 就是内网代理 IP，问题依旧；且破坏直连/单层代理部署 |
| D. 可信代理 CIDR 白名单配置 | 配置 `TRUSTED_PROXY_CIDRS`，从右跳过白名单内跳 | ❌ 否决：新增配置面（catalog + `.env.example` + 门禁）却无收益——HF 内网段不保证稳定，「跳过私网跳」已是等价的通用规则 |

### 选定方案与理由

方案 A。改动只收敛在 `_extract_identity_ip` 一个函数内，所有调用点（签发、游客登录、无 token 兜底）自动受益，无需改调用方；复用文件内已有的 `is_private_client_ip` 作为「非公网」判定（与在线统计的网关 IP 过滤同一口径）。同步修正四处残留「末跳」措辞的注释（`constants.py`、`guest_token.py`、`dependencies.py`、`routes.py`），避免注释与行为脱节。

**不在本次范围**（按 §2.5 记入遗留，不顺手做）：签发时加浏览器特征 / 验证码校验。23:44 的修复方向里提过这一项，但它是带前端与供应商接入的功能级工作，不属于本次「IP 提取错误」的修复范围；且 Force_command §11.1.4 禁止验证码对抗类逻辑——加校验本身不违规，但需单独立项设计，不在此 PR 夹带。

## 修改内容

1. `backend/api/auth/constants.py`：`_extract_identity_ip` 改为从右向左取第一个公网 IP；XFF 无公网跳时回退 `request.client.host`（仅当其为公网 IP）；全链皆私网/无可用 IP 时返回 `""`（调用方原样参与哈希，不再把内网代理 IP 当作身份）；更新 `_derive_uid_from_ip_ua` 注释中的「XFF 末跳」表述。
2. `backend/api/auth/guest_token.py`：模块头注释与 `issue_limit_key` docstring 的「末跳 IP」改为「身份 IP（最右侧公网跳）」。
3. `backend/api/auth/dependencies.py`：无 token 兜底注释的 `H(XFF末跳IP|UA)` 同步改述。
4. `backend/api/auth/routes.py`：游客登录分支注释与签发端点 docstring / `V3.7.14` 注记中的「末跳」表述同步改述。
5. `backend/tests/test_guest_identity.py`：新增 `_extract_identity_ip` 单测类，覆盖 HF 实测链（公网 + 内网末跳）、链首伪造、直连、全私网链、非法跳、IPv6。

## 修改原因

身份 IP 是游客配额桶与签发限频的唯一服务端可信维度（device_id、UA 均客户端可轮换）。IP 取错等于反滥用防线建立在全体用户共享的一个常量上：既误伤正常用户（同 UA 共桶），又放过滥用者（轮换 UA 即绕过限频）。

## 影响范围

- **鉴权/游客身份**：签发、游客登录、无 token 兜底三条路径的 `guest_uid` 派生口径变化——同一真实用户在修复前后得到的无 token 桶可能不同（旧桶以 `10.16.1.43` 派生，新桶以真实公网 IP 派生）。已签发 token 不受影响（验签走 `guest_uid` 本身，不重算 IP）；旧桶内的配额计数自然过期，无需迁移。
- **签发限频**：限频键从「全站共享 IP + UA」变为「真实 IP + UA」，轮换 UA 绕过失效；同 UA 不同 IP 的用户不再互相挤占额度。
- **在线统计/会话落库**：`sessions.ip` 与 `resolve_ip_geo` 首次拿到真实公网 IP，城市解析恢复意义；`is_private_client_ip` 的网关过滤逻辑不受影响。
- **展示用 IP 不变**：`_extract_client_ip`（展示/审计）未动。

## 解决方案

见「选定方案与理由」。实施步骤：写日志分析 → 改 `_extract_identity_ip` → 同步四处注释 → 补单测 → 跑单测与门禁 → 升版 → 提交 PR（合并由用户执行）。

## 性能指标

未实测。本改动为每次请求一次 XFF 字符串扫描（跳数通常 ≤3），无新增 I/O 或查询。

## 测试方案

### Agent 已执行

- 复现脚本（修复前）：构造 HF 实测链 `X-Forwarded-For: 8.8.8.8, 10.16.1.43` 调 `_extract_identity_ip`，修复前返回 `10.16.1.43`，两用户同 UA 撞进同一 `guest_c7cba66f113ac70d`；修复后返回 `8.8.8.8`，两用户桶分离（`guest_819bc87126a1db69` / `guest_afbcf4d932bd68ff`）。
- 新增单测 `backend/tests/test_guest_identity.py`（`ExtractIdentityIpTests`，7 个），覆盖：HF 链、链首伪造公网 IP、多跳、直连公网 `client.host`、全私网链返回 `""`、非法跳跳过、IPv6 公网/私网。**注意**：测试 IP 必须用真实公网 IP（如 `8.8.8.8` / `114.114.114.114`），文档段 `203.0.113.0/24`、`198.51.100.0/24` 在 Python `ipaddress` 里 `is_private=True`，会被当作私网跳过——第一轮测试因此 5 失败，换真实 IP 后全过。
- 全量跑 `backend/tests/test_guest_identity.py`：**29 passed**（原 22 个 + 新 7 个）。
- 全量后端单测 `backend/tests/`：**190 passed，2 failed**。2 个失败与本次改动无关，且在干净 main（`git stash` 后复跑）上同样失败，属既有失败：`test_db_transient_corruption.py::AccessSerializationTests::test_exhausted_corruption_resets_storage_ready_flag`（期望的 `sqlite3.DatabaseError: not a database` 未抛出）与 `test_webhook_helpers.py::test_shutdown_webhook_watches_noop_when_idle`。已记入遗留，不在本 PR 修（§2.5 越权扩大范围禁令）。
- 门禁：`python Scripts/CheckStructureTree.py`、`python Scripts/CheckConfigRegistry.py`。
- 平台红线自查（§11.2 两条 `rg` 命令）。

### 待用户实机验证

1. 合并 PR 并部署后端到 HF 后，用 curl（换 2 个不同 UA）各请求一次 `POST /auth/guest/session`，再在管理端查 `sessions` 表：两条记录的 `ip` 应为各自真实公网 IP（不再是 `10.16.1.43`），且 `ip_city` 能解析出城市。
2. 同一 UA 连续签发 7 次，第 7 次应返回 429 `GUEST_ISSUE_LIMITED`（限频 6/小时生效且按真实 IP 隔离）。
3. 浏览器正常游客登录一次，配额与在线统计显示正常，无回归。

## 变更文件清单

- `backend/api/auth/constants.py`——身份 IP 提取改为最右侧公网跳 + 注释同步
- `backend/api/auth/guest_token.py`——「末跳」注释改述（无行为改动）
- `backend/api/auth/dependencies.py`——「末跳」注释改述（无行为改动）
- `backend/api/auth/routes.py`——「末跳」注释改述（无行为改动）
- `backend/tests/test_guest_identity.py`——新增 `_extract_identity_ip` 单测
- `Docs/LLM_record/26-11/2026-11-26/2026-11-26-guest-identity-ip-fix.md`——本日志
- `Docs/Guide/CHANGELOG.md`、`README.md`——V3.7.18 版本号

## 遗留与风险

- **无公网 IP 可见时身份为空串**：若请求链全为私网跳且 `client.host` 也是私网（纯内网/本地开发），`_extract_identity_ip` 返回 `""`，调用方退化为 `H(""|UA)` 共享桶——与修复前同等碰撞，但仅限无公网 IP 的环境；生产 HF 链恒有公网跳，不受影响。彻底根治需设备/验证码等额外身份锚，见下条。
- **签发通道仍无浏览器/验证码校验**：curl 仍可匿名签发（按设计），限频现按真实 IP 生效，但同一出口 IP 下的 UA 轮换仍可少量绕过（成本已从「零」抬升为「需同时换出口 IP 与 UA」）。如需进一步收紧，另立项：签发时校验浏览器特征 / 接入验证码（注意 §11.1.4：只允许加校验，不允许做绕过对抗逻辑）。
- **既有单测 2 失败（与本 PR 无关，已验证干净 main 同样失败）**：`test_db_transient_corruption.py::AccessSerializationTests::test_exhausted_corruption_resets_storage_ready_flag`、`test_webhook_helpers.py::test_shutdown_webhook_watches_noop_when_idle`。建议另立任务排查，记入 `Docs/TODO/bugfix-optimization-plan.md` 候选。
- **历史桶口径变化**：无 token 老用户修复后首次访问会落入新桶（配额计数重新累计），属一次性口径迁移，无数据迁移需求。
- **X-Real-IP 未纳入**：本次只认 XFF + `client.host`；HF 部署下 XFF 已足够，不额外信任另一客户端可写头部。
