# 修复 Hugging Face 推送被拒：字体二进制未走 LFS

## 日期与时间

2026-11-01 10:44

## 任务等级

**L2**（CI/部署面缺陷修复 + 版本号推进 + 文档同步；改动跨 `deploy.yml` 与 README/CHANGELOG/日志，超出 L1 单文件 20 行阈值）

## 问题分析

### 症状

V3.6.36 提交后，GitHub Actions 的 `deploy-frontend-to-hf` 在最后一步推送时被 Hugging Face 拒收：

```
Pushing to Hugging Face...
Uploading LFS objects: 100% (232/232), 46 MB | 0 B/s, done.
remote: Your push was rejected because it contains binary files.
remote: Please use https://huggingface.co/docs/hub/xet to store binary files.
remote: Offending files:
remote:   - fontawesome/webfonts/fa-brands-400.woff2 (ref: refs/heads/main)
remote:   - fontawesome/webfonts/fa-solid-900.woff2 (ref: refs/heads/main)
```

注意 `Uploading LFS objects: 100%` 已成功——说明 LFS 通道本身正常，被拒的是**没有进入 LFS 的那部分文件**。

### 根本原因

两个 HF 推送任务的 `git lfs track` 白名单里**从来没有字体扩展名**。

`.github/workflows/deploy.yml` 中存在两条独立的 HF 推送链路，各自维护一份手写白名单：

| 任务 | 目标 Space | 推送内容 |
|---|---|---|
| `deploy-frontend-to-hf` | `NEGIAO/Web` | `frontend/dist` 构建产物（静态站） |
| `sync-to-huggingface` | `NEGIAO/WebGIS` | `git archive` 出的 `deploy/ backend/ frontend/`（Docker Space） |

两份白名单是逐次踩坑补出来的——`*.wasm` 与 `*.gif` 的注释明确写着「HF 要求二进制文件必须走 LFS/Xet 存储，裸 blob 会被 pre-receive 拒绝」，说明此前已因这两类文件失败过两次。但字体（`woff2` / `woff` / `ttf`）始终没被补进去。

### 量化影响

用「二进制判定（前 8000 字节含 NUL）+ 白名单匹配」对两处上下文做静态复核：

| 上下文 | 二进制文件总数 | 未被 LFS 覆盖 | 体积 | 扩展名分布 |
|---|---:|---:|---:|---|
| job1 `frontend/dist` | 671 | **64** | 1345 KB | `woff2` 24 / `woff` 20 / `ttf` 20 |
| job2 `deploy+backend+frontend` | — | **5** | 290 KB | `woff2` 5 |

未被覆盖的来源分两处：

1. **Font Awesome 自托管字体**：`frontend/public/fontawesome/webfonts/*.woff2`（4 个），由 `index.html` 第 65 行 preload、第 72 行引 `all.min.css` 使用，构建时原样复制到 `dist/fontawesome/webfonts/`。
2. **KaTeX 数学字体**：`katex` 包 CSS 引用的 `woff2` / `woff` / `ttf` 三套共 60 个，Vite 构建后落在 `dist/assets/`。
3. 另有 `frontend/src/assets/fonts/noto-serif-sc-700.woff2`，只出现在 job2 的源码归档中。

### 为什么远端只列出 2 个文件

`fa-solid-900.woff2`（146.6 KB）与 `fa-brands-400.woff2`（105.5 KB）是唯一两个超过约 100 KB 的字体文件。HF 的 `Offending files` 列表只展示超阈值样本，`fa-regular-400.woff2`（24.4 KB）与 KaTeX 字体（≤ 62 KB）同样不合规，只是未被列出。

**这是本次排查最容易走偏的地方**：按远端列表「只修这两个文件」会让下一次推送在另一批文件上继续失败。

### 受影响模块

- CI/CD：`.github/workflows/deploy.yml` 的 `deploy-frontend-to-hf`、`sync-to-huggingface`
- 前端静态资源：`frontend/public/fontawesome/**`、`frontend/src/assets/fonts/**`、KaTeX 构建产物
- 不影响运行时逻辑、后端接口、数据库、鉴权、图层管理

## 修改内容

1. **`deploy-frontend-to-hf` 补字体 LFS 规则**：在 `*.gif` 之后追加 `*.woff2` / `*.woff` / `*.ttf` / `*.otf` / `*.eot`，并加注释说明「漏配会让整次 push 被拒，且远端只列样本文件」。
2. **`sync-to-huggingface` 同步补齐**：`Track large binaries with LFS` 步骤追加同一组扩展名，注释点明 `public/fontawesome/webfonts/` 与 `src/assets/fonts/` 两个来源。
3. **两处新增二进制兜底校验**：在 `git add` 之后、`git commit` 之前插入
   ```bash
   UNTRACKED_BIN=$(git diff --cached --numstat | awk -F'\t' '$1=="-" && $2=="-" {print $3}')
   if [ -n "$UNTRACKED_BIN" ]; then
     echo "::error::以下二进制文件未走 LFS，HF 会拒收，请补 git lfs track 规则："
     echo "$UNTRACKED_BIN"
     exit 1
   fi
   ```
