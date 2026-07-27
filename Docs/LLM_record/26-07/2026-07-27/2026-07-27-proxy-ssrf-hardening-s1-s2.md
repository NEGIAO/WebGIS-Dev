# 2026-07-27 代理 SSRF 加固 S1+S2：IP 字面量绕过封堵 + DNS 复判 + 资源上限（规划 P1-4 [P0 安全]）

- **日期与时间**：2026-07-27 18:20
- **任务等级**：L3（方案文档 [`Docs/TODO/proxy-ssrf-hardening-plan.md`](../../../TODO/proxy-ssrf-hardening-plan.md)，
  用户批准口径：**S1+S2**、白名单机制建但**默认空=不限制**、`PROXY_RATE_LIMIT` 保持 0 不动）
- **版本**：V3.4.65（写入前 README/CHANGELOG 双 grep 复核：并行会话已占 63/64，按 §5 顺延）
- **承接**：姊妹项「agent override Key 外泄」V3.4.63 已完成，其判定实现本次提为共用单点（该日志明确留此接口）

---

## 问题分析

### 核心症状

后端三处「按调用方给的 URL 代为访问」的出站面存在 SSRF 与资源耗尽风险，其中通用代理**无任何鉴权**：

| 面 | 位置 | 实况缺口 |
|---|---|---|
| 通用/瓦片代理 | `api/proxy.py` `/proxy/{target_url:path}` | 匿名可用；私网过滤 `ipaddress.ip_address()` 只认点分十进制，**解析失败即放行** → `2130706433`/`0x7f000001`/`127.1`/`0177.0.0.1` 全绕过；不解析 DNS（域名 A 记录指向内网即绕过）；响应体无上限 |
| 纠偏代理 | `/proxy/gcj2wgs/**`、`/proxy/wgs2gcj/**` | 共用同一 host 校验（同上绕过）；`Image.open` 直解上游字节且 Pillow 默认阈值仅告警不拦截（解压炸弹）；合成网格瓦片数无上限；抓取并发硬编码 100 |
| 底图下载 | `download_xyz/download.py` | 鉴权在（`require_api_access`），但 `_validate_tile_template` **只校验 `{z}{x}{y}` 占位符**，无协议/host 校验 → 已登录用户可让服务器抓内网 URL 并把响应写进 GeoTIFF 回传 |

### 根本原因

同一类判定（"这个 host 能不能代为访问"）在三处各写一套、强弱不一：agent 侧 V3.4.63 已按 inet_aton 语义归一，
proxy 侧仍是弱判定，download 侧完全没有。**判定不收敛 = 最弱的那处决定实际安全水位**。

### 已核实**不成立**的疑点（避免误记为缺口）

- 重定向型 SSRF：两处代理均 `follow_redirects=False`，30x 原样回吐 `Location` 交客户端，后端不跟随 → 不成立；
- 白名单缺失≠可绕过内网：白名单是纵深防御项，主防线是私网+DNS 判定（本次已补）。

## 修改内容

### S1 判定统一（新建 `backend/utils/net_guard.py`，三面共用）

- `coerce_ip_literal` / `is_private_ip` / `is_disallowed_host` / `is_loopback_host`：自 `agent_chat/utils.py`
  **逐行迁入**（V3.4.63 语义不变），agent 侧改为 import + 同名别名赋值，调用点零改动；
- 新增 `resolve_host_has_private_ip`：`getaddrinfo` 取全部 A/AAAA，任一落私网即拒；**解析失败 fail-closed**；
  60s 结果缓存（高频瓦片请求不逐次解析，条目超 2048 整表清空）；
- 新增 `parse_host_allowlist` / `host_matches_allowlist`：精确 + 子域匹配，空列表=未启用；
- `proxy.py:_is_private_host` 改走共用实现 → 绕过写法全部封堵；`_validate_proxy_target_url` 串起
  「协议 → host 字面量 → 白名单 → DNS 复判」四道（`PROXY_ALLOW_PRIVATE_HOSTS=true` 时整体放行，本地调试不受影响）；
- `download_xyz._validate_tile_template` 补协议白名单 + 共用 host 判定；**无 scheme 与协议相对 URL 按 https 兜底解析**
  （与 `_build_proxy_target_url` 同语义，既有宽松输入不被打断）。

