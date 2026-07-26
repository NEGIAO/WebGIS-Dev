# 项目结构详解

> 📌 本文件维护**项目根级目录总览**与 **Docs 文档树**。前后端详细文件树已拆分为独立文件（原子化维护，避免重复）：
>
> - 📂 前端完整文件树 → [`frontend-structure.md`](frontend-structure.md)
> - 📂 后端完整文件树 → [`backend-structure.md`](backend-structure.md)
>
> 返回 [根 README](../../README.md)
>
> ⚠️ **维护规则**：根级目录或 Docs 结构变动时更新本文件；前后端内部文件增删改请更新对应的 structure 文件。

---

## 根级目录总览

```text
WebGIS_Dev/
├── .github/workflows/                 # CI/CD（前端 GitHub Pages 自动部署）
│
├── frontend/                          # 前端工程（Vue 3 + Vite + OpenLayers + Cesium）
│   └── src/                           # 详细文件树见 frontend-structure.md
│
├── backend/                           # 后端工程（FastAPI + Docker，部署于 HF Spaces）
│   └── api/                           # 详细文件树见 backend-structure.md
│
├── Docs/                              # 项目文档（维护日志 + 架构文档 + 指南文档 + Demo 演示）
├── Docs/                              # 项目文档（维护日志 + 架构文档 + 指南文档 + Demo 演示）
│   ├── LLM_record/                    # 维护日志（按日期归档）
│   ├── Architecture/                  # 架构设计文档（八大功能架构说明 + 洪水模拟）
│   ├── Guide/                         # 指南文档（本目录）
│   ├── Demo/                          # 前端静态 Demo 演示页面
│   ├── Demo/                          # 前端静态 Demo 演示页面
│   ├── Example_prompt.md
│   ├── Force_command.md
│   └── TODO/
│
├── LocalDev.bat                       # Windows 一键启动脚本
├── docker-compose.yml                 # 前后端容器编排
├── .gitignore
├── LICENSE
└── README.md                          # 项目门户页
```

---

## Docs 文档树

```text
Docs/
├── LLM_record/                        # 维护日志（按日期归档，原 Docs/ 下的日期目录整体迁入）
│   ├── 26-04/                         # 2026-04 日志
│   ├── 26-05/                         # 2026-05 日志
│   ├── 26-06/                         # 2026-06 日志（含 06-28 / 06-29 等不规则命名子目录）
│   └── 26-07/                         # 2026-07 日志（含 26-07-25 BSM 动态修复、26-07-26 阴影稳定性与 OAuth 登录绑定）
│
├── Architecture/                      # 架构设计文档（八大功能架构说明 + 洪水模拟）
│
├── Demo/                              # 前端静态 Demo 演示页面（15 个独立页面）
│   ├── 2dWindField.html               # 2D 风场可视化演示
│   ├── 3dHeatMap.html                 # 3D 热力图演示
│   ├── amapRectify.html               # 高德底图纠偏演示
│   ├── atmosphere.html                # 大气渲染效果演示
│   ├── beidou.html                    # 北斗相关定位/可视化演示
│   ├── buildingShade.html             # 建筑阴影分析演示
│   ├── customDashArrow.html           # 自定义虚线箭头样式演示
│   ├── dynamicLable.html              # 动态标签渲染演示
│   ├── height_limit_analysis.html     # 高度限制分析演示
│   ├── immensePointLoader.html        # 海量点加载演示
│   ├── mapTheme.html                  # 地图主题切换演示
│   ├── nearGroundBox.html             # 近地面盒体效果演示
│   ├── odFlyLine.html                 # OD 飞线效果演示
│   ├── slopeAnaysis.html              # 坡度/坡向分析演示
│   └── visibilityAnalysis.html        # 通视/可视域分析演示
│
├── Guide/                             # 指南文档（由根 README 拆分，原子化维护）
│   ├── project-structure.md           # 本文件：根级目录总览 + Docs 树
│   ├── frontend-structure.md          # 前端完整文件树（唯一权威）
│   ├── backend-structure.md           # 后端完整文件树（唯一权威）
│   ├── CHANGELOG.md                   # 更新日志（版本记录唯一权威）
│   ├── dev-conventions.md             # 开发约定与提交规范
│   ├── dev-guide.md                   # 开发指南
│   └── faq.md                         # 技术栈与 FAQ
│
├── Example_prompt.md                  # Agent 提示词示例
├── Force_command.md                   # Agent 强制命令
└── TODO/                              # 待办事项
```
