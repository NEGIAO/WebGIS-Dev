from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx  # 推荐用 httpx 代替 requests，因为它支持异步
import pandas as pd

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 功能 1：简单的爬虫接口 ---
# 前端请求：/api/news
@app.get("/api/news")
async def get_external_news():
    url = "https://api.example.com/gis-news" # 假设的外部接口
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        # 这里可以对爬取的数据进行清洗
        return response.json()

# --- 功能 2：GIS 数据处理 (用 Pandas) ---
# 前端请求：/api/process-points
@app.get("/api/process-points")
async def process_gis_data():
    # 模拟一些原始坐标数据
    raw_data = [
        {"name": "点A", "lat": 30.5, "lng": 114.3},
        {"name": "点B", "lat": 30.6, "lng": 114.4}
    ]
    df = pd.DataFrame(raw_data)
    
    # 简单处理：比如给所有点加个“已处理”标记
    df['status'] = 'processed'
    
    return df.to_dict(orient="records")

# --- 功能 3：测试数据接口 ---
@app.get("/api/data")
async def get_test_data():
    return {
        "status": "success", 
        "message": "恭喜！后端已经收到请求",
        "data": [
            {"name": "测试点1", "value": 100},
            {"name": "测试点2", "value": 200}
        ]
    }

# --- 功能 4：健康检查 ---
@app.get("/")
@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "WebGIS Backend is Running!"}

# --- 功能 5：信息接口 ---
@app.get("/api/info")
async def get_api_info():
    return {
        "name": "WebGIS Backend",
        "version": "0.1.0",
        "description": "WebGIS 后端 API 服务",
        "endpoints": [
            "/api/data - 测试数据",
            "/api/news - 新闻爬虫",
            "/api/process-points - GIS 数据处理",
            "/health - 健康检查"
        ]
    }