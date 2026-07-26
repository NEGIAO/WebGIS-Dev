/**
 * ⚠️ DEPRECATED 转发壳：请勿在新代码中 import 本文件。
 * 直接 `import ... from './backend'`（目录 index）语义相同——本文件删除后
 * 既有的 `api/backend` 无后缀导入会自动解析到 backend/index.js，零改动兼容。
 * 待执行清理（用户 git 操作）：git rm frontend/src/api/backend.js
 *
 * 后端 API 客户端 — barrel re-export
 *
 * 原 881 行已按业务域拆分到 backend/ 子目录：
 *   backend/client.js    — axios 实例、拦截器、错误处理
 *   backend/auth.js      — 鉴权接口
 *   backend/location.js  — 地理编码/定位接口
 *   backend/weather.js   — 天气接口
 *   backend/routing.js   — 路线规划接口
 *   backend/agent.js     — AI Agent 接口
 *   backend/statistics.js — 统计/消息/公告接口
 *   backend/admin.js     — 管理后台接口
 *   backend/spatial.js   — 空间分析接口
 *
 * 所有原有 import 路径保持不变。
 */

export * from './backend/index';
export { default } from './backend/index';