### S2 资源上限

- 通用代理：`Content-Length` 超限直接 413（`_reject_if_content_length_exceeds`）+ 流式累计超限断流
  （`_limited_stream`，无长度声明时兜底，超限记 warning 后停止迭代）；
- 纠偏链路：单瓦片字节上限（拒绝路径不写缓存）、`Image.MAX_IMAGE_PIXELS` 显式收紧为硬上限、
  合成网格瓦片数上限、`MAX_CONCURRENCY` 100→16；
- 路由层 `ValueError` / `DecompressionBombError` 转 **400**（此前一律落 502「纠偏失败」，语义误导）。

### 配置登记（按 §3 顺序：先 catalog + `.env.example`，再写代码）

新增 7 个 L1 key，**默认值即当前安全行为**：`PROXY_ALLOWED_HOSTS`（空=不启用）、`PROXY_DNS_GUARD`(true)、
`PROXY_MAX_RESPONSE_MB`(32)、`GCJRE_TILE_MAX_MB`(8)、`GCJRE_MAX_IMAGE_PIXELS`(16777216)、
`GCJRE_MAX_TILES_PER_REQUEST`(64)、`GCJRE_MAX_CONCURRENCY`(16)。

## 修改原因

规划 P1-4 首条 [P0 安全]，且姊妹项 V3.4.63 已把「判定收敛到单点」列为后续接口。匿名开放代理 + 可绕过的私网过滤
是本仓库当前最高危的未修项（可打本机 admin 接口与容器内网）。

## 影响范围

出站代理三面（瓦片代理/纠偏/底图下载）。**正常公网瓦片源零行为变化**（实测放行）；
新增拒绝仅覆盖内网目标、非 http(s) 协议、超限响应；`PROXY_RATE_LIMIT` 按批准保持 0。

## 解决方案

| 方案 | 说明 | 结论 |
|---|---|---|
| a. 判定提共用模块 + DNS 复判 + 资源上限（选定，S1+S2） | 默认即安全、零破坏，判定单点化后三面同水位 | ✅ |
| b. 强制 host 白名单立即生效 | 最安全但会打断「自定义 XYZ 接入」与瓦片熔断回退 | ✖ 用户选默认空 |
| c. 给通用代理加鉴权 | 分享模式/未登录首屏若依赖代理瓦片会破功 | ✖ 仅登记，需单独实机验证 |
| d. 缓存 TTL/LRU 治理（S3） | 纯运维项，与安全无关 | ✖ 本轮不做，留规划 |

## 性能指标

- DNS 复判：首次解析 ~ms 级（1s 超时），命中 60s 缓存后为字典查找；瓦片高频请求实际开销可忽略；
- 纠偏并发 100→16：单请求耗时可能微增，但正常纠偏网格为 2×2~3×3（≤9 片）不触及并发上限；
- 响应体上限：仅比较计数，无额外拷贝。

## 测试方案

### Agent 已执行（沙盒）

- `py_compile` 6 文件通过；
- **net_guard 单测 36 例全过**：5 类绕过写法（整数/十六进制/八进制/短点分/IPv6）+ 私网各段 + 元数据地址 +
  本机名/内网后缀 + 空 host fail-closed + 正常公网放行 + 白名单精确/子域/后缀欺骗（`notgoogle.com` 正确拒绝）+ 回环判定；
- **V3.4.63 语义回归**：agent 三个别名 `is` 同一函数对象；`_validate_override_base_url` 8 场景断言
  （无 key 拒 / 成对放行 / 三种绕过写法拒 / 私网拒 / 元数据拒 / 公网 http 拒）逐例与修复前一致；
- **proxy 护栏实测**：11 例目标（正常瓦片放行、4 种绕过写法 403、localhost/私网/元数据 403、ftp 400、`[::1]` 403）+
  白名单启用态 3 例 + Content-Length 413 触发；
- **DNS 复判真实解析实测**：`localtest.me`、`127.0.0.1.nip.io`（公网域名 A 记录指向 127.0.0.1）→ 判定不安全 ✅；
  `tile.openstreetmap.org` → 安全 ✅；不存在域名 → fail-closed 拒绝 ✅；
