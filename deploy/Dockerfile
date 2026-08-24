# =====================================================================
# WebGIS 全栈单一镜像：nginx（前端静态 + /api 反代）+ FastAPI(uvicorn) 同容器
#
# 部署目标：Hugging Face Space —— 单容器单端口 7860（nginx 对外总入口）
# 本地使用：docker compose -f deploy/docker-compose.yml up -d --build
#
# 构建上下文 = 仓库根：
#   - 本地：compose 已指定 context=..、dockerfile=deploy/Dockerfile
#   - HF  ：CI 组装 Space 根 = {Dockerfile(←deploy/Dockerfile), deploy/,
#           backend/, frontend/, README.md}，路径与本仓库根同构
#
# 容器内部拓扑（nginx 原样透传，零路径改写）：
#   :7860 nginx ─┬─ 静态前端 dist
#                ├─ /api/* /proxy/* /tiles/* /monitor/*
#                │   /health /docs /redoc /openapi.json
#                │   → http://127.0.0.1:8000（后端原生路径）
#                └─ /geoserver/* → http://127.0.0.1:8080（GeoServer 探索部署）
#   :8000 uvicorn（仅容器内回环，不对外）
#   :8080 GeoServer/Jetty（仅容器内回环，不对外；数据目录 ephemeral）
# =====================================================================

########################  阶段一：前端构建  ########################
FROM node:22-bookworm-slim AS web-build

WORKDIR /src/frontend

# 1) 锁文件先行装依赖（package 未变则命中层缓存）
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) 前端源码 + vite.config 跨目录依赖（README 提版本号）
COPY frontend/ ./
COPY README.md /src/README.md

# 3) 构建期 VITE_* 注入：selectiveEnvPlugin 的 envDir 固定解析
#    <frontend>/../deploy → 容器内即 /src/deploy/.env（路径错位会让
#    env 读空、API 基址回落 localhost）。拷入后把后端基址改为同源根
#    路径「/」——前端拼出 /api/*、/proxy/*、/tiles/* 原生路径，
#    nginx 无需任何改写、原样透传（ARG 可覆写）
COPY deploy/.env /src/deploy/.env
ARG DOCKER_VITE_BACKEND_URL=/
ARG DOCKER_VITE_TILE_PROXY_BASE_URL=/
RUN sed -i "s|^VITE_BACKEND_URL=.*|VITE_BACKEND_URL=${DOCKER_VITE_BACKEND_URL}|" /src/deploy/.env \
 && sed -i "s|^VITE_TILE_PROXY_BASE_URL=.*|VITE_TILE_PROXY_BASE_URL=${DOCKER_VITE_TILE_PROXY_BASE_URL}|" /src/deploy/.env \
 && npm run build

########################  阶段二：运行时（python + nginx）  ########################
FROM python:3.12-slim

# 1. uv + 系统依赖（含 nginx、JRE——GeoServer 运行时；不装 libgl1——无 OpenGL 依赖，避免拖入 Mesa ~180MB）
RUN pip install --no-cache-dir uv -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    sqlite3 \
    tzdata \
    nginx \
    curl \
    cron \
    sudo \
    coreutils \
    unzip \
    default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 2. 非 root 运行用户
RUN useradd -m -u 1000 user
WORKDIR /app

# 3. 后端 Python 依赖（内容寻址缓存：锁文件不变则整层复用）
COPY backend/pyproject.toml backend/uv.lock* ./
RUN chown -R user:user /app
USER user
RUN uv sync --no-cache

# 4. 后端代码 + 运行配置（L1；本地 compose 另挂载覆盖以热更）
COPY --chown=user backend/ ./
COPY --chown=user deploy/.env ./

# 5. 前端产物 + nginx 配置（全部归 user；日志/临时目录指向 /tmp 免 root）
USER root
COPY --from=web-build /src/frontend/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/nginx.conf
# nginx 以 user 运行：静态资源/配置/临时目录归属对齐（日志与 pid 均在 /tmp 下自动创建）
RUN chown -R user:user /usr/share/nginx/html /etc/nginx \
 && mkdir -p /tmp/nginx_cache && chown -R user:user /tmp/nginx_cache

