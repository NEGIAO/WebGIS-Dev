"""
WebGIS 后端应用的另一个入口点（可选）
也可以为 Hugging Face Spaces 提供
"""
from app import app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