4. **版本推进**：V3.6.36 → **V3.6.37**，README 三处 + CHANGELOG 条目。

## 修改原因

- **直接动机**：HF 推送被拒，静态站与全栈两个 Space 都无法更新，`NEGIAO/Web` 停留在旧版本。
- **深层动机**：白名单式 LFS 配置天然脆弱——新增一类二进制资源就会静默失败一次，且失败信号在流水线末端（远端 pre-receive），排查成本高。本次在补规则之外增加本地校验，把「远端拒收」提前成「CI 第 5 步失败并打印文件名」。
- **不做过度设计**：没有引入「扫描全仓库自动生成 .gitattributes」之类的机制，因为 `git lfs track` 的显式清单可读性更好，且与既有写法一致。

## 影响范围

| 维度 | 影响 |
|---|---|
| 部署 | 两个 HF Space 的推送成功率；静态站与全栈镜像均可正常更新 |
| 产物体积 | 不变（只是存储通道由裸 blob 改为 LFS 指针，实际字节数一致） |
| 推送耗时 | LFS 上传与原先的 `Uploading LFS objects` 同一通道，预计持平；多出 64 个指针文件的提交开销，可忽略 |
| 运行时 | 无影响，前端读取方式不变（HF 对 LFS 文件透明代理） |
| 其它流水线 | `build`、`deploy-to-self`、`sync-to-main-repo` 未改动 |

## 解决方案

### 方案对比

| 方案 | 做法 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **A. 补 LFS 扩展名 + 本地校验** | 两个任务各补 5 个字体扩展名，并在 commit 前用 `git diff --cached --numstat` 拦截残留裸 blob | 改动小、可读性好、失败点前移、与既有写法一致 | 未来新增二进制类型仍需手动补规则 | ✅ 采用 |
| B. 删除字体资源 | 改为 CDN 引 Font Awesome，KaTeX 走 CDN | 产物更小 | 违背「同源加载」的既有设计（`index.html` 注释明确写了省掉 DNS+TCP+TLS 与第三方可用性风险）；国内 CDN 不可达时图标全丢 | ❌ |
| C. `git lfs migrate import --include` 全量迁移 | 在 CI 里按扩展名批量迁移 | 覆盖彻底 | 两个 HF 仓库都是 `git init` + `--force` 的临时仓库，无历史包袱，迁移纯属多余 | ❌ |
| D. 关闭 HF 的二进制检查 | 无此开关 | — | 不可行 | ❌ |

### 选型理由

方案 A 的关键在于**校验逻辑的正确性有原理保证**，不是启发式猜测：

`git lfs track` 写入 `.gitattributes` 后，`git add` 时 clean filter 会把匹配文件**替换为约 130 字节的 ASCII 指针**。因此：

- 被 LFS 接管的文件 → 索引里是纯文本 → `git diff --cached --numstat` 显示行数（如 `3 0 path`）
- 未被接管的二进制 → 索引里仍是原始 blob → numstat 显示 `- - path`

也就是说，**凡是 numstat 里仍为 `-` 的，必然是裸 blob**。这与 HF 的判定口径完全一致，不会误报也不会漏报。

### 实施步骤

1. 静态复核两处上下文的白名单覆盖率（脚本遍历 + NUL 字节判定）。
2. 修改 `deploy.yml` 两个任务的 `git lfs track` 清单。
3. 在两个任务的 `git add` 与 `git commit` 之间插入校验片段。
4. `yaml.safe_load` 验证结构。
5. 用本机 `git-lfs 3.7.0` 建临时仓库做双场景回归（有/无字体规则）。
6. 推进版本号与文档，跑门禁。

## 性能指标

未实测（非性能任务）。理论影响：多 64 个 LFS 指针文件参与提交，单文件约 130 字节，合计 < 10 KB，可忽略。

## 测试方案

### Agent 已执行

