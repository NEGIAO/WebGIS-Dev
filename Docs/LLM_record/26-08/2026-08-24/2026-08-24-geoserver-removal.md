# 2026-08-24 GeoServer 探索部署整体移除

**日期与时间**：2026-08-24 16:40
**任务等级**：L2

---

## 问题分析

- **核心症状**：GeoServer 探索部署（V3.5.31~33 累计三层迭代）经实际试用后判定不符合当前需求，用户要求从部署文件中整体移除。
- **根本原因**：产品决策变更——现有 FastAPI + OL 直连架构已覆盖数据服务需求，GeoServer 的 OGC 服务能力无近期消费场景，且带来镜像 +700MB、JVM 常驻内存、数据持久化（HF ephemeral）三重运维负担。
- **受影响模块**：`deploy/Dockerfile`、`deploy/nginx.conf`；本地 Docker 环境。
- **候选方案对比**：
  - ① 保留但禁用启动——残留死代码与镜像体积，违背"只出不进"精神 ❌
  - ② 整体移除，git 历史可随时回溯 ✅ **选定**
- **选定理由**：探索结论已沉淀于日志与 CHANGELOG，代码回滚成本低（`git revert` 或按本日志反向操作）。

## 修改内容

1. `deploy/Dockerfile`：
   - 删除阶段一·B（geoserver-dist 多阶段源）
   - apt 移除 unzip / libfreetype6 / fontconfig / fonts-dejavu-core（均为 GeoServer/JRE 配套）
   - 删除第 6 节 Tomcat/OpenJDK 拷贝、RemoteIpValve 注入
   - start.sh 删除 GeoServer 后台启动与 Proxy Base URL REST 注入两个子壳
   - 头部拓扑注释同步还原为双服务形态
2. `deploy/nginx.conf`：
   - 删除 `/geoserver` 301 与 `location ^~ /geoserver/` 段
   - 删除仅为该段服务的 X-Forwarded-* map 归一化块（api/proxy/tiles 段使用 $scheme 不受影响）
   - 清理重复注释行
3. 保留项（非 GeoServer 专属，属通用加固）：server 级三条安全响应头及 tiles 段重复声明。

## 修改原因

试用期结论：功能冗余、运维成本高于收益。详见 V3.5.31~33 三份日志的探索过程。

## 影响范围

- HF Space：下次构建后恢复双服务形态（镜像瘦身 ~700MB、内存减去 JVM 常驻）
- 线上已发布到 GeoServer 的实验图层随移除而失效（数据本就 ephemeral，无资产损失）
- 本地 Docker：探索用容器/镜像/挂载目录清理（宿主机 `Desktop/测试数据` 原样保留）

## 解决方案

见上。回归验证确保移除后主链路无损。

## 性能指标

未实测（构建时长预计 -60s，运行期常驻内存 -300MB+ 为结构性收益）。

## 测试方案

| Agent 已执行 | 待用户实机验证 |
|---|---|
| nginx:1.27-alpine `nginx -t` 通过；本地全量 `docker build` 通过；临时容器实测 /health 200、首页 200、/geoserver/* 正确回落 SPA 回退（200 HTML）、容器内 /opt 仅余 start.sh | push 后 HF 构建成功、/health healthy、前端与属性表等既有功能回归正常 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `deploy/Dockerfile` | 移除 GeoServer 全部构建/运行逻辑 |
| `deploy/nginx.conf` | 移除 /geoserver 分流段与 map 归一化块 |
| `README.md` | 版本号三处同步 V3.5.33 → V3.5.34 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.34 条目 |
| 本日志 | L2 记录 |

## 遗留与风险

- 无。若未来重新需要 GeoServer，参考 V3.5.31~33 日志可快速重建（推荐届时直接采用 PostGIS+COG 外部化形态）
