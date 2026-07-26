# 配置架构计划收官：阶段 5 收尾 + 阶段 6 门禁（V3.4.13）

## 日期和时间

2026-07-26 18:55（北京时间）

## 事件逻辑链条分析

- **核心症状**：三层配置架构主体（阶段 0–4）已落地，但缺三块收尾——①部署者没有一份可直接复制的「HF Secrets 最小集合」清单（需自行翻 `.env.example` 摘抄）；②「新增 key 必须先登记」的门禁只是文档约定，无自动化检查，随时可能回潮（本次自测即抓到 3 处存量遗漏）；③`backend/README.md` 仍保留 super_admin 手工 SQL 建号的整段过时说明与 23 处过时端口 8000，与现行 admin + L3 `SUPER_USER` 机制双写冲突。
- **根本原因**：约定型规范缺执行器；历史文档未随认证/端口演进同步。
- **受影响模块**：部署文档、后端 README、配置登记链路（catalog ↔ 根 .env.example ↔ 前端 VITE 消费）。
- **解决思路**：清单落档（与 L3 段一一对应）→ 写 AST 级门禁脚本并以当前仓库自测 → 修复自测抓到的遗漏 → 清理过时双写。

## 修改内容

1. **新增根目录 `CheckConfigRegistry.py`（登记门禁扫描）**：
   - [B1] 后端业务代码裸 `os.getenv/os.environ`（AST Attribute 精确匹配，杜绝注释/文档串误报；仅 `backend/config` 包豁免）
   - [B2] `get_str/get_int/get_float/get_bool/get_effective_str` 字面量 key 未登记 catalog（`SPACE_ID` 等平台注入白名单）
   - [B3] catalog 全 key 必须出现在根 `.env.example`（含注释态 `# KEY=`）
   - [B4] `.env.example` 非 `VITE_`/`L2_` 孤儿 key 反向校验
   - [F1] 前端散落 `import.meta.env`（仅 `src/config/publicRuntime.ts` 豁免；`vite.config.js` 允许读但 key 仍须登记）
   - [F2] 前端使用的 `VITE_*` 未登记根清单
   - [F3] 前端硬编码原作者部署域名
   - 违规 exit 1；`-q` 只报违规。用法：仓库根 `python CheckConfigRegistry.py`。
2. **门禁自测修复 3 处存量遗漏**：根 `.env.example` L3 段补 `# AMAP_KEY=`、`# GAODE_KEY=` 兼容名登记；`frontend/src/api/download.js` 散落读取 `VITE_DOWNLOAD_REQUEST_TIMEOUT` 收敛为 `publicRuntime.DOWNLOAD_REQUEST_TIMEOUT_MS`（publicRuntime 新增该导出，默认 2000000ms 语义不变）。
3. **`configuration.md` 新增「HF Secrets 最小集合」**：按功能分组（admin 必配 / OAuth / SMTP / Agent / 高德 / Supabase / LOG）的可复制 key 名清单，与根 `.env.example` [L3] 段一一对应；附 Variables（非密）建议与两条自检路径（启动日志「[配置] [L3]」行、admin 控制台「环境密钥状态」卡片）。阶段 5 的 compose env_file 注入与 LocalDev 自动生成根 `.env` 已由 V3.4.11（用户会话）完成，本次交叉引用后阶段 5 闭环。
4. **`backend/README.md` 过时双写清理（阶段 6）**：
   - 「超级管理员」段改写：账号固定 `admin`、密码 L3 `SUPER_USER`、dev 兜底 123456、经统一 loader 读取、admin/user 禁绑 OAuth；
   - 删除「管理员账号 SQL 初始化」整段（INSERT super_admin 示例），替换为无需 SQL 的机制说明与根清单/配置指南链接；
   - 管理员登录 curl 示例改 `admin`；全文 23 处 `localhost:8000` → `localhost:7860`（实际服务端口）。
5. **文件树登记**：`project-structure.md` 根级补 `CheckConfigRegistry.py`（并补录此前漏登记的 `UpdateReadmeTree.py`）。

## 修改原因

执行配置架构计划第 5 步收尾与阶段 6：把「清单统一、读取收敛」的成果用自动化门禁固化，防止后续开发回潮；消除会误导部署者的过时管理员说明。

## 影响范围

部署/配置文档、后端 README、根 `.env.example`（注释登记行）、前端 download API 超时常量来源（值不变）、新增独立脚本（不参与运行时）。**不改变**任何后端运行逻辑与接口行为。

## 优化解决方案

门禁用 AST 而非纯文本 grep：`os.getenv` 只匹配真实代码节点（constants.py 文档字符串提及不误报）；helper key 只取字面量首参（变量传参如 `RUNTIME_CONFIG_ALLOWED_ORIGINS_ENV` 交由 B3/B4 清单侧兜住）。脚本零第三方依赖（直接 import `config.catalog`，其为纯标准库），Windows 控制台做 UTF-8 reconfigure 兜底。

## 性能指标

非性能任务。门禁全仓扫描本地约 1–3s（沙盒挂载盘约 30s），不影响运行时。

## 测试方案

- **门禁自证**：首轮运行抓出 3 处真实违规（B3×2 + F1×1），修复后重跑 7 项全绿（exit 0），验证脚本查得出、修得对；统计 catalog 55 key、前端 VITE_ 5 个。
- **类型/语法**：全项目 `tsc --noEmit` 中本次改动的 `publicRuntime.ts`/`download.js` 零错误（全局仅存量 cesium 类型与并行任务遗留）；脚本自身 py 运行通过即语法通过。
- **文档一致性**：`grep super_admin`（排除澄清句/保留名/维护日志）结果为空；`configuration.md` HF 清单 key 与 `.env.example` [L3] 段逐一比对一致。
- **待实机**：Windows 下 `python CheckConfigRegistry.py` 应同样全绿；可选将其加入 CI 或提交前检查。

## 修改的文件路径

- D:\Dev\GitHub\WebGIS-Dev\CheckConfigRegistry.py（新增）
- D:\Dev\GitHub\WebGIS-Dev\.env.example
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\config\publicRuntime.ts
- D:\Dev\GitHub\WebGIS-Dev\frontend\src\api\download.js
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration.md
- D:\Dev\GitHub\WebGIS-Dev\backend\README.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\project-structure.md
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\configuration-architecture-plan.md（阶段 5/6 状态标注）
- D:\Dev\GitHub\WebGIS-Dev\README.md（版本 V3.4.13 三处 + 版本表裁剪至最新三条）
- D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md（V3.4.13 条目）
- D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-config-plan-phase5-6-gatekeeper.md（本日志）

> 备注：新增文件已同步 project-structure.md；未执行任何 git 操作，提交由用户决策。
