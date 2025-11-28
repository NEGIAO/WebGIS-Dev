# vue_third_5_19

本项目实现的功能：<br>
1、良好的排版与布局：<br>
                    # 校园 WebGIS（HENU 地理科学学院）

                    基于 Vue 3 + Vite + OpenLayers 构建的校园 WebGIS 项目，聚焦河南大学地理科学学院教学区。通过互动地图与新闻侧栏联动，帮助访客快速了解地环院的空间位置、校园风貌与最新资讯。

                    ## 主要特性

                    - 📌 多底图切换：支持本地瓦片、天地图影像/矢量、ESRI 影像、OpenStreetMap、高德地图等服务。
                    - 🛰️ 实时坐标：显示鼠标经纬度，进入地环院范围时自动高亮并推送相关新闻。
                    - 🖼️ 缩略图预览：放大到指定级别即可查看校园缩略图，点击可放大查看并同步侧栏展示。
                    - 📰 动态资讯：新闻标题、配图、摘要与外链均可一键获取，便于追踪学院动态。
                    - 📱 自适应布局：响应式设计，桌面与移动端都有良好体验。

                    ## 快速开始

                    ```bash
                    npm install
                    npm run dev
                    npm run build
                    npm run lint
                    ```

                    ### 本地瓦片资源

                    将离线瓦片放置在 `public/tiles/{z}/{x}/{y}.png` 目录下即可自动读取。如果构建后的站点无法访问本地瓦片，应用会自动回退到在线底图并在界面提示。

                    ## GitHub Pages 部署

                    项目自带工作流 `.github/workflows/deploy.yml`：

                    1. 推送到 `main` 或手动触发 `workflow_dispatch`。
                    2. GitHub Actions 会：
                       - 安装依赖并运行 `npm run build`
                       - 将 `dist/` 上传为 Pages 工件
                       - 使用 `actions/deploy-pages` 发布到 GitHub Pages
                    3. 工作流中设置了 `VITE_APP_BASE_URL=/WebGIS_henu_trials_5_28_vue3/`，适用于项目页仓库。如需部署到用户主页仓库（`NEGIAO.github.io`），可将该变量改为 `/`。

                    启用方式：在仓库 Settings → Pages 中选择 “Source: GitHub Actions”，首次构建完成后即可访问。

                    ## 目录结构

                    ```
                    ├─ public/               # 静态资源（包括 icon、瓦片）
                    ├─ src/
                    │  ├─ assets/            # 全局样式
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