# 6) GeoServer（探索用第三服务：容器内 :8080 仅回环，由 nginx /geoserver/ 分流对外）
#    官方 bin 发行版（内嵌 Jetty）；数据目录暂为容器内 ephemeral，
#    HF 持久化（Persistent Storage / PostGIS + COG）待探索后另行设计
#    下载源双路回退：download.geoserver.org 曾出现 DNS 故障（本地与 HF 构建
#    环境均复现），SourceForge master 镜像为兜底（viasf=1 跳转签名镜像直链）
ENV GEOSERVER_VERSION=2.26.2
USER root
RUN set -e; \
    ok=""; \
    for url in \
      "https://download.geoserver.org/geoserver/${GEOSERVER_VERSION}/geoserver-${GEOSERVER_VERSION}-bin.zip" \
      "https://master.dl.sourceforge.net/project/geoserver/GeoServer/${GEOSERVER_VERSION}/geoserver-${GEOSERVER_VERSION}-bin.zip?viasf=1"; \
    do \
      echo "[geoserver] trying: $url"; \
      if curl -fsSL --connect-timeout 15 --retry 2 --max-time 900 "$url" -o /tmp/geoserver-bin.zip; then ok="$url"; break; fi; \
      rm -f /tmp/geoserver-bin.zip; \
    done; \
    [ -n "$ok" ] || { echo "[geoserver] FATAL: all mirrors failed"; exit 1; }; \
    echo "[geoserver] downloaded from: $ok"; \
    unzip -q /tmp/geoserver-bin.zip -d /opt \
 && mv "/opt/geoserver-${GEOSERVER_VERSION}" /opt/geoserver \
 && mkdir -p /opt/geoserver/data_dir \
 && rm -f /tmp/geoserver-bin.zip \
 && chown -R user:user /opt/geoserver
USER user

# =================================================================-
# KeepAlive 互活跃机制（HF Space 防 24h 休眠；本地 compose 会覆盖 CMD，不启用）
# 发送端（主）：asyncio 任务随机间隔 GET 对端 /api/status
# 发送端（兜底）：cron 每 3min + sleep(0~180)
# 接收端：FastAPI /api/heartbeat + /api/keepalive/ping（公开无鉴权）
# =================================================================-
RUN echo '*/3 * * * * sleep $(shuf -i 0-180 -n 1) && /app/keepalive_send.sh >> /var/log/keepalive.log 2>&1' | crontab -

# 启动脚本：cron 保活 + GeoServer(后台) + nginx(前台守护进程化后台运行) + uvicorn(主进程)
RUN cat > /opt/start.sh << 'SCRIPT'
#!/bin/sh
set -e
sudo /usr/sbin/cron 2>/dev/null || cron 2>/dev/null || true

# GeoServer 后台启动：日志落 /tmp/geoserver.log；就绪约 20~40s，不阻塞主进程。
# 崩溃不影响 nginx/后端——探索期容忍降级，后续按需加自动重启
( cd /opt/geoserver \
  && exec java -Xms256m -Xmx1g \
       -DGEOSERVER_DATA_DIR=/opt/geoserver/data_dir \
       -Djetty.port=8080 \
       -jar start.jar ) >> /tmp/geoserver.log 2>&1 &

nginx
exec uv run uvicorn app:app --host 127.0.0.1 --port 8000 --no-access-log
SCRIPT
RUN chmod +x /opt/start.sh && chown user:user /opt/start.sh

# cron 兜底探活脚本：GET 对端 New API 公开状态端点（随机 UA/Accept-Language 拟真）
RUN cat > /app/keepalive_send.sh << 'SCRIPT'
#!/bin/sh
PEER="https://negiao-newapi.hf.space/api/status"

_UA_1="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
_UA_2="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0"
_UA_3="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
_UA_4="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
_UA_5="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

UA_NUM=$(shuf -i 1-5 -n 1)
eval "UA=\$_UA_${UA_NUM}"

AL_NUM=$(shuf -i 1-3 -n 1)
if [ "$AL_NUM" = "1" ]; then
  AL="zh-CN,zh;q=0.9,en;q=0.8"
elif [ "$AL_NUM" = "2" ]; then
  AL="en-US,en;q=0.9,zh-CN;q=0.8"
else
  AL="zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"
fi

TS=$(date '+%Y-%m-%d %H:%M:%S')
printf '[保活] [%s] 数据发送中 → %s\n' "$TS" "$PEER"
TS=$(date '+%Y-%m-%d %H:%M:%S')
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
  -X GET "$PEER" \
  -H "User-Agent: $UA" \
  -H "Accept: application/json, text/html, */*" \
  -H "Accept-Language: $AL" \
  -H "Referer: https://negiao-webgis.hf.space/" \
  --max-time 15 2>/dev/null)

if [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  printf '[保活] [%s] 保活成功 ✓ 对方响应: HTTP %s\n' "$TS" "$HTTP_CODE"
else
  printf '[保活] [%s] 保活失败 ✗ 错误码: %s\n' "$TS" "${HTTP_CODE:-unreachable}"
fi
SCRIPT
RUN chmod +x /app/keepalive_send.sh && chown user:user /app/keepalive_send.sh

# 非 root user 启动 cron 所需 sudo 白名单
USER root
RUN echo 'user ALL=(ALL) NOPASSWD: /usr/sbin/cron' >> /etc/sudoers.d/keepalive && chmod 440 /etc/sudoers.d/keepalive
USER user

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["/opt/start.sh"]
