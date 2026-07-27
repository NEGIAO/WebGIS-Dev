# 2026-07-26 P0 静态打靶：两项预判 bug 证实与修复（p0-static-bugfixes)

- **日期和时间**：2026-07-27 02:50
- **所属版本**：V3.4.41（原拟 V3.4.40，与并行会话「Phase 1 速胜三项」撞号，按交接坑清单规则顺延）
- **变更类型**：bug 修复（按《下一步修复与优化规划》P0 执行；实机通道未就绪，先完成可静态证实项）

---

## 事件逻辑链条分析

| 环节 | 内容 |
|------|------|
| 核心症状 | 规划文档 P0 表中两项预判 bug：① 偏好设置的默认底图下拉包含 `custom`/`local_tiles_preset`，用户选中保存后刷新可能底图白屏（custom 无配套 URL 上下文）；② 账号中心全屏层级由原 `z-index:3000` 在令牌化时降为 `--z-modal-high(2200)`，可能被同层浮层遮挡 |
| 根本原因 | ① 偏好下拉直接复用全量 `BASEMAP_OPTIONS`，未排除依赖上下文的特殊 preset；2D 侧 `getLayerIndexById` 校验拦不住（custom 是合法注册 id），3D 侧 `URL_LAYER_OPTIONS.includes('custom')` 同样放行；② V3.4.14 z-index 令牌化时 3000 就近映射到 2200 档，丢失了"整屏覆盖层压过一切模态"的语义——扫描证实与 `LayerControlPanel`、`TopBar` 弹层、`HomeView`（还带 `!important`）三处同层 |
| 受影响的模块 | 偏好设置链路（选择入口 + 2D/3D 消费端）、账号中心全屏模式、theme.css 层级体系 |
| 解决方案 | ① 双保险过滤；② 新增层级档位还原语义 |

## 修改内容

1. **偏好底图特殊 preset 过滤（双保险）**
   - `useUserPreferencesStore.ts`：新增 `PREFERENCE_EXCLUDED_BASEMAPS`（custom/local_tiles_preset）与导出函数 `isBasemapPreferenceSelectable(presetId)`；`readCachedPreferredBasemap()` 读取时过滤——**已存脏值的用户刷新即免疫**，2D/3D 两个消费方零改动自动生效。
   - `FloatingAccountPanel.vue`：`basemapPreferenceOptions` 计算属性过滤两项，选择入口不再出现（防再存）。
2. **z-index 整屏覆盖档**
   - `theme.css`：层级令牌新增 `--z-overlay-top: 2400`（注释注明语义：整屏覆盖层需压过全部模态）。
   - `FloatingAccountPanel.vue`：`.floating-account-manager.is-fullscreen` 由 `--z-modal-high` 改用 `--z-overlay-top`。

## 修改原因

执行规划文档 P0；Chrome 扩展未连接（实机项待用户起 dev server 后进行），先落地可静态证实的两项。

## 影响范围

- 偏好设置的底图选择与还原链路（2D + 3D）；账号中心全屏层级
- 不影响：底图正常切换（custom 仍可在图层控制中手动使用）、其余 z-index 层级

## 优化解决方案（实施步骤）

1. 静态证实：确认偏好下拉数据源为全量 BASEMAP_OPTIONS；grep 扫描 `>=2200` 层级使用点找到三处同层浮层。
2. 修复点选在 store 读取函数（单点覆盖两端消费方 + 脏值免疫），入口过滤为第二道防线。
3. 层级修复走新增档位而非改回魔数，保持令牌体系完整。

## 性能指标

- 无性能影响（一次 Set 查询/一档 CSS 变量）。

## 测试方案

- **静态验证（已执行，全部通过）**：FloatingAccountPanel compiler-sfc 编译、store TS transpile、theme.css 括号配平与新令牌存在性、ESLint 零告警；过滤逻辑断言 4/4（可选 id 放行 / custom 拒绝 / local_tiles_preset 拒绝 / **已存脏值 custom 读取返回空串**）。
- **实机复核项（并入 P0 回归清单）**：① 偏好下拉不出现两个特殊项；② 曾保存 custom 的账号刷新后底图正常回退；③ 全屏账号中心不被图层控制面板/TopBar 弹层遮挡。

## 修改的文件路径

- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\stores\useUserPreferencesStore.ts`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\components\UserCenter\FloatingAccountPanel.vue`
- `D:\Dev\GitHub\WebGIS-Dev\frontend\src\assets\theme.css`（新增 --z-overlay-top）
- `D:\Dev\GitHub\WebGIS-Dev\Docs\LLM_record\26-07-26\2026-07-26-next-bugfix-optimization-plan.md`（P0 表结论标注）
- `D:\Dev\GitHub\WebGIS-Dev\README.md` / `Docs\Guide\CHANGELOG.md`（版本 V3.4.41）
- 本日志（新增）
