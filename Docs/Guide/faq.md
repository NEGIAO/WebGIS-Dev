# 技术栈与常见问题

> 📌 本文件由根 [README](../../README.md) 的「技术栈与支持」「参考资源」「常见问题」「TODO」章节拆分而来。返回 [README 首页](../../README.md)。

---

## 📞 技术栈与支持

### 前端技术栈
- **框架**：Vue 3.3+
- **构建**：Vite 5.0+
- **地图**：OpenLayers 8.x + Cesium 1.x
- **状态**：Pinia 2.1+
- **路由**：Vue Router 4.2+
- **图表**：ECharts 5.x+
- **工具**：Axios, Moment.js, JSZip, 等

### 后端技术栈
- **框架**：FastAPI 0.104+
- **服务器**：Uvicorn 0.24+
- **验证**：Pydantic 2.0+
- **异步**：asyncio, httpx, aiohttp
- **数据**：Pandas 2.0+
- **几何**：Shapely 2.0+
- **栅格**：Rasterio 1.3+
- **包管理**：uv（推荐）或 pip

## 📚 参考资源

- [Vue 3 官方文档](https://vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [OpenLayers 官方文档](https://openlayers.org/)
- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Hugging Face Spaces 文档](https://huggingface.co/docs/hub/spaces)

## ⚠️ 常见问题

### Q: 前后端如何本地联调？
**A**：前端 `localhost:5173` → 后端 `localhost:7860`，确保 CORS 配置正确。

### Q: 如何修改后端技术栈？
**A**：后端仍在测试阶段，可随时调整。在 `backend/README.md` 中有详细的扩展指南。

### Q: 如何部署到自己的服务器？
**A**：
- 前端：构建后上传到任何静态托管（Nginx、Apache、CDN）
- 后端：使用 Docker 或直接运行 Uvicorn，配合 Nginx 反向代理

### Q: 数据导入支持哪些格式？
**A**：GeoJSON、KML/KMZ、Shapefile、GeoTIFF、CSV、XYZ 瓦片等。详见 [前端文档](./frontend/README.md)。

## TODO
参考高德api的md文档，将现有的低级api切换为高级api并解析出数据进行查看
