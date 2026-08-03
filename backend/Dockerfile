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

# 8. CMD启动应用
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
