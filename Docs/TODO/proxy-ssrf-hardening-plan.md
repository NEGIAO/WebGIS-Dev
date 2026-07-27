# 代理 SSRF 加固方案（规划 P1-4 [P0 安全]，L3 · S1/S2 已实施）

> 起草：2026-07-27 会话 ｜ 状态：**S1+S2 已实施 V3.4.65**（共用 `backend/utils/net_guard.py`、通用代理响应上限、GCJ 纠偏瓦片/像素/网格上限、download_xyz 模板 host 校验）；S3 缓存治理与 S4 鉴权/限流姿态仍按下方决策项单独评估。
> 承接：`Docs/TODO/bugfix-optimization-plan.md` P1-4 第 1 条；姊妹项「agent override Key 外泄」已于 V3.4.63 完成，
> 其 `_coerce_ip_literal` / `_is_disallowed_override_host` 判定可直接复用（避免两处各写一套，V3.4.63 日志已留此接口）。

---

## 一、攻击面实况（逐行读码确认，非推测）

### A. `/proxy/{target_url:path}` 通用流式代理（`backend/api/proxy.py:312`）

| 项 | 实况 | 风险 |
|---|---|---|
| 鉴权 | **无任何 Depends 鉴权**（仅 `_rate_limit_check`） | 匿名开放代理，任何人可借服务器出网 |
| 私网过滤 | `_is_private_host` 直接 `ipaddress.ip_address(hostname)`，非点分十进制解析失败即 `return False` **放行** | `2130706433`、`0x7f000001`、`127.1`、`0177.0.0.1` 全部绕过 → 打本机与内网（HF Space 内网、元数据端点类目标） |
| DNS | 不解析 | 攻击者把自有域名 A 记录指向内网/`169.254.169.254` 即绕过 |
| 限流 | `PROXY_RATE_LIMIT` 默认 **0 = 不限流** | 可被当免费流量中继/放大器 |
| 响应体上限 | 无 | 代理任意大文件耗尽带宽（流式转发，内存压力有限） |
| 重定向 | `follow_redirects=False`，30x 原样回吐 Location | ✅ 重定向型 SSRF 不成立（已核实，非缺口） |

### B. `/proxy/gcj2wgs/**`、`/proxy/wgs2gcj/**` 纠偏代理（`proxy.py:259/285`）

同 A 的 host 校验缺口（共用 `_build_proxy_target_url`），额外：

- **Pillow 解压炸弹**：`rectify.py:216` 对上游字节直接 `Image.open`，全程无 `Image.MAX_IMAGE_PIXELS` 收紧、无字节数上限——
  上游返回恶意 PNG 即可放大到 GB 级内存（Pillow 默认 178M 像素告警阈值仅 warning 不拦截）；
- **合成网格无界**：`_fetch_tile_grid` 并发 100（`MAX_CONCURRENCY`，注释自述"实际不限制"），
  合成图 `(x_max-x_min+1)*256 × (y_max-y_min+1)*256` 由请求间接决定；
- **磁盘缓存无界**：`get_cache_dir()` 只建目录，**无 LRU/TTL/容量上限**，纠偏瓦片持续落盘（HF Space 磁盘配额风险）。

### C. `download_xyz` 建任务（`backend/download_xyz/download.py:115`）

- 鉴权 ✅ `Depends(require_api_access)`（已登录才可用，风险等级低于 A/B）；
- `_validate_tile_template`（:379）**只校验非空 + `{z}/{x}/{y}` 占位符齐全**，无 scheme/host 校验
  → 已登录用户可让服务器抓取任意内网 URL 并把响应写进 GeoTIFF 下载回来（信息回传型 SSRF）。

### D. 前端实际用法（决定加固强度的关键约束）

`publicRuntime.ts:57/65` 与 `tileLifecycle.ts:121` 表明：`/proxy/{host+path}` 是**任意第三方瓦片源**的
CORS/可达性兜底通道（fallback 模式），`useCesiumLayers.js:327` 还硬编码走 `mt{s}.google.com`。
→ **严格 host 白名单会直接打断「自定义 XYZ 接入」与瓦片熔断回退**，这是必须由用户拍板的取舍点。

---

## 二、加固方案（分四项，可独立取舍）

### S1 host 判定统一升级（**无行为变化，建议必做**）

- 把 agent 侧已验证的 `_coerce_ip_literal`（inet_aton 语义归一：整数/十六进制/八进制/短点分）提为共用工具
  （新建 `backend/api/_net_guard.py` 或 `backend/config/net_guard.py`，agent 侧改 import 复用，**判定逻辑零改动**）；
- `proxy.py:_is_private_host` 改走共用实现 → 堵死 `2130706433` 等字面量绕过；
- **DNS 解析后复判**：`getaddrinfo(host)` 取全部 A/AAAA，任一落私网/回环/链路本地即拒
  （堵 D 类域名指向内网；带 1s 超时 + 解析失败 fail-closed 拒绝）。
