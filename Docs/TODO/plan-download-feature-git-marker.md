# 底图下载功能：代码位置标记（暂不实现）

日期：2026-09-15  
状态：**搁置**。HF 禁止 Space 上第三方瓦片中转；VPS 小内存上大范围 GeoTIFF 风险高，**暂不在任何环境提供下载**。

## 代码在哪个版本

| 项 | 值 |
|---|---|
| **本地 tag** | `tile-download-last` |
| **指向 commit** | `4a701dad`（**V3.6.4**） |
| **路径** | `backend/domains/tiles/download/` |
| **相关** | `download.py` / `tile_engine.py` / `download_task.py` / `task_scheduler.py` |
| **删除时点** | V3.6.5（`1b731917`）起从本仓移除 |

Tag **仅在本地**，未 push。若需推远端由你执行：

```bash
git push origin tile-download-last
```

## 以后若要恢复（自建 VPS，勿挂 HF）

```bash
# 查看
git show tile-download-last:backend/domains/tiles/download/download.py

# 导出到工作区（示例）
git checkout tile-download-last -- backend/domains/tiles/download
```

迁出自建时务必：

1. 去掉对 `api.auth` / WebGIS 配额的硬依赖（或自备鉴权）
2. 限制单任务瓦片数与并发（小内存机）
3. 前端下载基址指向自有域名，**不要**指向 HF Space

旧方案记录见同目录 `plan-download-async-l2-ttl.md`。
