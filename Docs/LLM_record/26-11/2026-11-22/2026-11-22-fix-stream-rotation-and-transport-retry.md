# 2026-11-22 流式候选轮换外层 break 修复 + 零输出诊断 + 传输异常整轮重试

- **日期与时间**：2026-11-22 15:45 前后（实施中补记）
- **任务等级**：L2（P1 bug 修复 + 可用性加固，经用户授权）
- **版本**：V3.7.8（曾用号 V3.7.12，按用户「整合为一个统一的版本：V3.7.8」指令归并，见 CHANGELOG 归并注）

## 问题分析

### 核心症状（前次暂存区 code review + 生产日志 14:37:55）

1. **P1（code review 发现）**：`_stream_upstream_chat_events` 内层端点循环的 `break` 只退出端点层，外层 `for api_key in candidates` 继续下一候选——已成功锁定后仍对下一 key 重复请求并重复 yield delta（多 key 候选时回复内容成倍重复 + 上游重复计费）。
2. **单候选无退路（生产实证）**：14:37:55 NVIDIA 上游 ReadTimeout（>120s 无输出），default-proxy 仅 1 key × 1 endpoint，轮换无处可去 → 该请求直接报错。
3. 附带：候选零输出路径零日志——12:29 / 13:46 两次「upstream returned empty content」事故均无法区分四种子因（无 data 行 / JSON 解析失败 / delta.content 空 / 无 [DONE]）。

### 根本原因

外层候选循环缺终止检查（批次 E 编写时的遗漏）；候选轮换设计只有「横向轮换」（换 key/endpoint），没有「纵向重试」（同候选再试一轮）。

### 受影响模块

`backend/api/agent_chat/upstream.py`（`_stream_upstream_chat_events`）。

### 候选方案对比（#4 部分）

| 方案 | 做法 | 取舍 |
|---|---|---|
| A（选定） | pre-delta 传输层异常（httpx.HTTPError）导致全部候选失败时，**整轮候选重试一次**（`_MAX_TRANSPORT_RETRY_PASSES=1`） | 只对传输类失败重试；HTTP 4xx/空流不重试（避免对确定性失败翻倍打） |
| B | 加大 read timeout | 120s 已很长，拉长只会让用户等更久 |
| C | 增加多候选 | key 数量是运维资源问题，非代码 |

**#5 撤销说明**：原计划「高德冷启动 504 修复」，实读 `external_proxy.py:179` 后确认 504 是**设计的快速失败映射**（`httpx.TimeoutException → 504`，预算 connect 3s/read 8s）——14:18–14:19 的 8 个 504 是高德上游真实变慢被正确拦截，非缺陷。诚实缩范围，不做无意义修复。

## 解决方案

1. **P1 修复**：`stream_locked` 标志——内层 break 处置 True，内层循环结束后（外层 for 体内）`if stream_locked: break`，成功后终止全部轮换。
2. **零输出诊断**：每次候选尝试记录 `raw_line_count / data_line_count / parsed_count / stream_done / stream_broke / finish_reason / 首条 data 行预览`，未产出任何内容时打 WARNING——撕裂/空流四种子因自此可在生产日志区分。
3. **#4 整轮传输重试**：pass 循环包裹候选轮换；pass 结束时「无内容 + 有传输异常」→ 整轮重试一次；有内容 → 收束；无传输异常（HTTP 失败/空流）→ 不重试。

## 修改内容

1. `backend/api/agent_chat/upstream.py` `_stream_upstream_chat_events`：
   - 新增 `stream_locked` 标志（内层端点循环锁定候选时置位，内层结束后 `break` 外层候选循环）——P1 根治。
   - 读循环新增诊断计数（`raw_line_count / data_line_count / parsed_count / first_data_preview / last_finish_reason`），候选未产出任何内容时打 WARNING（含 last_error）。
   - 外层包 pass 循环：全部候选因 `httpx.HTTPError` 失败且零内容 → 整轮重试一次（`_MAX_TRANSPORT_RETRY_PASSES=1`）；`had_transport_error` 门控保证 HTTP 4xx/空流不重试。
2. `backend/tests/test_agent_stream.py`：新增 `_FakeAsyncClient`/`_FakeResponse` mock 基建 + `StreamRotationRegressionTests` 3 例（锁定终止轮换、传输异常整轮重试、HTTP 失败不重试）。
3. HF 侧（API 写操作，用户授权）：撤销冗余 secret `SMTP_Reply`；`SUPABADE_KEY→SUPABASE_KEY` 已由用户在网页改名。

## 影响范围

- 三通道流式端点（default-proxy / proxy / completions 的 /stream）共用的生成器；非流式端点零改动。
- 多 key 候选配置（completions 通道）不再重复请求/重复计费；单候选配置获得「传输异常整轮重试一次」的可用性兜底。
- HF Space secrets 变更（SMTP_Reply 删除不影响代码读取；SUPABASE 改名随下次重启生效）。

## 性能指标

不适用——正常路径零开销（多一层标志检查）；传输异常场景单请求最多增加一轮候选调用耗时（≤ timeout 上限）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 流式域 pytest **16/16**（含 3 新回归：首候选成功后第二候选不被调用 / 内容不成倍重复 / 传输异常重试 / HTTP 失败不重试）；全量 122 passed（1 个 pytest-asyncio 既有环境项）；py_compile 通过；结构树/配置登记门禁通过；表格 3 行核验 | ① 多 key 候选下对话：回复内容不再成倍重复；② 单候选偶发超时：自动重试成功（日志见 `retrying once (pass 1)`）；③ 零输出若再发生：日志可读出 `candidate produced nothing: ... lines/data/parsed/done/finish/first_data` 直接定位子因 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/api/agent_chat/upstream.py` | stream_locked + 零输出诊断 + 传输重试 pass 循环 |
| `backend/tests/test_agent_stream.py` | 新增 mock 基建 + 3 回归测试 |
| `README.md` | 版本号三处（表格增删同步，恒定 3 行） |
| `Docs/Guide/CHANGELOG.md` | 顶部追加 V3.7.12 条目 |
| `Docs/LLM_record/26-11/2026-11-22/2026-11-22-fix-stream-rotation-and-transport-retry.md` | 本日志（**新建**） |
| HF Space secrets | 撤销 `SMTP_Reply`（API 写操作，用户授权） |

## 遗留与风险

1. 传输重试的整轮重复意味着异常场景下上游可能收到两次请求（原实现同样如此——候选轮换本身就是重复请求机制）；计费影响与轮换语义一致。
2. restart / factory-reboot 端点**未出现在官方 openapi 规范**（json/md 均无）——重启 Space 若需 API 化，需实测 hub 生态已知端点后才能依赖。
3. SUPABASE 功能将在下次重启后首次真正启用——若 Supabase 侧凭据/表结构有变，首次启动可能出现该域新错误（属暴露而非回归）。
4. 本地环境缺口：pyproj（cors 测试收集失败）、pytest-asyncio（1 async 测试失败）——建议 `pip install pyproj pytest-asyncio` 补齐以获得全绿基线。
