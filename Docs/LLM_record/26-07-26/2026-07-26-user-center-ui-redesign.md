# 2026-07-26 账号中心 UI 重设计（user-center-ui-redesign）

- **日期和时间**：2026-07-26 23:40
- **所属版本**：V3.4.28
- **变更类型**：前端 UI 重设计（1 壳 + 3 Tab；逻辑零改动，Security/Preferences/壳的模板零改动）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | 用户反馈账号中心"不太好看，也不是很实用"。实用性：内容区被固定 `height: 210px`，总览/安全/偏好所有内容都挤在小窗中滚动，信息几乎不可读；观感：暗色翡翠玻璃拟态基底样式 + 浅色薄荷覆盖样式两层叠罗汉（同一选择器先深后浅二次定义），颜色浑浊、维护混乱，clip-path 八角切角风格过时，配额只有文字无可视化 |
| 根本原因 | 面板经历过"暗色高级玻璃风"到"浅色薄荷对齐 TopBar"的转向，但转向时未清理旧样式而是整段追加覆盖；内容区高度是早期小面板时代的遗留魔数 |
| 受影响的模块 | FloatingAccountPanel（壳）、OverviewTab、SecurityTab、PreferencesTab；AdminControlPanel/ApiManagementPanel 未动（其引用的 `--acc-*` 变量在壳中保留并映射到主题令牌） |
| 解决方案 | 壳与三个 Tab 全部重写为"单套浅色白卡"视觉语言（与注册页/对话面板同 DNA）；内容区高度自适应视口；Overview 信息层级重排 + 配额进度条可视化 |

---

## 修改内容

1. **FloatingAccountPanel.vue（仅重写 `<style scoped>`，模板/脚本零改动）**
   - 内容区：`height: 210px` → `min-height: 280px; max-height: min(58vh, 540px)`；移动端 52vh；全屏模式 `flex:1` 铺满。
   - 双层样式合并为单套：删除暗色基底段与浅色覆盖段（约 680 行 → 约 520 行）。
   - 头部：品牌渐变横幅 + 经纬网格纹理（::after + mask，与注册页同 DNA）；头像 56px 白框圆角；角色改白胶囊徽章；全屏钮半透明白方钮。
   - 导航：白底 + 下划线式 active（品牌色 3px 圆条），hover 浅品牌底。
   - 面板：白卡 16px 圆角、双层投影；去 clip-path。
   - 页脚：退出钮红描边浅底（原深色红玻璃）。
   - FAB：白底品牌描边胶囊，移除扫光动画与霓虹发光。
   - z-index 接入令牌（`--z-modal-high`）。
   - 兼容性：`--acc-mint-*/--acc-text-*` 变量保留（AdminControlPanel 12 处、ApiManagementPanel 15 处引用），值映射到主题令牌。
2. **OverviewTab.vue（模板 + 样式重写，props/emits 协议不变）**
   - 新增配额进度条：`quotaPercent` computed（limit 为空返回 null → 不限额半透明满条），>80% 时数值与填充转警示橙。
   - 三张统计卡：图标彩底方块 + 19px tabular-nums 大数字。
   - 个人信息紧凑行（12.5px、虚线行分隔）+ 在线状态圆点光环。
   - 全站实时：四项改 2×4 mini 网格（浅底圆角格），管理员联系并入卡尾。
   - 留言板：输入框/发布按钮/留言卡片全部白卡化；空态虚线卡文案优化。
3. **SecurityTab.vue / PreferencesTab.vue（仅重写 `<style scoped>`，模板零改动）**
   - Security：分区标题品牌左条；输入 42px、聚焦时图标联动变色（:focus-within）；OAuth 钮白卡 + Google 蓝/GitHub 黑品牌图标；游客/管理员提示卡由深红玻璃改浅琥珀警示卡。
   - Preferences：偏好项白卡行（hover 描边）；下拉 34px 圆角 9；主题选择卡（选中品牌环）；头像 6 列圆环网格（选中品牌环 + 右下绿色 ✓ 角标）；保存钮渐变主按钮。

## 补记（2026-07-27 00:15 二轮：实用性与观感再打磨）

用户要求"再优化一些，更加实用和好看"。二轮改动（逻辑侧仅新增，无破坏性变更）：

