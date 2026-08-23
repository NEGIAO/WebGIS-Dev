# 2026-08-22 shader bundle 漂移防护自动化（vite 求值期自动再生 + CI 门禁）

- **日期与时间**：2026-08-22 20:02
- **任务等级**：L2（构建链路自动化改造，无运行时代码逻辑变化）
- **版本**：V3.5.29

---

## 问题分析

### 背景

上一会话（同日 [2026-08-22-cloud-shader-bundle-drift-fix.md](2026-08-22-cloud-shader-bundle-drift-fix.md)）补建了 `bundle-shaders.mjs` 并完成三副本重同步，但交接块明确遗留风险：

> bundle 再生仍靠手动执行脚本，忘跑会复现漂移——建议后续接入 prebuild 钩子或 CI 校验。

即 V3.5.28 只恢复了「一次性一致」，未建立「持续一致」的机制保障。shader 相关副本共 3 处：

| 副本 | 角色 | V3.5.28 后的同步方式 |
|---|---|---|
| `lib/AtmosphereFromThreeGeospatial/Shaders/` | 真源 | — |
| `lib/shaders/bundledShaders.js` | 运行时唯一真源（`shaderLoader.js` bundle 优先命中） | 手动跑脚本 |
| `public/cloud-atmosphere/shaders/` | fetch 回退镜像 | 手动 cp 覆盖 |

后两处均为手动动作，「改了源忘同步」的暴露面仍是 2/3。

### 复盘上版方案取舍

上版日志方案 C（补建再生脚本）已意识到「可进 CI」但止步于脚本本身；本版将其推进为全自动闭环。

## 修改内容

1. **脚本重构** [frontend/scripts/bundle-shaders.mjs](../../../../frontend/scripts/bundle-shaders.mjs)：改为可导出模块 `bundleShaders({ check })`；
   - 新增 `--check` 校验模式：只读比对 bundle 与镜像和真源是否一致（缺失/内容不符/镜像陈旧多余文件均计漂移），列明细并 exit 1，不写盘；
   - 写模式下顺带同步 public 镜像（此前需手动 cp）并自动清理真源已删除的陈旧副本，实现「一条命令三副本全对齐」；
   - 比对前统一 CRLF→LF，免受 git autocrlf checkout 行尾转换干扰产生假阳性。
2. **vite.config.js 挂载**：配置求值期调用 `bundleShaders()`（照 `generateShareDataManifest()` 先例）——`dev` / `build` / `build:*` / analyze 启动即自动再生，「忘跑脚本」在本地工作流中不再可能发生。
3. **npm scripts**：新增 `shaders`（手动再生）与 `shaders:check`（校验，CI/门禁入口）。
4. **CI 门禁** [.github/workflows/deploy.yml](../../../../.github/workflows/deploy.yml)：build job 在 Install 依赖之后、Build 之前插入 `Check shader bundle sync` 步骤执行 `npm run shaders:check`——已提交进仓库的漂移在部署前被拦截（build 本身虽也会经 vite 自动再生兜底，但该步给出显式失败信号而非静默修正）。

三道防线的分工：vite 挂载保证**产物正确**（dev/build 永远用新 bundle），CI 门禁保证**仓库干净**（漂移的提交会被打回），npm scripts 提供**人工入口**与文档锚点。

## 修改原因

多副本无自动同步机制是 V3.5.28 事故根因；只补脚本不接自动化等于把「记得跑」的人肉纪律继续留在关键路径上。参照本仓库既有先例（ShareData manifest 曾有完全同构的问题并在 V3.4.x 以 vite.config 求值期生成解决），沿用同一成熟模式，风格与行为均可预期。

## 解决方案

备选对比：

- **A. predev/prebuild npm 钩子**：npm 仅对精确同名脚本触发 pre 钩子，本仓库 build 变体 5 个（build / build:webgis* ×3 / build:analyze），逐一前缀易漏且 dev 场景覆盖不到 vite preview；放弃。
- **B. vite.config 求值期调用**（选定）：单点挂载全场景生效，与 generate-sharedata-manifest 完全同构，维护心智一致。
- **C. 仅 CI 校验不自动再生**：能拦住已提交漂移，但本地每次都要手动补救，摩擦大；作为 B 的补充保留（deploy.yml 门禁步）。

实施步骤：重构脚本 → CLI 双模式验证 → 挂载 vite.config → package.json 登记 → deploy.yml 插步 → 文档四件套。

## 测试方案

### Agent 已执行

- `node scripts/bundle-shaders.mjs --check`：当前一致态通过（exit 0）
- **漂移注入测试**：向 bundledShaders.js 与 public/sky.glsl 各追加一行注释后 `--check` → 正确 exit 1，明细列出恰好 2 处漂移并提示修复命令
- 重跑再生 → 两文件逐字节还原，`--check` 复归通过（写路径幂等）
- `npm run build`：31.77s 通过，配置求值期自动再生无报错，构建后 git 无额外 diff（产物确定性）；`dist/cloud-atmosphere/shaders/aerialPerspectiveEffect.frag` 含 Fix A/B/C 标志（`compositeAerialDisplay` ×3），确认部署产物走修复态
- 门禁：CheckStructureTree ✅（458=458）/ CheckConfigRegistry ✅（122 key）

### 待用户实机验证

1. 改任意 `Shaders/*.frag` 保存后直接 `npm run dev` → 控制台出现 `[shader-bundle] 已同步 ...`，bundle 与镜像自动更新（无需任何手动动作）。
2. （回归）V3.5.28 交接块的实机渲染清单仍待一并回归：①交界处无灰白蒙版；②空中透视强度平滑淡入、归零恒等；③贴地平线升降无闪烁；④BSM 云影/丁达尔不劣化。
3. 下一次 push main 触发 deploy.yml 时观察 `Check shader bundle sync` 步骤绿灯。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| frontend/scripts/bundle-shaders.mjs | 重构：导出 `bundleShaders()` + `--check` 模式 + public 镜像同步/清理 |
| frontend/vite.config.js | 求值期挂载 `bundleShaders()`（sharedata manifest 同款先例） |
| frontend/package.json | 新增 `shaders` / `shaders:check` scripts |
| .github/workflows/deploy.yml | build 前置 `Check shader bundle sync` 门禁步 |
| README.md / Docs/Guide/CHANGELOG.md / Docs/Guide/frontend-structure.md | 版本号 V3.5.29 三处、新条目、结构树两处注释更新 |

## 性能指标

无运行时开销（构建期 O(文件数) 文本读写，5 个小文件毫秒级）；dist 体积零变化。

## 影响范围

- 构建链路行为变化：dev/build 启动时可能自动改写 bundledShaders.js 与 public 镜像（仅当存在漂移时产生 diff，属预期自愈）。
- 无 API、配置 key、数据库改动；运行时渲染逻辑零变化。

## 遗留与风险

- vite 挂载只覆盖「启动 vite」的时刻：dev server 运行中改 `.frag` 仍需重启 dev 或手动跑 `npm run shaders` 才进 bundle（bundle 是 JS 模块，非 HMR 目标）。此限制已在脚本头注释说明；彻底方案需 Vite 插件 watch 源目录，收益低暂不做。
- CI 门禁依赖 deploy.yml 触发（push main / 手动 dispatch）；若未来引入 PR-only 流程需另配 workflow。
- 上版 Fix A/B/C 实机渲染回归仍未完成（见「待用户实机验证」②），本轮自动化不改变其验证状态。
