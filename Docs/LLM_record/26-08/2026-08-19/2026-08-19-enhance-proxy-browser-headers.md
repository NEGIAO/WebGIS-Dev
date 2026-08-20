# V3.5.24 瓦片代理三接口出站请求头泛化（浏览器特征对齐 + 天地图企业域名防盗链）

## 日期与时间

2026-08-19（承接当日 V3.5.27/V3.5.28 会话；二者已按用户指示并入 V3.5.23 综合版本并
提交 `f994b81d`，本次按当前基线 V3.5.23 顺延为 V3.5.24）

## 任务等级

L2

## 问题分析

**核心症状**：用户提供浏览器真实请求头（Chrome/151，含 `sec-ch-ua`、`Sec-Fetch-*`、
`Accept: */*`、`Accept-Encoding: gzip, deflate, br, zstd` 等完整特征），并要求把
`/proxy`、`/proxy/wgs2gcj`、`/proxy/gcj2wgs` 三个代理做成**通用的、泛型能力的接口**，
提高对任意瓦片源的普适性（反爬源按「非浏览器特征」拦截，如天地图 418）。

**根本原因**（对照代码逐一核实）：

1. **`/proxy/{url}` 通用代理**（`backend/api/proxy.py:359` `_build_proxy_request_headers`）：
   默认头只有 UA + Accept(image/png) + Accept-Language + Accept-Encoding(gzip,deflate,br)，
   **缺 `sec-ch-ua`、`Sec-Fetch-*` 等 Client Hints**；UA 固定为配置值不随客户端变化。
2. **`/proxy/wgs2gcj` 与 `/proxy/gcj2wgs` 纠偏代理**（`backend/gcj_rectify/fetch.py:92`）：
   出站头**最薄**——仅 httpx 默认 `python-httpx/x.y.z` UA（共享 client 无默认头时）+
   白名单 Referer；无 Accept / Accept-Language / Client Hints。反爬源最先拦的就是这种。
3. **防盗链白名单**（`backend/utils/http_headers.py` `REFERER_BY_DOMAIN`）：仅有
   `tianditu.gov.cn`；用户日志中的天地图企业域名 `omap.map-world.com.cn`
   **不在白名单**，目前靠透传浏览器 Referer 才侥幸 200。

**受影响模块**：通用代理 / 纠偏代理出站链路、共享请求头模块（三出站面共用）。

## 修改内容

1. **`backend/utils/http_headers.py`（泛化核心）**：
   - 新增 `SEC_CH_UA`（与 `BROWSER_USER_AGENT` 的 Chrome/126 版本号严格一致，
     反爬服务会交叉校验 UA 与 sec-ch-ua 版本号，不一致反而暴露非浏览器特征）；
   - 新增 `DEFAULT_BROWSER_HEADERS`：完整浏览器特征集（`Accept: */*`、
     `Accept-Encoding: gzip, deflate, br, zstd`、`sec-ch-ua*`、`Sec-Fetch-*` 等 10 项）；
   - 新增 `build_browser_headers()`（含 br/zstd，仅流式转发面用）与
     `build_browser_headers_no_br()`（供需 httpx 解压响应体的面用——backend 未安装
     brotli/zstandard 解码库，广告 br/zstd 且上游真以该编码响应时 httpx 抛
     DecodingError，瓦片拉取必失败）；
   - `REFERER_BY_DOMAIN` 新增 `map-world.com.cn`（天地图企业/移动域名，
     `omap.map-world.com.cn` 等子域全覆盖，子串匹配），Referer 值同官方站点。
2. **`backend/api/proxy.py`**：
   - `PROXY_DEFAULT_REQUEST_HEADERS` 改为 `build_browser_headers()`，`PROXY_USER_AGENT`
     保留为 UA 可配置覆盖项（catalog 登记不变）；
   - `_build_proxy_request_headers` 透传集合扩展：`Accept / Accept-Language /
     Accept-Encoding / Origin / Range / Sec-Fetch-* / sec-ch-ua*` 客户端带了即透传
     （浏览器客户端 = 最真实特征）；**UA 仅当 `Mozilla/` 前缀（浏览器）时透传**，
     curl/脚本等非浏览器客户端强制用默认浏览器 UA，防止暴露脚本特征；
   - 白名单 Referer 逻辑不变（命中附加固定值，未命中透传客户端 Referer）。
3. **`backend/gcj_rectify/fetch.py`**：`fetch_tile` 每次请求显式合并
   `build_browser_headers_no_br()` + 白名单 Referer，补齐浏览器特征
   （UA/Accept/Accept-Language/sec-ch-ua/Sec-Fetch-*），共享 client 路径不再裸奔。

## 修改原因

