# 底图下载节点停用：恢复「无下载功能 → 404 明确报错」的预期行为

## 基本信息

| 项 | 内容 |
|---|---|
| 日期与时间 | 2026-11-03 18:20 |
| 任务等级 | **L2**（部署面配置变更 ×2 + 文档；零代码改动） |
| 版本 | **V3.6.40**（整合发布，本项并入 CHANGELOG §7） |
| 触发方式 | 用户报告：下载底图按钮「以前弹 404（对，后端已无该功能），现在能提交任务但永远拿不到数据」 |

## 问题分析（全部实测取证）

| 证据 | 结果 |
|---|---|
| `deploy/.env:156` / `deploy/.env.local:22` | 均配置 `VITE_DOWNLOAD_SERVICE_URL=https://gis.negiao.cn:8443`（git log：**V3.6.28 引入**） |
| `publicRuntime.ts` 语义 | 该值非空且 ≠ 主后端基址 → `USE_REMOTE_SERVICE = true` → 请求直达独立节点，不经过已删模块的 HF 后端 |
| `curl /health` | **200 OK**（节点存活） |
| `curl GET /api/download/tasks` | 200 JSON，含 `task_id: 0af7f374…`、`status: cancelled`、`progress: 5.0`、`created_at: 2026-11-03T17:36`（用户当天提交的真实任务） |

「能提交任务」不是前端代码回归（错误拦截器改动不影响成功/失败分流），而是节点近期从不可达变为存活。节点「半死」：health 与任务 CRUD 正常，瓦片抓取推进不了。节点代码在独立仓/VPS，本仓库不可修。

## 修改

`deploy/.env` 与 `deploy/.env.local` 的 `VITE_DOWNLOAD_SERVICE_URL` 清空 + 注释记录停用原因与一键恢复方法。清空后 `downloadAPI = backendAPI` → POST `/api/download/tasks` → HF 后端 404 → 明确报错，恢复用户预期。

## 测试方案

- **Agent 已执行**：`CheckConfigRegistry` 7 项通过（key 未删仅值清空）；`npm run build` 成功；产物 grep `gis.negiao.cn:8443` **0 命中**。
- **待用户实机验证**：底图下载面板提交任务 → 应出现 404/请求失败报错，不再出现「任务已提交」；本地 dev 同验（`.env.local` 已同步）。

## 遗留与风险

1. 节点侧根因（瓦片抓取卡 ~5%）不在本仓库范围，待 VPS 排查；修复后把两处值改回 `https://gis.negiao.cn:8443` 即恢复。
2. `api/download.js` 远端路径成功分支无任务结构校验——节点恢复前应补校验（已登记 TODO）。
3. HF 后端 download 残留 key 5 个（模块已删、key 仍登记）：无害死配置，留配置专项清理。