- 风险：正常公网瓦片源不受影响；解析引入 ~ms 级开销（可加 60s 结果缓存）。

### S2 响应与解码上限（**无行为变化，建议必做**）

- 通用代理：`Content-Length` 超上限直接 413；流式转发累计字节超上限即断流
  （新 key `PROXY_MAX_RESPONSE_MB`，默认 32——瓦片/小资源足够）；
- 纠偏链路：单瓦片字节上限（默认 8MB）+ `Image.MAX_IMAGE_PIXELS` 显式收紧（默认 4096×4096=16.7M）
  + 合成网格瓦片数上限（默认 64 = 8×8），超限 400；
- `MAX_CONCURRENCY` 100 → 16（顺带项，防单请求打爆上游与本机 fd）。

### S3 缓存治理（纠偏磁盘缓存）

- 启动时 + 每 6h 后台任务：按 mtime 清理超 `GCJRE_CACHE_TTL_HOURS`（默认 168=7 天）的瓦片文件，
  并在总量超 `GCJRE_CACHE_MAX_MB`（默认 512）时按 LRU 淘汰至 80% 水位；
- 纯运维项，无接口行为变化。

### S4 host 白名单与鉴权姿态（**需用户决策，见第三节**）

- 白名单：新 key `PROXY_ALLOWED_HOSTS`（逗号分隔，支持 `*.example.com`）；**空值=不限制**（沿用 agent 侧
  V3.4.63 已批准的"默认关"范式，零破坏），非空则仅白名单可代理；
- `download_xyz` 模板校验补 scheme（仅 http/https）+ 走 S1 host 判定 + 同一白名单（**此处建议白名单恒生效**，
  因该功能只用于已知底图源，破坏面小于通用代理）；
- 限流默认值：`PROXY_RATE_LIMIT` 0 → 建议 600/分钟/IP（瓦片突发友好，仍挡中继滥用）；
- 匿名开放问题：可选加 `require_api_access_or_guest`——但分享模式/未登录首屏若依赖代理瓦片会破功，
  **默认不改鉴权**，仅登记；如需收紧建议单独一轮实机验证。

---

## 三、需用户拍板的三点

1. **白名单姿态**：通用代理白名单默认空（不限制、零破坏）还是预置常见瓦片源清单后即刻生效（更安全、有破坏风险）？
2. **限流默认值**：`PROXY_RATE_LIMIT` 是否由 0 改为 600/min/IP（行为变化，可能影响高缩放级瓦片突发）？
3. **本轮范围**：S1+S2（默认即安全、零行为变化）先落，S3/S4 后续；还是 S1–S4 一次做完？

---

## 四、配置 key 清单（按 §3「登记前置」顺序：先 catalog + .env.example，再写代码）

| key | 层 | 默认 | 说明 |
|---|---|---|---|
| `PROXY_MAX_RESPONSE_MB` | L1 | 32 | 通用代理响应体上限（MB），超限 413 |
| `PROXY_ALLOWED_HOSTS` | L1 | 空 | 代理 host 白名单（逗号分隔，支持 `*.` 前缀）；空=不限制 |
| `PROXY_DNS_GUARD` | L1 | true | 是否对 host 做 DNS 解析后私网复判 |
| `GCJRE_TILE_MAX_MB` | L1 | 8 | 纠偏单瓦片字节上限 |
| `GCJRE_MAX_TILES_PER_REQUEST` | L1 | 64 | 纠偏单请求合成瓦片数上限 |
| `GCJRE_CACHE_TTL_HOURS` | L1 | 168 | 纠偏缓存保留时长 |
| `GCJRE_CACHE_MAX_MB` | L1 | 512 | 纠偏缓存总量上限（超限 LRU 淘汰） |
| `PROXY_RATE_LIMIT` | L1 | 0→? | 现存 key，默认值是否改动待决策 |

## 五、验收与回滚

- 单测（沙盒可跑）：`_coerce_ip_literal` 绕过写法 12 例全拒、白名单通配匹配、大小上限触发 413、
  像素上限拒绝、网格数超限 400、缓存 LRU 淘汰水位、agent 侧复用后行为逐例等价（回归 V3.4.63 的 23 例）；
- 门禁：`CheckConfigRegistry.py`（新 key 登记）+ `CheckStructureTree.py`（若新建 `_net_guard.py` 需登记结构树）；
- 实机（用户）：2D/3D 底图全量加载（含 fallback 代理路径）、GCJ 纠偏底图、自定义 XYZ 接入、底图下载任务；
- 回滚：所有新 key 默认值即当前行为等价（除 S4 若批准改限流默认值），单 key 置回即回滚。
