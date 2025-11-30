# 校园 WebGIS（HENU 地理科学学院）
[查看部署效果](https://negiao.github.io/WebGIS_henu_trials_5_28_vue3/#/home)

基于 Vue 3 + Vite + OpenLayers 构建的校园 WebGIS 项目，聚焦河南大学地理科学学院教学区。通过互动地图与新闻侧栏联动，帮助访客快速了解地环院的空间位置、校园风貌与最新资讯。

> 本项目最初为大二下学期课程作业，开发周期为 5 月 28 日至 6 月 13 日。交付后曾暂时搁置，直至 11 月 28 日在专业知识与实践经验积累之下，再次启动并持续迭代优化。

## 主要特性

- 📌 **多底图切换**：支持本地瓦片、天地图影像/矢量、ESRI 影像、OpenStreetMap、高德地图等服务。
- 🛰️ **实时坐标**：显示鼠标经纬度，进入地环院范围时自动高亮并推送相关新闻。
- 🖼️ **缩略图预览**：放大到指定级别即可查看校园缩略图，点击可放大查看并同步侧栏展示。
- 📰 **动态资讯**：新闻标题、配图、摘要与外链均可一键获取，便于追踪学院动态。
- 📱 **自适应布局**：响应式设计，桌面与移动端都有良好体验。
- 🔐 **用户系统**：包含简单的注册/登录页面（演示用）。

## 快速开始

```bash
npm install
npm run dev
npm run build
```

### 本地瓦片资源

将离线瓦片放置在 `public/tiles/{z}/{x}/{y}.png` 目录下即可自动读取。如果构建后的站点无法访问本地瓦片，应用会自动回退到在线底图并在界面提示。

## 目录结构

```
WebGIS_henu_trials_5_28_vue3/
├── public/              # 静态资源（包括 icon、瓦片、图片）
├── src/
│   ├── assets/          # 全局样式
│   ├── components/      # Vue 组件
│   │   ├── MapContainer.vue  # 地图核心逻辑组件
│   │   ├── SidePanel.vue     # 右侧信息面板组件
│   │   └── TopBar.vue        # 顶部导航栏组件
│   ├── router/          # Vue Router 路由配置
│   ├── views/           # 页面视图
│   │   ├── HomeView.vue      # 主页（地图页）
│   │   └── RegisterView.vue  # 注册/登录页
│   ├── App.vue          # 根组件
│   └── main.js          # 入口文件
├── index.html           # HTML 入口
├── package.json         # 项目依赖配置
└── vite.config.js       # Vite 构建配置
```

## 版本记录

### V2.0.0 (2025-11-28)
- **架构重构**：迁移至 Vue 3 + Vite + Vue Router 的 SPA 架构。
- **功能新增**：
    - 新增登录/注册页面。
    - 新增地图复位按钮。
    - 优化经纬度显示控件 UI。
- **移动端适配**：实现响应式布局，支持手机端访问（上下布局）。
- **代码优化**：
    - 移除 jQuery 风格的 DOM 操作，全面拥抱 Vue 响应式数据流。
    - 组件拆分（MapContainer, SidePanel, TopBar），降低耦合度。
    - 修复 OpenLayers 地图初始化与定位问题。

### V1.0.0 (2024-06-13)
- **初始发布**：作为课程作业提交。
- **基础功能**：
    - OpenLayers 地图展示与底图切换。
    - 简单的图文联动功能。
    - 基础的 HTML/CSS/JS 结构。
                    │  ├─ components/        # 顶栏、地图、右侧信息栏等组件
                    │  └─ APP_3.vue          # 主布局容器
                    ├─ index.html            # 入口文件
                    ├─ package.json
                    ├─ vite.config.js
                    └─ .github/workflows/    # GitHub Pages 自动部署脚本
                    ```

                    ## 开发建议

                    - 建议使用 VS Code + Volar 插件，配合 ESLint 保持代码风格一致。
                    - 大比例尺时请求的瓦片较多，可按需控制缩放阈值或裁剪瓦片范围。
                    - 如需新增 API Key，请通过 `.env` 配置，并在 `vite.config.js` 中读取 `VITE_` 前缀变量。

                    欢迎继续扩展功能，例如添加更多兴趣点、天气信息或 3D 建筑模型。若遇到问题，欢迎提 Issue 讨论。祝学习顺利！
```
