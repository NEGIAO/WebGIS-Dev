# 后端输入校验与边界修复

- **日期与时间**：2026-08-01 17:30
- **任务等级**：L2
- **问题分析**：
  - 核心症状：sqlite_recovery 无路径约束、location IP 输入无格式校验
  - 根本原因：recover_sqlite_database 接受任意路径无边界检查、ip-locate 接口直接信任用户输入的 IP 字符串
  - 受影响模块：数据库恢复、地理定位服务

- **修改内容**：
  1. **sqlite_recovery 路径遍历防护**：`recover_sqlite_database` 新增 `allowed_base_dir` 参数，调用时校验 `db_path` 位于允许目录内，防止未来被误用时导致路径遍历
  2. **location IP 输入验证**：`ip-locate` 接口在用户提供 IP 时使用 `ipaddress.ip_address()` 校验格式，非法格式返回 400
  3. **确认邮件服务安全**：`email_service.py` 的 subject 使用固定 dict 映射 + 数字 code，无注入风险（已确认）
  4. **确认验证码系统安全**：`verification.py` 使用 `secrets.randbelow` 生成验证码，有 30s 节流 + 每日上限 + 尝试次数限制（已确认）
  5. **确认 CORS 配置驱动**：`app.py` 的 CORS 来源由 `CORS_ALLOWED_ORIGINS` 环境变量控制，生产环境通过 HF Variables 配置（已确认）

- **影响范围**：数据库恢复安全、地理定位输入校验

- **测试方案**：
  - **Agent 已执行**：代码审查确认逻辑正确
  - **待用户实机验证**：生产环境配置 CORS_ALLOWED_ORIGINS 后验证跨域正常

- **变更文件清单**：
  - `backend/utils/sqlite_recovery.py` — 新增 allowed_base_dir 路径遍历防护
  - `backend/api/auth/db.py` — 调用 recover_sqlite_database 时传入 allowed_base_dir
  - `backend/api/location.py` — ip-locate 接口添加 IP 格式校验

- **遗留与风险**：CORS 生产配置需用户在 HF Variables 设置 `CORS_ALLOWED_ORIGINS`
