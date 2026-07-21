# 开发指南与贡献指南

> 📌 本文件由根 [README](../../README.md) 的「开发指南」「贡献指南」章节拆分而来。返回 [README 首页](../../README.md)。

---

## 🛠️ 开发指南

### 添加新功能的标准流程

#### 前端新增页面

```bash
# 1. 创建页面组件
touch frontend/src/components/MyFeaturePage.vue

# 2. 配置路由
# frontend/src/router/index.js 或在views/HomeView.vue中引入

# 3. 添加菜单项
# 在 TopBar 或 SidePanel 中添加导航
```

#### 后端新增 API

```python
# backend/app.py 或 backend/api/my_router.py
@app.get("/api/v1/my-endpoint")
async def my_endpoint():
    """API 文档"""
    return {"status": "success", "data": {}}
```

#### 前后端通信

```javascript
// frontend/src/api/backend.js
// 前端端通信桥梁
export const getMyData = async (params) => {
  const response = await fetch('/api/v1/my-endpoint', {
    method: 'GET'
  })
  return response.json()
}
```

### 代码风格

- **前端**：ESLint + Prettier（JavaScript 社区标准）
- **后端**：Black + Ruff（Python 社区标准）
- **提交**：Conventional Commits

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/xxx`)
3. 提交更改 (`git commit -m 'Add xxx'`)
4. 推送分支 (`git push origin feature/xxx`)
5. 提交 Pull Request
