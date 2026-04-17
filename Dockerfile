FROM python:3.9-slim

# 1. 安装 uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 2. 设置环境
RUN useradd -m -u 1000 user
USER user
WORKDIR /app

# 3. 同步依赖 (注意：这里直接改成了 pyproject.toml，不再带文件夹名)
COPY --chown=user pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache

# 4. 拷贝代码 (直接拷贝当前目录下的 app.py)
COPY --chown=user app.py ./app.py

# 5. 启动
EXPOSE 7860
CMD ["uv", "run", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]