| 检查项 | 命令 / 方法 | 结果 |
|---|---|---|
| YAML 结构 | `yaml.safe_load('.github/workflows/deploy.yml')` | 解析通过；5 个 job（`build` / `deploy-to-self` / `sync-to-main-repo` / `deploy-frontend-to-hf` / `sync-to-huggingface`）完整 |
| 规则落位 | 解析后打印两个任务的 `run` 片段 | job1 含 23 条 `git lfs track`（新增 5 条字体）；job2 含字体扩展名与校验片段 |
| 覆盖率复核（job1） | 遍历 `frontend/dist` 671 个二进制 + 新白名单 | 未覆盖 **64 → 0** |
| 覆盖率复核（job2） | 遍历 `git ls-files deploy backend frontend` + 新白名单 | 未覆盖 **5 → 0** |
| 回归场景 A（修复前） | 临时仓库，只放 2 个 `woff2`，不加字体规则，执行校验片段 | 校验命中 ✅，输出两个文件路径 |
| 回归场景 B（修复后） | 同上，`git lfs track "*.woff2" ...` 后重新 `git add` | 校验通过 ✅；`git cat-file -p :path` 显示 `version https://git-lfs.github.com/spec/v1` / `oid sha256:7152a69…` / `size 150124` |
| 结构树门禁 | `python Scripts/CheckStructureTree.py` | 通过（未涉及 `frontend/src`） |
| 配置登记门禁 | `python Scripts/CheckConfigRegistry.py` | 通过（未新增配置 key） |
| 平台红线 §11.2 | 四条命令 | `REDLINE-1-CLEAN` / `REDLINE-2-CLEAN` / `REDLINE-3-CLEAN` / `REDLINE-4-CLEAN` |

> 说明：规范给的命令使用 `rg`，本机未安装（`command not found`），直接 `|| echo CLEAN` 会产生**假阳性**。本次改用 `grep -rEil` 等价执行，并排除 gitignore 的 `backend/.venv`、`node_modules`、`dist`；`xray` / `hermes` 加词界 `\b` 避免误命中 `maxRayDistance` 之类的标识符。

### 待用户实机验证

| # | 步骤 | 预期结果 |
|---|---|---|
| 1 | 提交并推送到 GitHub，等待 Actions 跑完 `deploy-frontend-to-hf` | 该 job 绿灯；日志出现 `OK`/无 `::error::`；不再出现 `contains binary files` |
| 2 | 打开 `https://huggingface.co/spaces/NEGIAO/Web` | 站点可访问，图标（Font Awesome）与公式（KaTeX）正常显示 |
| 3 | 观察 `sync-to-huggingface` job | 绿灯；`NEGIAO/WebGIS` Space 重新构建成功 |
| 4 | 在 HF 仓库文件列表确认 `fontawesome/webfonts/fa-solid-900.woff2` | 显示为 LFS 文件（约 150 KB，带 LFS 标记） |
| 5 | 反向验证校验器（可选） | 临时把某条 `git lfs track` 注释掉再跑，job 应在 commit 前以 `::error::` 失败并打印文件名 |

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `.github/workflows/deploy.yml` | job1/job2 各补 5 个字体扩展名；两处 `git add` 与 `git commit` 之间新增二进制兜底校验 |
| `README.md` | 版本三处同步至 V3.6.37（简介行 / 版本表首行 / 页脚），版本表保持 3 行（37/36/35），表下指针订正为「V3.6.34 及以前」 |
| `Docs/Guide/CHANGELOG.md` | 顶部新增 V3.6.37 完整条目（背景 / 量化影响 / 改动 / 取舍 / 验证 / 日志链接） |
| `Docs/LLM_record/26-11/2026-11-01/2026-11-01-hf-binary-lfs-fonts.md` | 本文件（新建月份目录 `26-11`） |

## 遗留与风险

1. **白名单仍是枚举式**：新增二进制类型（如 `.mp4`、`.pdf`、`.ktx2`）仍会失败一次。本次加的校验能把失败点前移到 CI 本地并打印文件名，但**不会自动修复**——仍需人工补 `git lfs track`。
2. **校验口径比 HF 更严**：任何未被 LFS 接管的二进制都会让 job 失败，包括 HF 实际可能放行的小文件。这是有意为之（宁可本地失败也不远端拒收），但若将来确实需要提交小体积二进制且不想走 LFS，需要显式加豁免规则。
3. **`ShareData/**` 在 job2 实际不生效**：`gitattributes` 中含斜杠的模式相对 `.gitattributes` 所在目录（仓库根）解析，而实际路径是 `frontend/public/ShareData/**`。当前该目录只有 `.kml` / `.kmz` / `.json`，前两者已被 `*.kml` / `*.kmz` 覆盖，故无实际影响；若将来往该目录放 `png` / `glb` 等，需改为 `**/ShareData/**`。**本次未改动**，避免扩大改动面。
4. **未做实机推送验证**：本地无 HF 凭据，无法复现完整推送。回归测试只覆盖「LFS 接管 + 校验判定」这一核心机制，实际 Space 构建结果需用户在 GitHub Actions 上确认。
5. **`Uploading LFS objects: 46 MB`** 说明当前 LFS 体积已不小；HF 免费 Space 有存储配额，长期需关注（非本次问题）。
