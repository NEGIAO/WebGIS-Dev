# 2026-11-26 编写用户位置统计架构文档

- **日期与时间**：2026-11-26 10:49
- **任务等级**：L2（纯文档梳理，无业务代码改动）
- **本次版本**：V3.7.14（并入本版本批次，未单独升号）

## 问题分析

**用户诉求**：整理前后端用户位置统计逻辑，覆盖 GPS/IP 从数据获取到前后端交互与信息存储的全链路；
特别强调前端 `p` 参数与后端 IP/GPS 解析要分清、不遗漏、架构准确。

**核查发现（关键事实）**：
1. **URL `p` 来自后端**：访问链路中 `p` 不是前端 `encodePos` 生成，而是 `/api/log-visit` 返回的
   `encoded_pos`（`useHomeTocAndAttributeActions.ts:574-576` 写 URL）。
2. **前后端编码同算法**：前端 `encodePos`（positions.ts）与后端 `encode_pos`（statistics.py:227）
   均为 ×1e6 + 位封包 + Base62，后端补位保证等长；但**后端只有编码、没有解码**。
3. **两套访问追踪端点**：`/api/log-visit`（statistics.py，写 visit_tracking_events + user_visits +
   guest_identity_records）与 `/api/v1/location/track-visit`（location.py，写 visit_tracking），触发方不同。
4. **loc 规则**：GPS 写 `p` + `loc=gps`，IP 只写 `loc=ip` 不写 `p`，GPS 优先不被覆盖。
5. **已知不一致**：`/location/ip-locate` 与 `/location/track-visit` 仍直调 `ip_geo_service`，
   未走 V3.7.14 新增的 `request_geo` 中枢（功能等价，架构未完全收敛）。

## 修改内容

新增 `Docs/Architecture/user-location-statistics.md`，含：
- 术语与口径定义表（p / loc / lng lat / encoded_pos / coord_source / IP 定位 / GPS 定位）；
- p 短码前后端同算法对照表与完整流转；
- GPS 采集链路、前端 IP 定位 API 交互；
- 后端 ip_geo 四级服务与 request_geo 中枢；
- 两套访问追踪端点对比、7 张地理字段表分工、在线表城市来源；
- Mermaid 端到端数据流图、7 条关键不变量、3 处已知不一致、文件速查表。

## 修改原因

用户要求形成架构文档沉淀，避免后续维护混淆 p 参数与 IP/GPS 统计两套机制。

## 影响范围

仅新增文档 + CHANGELOG 追加一条；无业务代码、无 DB、无配置改动。

## 解决方案

以代码实证为准逐条核对（尤其修正了初稿中"后端有 decode_pos"的臆造断言——实际后端只有编码），
文档中所有函数位置均标注文件名与行号便于复核。

## 性能指标

不适用（文档任务）。

## 测试方案

### Agent 已执行

- 逐项 grep/Read 核对文档中的函数、行号、表名、字段名；修正 1 处臆造断言（后端 decode_pos）。
- 门禁 4 项全绿。

### 待用户实机验证

无需功能验证（纯文档）。请审阅架构文档描述的链路是否与预期一致，特别是"已知不一致"章节的三项。

## 变更文件清单

- `Docs/Architecture/user-location-statistics.md`（新增）：位置统计架构文档。
- `Docs/Guide/CHANGELOG.md`：V3.7.14 第 6 项 + 修正验证数据为 178 passed。
- 本日志。

## 遗留与风险

- 文档记录的 3 处已知不一致尚未修复（不在本次任务范围）；如需收敛，另起 L2/L3 任务。
- 未单独升版本号（并入 V3.7.14 批次）：若用户希望文档任务独立成版，可后续调整。
