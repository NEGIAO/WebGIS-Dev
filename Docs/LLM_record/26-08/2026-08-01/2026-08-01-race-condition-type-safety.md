# 前端 Race Condition 与类型安全修复

- **日期与时间**：2026-08-01 17:00
- **任务等级**：L2
- **问题分析**：
  - 核心症状：playerController 存在双重决议风险、CameraSystem 使用 as any 绕过类型检查、PhysicsSystem 访问 Cesium 私有字段、ensureCesiumLoaded 的 Promise 锁清空时机不明确
  - 根本原因：事件监听器命名混淆（变量名 onReady/onErr 实际是 remove 函数）、弹簧阻尼循环使用字符串属性访问 + as any、未声明接口直接访问私有字段、Promise 锁在 finally 中无条件清空
  - 受影响模块：player-controller（角色漫游系统）

- **修改内容**：
  1. **playerController.waitForModelReady**：重命名变量为 offReady/offErr（正确反映 remove 函数语义），添加 `settled` 守卫防止双重决议
  2. **CameraSystem.springTarget**：消除 8 处 as any  cast，改为分量级运算（提取 cur.x/y/z、dest.x/y/z、v.x/y/z 到局部变量，计算后回写）
  3. **PhysicsSystem 地形采样**：定义 `TerrainProviderWithBottomLevel` 显式接口，替代 `(provider as any)._bottomLevel`，文档化私有 API 依赖
  4. **ensureCesiumLoaded Promise 锁**：将 `_cesiumLoadPromise = null` 从 finally 移入 catch，明确语义：仅失败时清空锁（允许重试），成功时 isCesiumLoaded 门控后续调用

- **影响范围**：PlayerController 角色漫游系统、Cesium 地形采样

- **测试方案**：
  - **Agent 已执行**：代码审查确认逻辑正确
  - **待用户实机验证**：3D 模式下角色加载/地形采样正常

- **变更文件清单**：
  - `frontend/src/domains/cesium/modules/player-controller/playerController.ts` — waitForModelReady 双重决议防护
  - `frontend/src/domains/cesium/modules/player-controller/systems/CameraSystem.ts` — springTarget 消除 as any
  - `frontend/src/domains/cesium/modules/player-controller/systems/PhysicsSystem.ts` — _bottomLevel 安全访问
  - `frontend/src/app/HomeView.vue` — ensureCesiumLoaded Promise 锁语义修正

- **遗留与风险**：PhysicsSystem 仍依赖 Cesium 私有字段 `_bottomLevel`，版本升级时可能失效（已用显式接口文档化风险）