1. **壳（FloatingAccountPanel）**
   - 头部按钮区改纵向双钮：新增「刷新数据」（`handleManualRefresh` 并发拉齐统计/实时/留言，isLoadingCenter 期间旋转禁用）+ 原全屏钮。
   - 头部下方新增**速览条**：三枚白胶囊（`quotaShortText` 剩余配额 / 在线时长 / 全站在线人数），打开面板不滚动即可看到最常查信息。
   - Esc 分级退出：有全屏先退全屏，否则直接关闭面板（原先 Esc 只处理全屏）。
2. **总览页（OverviewTab）**
   - 统计与实时数字全部千分位（`toLocaleString`）；「我的账号」卡标题右侧新增「已陪伴 N 天」徽章（按注册时间推算）。
   - 留言板：作者彩色首字头像（用户名哈希取 6 色板）、时间改相对时间（刚刚/x 分钟前/x 小时前/昨天/日期，title 悬停保留完整时间）、输入 200 字上限 + 计数（剩 20 字内转警示色）、空内容禁用发布。
   - 管理员联系方式改为一键复制按钮（copy → ✓ 1.5s 反馈）。
3. **安全页（SecurityTab）**：当前/新/确认三个密码框各加明文显隐切换（眼睛钮，focus-within 图标联动配色一致）。
4. **修复**：一轮 splice 脚本行尾检测在 heredoc 中转义错误（`'\\r\\n'` 字面四字符恒 False），导致 CRLF 模板被插入 LF 样式块形成混合行尾；本轮将三个 Tab 统一归一为 CRLF 并复查为纯净行尾。

验证：4 文件 compiler-sfc 编译通过、ESLint 零告警、行尾纯净复查通过。

新增验收项：⑨ 头部刷新钮转圈并 toast；⑩ 速览条三枚胶囊数值正确；⑪ Esc 两级退出；⑫ 密码显隐切换；⑬ 留言相对时间/彩色头像/字数计数；⑭ 管理员联系点击复制出 ✓。

## 修改原因

用户明确反馈账号中心"不好看、不实用"。210px 固定高是实用性硬伤；双层样式与过时装饰是观感硬伤。

## 影响范围

- 账号中心弹层（FAB、面板壳、总览/安全/偏好三页）视觉与信息布局
- 不影响：全部业务逻辑（统计加载/改密/OAuth 绑定/偏好保存/头像/留言）、props/emits 协议、Admin 与 API 管理面板、后端

## 优化解决方案（实施步骤）

1. 通读壳组件确认模板结构可复用 → 决定"只换样式不动模板"的低风险路径（壳/Security/Preferences）。
2. Overview 信息层级重排需动模板 → 单独重写并保持 props/emits 协议逐字段对齐。
3. 样式拼接采用行尾自适应脚本（壳为 CRLF、两个 Tab 为 LF，分别保持）。
4. 类名覆盖复查脚本比对模板 class 与样式选择器，补齐遗漏的 `.message-time`。

## 性能指标

- 纯样式与模板重排，无运行时开销变化；壳样式行数 -~160 行，删除了持续运行的 FAB 扫光动画（微降常驻合成开销，未量化）。

## 测试方案

- **静态验证（已执行，全部通过）**：4 个文件 compiler-sfc（parse + compileScript + compileStyle）编译通过；`npx eslint` 对壳 + tabs 目录零告警；模板类名 vs 样式选择器覆盖复查（排除绑定表达式噪音后无缺失）。
- **手动验收清单（建议执行）**：① 点击 FAB 打开面板：头部品牌横幅 + 网格纹理、角色徽章正确；② 总览页统计卡/配额进度条（游客受限额度应显示百分比，管理员不限额显示半透明满条）；③ 内容区高度随视口自适应，不再是 210px 小窗；④ 安全页：改昵称/改密/OAuth 绑定钮观感与交互正常；⑤ 偏好页：主题切换选中环、头像选择勾角标、保存按钮；⑥ 管理员登录检查 Admin/API 两个面板未受影响（--acc-* 变量兼容）；⑦ 全屏模式与 <768px 视口布局；⑧ 蓝色主题联动。
- 预期结果：功能与改版前完全一致，信息可读性显著提升，视觉与注册页/对话面板统一。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue`（仅样式）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\tabs\OverviewTab.vue`（模板+样式重写）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\tabs\SecurityTab.vue`（仅样式）
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\tabs\PreferencesTab.vue`（仅样式）
- `D:\Dev\GitHub\WebGIS-Dev\README.md`（版本升至 V3.4.28，版本表保留最新三条）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\Guide\CHANGELOG.md`（新增 V3.4.28 条目）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-user-center-ui-redesign.md`（本日志，新增）
