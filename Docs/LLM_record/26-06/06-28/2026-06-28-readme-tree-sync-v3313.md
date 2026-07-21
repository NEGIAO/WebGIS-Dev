# 2026-06-28 V3.3.13 三个 README 文件树同步更新

**日期和时间**：2026-06-28

---

## 修改内容

同步更新三个 README（根目录 / 前端 / 后端）的文件结构树，反映 V3.3.13 版本的实际文件布局。

## 修改原因

V3.3.13 版本变更了大量前后端文件结构，但三个 README 的文件树未同步更新，存在以下不一致：

1. **根 README 后端树**：引用了不存在的 `core/`、`models/`、`schemas/`、`requirements.txt`、`main.py`；缺少实际存在的 `services/`、`data/`、`gcj_rectify/`
2. **根 README Docs 树**：缺少 `06-27/`、`26-06-27/`、`26-06-28/` 等目录
3. **后端 README 树**：同样引用了不存在的 `core/`、`models/`；缺少 `services/`、`data/`
4. **前端 README 树**：缺少 `useAgentConfig.js`、`Explanation/`、`logo.svg`

## 影响范围

- `README.md`（根目录）
- `frontend/README.md`
- `backend/README.md`

## 修改详情

### 根 README.md

| 区域 | 变更 |
|------|------|
| composables/ | 恢复子目录结构（auth/dataImport/Magic/map/tileSource/weather）+ 新增 useAgentConfig.js |
| backend/ | 重写：移除不存在的 core/models/schemas，新增 services/data/gcj_rectify，修正入口为 app.py |
| Docs/ | 补全 26-06 子目录（26-06-09~26-06-28）+ 06-28 + 26-06-26 + TODO/ |

### frontend/README.md

| 区域 | 变更 |
|------|------|
| assets/ | 新增 `logo.svg` |
| feng-shui-compass-svg/ | 新增 `Explanation/` 子目录（5 个 JSON 文件）|
| composables/ | 新增 `useAgentConfig.js` |

### backend/README.md

| 区域 | 变更 |
|------|------|
| core/ + models/ | 删除（不存在于磁盘）|
| services/ | 新增（含 ip_geo.py）|
| data/ | 新增（含 webgis_auth.db）|

## 测试方案

- `ls` 验证所有树中列出的目录/文件确实存在
- 三个 README 的树与 `tree` 命令输出一致

## 修改的文件路径

- `d:\Dev\GitHub\WebGIS-Dev\README.md`
- `d:\Dev\GitHub\WebGIS-Dev\frontend\README.md`
- `d:\Dev\GitHub\WebGIS-Dev\backend\README.md`
