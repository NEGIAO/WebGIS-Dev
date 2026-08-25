# 2026-08-24 GeoServer 反代链路加固：Nginx HTTPS 协议转发 + 安全头 + Proxy Base URL 启动自动注入

**日期与时间**：2026-08-24 15:05
**任务等级**：L2（用户明确指示：Nginx 强制 HTTPS 协议转发并补安全头；GeoServer Proxy Base URL 设为公开 HTTPS 地址）

---

## 问题分析

### 事件逻辑链条

- **核心症状**：经 HF Space（TLS 边缘终结）反代访问 `https://negiao-webgis.hf.space/geoserver/web/` 时，GeoServer 内部生成的重定向、登录表单 action、GetCapabilities 文档中的在线资源 URL 可能回落为 `http://` 协议（或错误端口），导致登录跳转失败、WMS/WFS 客户端拿到错误的 capabilities 地址。
- **根本原因**（四点叠加）：
  1. `deploy/nginx.conf` 的 `/geoserver/` 段使用 `X-Forwarded-Proto $scheme` —— HF 在边缘终结 TLS，容器内 nginx 收到的是明文 HTTP，`$scheme` 恒为 `http`，等于把错误协议告知上游；
  2. 未传递 `X-Forwarded-Host` / `X-Forwarded-Port`，上游无法还原对外主机与端口；
  3. `/geoserver/` location 此前无任何 `add_header`，一旦新增即触发 nginx 继承规则——server 级三条安全头在该 location 内整体失效，必须显式补齐；
  4. GeoServer 的 Proxy Base URL 为默认值（未设置）；且数据目录 ephemeral，即使后台手工修改，Space 重启后也会还原，必须在启动脚本中自动化注入。
- **受影响模块**：`deploy/nginx.conf`、`deploy/Dockerfile`（start.sh）、文档同步（根 README / CHANGELOG / project-structure / backend README）。

### 关于「Nginx 层强制 HTTPS 跳转」的方案裁定

容器内 nginx 只接收两类流量：① HF 边缘代理转发（外部已是 HTTPS，无需再跳）；② 容器内部健康检查与本地 compose 调试（`curl http://127.0.0.1:7860/health`、本地 http 访问）。若在 nginx 做 301 → https 会直接打挂 HEALTHCHECK 与本地调试。故「强制 HTTPS」以**语义强制**落地：`X-Forwarded-Proto` 按「上游真实头优先、缺失回落 `$scheme`」归一化后转发 + Proxy Base URL 固化为 `https://negiao-webgis.hf.space/geoserver`，效果等同且不破坏现有链路。

## 修改内容

1. **nginx.conf**：
   - http 块新增 `map $http_x_forwarded_proto → $forwarded_proto`、`map $http_x_forwarded_port → $forwarded_port`（有头采信上游，无头回落本机值，兼容 HF 生产与本地调试双场景）；
   - `/geoserver/` 段改传 `$forwarded_proto/$forwarded_port`，补 `X-Forwarded-Host $host`；
   - `/geoserver/` 段显式补齐三条安全响应头（nosniff / SAMEORIGIN / Referrer-Policy），对冲 add_header 继承失效。
2. **deploy/Dockerfile（start.sh）**：新增后台子壳——就绪探测（轮询 `/geoserver/rest/about/version.json`，最长 ~150s）通过后，经 GeoServer REST API `PUT /rest/settings` 写入 `proxyBaseUrl = https://negiao-webgis.hf.space/geoserver`；支持 `GEOSERVER_PUBLIC_URL` / `GEOSERVER_ADMIN_USER` / `GEOSERVER_ADMIN_PASSWORD` 环境变量覆盖，置空 URL 则跳过；失败仅记日志不阻塞主服务。
3. **文档同步**：根 README 版本表（V3.5.32 入表、保留最近三条）；CHANGELOG 补 V3.5.32 条目并**补录遗漏的 V3.5.31 条目**（上任务日志声称已追加但文件中不存在）；project-structure.md 注释对齐；backend README 部署说明补 GeoServer 分流一句。

## 修改原因

用户在实机验证 `https://negiao-webgis.hf.space/geoserver/web/` 时关注反代协议正确性与安全头合规；GeoServer 生成的绝对 URL 必须与对外 HTTPS 地址一致，否则管理界面与 OGC capabilities 输出自相矛盾。

## 影响范围

- 仅部署层：nginx `/geoserver/` 段与 start.sh 追加段；前端、FastAPI 后端、瓦片缓存链路行为零变化；
- `/api/ /monitor/` 等其余透传段维持 `$scheme` 不变（FastAPI 无绝对 URL 回写需求，避免无关波动）；
- GeoServer 数据目录 ephemeral 特性下，Proxy Base URL 由「每次启动自动重写」保证最终一致。

## 性能指标

启动期增加一次就绪轮询（后台执行，不阻塞 uvicorn 主进程）；运行期零额外开销（map 匹配为 O(1)）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| `nginx -t` 配置语法校验（docker nginx:1.27-alpine 挂载校验）；start.sh 片段 shell 语法核对 | ① push 后 Space 构建成功、`/health` healthy；② 打开 `/geoserver/web/` 登录后进入 全局设置，确认 Proxy Base URL 已显示为 `https://negiao-webgis.hf.space/geoserver`；③ 浏览器 DevTools 确认 `/geoserver/` 响应含三条安全头；④ WMS GetCapabilities 中在线资源 URL 为 https |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `d:\Dev\GitHub\WebGIS-Dev\deploy\nginx.conf` | forwarded 头 map + /geoserver/ 段协议头与安全头 |
| `d:\Dev\GitHub\WebGIS-Dev\deploy\Dockerfile` | start.sh 新增 Proxy Base URL 启动自动注入 |
| `d:\Dev\GitHub\WebGIS-Dev\README.md` | 版本表 V3.5.32 |
| `d:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md` | 补 V3.5.31（漏录）+ V3.5.32 条目 |
| `d:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md` | deploy 注释对齐 |
| `d:\Dev\GitHub\WebGIS-Dev\backend\README.md` | 部署说明补 GeoServer 反代说明 |
| 本日志 | L2 记录 |

## 遗留与风险

- 若后续修改 GeoServer admin 密码，需同步配置 `GEOSERVER_ADMIN_PASSWORD` 环境变量（HF Secrets），否则启动注入会因 401 失败（不影响其余服务）；
- 前端 README 本次无受影响内容（无前端文件增删改，其结构树不变），按最小扰动原则不动。