用户目标是把代理做成通用泛型接口：任何客户端形态（浏览器 / 脚本 / 其他后端）经三个
代理访问任意瓦片源，出站请求都呈现完整浏览器特征，最大化通过反爬校验的普适性；
同时修复天地图企业域名防盗链 Referer 缺口与纠偏代理「无浏览器特征」隐患。

## 影响范围

- 出站面：`/proxy`、`/proxy/wgs2gcj`、`/proxy/gcj2wgs`（请求头构造逻辑）。
- 共享模块 `utils/http_headers.py`（三出站面共用，download_xyz 面本次未动，见遗留）。
- 无新增配置 key（`PROXY_USER_AGENT` 语义不变），无路由/响应侧改动。

## 解决方案

方案对比：

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 固定浏览器特征头（含 br/zstd）给所有面 | 简单，但纠偏/下载面 httpx 无解码库，br/zstd 响应必炸 DecodingError | 不采用 |
| B. 分面头集 + 客户端透传 + UA 浏览器守卫（采用） | 流式面广告 br/zstd；解码面降级 gzip/deflate；浏览器客户端透传真实头（含 UA），非浏览器强制浏览器 UA；sec-ch-ua 与 UA 版本一致 | 泛化 + 安全 + 兼容 |
| C. 全量透传客户端所有头 | 脚本 UA / 自造头直接暴露给上游，反爬收益反而下降 | 不采用 |

选型理由：B 方案的「透传真实浏览器头 + 非浏览器兜底浏览器特征」组合，使接口对
任意调用方形态都呈现浏览器行为，是通用代理的正确形态；br/zstd 按面分离规避
解码缺陷，属必要技术约束而非妥协。

## 性能指标

未实测（请求头构造为常量级操作，无数据链路变更）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `python -m py_compile` 三文件语法通过 | 浏览器访问底图/纠偏瓦片，后端日志确认出站请求携带浏览器真实 UA + sec-ch-ua + Sec-Fetch-*（可用 DEBUG 日志或上游访问日志核对） |
| `python -m pytest tests/` 34 passed, 3 subtests passed | 天地图企业源（`omap.map-world.com.cn`）出站 Referer 应为 `https://www.tianditu.gov.cn/` |
| 实机调用 `build_browser_headers` / `build_browser_headers_no_br` / `referer_headers_for` 输出核对（见上文实测输出） | curl 直接打 `/proxy/...`：上游收到浏览器 UA 而非 curl 特征；地图页瓦片加载正常 |
| `CheckConfigRegistry.py` ✅ / `CheckStructureTree.py` ✅ | wgs2gcj/gcj2wgs 纠偏链路在地图页正常出图（上游不再因缺浏览器特征拒绝） |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/utils/http_headers.py` | 泛化核心：SEC_CH_UA / DEFAULT_BROWSER_HEADERS / build_browser_headers(_no_br) / REFERER_BY_DOMAIN 增加 map-world.com.cn |
| `backend/api/proxy.py` | 默认头换浏览器特征集；透传清单扩展（Accept-Encoding/Sec-Fetch-*/sec-ch-ua*）；UA 仅浏览器透传（Mozilla/ 守卫） |
| `backend/gcj_rectify/fetch.py` | fetch_tile 显式合并浏览器特征头（no_br 版）+ 白名单 Referer |

## 遗留与风险

- **download_xyz 面已随零散修补完成**（见文末「零散修补」小节）：出站头已与本次
  泛化对齐（浏览器特征集 + 白名单 Referer），不再存在 418 隐患缺口。
- 风险提示：伪造的 Mozilla UA + 默认 sec-ch-ua 版本组合仅出现在「伪浏览器脚本」场景，
  属边缘情况，不构成实际风险（真浏览器 UA 与 sec-ch-ua 必然同版本同源透传）。
- `REFERER_BY_DOMAIN` 为子串匹配，`map-world.com.cn` 会覆盖其全部子域；若未来该
  域名体系出现非天地图服务需拆分精确匹配（届时改白名单为 host 精确比对即可）。

## 零散修补（L1，2026-08-19）

- **download_xyz 出站头套用浏览器特征集**（TODO 销项）：`download_xyz/tile_engine.py`
  `_fetch_tile_bytes` 由「仅 UA + 白名单 Referer」改为显式合并
  `build_browser_headers_no_br()` + 白名单 Referer，与 `api.proxy` / `gcj_rectify`
  三出站面完全对齐；py_compile + 全量 pytest（34 passed）通过。无需独立版本号。

## 下一步建议

- 用户实机验证三个代理出站头与瓦片加载正常后 git 提交（V3.5.27/28/29 可一并）。
- 若 download_xyz 出现反爬拦截，按 TODO 登记项套用同一浏览器特征头集（L1 级）。