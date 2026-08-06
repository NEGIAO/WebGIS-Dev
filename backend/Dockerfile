# 使用官方 Python 运行时作为基础镜像
FROM python:3.12-slim

# 1. 安装 uv（通过 pip 国内镜像，避免 Docker Hub 拉取失败）
RUN pip install uv -i https://pypi.tuna.tsinghua.edu.cn/simple

# 2. 安装系统级依赖（先换清华镜像源，再安装）
#    必须在切换 USER 之前，且使用 root 权限
#    GIS 库 (rasterio, GDAL) 运行所必需的底层 C 库 + tzdata（时区数据）
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    libgdal-dev \
    libgeos-dev \
    libgl1 \
    sqlite3 \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 3. 设置工作目录和用户
RUN useradd -m -u 1000 user
WORKDIR /app


# 4. 复制依赖文件（此时还是 root 权限，方便后续 chown）
COPY pyproject.toml uv.lock* ./

# 5. 安装依赖并设置权限
# 把 /app 的所有权给 user，并安装依赖
RUN chown -R user:user /app
USER user
RUN uv sync --no-cache

# 6. 复制应用代码（CI 已通过 cp .env backend/.env 注入根配置）
COPY --chown=user . .

# 7. 暴露端口
EXPOSE 7860

# =================================================================-
# KeepAlive 互活跃机制（WebGIS 端 - 项目 A）
# 目标：每 3~6 分钟与对端 New API 互相访问，避免 HF Space 24h 无流量自动休眠
# ⚠️ HF Space 对外只暴露一个端口：
#    - WebGIS 暴露 7860（FastAPI，可自定义路由）
#    - New API 暴露 3000（Go 二进制，无法自定义路由，只有 /api/status 公开可用）
#    → WebGIS 发送端 GET 对端 /api/status（唯一公开端点）
#    → New API 发送端 GET 对端 /health 或 /api/keepalive/ping
# 架构（两层冗余）：
#   接收端：FastAPI POST /api/heartbeat + GET /api/heartbeat + GET /api/keepalive/ping（公开无鉴权）
#   发送端（主）：asyncio 后台任务，随机 180~360s 间隔 GET 对端 /api/status
#   发送端（兜底）：cron 每 3min + sleep(0~180) 调用 shell 脚本 GET 对端
# =================================================================-
USER root
RUN apt-get update && apt-get install -y --no-install-recommends curl cron sudo coreutils && rm -rf /var/lib/apt/lists/*

# 发送端 shell 脚本（cron 兜底层）
# ⚠️ HF Space 只暴露 3000 端口到公网，New API 是 Go 二进制无法加路由
# → 只能 GET 对端已有的公开端点 /api/status（HEALTHCHECK 已验证可用）
# - 使用 shuf 生成随机 UA / Accept-Language / 间隔偏移
# - 严格按规范格式打印日志到 stdout（Docker 日志实时可见）
RUN cat > /app/keepalive_send.sh << 'SCRIPT'
#!/bin/sh
# cron 兜底探活脚本：GET 对端 New API 公开状态端点
PEER="https://negiao-newapi.hf.space/api/status"

# UA 池
_UA_1="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
_UA_2="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0"
_UA_3="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
_UA_4="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
_UA_5="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

# 随机选 UA（shuf 从 1~5 选一个数）
UA_NUM=$(shuf -i 1-5 -n 1)
eval "UA=\$_UA_${UA_NUM}"

# 随机 Accept-Language
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
RUN chmod +x /app/keepalive_send.sh

# 注册 cron 任务（每 3 分钟触发一次；脚本内部会再 sleep 随机 0~180s，等效 3~6min 间隔）
RUN echo '*/3 * * * * sleep $(shuf -i 0-180 -n 1) && /app/keepalive_send.sh >> /var/log/keepalive.log 2>&1' | crontab -

# 启动脚本：启动 cron 守护进程 + 启动主应用
RUN cat > /app/keepalive_entrypoint.sh << 'SCRIPT'
#!/bin/sh
set -e
sudo /usr/sbin/cron 2>/dev/null || cron 2>/dev/null || /etc/init.d/cron start 2>/dev/null || true
# --access-log 关闭 uvicorn 请求访问日志，避免外部扫描器 404 噪音淹没保活日志
exec uv run uvicorn app:app --host 0.0.0.0 --port 7860 --no-access-log
SCRIPT
RUN chmod +x /app/keepalive_entrypoint.sh

# 给非 root user 启动 cron 的 sudo 权限
RUN echo 'user ALL=(ALL) NOPASSWD: /usr/sbin/cron' >> /etc/sudoers.d/keepalive && chmod 440 /etc/sudoers.d/keepalive

USER user
# 确保 user 拥有脚本文件（避免 Permission denied）
USER root
RUN chown user:user /app/keepalive_send.sh /app/keepalive_entrypoint.sh
USER user

# 启动入口
CMD ["/app/keepalive_entrypoint.sh"]
