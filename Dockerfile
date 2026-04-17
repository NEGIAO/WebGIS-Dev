FROM python:3.9-slim

# 1. 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 2. 设置工作目录和用户
RUN useradd -m -u 1000 user
USER user
WORKDIR /app

# 3. 先同步环境 (利用 Docker 缓存层)
# 只需要这两个文件就能安装所有依赖
COPY --chown=user backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-cache

# 4. 复制后端代码
COPY --chown=user backend/app.py ./app.py

# 5. 使用 uv 运行 (确保在虚拟环境中执行)
# 端口必须是 7860
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]