# 2026-08-24 GeoServer 并入全栈镜像（HF Space 探索部署）

**日期与时间**：2026-08-24 14:30
**任务等级**：L2（方案经用户当场裁定：同容器部署、仅求可用、后续按需迭代）

---

## 问题分析

- **核心症状**：deploy/Dockerfile 初版采用「构建期 curl 下载 GeoServer bin.zip」方案，本地与 HF CI 双双构建失败。
- **根本原因**：`download.geoserver.org` 在两类构建环境均 DNS 解析失败（`curl: (6)`）；SourceForge 兜底链可下载但内容物不可靠（解压后无预期目录，mv 失败）。属外部资源不可达/不可信问题，非脚本逻辑缺陷。
- **受影响模块**：`deploy/Dockerfile`（唯一功能改动）、`deploy/nginx.conf`（路由新增）。
- **候选方案对比**：
  - ① 多源 zip 回退下载——已实测三源两环境仍不稳定 ❌
  - ② 多阶段 `COPY --from` 直接取用 OSGeo 官方 Docker 镜像内容物 ✅ **选定**
  - ③ Maven Central war + 自装 Tomcat——war 资产形态待验证，复杂度高 ❌
- **选定理由**：镜像层拉取走 registry 协议（可续传、digest 可靠），DNS 表现稳定；JRE/Tomcat/GeoServer 版本组合为厂商原装，零拼装风险。

## 修改内容

1. 新增构建阶段 `FROM docker.osgeo.org/geoserver:2.26.2 AS geoserver-dist`（仅作文件来源）。
2. 运行时阶段 `COPY --from` 拷入 `/usr/local/tomcat → /opt/geoserver-tomcat` 与 `/opt/java`（OpenJDK 17.0.13，厂商验证组合）；删除 ROOT/docs/examples/manager 等冗余 webapp。
3. apt 移除 JRE 包需求（改用拷贝的 /opt/java）；保留 unzip（其他环节通用工具）。
4. `/opt/start.sh` 增加第三服务：catalina.sh run 后台启动，`-DGEOSERVER_DATA_DIR=/opt/geoserver/data_dir`，堆内存 256m~1g，日志落 `/tmp/geoserver.log`。
5. `deploy/nginx.conf` 新增：`location = /geoserver` 301 → `/geoserver/web/`；`location ^~ /geoserver/` 反代 `127.0.0.1:8080`。

## 修改原因

用户需要在 HF 部署环境直接探索 GeoServer 能力（OGC 服务发布/样式体系），要求并入现有全栈单容器、nginx 统一分流、最小可用优先。

## 影响范围

- 部署：全栈镜像体积 +~700MB（Tomcat+webapp+JRE）；启动后常驻一个 JVM（堆上限 1g，16GB 配额充裕）
- HF Space：数据目录 ephemeral（Space 重启后 GeoServer 内发布的配置还原）——已知限制，用户知情并接受
- 原有前端/FastAPI/nginx 行为零变化

## 解决方案

见上。关键核验：geoserver-dist 镜像布局实测（tomcat 位于 /usr/local/tomcat、JRE 位于 /opt/java/openjdk、Connector 8080）；GeoServer 2.26 官方兼容 OpenJDK 17。

## 性能指标

未实测。镜像构建时长本地约 +60s（COPY 层），运行期 JVM 空载 RSS 约 300MB。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| 本地 `docker build` 全量通过（含 COPY --from 跨 registry 拉取）；临时容器实测：`GET :7860/health` → 200；`GET :7860/geoserver/web/` → 302（跳登录）；`:7862/geoserver/ows?service=WMS&request=GetCapabilities` → 200；容器内 java/nginx/uvicorn 三进程并存确认 | ① push 后 HF Space 构建成功且 `/health` healthy；② 打开 `https://<space>.hf.space/geoserver/web/` 用 admin/geoserver 登录；③ Layer Preview 打开 topp:states 示例图；④ 原有地图前端功能回归正常 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `deploy/Dockerfile` | 新增 geoserver-dist 阶段、Tomcat/JRE 拷贝、启动脚本第三服务 |
| `deploy/nginx.conf` | 新增 /geoserver 分流段 |
| `README.md` | 版本号三处同步 V3.5.30 → V3.5.31 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.31 条目 |
| 本日志 | L2 记录 |

## 遗留与风险

- GeoServer 数据目录不持久（Space 重建即重置）→ 探索期接受；正式启用时按「PostGIS 数据 + COG 入 bucket + data_dir 瘦身进 git」架构改造
- JVM 与 uvicorn 共享 2 核 CPU，高并发 WMS 出图会挤压后端响应延迟
- keepalive cron 不覆盖 GeoServer（其休眠由 Space 级机制管理）

---

## 补丁批次（同日 V3.5.31 内）：登录"不安全提交"拦截修复

- **症状**：HF 上打开登录页提交表单，Chrome 报"The information you're about to submit is not secure"并拦截。
- **根因**：①GeoServer 全新数据目录的 Proxy Base URL 出厂默认硬编码 `https://localhost/geoserver`，覆盖请求探测；②Tomcat 不感知外部 TLS 终结，请求 scheme 判定为 http。
- **修复**：server.xml 注入 RemoteIpValve（信任 X-Forwarded-Proto）；预置 `data_dir/global.xml` 将 proxyBase 置空 → GeoServer 按真实访问域自动生成地址（实测 GetCapabilities 输出 `https://negiao-webgis.hf.space/...`；本地部署自动回落 localhost，无需写死域名）。
- **附带**：nginx 新增安全响应头（nosniff/SAMEORIGIN/Referrer-Policy；server 级 + 受 add_header 继承规则影响的 tiles/geoserver 段各自补齐）；geoserver 段 X-Forwarded-Proto 显式置 https 并补 X-Forwarded-Port 443。
- **验证**：本地构建通过；容器实测带 `Host: negiao-webgis.hf.space + XFP:https` 的 GetCapabilities 输出正确公网 https 地址；/health 200、登录页 302。
