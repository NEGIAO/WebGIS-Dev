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
#                └─ /api/* /proxy/* /tiles/* /monitor/*
#                   /health /docs /redoc /openapi.json
#                   → http://127.0.0.1:8000（后端原生路径）
#   :8000 uvicorn（仅容器内回环，不对外）
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

# 1. uv + 系统依赖（含 nginx；不装 libgl1——无 OpenGL 依赖，避免拖入 Mesa ~180MB）
RUN pip install --no-cache-dir uv -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    sqlite3 \
    tzdata \
    nginx \
    curl \
    coreutils \
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

# 启动脚本：nginx(前台守护进程化后台运行) + uvicorn(主进程)
RUN cat > /opt/start.sh << 'SCRIPT'
#!/bin/sh
set -e

nginx
exec uv run uvicorn app:app --host 127.0.0.1 --port 8000 --no-access-log
SCRIPT
RUN chmod +x /opt/start.sh && chown user:user /opt/start.sh

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
    CMD curl -fsS http://127.0.0.1:7860/health || exit 1

CMD ["/opt/start.sh"]
