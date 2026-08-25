# 2026-08-24 GeoServer 状态页 NPE 修复：废除手写预置 global.xml

**日期和时间**：2026-08-24 15:40

## 问题分析

- **核心症状**：GeoServer Web 管理界面「服务器状态」页（StatusPage）渲染抛出 `WicketRuntimeException`，根因为 `NullPointerException: Cannot invoke "org.geoserver.config.JAIInfo.getJAI()" because "jaiInfo" is null`（StatusPanel.updateModel）。
- **根本原因**：deploy/Dockerfile 此前在构建期向 data_dir 预置了极简 `global.xml`（仅含 `<proxyBase>`）。GeoServer 启动发现该文件存在即直接加载，**不再生成默认配置**。而 XStream 反序列化走 Unsafe 实例化（绕过构造器与字段初始化器），XML 缺失的节点在内存中即为 `null`；`GeoServerInfoImpl.readResolve()` 只回填 `settings`、不回填 `jai`/`coverageAccess`（已核对 2.26.2 源码），故 `JAIInfo` 保持 null → 状态页渲染必崩。
- **受影响模块**：仅 GeoServer Web UI 状态页（及其依赖 JAI/CoverageAccess 配置的面板）；OWS 服务与其余管理页不受影响。

## 修改内容

- deploy/Dockerfile：删除预置 `global.xml` 的 `printf` 行，让 GeoServer 首启自生成完整默认配置；原位置补警示注释禁止未来再手写预置。
- deploy/Dockerfile（start.sh）：Proxy Base 注入由「直接 PUT 部分 payload」重写为「GET 完整 `/rest/settings.xml` → sed 替换/插入 `<proxyBaseUrl>` → PUT 整体回传」。原因：直接 PUT 部分 payload 会因配置对象图缺失被 GeoServer 拒绝（实测 500）；整体回传可保留完整对象图并触发全量持久化。
- deploy/Dockerfile（apt，同日补充）：运行时依赖补 `libfreetype6` + `fontconfig` + `fonts-dejavu-core`。原因：global.xml 修复后状态页继续走到字体枚举（StatusPanel.initUI → getAllFonts），首次加载 `libfontmanager.so` 时因 slim 基础镜像缺系统 libfreetype 抛 `UnsatisfiedLinkError`（Linux 版 JDK 动态链接系统 freetype，不像 Windows 版自带）；fontconfig 与基础字体系同时保障 headless 出图与 SLD 标注。不引入此前刻意规避的 Mesa/libgl1。
- Proxy Base 链路不变：`proxyBaseUrl` 默认 null 时按请求探测生成地址（RemoteIpValve + nginx X-Forwarded-* 归一化保证 https 正确），REST 注入每次启动仍兜底写入公网地址。

## 影响范围

deploy/Dockerfile 单文件；nginx/FastAPI/前端零变化。镜像需重新构建生效（数据目录 ephemeral，无需迁移）。

## 测试方案

1. 本地重建镜像：`docker compose -f deploy/docker-compose.yml up -d --build`。
2. 访问 `/geoserver/web/` 登录后打开「服务器状态」页 → 应正常渲染（不再报 Oops 错误）。
3. 进容器检查 `/opt/geoserver/data_dir/global.xml` 应包含完整 `<jai>`、`<coverageAccess>`、`<settings>` 节点。
4. 状态页「JAI 可用性/字体」信息正常显示（无 UnsatisfiedLinkError）；容器内 `ldd /opt/java/openjdk/lib/libfontmanager.so | grep freetype` 应解析到系统库。
5. 观察 `/tmp/geoserver-proxy-url.log` 确认启动期 proxyBaseUrl 注入成功；GetCapabilities 输出地址协议/域名正确。

## 修改的文件路径

- d:\Dev\GitHub\WebGIS-Dev\deploy\Dockerfile
