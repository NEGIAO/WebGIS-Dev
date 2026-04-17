# WebGIS 后端 API 服务

## 📋 项目概述

本后端服务基于 **FastAPI** 构建，为 WebGIS 前端提供以下核心功能：

- 🗺️ 地理数据处理与分析
- 📡 坐标系转换与投影变换  
- 📍 地理编码 / 逆地理编码
- 🌦️ 天气数据服务
- 🛣️ 路线规划与导航
- 📰 新闻爬虫与数据采集
- 💾 GIS 数据格式转换
- ⚙️ 异步后台任务处理

> **重要提示**：当前版本为测试版。后续可能采用不同的后端技术栈。

## 🚀 快速开始

### 前置要求
- Python 3.9+
- uv（推荐，快速包管理器）或 pip
- Docker（可选，容器化部署）

### 本地开发

#### 使用 uv（推荐）

```bash
# 1. 进入后端目录
cd backend

# 2. 同步依赖
uv sync

# 3. 启动开发服务器（自动 reload）
uv run uvicorn app:app --reload --port 8000
```

#### 使用 pip

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境（Windows）
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动开发服务器
uvicorn app:app --reload --port 8000
```

### 访问 API

- **API 服务**: http://localhost:8000
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 📁 项目目录结构

```
backend/
├── app.py                    # 🔹 FastAPI 主应用
│                             #   - 路由挂载
│                             #   - CORS 配置
│                             #   - 异常处理
│
├── main.py                   # FastAPI 启动脚本（HF Spaces 兼容）
│
├── pyproject.toml            # 🔹 uv 项目配置
│                             #   - 项目元数据
│                             #   - 依赖定义
│                             #   - 脚本命令
│
├── uv.lock                   # uv 依赖版本锁定（自动生成）
│
├── requirements.txt          # pip 依赖列表（备用）
│
├── Dockerfile                # 🔹 Docker 镜像定义
│                             #   - Python 3.9-slim 基础
│                             #   - uv 快速安装
│                             #   - 端口 7860
│
├── .env.example              # 环境变量示例
│
├── .python-version           # Python 版本（pyenv 支持）
│
├── routers/                  # 路由蓝图（可选）
│   └── (待开发)
│
├── services/                 # 业务逻辑层（可选）
│   └── (待开发)
│
├── models/                   # 数据模型（Pydantic）
│   └── (待开发)
│
├── utils/                    # 工具函数
│   └── (待开发)
│
├── static/                   # 静态文件（可选）
│   └── index.html
│
├── tests/                    # 单元测试
│   └── (待开发)
│
└── README.md                 # 本文件
```

## 📦 核心依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| FastAPI | 0.104+ | Web 框架 |
| Uvicorn | 0.24+ | ASGI 服务器 |
| Pydantic | 2.0+ | 数据验证 |
| httpx | 0.24+ | 异步 HTTP 客户端 |
| pandas | 2.0+ | 数据处理 |

详见 `pyproject.toml` 或 `requirements.txt`

## 🔌 API 端点

### 健康检查
- `GET /health` - 服务健康状态
- `GET /` - 根端点

### 测试端点（当前版本）
- `GET /api/data` - 获取测试数据
- `GET /api/info` - API 信息

### 待开发
- [ ] 地理编码 API
- [ ] 天气 API
- [ ] 路线规划 API
- [ ] 数据处理 API

完整 API 文档详见 http://localhost:8000/docs

## 🐳 Docker 部署

### 构建镜像

```bash
# 从项目根目录构建
docker build -t webgis-backend:latest -f Dockerfile .
```

### 运行容器

```bash
docker run -p 8000:7860 \
  -e AMAP_API_KEY=your_key \
  webgis-backend:latest
```

### 使用 docker-compose（可选）

```bash
docker-compose up backend
```

## ☁️ Hugging Face Spaces 部署

项目已配置 GitHub Actions 自动部署到 Hugging Face Spaces。

### 首次设置

1. **创建 HF Spaces**：https://huggingface.co/spaces
   - Space 名称：`WebGIS`
   - 初始化为 Docker 模板

2. **配置 GitHub Secrets**
   - `HF_TOKEN`：Hugging Face API Token

3. **配置 HF Spaces 环境变量**
   ```
   AMAP_API_KEY=your_key
   TIANDITU_API_KEY=your_key
   ```

### 自动部署触发

推送到 `main` 或 `fullstack` 分支时自动触发：

```bash
git push origin fullstack
# GitHub Actions 自动执行 deploy.yml → sync-to-huggingface
```

### 部署验证

- HF Spaces 构建日志：https://huggingface.co/spaces/NEGIAO/WebGIS
- API 访问：`https://NEGIAO-WebGIS.hf.space`