- 纠偏护栏常量与 `_reject_oversized_tile_bytes` 触发/放行各一例；
- download 模板校验 10 例（内网 4 类拒、file:// 拒、无 scheme/协议相对放行）——⚠️ **以等价代码片段验证**：
  沙盒缺 rasterio 无法导入真模块，`py_compile` 通过，逻辑与源码逐行同构；
- 门禁：`CheckConfigRegistry.py` 首轮**抓到** `GCJRE_MAX_CONCURRENCY` 漏登记 → 补登记后 7/7 全绿（catalog 65 key）；
  `CheckStructureTree.py` 390⇄390 零漂移（⚠️ 该门禁仅覆盖 `frontend/src`，`backend-structure.md` 的 `net_guard.py` 登记为手工同步）。

### 待用户实机验证

1. 2D 底图全量切换（含 fallback 走 `/proxy/` 的第三方源）→ 瓦片正常加载，无 403；
2. GCJ-02 纠偏底图（高德/腾讯系）→ 纠偏瓦片正常，缩放拖动无异常；
3. 自定义 XYZ 接入任意公网瓦片源 → 正常（白名单默认空不拦）；
4. 底图下载任务（含高德/天地图模板）→ 建任务成功、GeoTIFF 正常；
5. 3D 底图与 3D Tiles → 无回归；
6. 负向验证：把 `PROXY_ALLOWED_HOSTS` 临时设为某单一 host，确认其他源被 403，验完清空；
7. 容器内网连通性未受影响（后端自身访问 DB/上游 API 不经本护栏，仅代理面受限）。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/utils/net_guard.py` | **新增**：出站 SSRF 判定单点（IP 归一/私网/回环/DNS 复判/白名单） |
| `backend/api/proxy.py` | 私网判定换共用实现；四道校验串联；响应体 413 + 流式断流；纠偏异常转 400 |
| `backend/api/agent_chat/utils.py` | 判定迁出改 import + 同名别名（调用点与语义零变化），去 `ipaddress` 冗余导入 |
| `backend/gcj_rectify/rectify.py` | 瓦片字节上限、`MAX_IMAGE_PIXELS` 硬收紧、网格数上限、并发 100→16（改配置项） |
| `backend/download_xyz/download.py` | 模板校验补协议白名单 + host 私网判定（无 scheme 按 https 兜底） |
| `backend/config/catalog.py` | 新增 7 个 L1 key 登记 |
| `.env.example` | 同步 7 个 key（注释说明默认即安全） |
| `Docs/Guide/backend-structure.md` | 登记 `utils/net_guard.py` |
| `Docs/TODO/proxy-ssrf-hardening-plan.md` | **新增**：本任务 L3 方案文档（含未做项 S3/S4 残留说明） |
| `README.md` / `Docs/Guide/CHANGELOG.md` / `Docs/TODO/bugfix-optimization-plan.md` | 版本三处 / 条目 / P1-4 首条勾选 |

## 遗留与风险

- **本轮未做（已在规划与方案文档标注）**：S3 纠偏磁盘缓存 TTL/LRU 治理；S4 的白名单强制生效与
  `PROXY_RATE_LIMIT` 默认值调整（用户明示保持 0）；通用代理**仍匿名可用**（加鉴权会破分享模式，需单独一轮实机验证）；
- **DNS rebinding 无法完全消除**：判定与实际请求之间存在极小时间窗（业界通例，需 socket 层定制解析才能根治）；
- `_limited_stream` 超限时响应头已发出，只能截断而非改状态码 → 客户端表现为不完整响应（"宁断不放大"取舍，有 warning 日志）；
- **顺带发现（未改，按 §2.5 登记）**：`/tiles/ships66/**` 专用海图代理硬编码 http 上游且不过 `_validate_proxy_target_url`
  （目标固定、无用户输入，非 SSRF 面，但明文 http 可被链路篡改，建议后续评估是否切 https）；
  `download_xyz` 的 `{s}` 子域轮换在校验时替换为固定 `a`，若某模板 `{s}` 位于 host 且轮换值指向不同域名，
  实际抓取域可与校验域不同（现有底图源均为同域轮换，非当前风险，已记备查）。
