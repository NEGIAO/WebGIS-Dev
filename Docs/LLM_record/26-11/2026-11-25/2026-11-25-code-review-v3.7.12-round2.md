# 2026-11-25 暂存区 Code Review（V3.7.12 归并 · 第二轮）

- **时间**：2026-11-25 14:36
- **任务**：按用户指令审查暂存区代码、归并版本到 V3.7.12、检查并修复 bug/漏洞

## 版本归并

暂存区原有 V3.7.12 / V3.7.13 两条独立条目。按用户明确选择「归并为 V3.7.12」：

- `Docs/Guide/CHANGELOG.md`：删除 V3.7.13 独立条目，其 6 项内容并入 V3.7.12（现 13 项），
  升级影响注记与合并验证结论一并迁入；归并注记保留「原 V3.7.13」来源说明。
- `README.md`：项目简介当前版本、版本演进表、页脚三处统一为 V3.7.12；演进表删除 V3.7.13 行。
- 代码注释与结构树共 11 文件 14 处 `V3.7.13` → `V3.7.12`；历史过程日志按项目约定保留不改写。

## Code Review 发现与修复

### 高危 1：游客 username 与注册用户名撞名可跨身份撤销会话

`guest_<id>` 作为游客 username 后，注册校验仍允许 `guest_1` 这类名字。
`session.py::_delete_sessions_by_username_sync` 仅按 username 删行，注册用户注销会连带
撤销同名游客的全部会话；`admin.py` 按 `guest_` 前缀识别游客也会混淆。

**修复**：
- `constants.py::_validate_register_payload` 禁止 `guest_` 前缀注册（400）。
- `user.py::_generate_account_username_sync` 对 OAuth 昵称生成的 base 做前缀改写，
  避免 `guest_xxx` 进入 username 命名空间。

### 高危 2：迟到的 401 清掉用户刚重建的会话

`client.ts` 响应拦截器任何 401 都调用 `markSessionExpired()`（无条件清空登录态与
guest token）。用户重新登录后，前一个超时请求的迟到 401 会立即踢掉新会话。

**修复**：请求拦截器把实际使用的 auth token / guest token 快照到 config；401 分支比较
当前凭证，仅当仍一致时才清理并派发过期事件，否则仅按错误处理返回。

### 中危：在线镜像游客地理信息查不到

`statistics.py::_mirror_identity_from_db_sync` 按 `username` 列匹配 `guest_uid` 取地理信息。
游客 username 改为 `guest_<id>` 后该查询必然落空，管理员在线表 IP 城市/坐标丢失。

**修复**：游客改按 `visit_tracking_events.guest_uid` 列（已有索引）查询，账号仍按 username；
旧库/测试内存库缺列时回退 username 匹配，不阻断镜像刷新。

## 验证

- 后端全量 pytest：171 passed / 1 既有异步标记失败（`test_webhook_helpers`，与本版本无关）。
- 前端 `vue-tsc --noEmit`：0 错误。
- 门禁：CheckConfigRegistry / CheckDomainDeps / CheckStructureTree(751/751) / CheckVueParadigm 全绿。
- 安全修复隔离验证：`guest_` 前缀注册被 400 拦截、普通用户名正常、OAuth 生成改为 `user_` 前缀。
- 未执行任何 Git 写操作（add / commit / push / stash / reset 均未执行）。

## 遗留与风险

- 过程日志保留各自当时的版本号表述，按 `Force_command` §4 不迁移、不改写。
- `expired_sessions` 归档表保留旧 hex username 属预期（审计快照不改写）。
- 存量游客会话的 username 懒迁移在对应游客下次访问时完成，非即时全量。
