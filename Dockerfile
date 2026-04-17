# 使用轻量级 Python 镜像
FROM python:3.9-slim

# 创建并切换到非 root 用户 (Hugging Face 安全要求)
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
WORKDIR /app

# 1. 复制后端依赖
# 假设你的结构是：根目录/backend/requirements.txt
COPY --chown=user backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# 2. 复制后端核心代码
# 假设你的核心代码在：根目录/backend/app.py
COPY --chown=user backend/app.py ./app.py

# 3. 启动 uvicorn
# 端口必须是 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]