## 🔑 环境变量配置

复制 `.env.example` 为 `.env`：

```bash
# API Keys
AMAP_API_KEY=your_key
TIANDITU_API_KEY=your_key
WEATHER_API_KEY=your_key

# 服务配置
SERVICE_PORT=8000
LOG_LEVEL=INFO

# 数据库（可选）
DATABASE_URL=postgresql://user:pass@localhost/webgis

# 跨域配置
ALLOWED_ORIGINS=["http://localhost:5173", "https://yourdomain.com"]
```

## 🔄 更新日志

### V3.0.0 (2026-04-17)
#### 🔹 前后端分离架构初版

**新增**：
- ✅ FastAPI 基础框架搭建
- ✅ Pydantic 数据验证与文档生成
- ✅ CORS 中间件配置
- ✅ Docker 容器化部署
- ✅ HF Spaces 自动部署（GitHub Actions）
- ✅ 异常处理与错误响应标准化
- ✅ 健康检查端点

**改进**：
- ✅ 从根目录独立 backend 子目录
- ✅ 使用 uv 替代 pip 依赖管理
- ✅ Dockerfile 迁移到 backend 目录

**待实现**：
- [ ] 数据库集成（PostgreSQL）
- [ ] 缓存层（Redis）
- [ ] JWT 认证
- [ ] WebSocket 实时通信
- [ ] 限流与速率控制
- [ ] 地理编码 API
- [ ] 天气数据 API
- [ ] 路线规划 API
- [ ] GIS 数据处理服务
- [ ] 新闻爬虫服务

## 🛠️ 开发指南

### 添加新的 API 端点

```python
# app.py
@app.get("/api/my-endpoint")
async def my_endpoint():
    """端点文档"""
    return {"message": "success"}
```

### 处理 CORS

后端已配置 CORS。生产环境应修改 `allow_origins`：

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 与前端集成

**本地开发**：
```
前端：http://localhost:5173
后端：http://localhost:8000
API 调用：http://localhost:8000/api/*
```

**生产环境**：
```
前端：https://yourdomain.com
后端：https://backend.yourdomain.com
API 调用：https://backend.yourdomain.com/api/*
```

## 🧪 测试

```bash
# 运行测试
uv run pytest tests/

# 覆盖率报告
uv run pytest tests/ --cov=.
```

## 📚 参考资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Pydantic 文档](https://docs.pydantic.dev/)
- [Uvicorn 文档](https://www.uvicorn.org/)
- [Hugging Face Spaces 指南](https://huggingface.co/docs/hub/spaces)
- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)

## ⚠️ 常见问题

### 1. 依赖安装失败
```bash
# 使用 uv 清理缓存
uv pip cache purge

# 重新同步
uv sync
```

### 2. 端口被占用
```bash
# 使用不同端口
uv run uvicorn app:app --port 8001
```

### 3. HF Spaces 部署失败
检查以下项目：
- [ ] `HF_TOKEN` Secret 已配置
- [ ] `backend/Dockerfile` 存在
- [ ] `backend/pyproject.toml` 依赖完整
- [ ] 构建日志无错误

### 4. CORS 跨域错误
配置 `ALLOWED_ORIGINS` 环境变量或修改代码中的 `allow_origins` 列表

## 📄 许可证

MIT License

---

**最后更新**：2026-04-17  
**当前版本**：V3.0.0  
**维护者**：NEGIAO  
**技术栈**：FastAPI + Python 3.9 + Docker + HF Spaces
uv sync

# 构建 Docker 镜像
docker build -t webgis-backend:latest .

# 推送到镜像仓库（如 Docker Hub）
docker tag webgis-backend:latest your-registry/webgis-backend:latest
docker push your-registry/webgis-backend:latest
```

## 🐛 故障排查

### 依赖冲突
```bash
# 重新生成 uv.lock
uv sync --upgrade

# 清除缓存
uv cache prune
```

### 端口被占用
```bash
# 改用其他端口
uvicorn app:app --port 8001
```

### Python 版本不兼容
```bash
# 检查 Python 版本（需要 3.9+）
python --version

# 使用指定 Python 版本运行
uv run -p python3.11 uvicorn app:app
```

## 📚 参考文档

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [uv 项目指南](https://docs.astral.sh/uv/)
- [Uvicorn 配置](https://www.uvicorn.org/)

## 📄 许可证

遵循项目主许可证。

---

**最后更新**：2026-04-17
