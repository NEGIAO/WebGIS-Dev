from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "GIS 服务器已启动", "memory": "16GB", "message": "Hello GISer!"}