# 使用官方 Python 运行时作为基础镜像
FROM python:3.9-slim

# 1. 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 2. 安装系统级依赖 (必须在切换 USER 之前，且使用 root 权限)
# 这些是 GIS 库 (rasterio, GDAL) 运行所必需的底层 C 库
# 2. 安装系统级依赖 (先换成清华镜像源，再安装)
RUN sed -i 's/deb.debian.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y --no-install-recommends \
    libexpat1 \
    libgdal-dev \
    libgeos-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

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

# 6. 复制应用代码
COPY --chown=user . .

# 7. 暴露端口
EXPOSE 7860

# 8. CMD启动应用
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]