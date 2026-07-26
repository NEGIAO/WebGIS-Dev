# 前端公开配置收敛（配置架构计划·阶段 4 完成）

## 日期和时间

2026-07-26 18:41（北京时间）

## 事件逻辑链条分析

- **核心症状**：clone 用户即使改了 `VITE_BACKEND_URL`，底图链路仍会请求原作者的 HF Space——`basemapConfig.ts` 与 `sourceDescriptors.ts` 内 12 处瓦片 URL 硬编码 `https://negiao-webgis.hf.space`（高德纠偏、Google 代理、ships66 自托管瓦片）；`tileLifecycle.ts` 的代理基址回退链终点也是该域名；env 读取散落 4 处文件各自 `import.meta.env`。
- **根本原因**：底图源定义是纯常量文件，历史上直接把「作者生产后端」写死进 URL；无统一的前端基址派生模块，env 消费无单点。
- **受影响模块**：底图/瓦片链路（OL + Cesium 双引擎共用的两份源定义）、瓦片代理生命周期、axios 客户端、前端 env 模板、后端公开配置端点。
- **解决思路**：按计划「先改 factory/基址拼接，再扫残留域名」——新建 `src/config/publicRuntime.ts` 单点派生 + 4 个拼接 helper，全部消费点改引 helper，最后 grep 验证 src 域名清零。

## 修改内容

1. **新增 `frontend/src/config/publicRuntime.ts`**：导出 `BACKEND_BASE_URL`（`VITE_BACKEND_URL`，缺省 `http://localhost:7860`）、`TILE_PROXY_BASE_URL`（`VITE_TILE_PROXY_BASE_URL` → `VITE_BACKEND_URL` → localhost 链式回退）、`TILE_PROXY_MODE`（缺省 fallback），及 `backendUrl()/tileProxyUrl()/gcj2wgsProxyUrl()/backendTilesUrl()` 四个 URL 拼接函数（含尾斜杠规整）；文件头注明「业务代码不硬编码域名、不散落 import.meta.env」规则。
2. **`composables/tileSource/tileLifecycle.ts`**：删除本地 env 读取与 HF 域名兜底，改为从 publicRuntime 导入 `TILE_PROXY_BASE_URL/TILE_PROXY_MODE`（回退链终点由原作者 HF 变为 localhost，clone 安全）。
3. **`api/backend/client.js`**：`BACKEND_BASE_URL` 改由 publicRuntime 提供（原地保留 re-export，下游 SSE/axios 引用不变）。
4. **`constants/basemap/basemapConfig.ts` 与 `constants/basemap/sourceDescriptors.ts`**（两份对称，各 6 处共 12 处）：高德 wprd02 注记 / webst01 影像 / webrd01 矢量三条 gcj2wgs 纠偏、Google mt0 地形注记纠偏 → `gcj2wgsProxyUrl(...)`；Google mt1 卫星 → `tileProxyUrl(...)`；ships66 → `backendTilesUrl(...)`；各文件头部加「禁止硬编码域名」注释。
5. **后端 `app.py` 新增 `GET /api/config/public`**：复用阶段 2 `config.public.build_public_config()`，返回统一响应格式（code/message/data），内容为非密公开配置与功能可用性布尔，无 secret 明文。
6. **env 模板**：`frontend/.env.production` 头部加「clone 必改 `VITE_BACKEND_URL`」警示、根清单交叉链接与可选 `VITE_TILE_PROXY_BASE_URL/MODE` 登记；`frontend/.env.example` 补生产构建与 publicRuntime 消费说明。

## 修改原因

执行配置架构计划第 4 步（阶段 4）：验收标准为「clone 用户改 `VITE_BACKEND_URL` 后，API 与代理不再打到原作者 HF」「构建产物中无 secret 字符串」。此前 12 处硬编码使前者不成立。

## 影响范围

底图/瓦片 URL 生成（OL 与 Cesium 双引擎）、瓦片代理兜底、axios 基址、前端构建配置模板、后端公开配置端点。**行为不变性**：作者生产部署由 `.env.production` 提供 `VITE_BACKEND_URL=https://negiao-webgis.hf.space`，构建后所有派生 URL 与改造前逐字节一致；本地开发由 LocalDev.bat 生成 `.env.local` 指向 localhost，同样一致。唯一语义变化：完全未设置 env 时兜底从原作者 HF 改为 localhost（有意为之，防误连）。

## 优化解决方案

单点派生（publicRuntime）+ 语义化 helper（纠偏/通用代理/自托管瓦片三类路径各一函数），消除「同一 URL 前缀 12 处复制」的维护面；新增图源时只写上游地址、不再关心部署域名。`/api/config/public` 为后续运行时下发公开 defaults 预留（本阶段前端暂不消费，避免引入加载时序变更）。

## 性能指标

非性能任务；URL 由构建期常量拼接，运行时零额外开销。

## 测试方案

- **静态**：改动 5 文件 ESLint 通过（typescript-eslint 覆盖 .ts）；`tsc --noEmit` 全项目仅存量错误（cesium 模块类型解析、并行任务的 layerTreeBuilder），本次新增/改动的 4 个 TS 文件零类型错误；`backend/app.py` py_compile 通过。
- **域名残留**：`grep -rn "negiao-webgis" frontend/src`（js/ts/vue）结果为 0。
- **待实机回归**（沙盒无法运行 Windows 安装的 esbuild/vite）：
  1. `npm run build` 后 `grep -r "negiao-webgis" dist/assets/*.js` 应仅出现于 `.env.production` 注入的 `VITE_BACKEND_URL` 常量（作者部署）；改 env 重新构建后应完全消失；
  2. 本地 dev：高德系底图（纠偏）、Google 卫星、ships66 正常加载且请求指向 localhost:7860；
  3. `curl http://localhost:7860/api/config/public` 返回 data.features 布尔集，无明文密钥。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\frontend\src\config\publicRuntime.ts（新增）
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\composables\tileSource\tileLifecycle.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\backend\client.js
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\constants\basemap\basemapConfig.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\constants\basemap\sourceDescriptors.ts
- D:\Dev\GitHub\WebGIS-Dev\backend\app.py
- D:\Dev\GitHub\WebGIS-Dev\frontend\.env.production
- D:\Dev\GitHub\WebGIS-Dev\frontend\.env.example
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\frontend-structure.md（文件树补录 src/config/）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration-architecture-plan.md（阶段 4 状态标注）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.10 三处 + 版本表裁剪至最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.10 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-frontend-public-config-phase4.md（本日志）

> 备注：新增文件仅 `src/config/publicRuntime.ts`，已同步 `frontend-structure.md`；根 project-structure.md 对 frontend 只到 src 层级（指向 frontend-structure.md），无需变更；未执行任何 git 操作，提交由用户决策。
