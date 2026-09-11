# L1：HF 后端恢复，应急游客模式关闭

- **日期与时间**：2026-09-11（UTC）
- **任务等级**：L1 微改（配置值 + 文案，无版本号）
- **背景**：HF Space 后端恢复可用，按 `deploy/.env` 既有注释"后端恢复后置 0 重建"执行恢复。
- **改动**：
  1. `deploy/.env`：`VITE_EMERGENCY_GUEST_MODE` 1 → 0（生产构建恢复正常登录流程；
     `router/index.js` 与 `useAuthStore.ts` 均为 flag 驱动，无需改代码）。
  2. `deploy/.env.local`：同上 1 → 0（本地无后端调试如需免登录可随时改回 1）。
  3. `README.md` 在线演示行：去掉"（后端挂了，暂时应急通道）"；深链
     `ut=guest` 访客直达参数保留（游客是正式登录方式，演示入口更顺）。
- **未改动**：后端零改动；`catalog.py`（key 已登记，仅值变更）；版本号（L1 不 bump）。
- **验证**：`CheckConfigRegistry.py` 全绿；构建不跑（纯 env/文案变更，CI push 后自动构建验证）。
- **待用户操作**：commit + push，CI 重建后前端恢复登录页；如曾在管理后台发过停服顶部公告，
  需手动撤下（DB 侧，仓库改不到）。

## 追查 492ca839（9-03 封号应急提交）全量恢复

- **恢复执行**：
  1. `LandingView.vue` 3 处 `to="/home"` → `to="/register"`（导航/hero/CTA 回登录注册页）。
  2. `client.js` 删除后端不可达负缓存三段（声明/请求拦截快速失败/响应拦截标记）；
     正常时期单次网络抖动不应触发 30s 请求熔断，axios 超时机制足够。
  3. `publicRuntime.ts` flag 缺省 `|| '1'` → `|| '0'`（注释同步）：缺 env 的构建
     不得静默进入免登录旁路；`catalog.py` default 同步 "0"。
  4. 前序已恢复：`deploy/.env` + `.env.local` 置 0、README 演示行去括号（深链保留）。
  5. flag 读取代码（router/useAuthStore）与 key 登记保留：机制本身是批准的未来应急手段。
- **明确拒绝恢复（§11 高于一切，用户口头要求也不得执行）**：
  `backend/api/keepalive.py`、启动器挂载与 allowlist 回加、`Docs/Architecture/keepalive-hf-space.md`、
  Dockerfile cron/sudo/keepalive_send.sh、compose 保活注释、README/目录树保活链接——
  保活正是本次封号原因，再犯不再复审。
- **不动作**：`d68fa386`（仅改保活对端域名，随模块删除已失效）；`traffic.json`（自动生成）；
  两份 9-01 日志（历史记录）。
- **验证**：残留符号 grep 零命中；ESLint ✅；`npm run build` ✅；`tsc --noEmit` ✅；
  双门禁 ✅（catalog 124 key）。构建产物确认走正常登录链路需用户上线后实测。
