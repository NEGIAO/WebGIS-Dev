# 三层配置架构计划 + 根目录 .env 全集清单

## 日期和时间

2026-07-26（配置清单阶段）

## 修改内容

- 定稿并写入分阶段执行计划：`Docs/Guide/configuration-architecture-plan.md`
- 落地阶段 0–1：
  - 根目录 `.env.example`（L1+L2+L3 全集目录与注释）
  - `Docs/Guide/configuration.md`（clone 配置指南）
  - 修正 `.gitignore` 忽略根/前后端私密 `.env`
  - `backend/.env.example`、`frontend/.env.example` 改为指向根清单的摘要
  - 根 `README.md` 增加三层配置入口与文档导航
  - `Docs/Guide/project-structure.md` 登记新文件

## 修改原因

配置分散在前后端 env、硬编码域名、Admin DB、HF Secrets 多处，clone 成本高且易把绝密与常量混用。用户要求三层：根 env 全集低密、Admin+DB 常变较高安全、HF Secrets 绝密。

## 影响范围

- 文档与配置模板（本阶段**不改变**业务运行时读取逻辑）
- 后续阶段 2 将引入 `backend/config` 统一 loader

## 优化解决方案

见 `configuration-architecture-plan.md` 阶段 0–6。本提交完成「清单统一」，读取收敛留待下一阶段。

## 测试方案

- 确认 `.env.example` 含 OAuth/SMTP/Agent/Supabase/Amap/VITE/Admin L2 登记
- 确认 `.gitignore` 忽略 `.env`
- 不要求本阶段通过 OAuth 实机（未改 loader）

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\.gitignore`
- `D:\Dev\GitHub\WebGIS-Dev\README.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration-architecture-plan.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md`
- `D:\Dev\GitHub\WebGIS-Dev\backend\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\.env.example`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-configuration-three-layer-plan-and-env-catalog.md`
