# --- 前端构建阶段 ---
FROM node:18 AS build-stage
WORKDIR /app/frontend
# 复制前端依赖并安装
COPY frontend/package*.json ./
RUN npm install
# 复制前端所有代码并打包
COPY frontend/ .
RUN npm run build

# --- 后端运行阶段 ---
FROM python:3.9
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH"
WORKDIR /app

# 安装后端依赖
COPY --chown=user backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade -r ./backend/requirements.txt

# 复制前端打包好的产物到 backend 可以访问的地方
COPY --from=build-stage --chown=user /app/frontend/dist ./dist
# 复制后端代码
COPY --chown=user backend/ ./backend/

# 运行命令 (注意路径变了)
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "7860"]