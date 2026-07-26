# 前端 env 统一收敛到仓库根：单一 env 落地（V3.4.19）

## 日期和时间

2026-07-26 19:21（北京时间）

## 事件逻辑链条分析

- **核心症状**：用户三层模型要求「前后端所有密钥常量统一从根目录一个 env 读取」，但前端 `VITE_*` 实际读取自 `frontend/.env.local`（LocalDev 生成）与 `frontend/.env.production`，根 `.env.example` 只承担登记职责——存在"清单在根、取值在子目录"的双源割裂，clone 用户需理解两套 env 位置。
- **根本原因**：Vite 默认 `envDir` 为前端工程目录，历史上顺势把前端 env 放在 frontend/ 下，未利用 Vite 的 envDir 定制能力。
- **受影响模块**：Vite 构建配置、前端 env 文件布局、LocalDev 启动脚本、配置文档链。
- **解决思路**：`envDir` 指向仓库根让 Vite 与后端 loader 同读根 `.env`；生产公开值上收为根 `.env.production`；frontend 目录 env 全部降为指路存根并清理生成逻辑。安全性由 Vite 机制保证：仅 `VITE_` 前缀注入客户端，根 `.env` 中的 L3/后端变量不会进构建产物。

## 修改内容

1. **`frontend/vite.config.js`**：导入 `loadEnv`；`envDir = 仓库根`（fileURLToPath 解析）写入返回配置；`VITE_BASE_URL` 改为 `loadEnv(mode, envDir, 'VITE_')` 优先、进程环境变量次之、`./` 兜底（原 CI 无注入时行为不变）。
2. **新增根 `.env.production`**（提交 git，仅公开 VITE_*）：`VITE_BACKEND_URL=https://negiao-webgis.hf.space`、`VITE_BASE_URL=./`、可选 TILE_PROXY/下载超时注释项；头部含「clone 必改」警示与登记链接。
3. **`frontend/.env.production`** 重写为指路存根（注明 Vite 不再读取本目录、变量勿加）；**`frontend/.env.example`** 头部同步 envDir 语义（保留键值仅作参考展示）。
4. **`LocalDev.bat`**：删除生成 `frontend/.env.local` 的整段（含 VITE_TIANDITU_TK 遗留占位）；改为存量 `.env.local` 自动删除 + 提示「env 统一在根 .env」；保留根 `.env` 自动创建逻辑；纯 ASCII 维持。
5. **登记与文档同步**：根 `.env.example` 前端段与「前端注意」注释改写；`configuration.md`（本地最低配置段、相关文件表）；`configuration-three-tier.md`（Mermaid ENVF 节点、前端构建期段落）；README 一键启动第 2 步文案；`publicRuntime.ts` 头注释；`project-structure.md` 根树登记 `.env.production`。

## 修改原因

响应用户明确要求：前端硬编码/散置的关键配置统一到根目录一个 env——此为其三层模型「env 是前后端唯一读取入口」的最后一块拼图（此前审计中的偏差 B）。

## 影响范围

前端构建配置与 env 文件布局、LocalDev 启动流程、配置文档。**行为不变性**：生产构建值与原 `frontend/.env.production` 逐项一致（VITE_BACKEND_URL 同值；VITE_BASE_URL 显式 `./` 与原兜底一致）；本地开发根 `.env`（由 .env.example 创建）自带 localhost 默认，与原 frontend/.env.local 等效；后端 loader 不读 `.env.production`，零影响。风险点：本地曾手改 `frontend/.env.local` 自定义值的开发者需把自定义迁至根 `.env`（LocalDev 会删除旧文件并提示）。

## 优化解决方案

安全边界依托 Vite 官方机制（envPrefix 白名单注入）而非人工约定：根 `.env` 同时承载后端 L1/L3 与前端 VITE_*，客户端只拿得到 VITE_ 前缀——「一个文件、两端消费、按前缀隔离」。门禁脚本 F1/F2 继续守护「唯一 import.meta.env 读取点 + key 全登记」。

## 性能指标

不适用（构建期配置重定位，运行时零变化）。

## 测试方案

- **已验**：ESLint（vite.config.js / publicRuntime.ts）零告警；`node --input-type=module --check` 语法通过；`CheckConfigRegistry.py` 七项全绿；`git check-ignore` 确认根 `.env.production` 可提交；全库旧路径话术（frontend/.env.local 生成语义）清零。
- **待实机**（沙盒 rollup 平台二进制不兼容无法起 vite）：
  1. `LocalDev.bat` 启动 → 旧 `frontend/.env.local` 被清理，`npm run dev` 下 `import.meta.env.VITE_BACKEND_URL` 来自根 `.env`（改根文件热重启生效）；
  2. `npm run build` → 产物请求指向根 `.env.production` 的域名；`grep -r "SMTP_\|SUPER_USER\|CLIENT_SECRET" dist/assets` 为空（验证前缀隔离）；
  3. CI Pages 构建正常（`.env.production` 已随仓库提交）。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\vite.config.js
- D:\Dev\GitHub\WebGIS-Dev\.env.production（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\.env.production（降为存根）
- D:\Dev\GitHub\WebGIS-Dev\frontend\.env.example
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\config\publicRuntime.ts（头注释）
- D:\Dev\GitHub\WebGIS-Dev\LocalDev.bat
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Architecture\configuration-three-tier.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md（根树登记 .env.production）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.19 三处 + 表行 + 一键启动文案；V3.4.18 已被并行属性表任务占用，本任务顺延）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.19 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-frontend-env-unify-root.md（本日志）

> 备注：未执行任何 git 操作，提交由用户决策。
