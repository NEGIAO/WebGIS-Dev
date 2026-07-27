# 2026-07-26 TOC 主题变量与品牌令牌合流（toc-theme-token-merge）

- **日期和时间**：2026-07-27 04:05
- **所属版本**：V3.4.50
- **变更类型**：UI 治理（执行《下一步修复与优化规划》P2-3；附 P2-1 误判撤销）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | `toc-theme.css` 的 `--toc-*` 体系仅主色/按钮等少数项映射 brand 令牌，约 24 个绿色系取值为独立硬编码且蓝主题覆盖块未覆盖——切蓝主题后 TOC 的上传区、徽章、边框、页签描边、卡片标题等全部残留绿色 |
| 根本原因 | TOC 主题文件早于全局令牌治理建立，蓝主题覆盖块只手工补了最显眼的 10 项 |
| 受影响的模块 | TOC 全家（图层目录/上传区/页签/徽章/属性表分隔线等引用 --toc-* 的组件），零组件级改动 |
| 解决方案 | 绿色系独立值改为 `--brand-*` 派生（rgba(--brand-primary-rgb, α) 或直接引用），绿主题近似原值、蓝主题自动联动；既有蓝覆盖块保留（优先级不受影响） |

## 修改内容

1. **24 项合流**（均在 `:root` 块，蓝覆盖块零改动）：
   - 主色底：`--toc-primary-bg/-hover` → `rgba(--brand-primary-dark-rgb, 0.06/0.12)`；
   - 文本：`--toc-text-primary`（与 `--text-brand-dark` 同值，直接引用化）、`--toc-card-title/-dark`；
   - 边框族：`--toc-border-light/medium/active`、`--toc-header-border`、`--toc-tab-border`、`--toc-tab-active-border`；
   - 徽章四件套：`--toc-badge-border/-hover/-bg-hover/-bg-active`；
   - 上传区 11 项：border/bg/drag-border/drag-bg/icon/progress-border/progress-bg/done-border/done-bg（error 两项为 danger 语义保留）。
2. **文件头新增合流约定注释**：绿色系取值一律派生 brand 令牌；蓝覆盖块仅保留无法 rgba 派生的渐变项；危险色/中性灰为主题无关值。
3. **刻意保留**：`#5f7e6d/#88a088/#4e6656`（低饱和灰绿文本，蓝主题下视觉中性）；`#468a46/#56ab56`（reverse 按钮/input-focus，蓝覆盖块已接管）。
4. **规划 P2-1 撤销**：扫描证实 Routing 三面板（BusPlanner/DrivingPlanner/MapPointPickerCard）非浮层面板家族——无 `rgba(255,255,255,0.95)` 框架签名、无绿色家族残留，蓝色系为驾车/选点功能语义色；硬套 `--panel-*` 属语义错误，规划文档已标注撤销。

## 修改原因

用户指示"继续"，按规划顺位执行；P2-1 经证据推翻假设后如实更正而非硬改。

## 影响范围

- 视觉：绿主题近似原值（rgba 派生与原 hex 色差在 1~3 灰度级）；蓝主题下 TOC 上传区/徽章/边框/页签首次完整联动
- 结构/组件：零改动（纯 CSS 变量文件）

## 优化解决方案（实施步骤）

1. 全文审读 toc-theme.css，把变量分为四类：已映射 / 蓝已覆盖 / 绿色残留（本轮目标）/ 主题无关。
2. 逐项配近似 brand 派生值（背景类用低 α rgba、描边类用中 α、实色用 brand 变量）。
3. 合流后绿色 hex 扫描复核，逐个确认剩余项的保留理由。

## 性能指标

- 无（CSS 变量解析开销不变）。

## 测试方案

- **静态验证（已执行，通过）**：CSS 花括号配平 2/2；引用的 `--brand-primary-rgb/--brand-primary-dark-rgb/--brand-primary/--brand-primary-dark/--brand-primary-lighter/--text-brand-dark` 均在 theme.css 定义；剩余绿色 hex 扫描 5 项全部有保留理由。
- **实机复核项（并入 P0 回归清单）**：① 绿主题 TOC 观感与改前无感知差异；② 切蓝主题：图层目录上传区（拖拽框/图标/进度/完成态）、要素徽章、页签激活描边、卡片标题全部变蓝无残绿；③ 属性表/图层树边框正常。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\assets\toc-theme.css`
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-next-bugfix-optimization-plan.md`（P2-1 撤销 + P2-3 完成标注）
- `D:\Dev\GitHub\WebGIS-Dev\README.md` / `Docs\Guide\CHANGELOG.md`（版本 V3.4.50）
- 本日志（新增）
