# 使用官方 Python 运行时作为基础镜像
FROM python:3.9-slim

# 1. 安装 uv（快速包管理器）
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 2. 设置工作目录和用户
RUN useradd -m -u 1000 user
USER user
WORKDIR /app

# 3. 复制依赖文件
COPY --chown=user pyproject.toml ./
# 如果存在 uv.lock 也复制
COPY --chown=user uv.lock* ./

# 4. 使用 uv 安装依赖
# 不使用 --frozen，允许在 Dockerfile 构建时生成 uv.lock
RUN uv sync --no-cache

# 5. 复制应用代码
COPY --chown=user app.py .
COPY --chown=user main.py . 

# 6. 暴露端口
EXPOSE 7860

# 7. 启动应用
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]