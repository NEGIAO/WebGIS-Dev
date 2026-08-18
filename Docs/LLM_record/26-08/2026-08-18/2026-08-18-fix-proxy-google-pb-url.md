# 2026-08-18 修复瓦片解析通用识别（路径数字 token 全量扫描）

- **日期与时间**：2026-08-18
- **任务等级**：L2（后端单模块重构 + 单测）

## 问题分析

- **核心症状**：`/proxy/gcj2wgs/`（及 `/proxy/wgs2gcj/`）代理
  `https://www.google.com/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6` 时返回 400。
  用户明确要求：**不写针对单个服务的专用代码，修复通用识别代码本身**。
- **根本原因**：`backend/gcj_rectify/url_template.py` 的 path 模式（备选方案2）识别逻辑过窄：
  - 旧逻辑 `_extract_numeric_segments` **每个路径段只取第一个数字**（`re.search` 单次匹配），再取末 3 个数值段；
  - pb 格式把 z/x/y 以 `!1i10!2i500!3i800` 前缀式内嵌在**同一个** path 段里，段内第一个数字是前缀标记（`!1m4` 的 `4`）→ 数值段不足 3 个 → `ValueError: unable to locate x/y/z in tile path` → 400。
- **迭代中发现的次生坑**（均为通用化尝试所验证）：
  1. 「取每段所有数字 + 连续三连」失败：pb 的 `!1i/!2i/!3i` 前缀自带数字 1/2/3 混入 token 流（实际流为 `1,4,1,3,1,10,2,500,3,800,2,1,1,6`），真实三元组 (10,500,800) 并非相邻 token；
  2. 「连续三连 + 尾段优先」失败：尾部 `!2m1!1e6` 凑出合法但错误的 (1,1,6)；
  3. 「纯 x+y 最大」对低 zoom 合法坐标（z=3, x=1, y=2）可能误伤——最终采用「全部有序三元组 + 合法性校验 + x+y 最大」，实测对 pb 与常规 URL 均正确。
- **受影响模块**：`backend/gcj_rectify/url_template.py`（gcj2wgs/wgs2gcj 双路由共用，`proxy.py:459/498`）。

## 修改内容

1. `url_template.py` path 模式重写为「**全路径数字 token 扫描**」：
   - `re.finditer(r"\d+", parsed.path)` 取整条路径全部数字 token（含字符区间 spans），不再每段取一；
   - 枚举**全部有序三元组** (i<j<k)，zxy 序优先、其次 xyz 序，`_is_valid_xyz`（z≤30 且 x,y ≤ 2^z-1）校验；
   - 合法候选中取 **x+y 最大**者——真实瓦片坐标的数值量级必然大于样式/版本等尾随参数数字，该判据服务无关，同时兼容 `/z/x/y` 切片、`x{y}` 内嵌与 pb 前缀式；
   - `TileUrlTemplate` 新增 `path`/`spans` 字段（path 模式存原始路径与 x/y/z 字符区间），重建改按区间**倒序替换**（防长度变化偏移），`! = { }` 特殊字符零 urlencode 干扰；format/query 两模式构造器同步补齐空值，外部消费方（rectify.py/proxy.py 仅用 cache_key）零改动；
   - 删除废弃的 `_extract_numeric_segments`，`indices`/`affixes` 字段 path 模式不再填充（保留字段定义以兼容数据类结构）。
2. `backend/tests/test_url_template.py`（unittest，9 用例）：内嵌多数字 pb 风格 ×2、尾随垃圾数字、内嵌 xyz 序、用户报告 URL 端到端、format/query/path 三模式回归、无 xyz 报错。

## 修改原因

用户发现后端无法代理 Google maps/vt 瓦片（`terrain_google` 等 pb 格式图层此前只能直连，无法走纠偏/代理链路），并明确否决服务专用修复，要求通用识别修复。

## 影响范围

- 后端瓦片代理链路（`/proxy/gcj2wgs/`、`/proxy/wgs2gcj/`），GCJ 纠偏管线 `get_gcj2wgs_tile`

## 解决方案

- **方案对比**：
  - A. 路由层对 pb URL 特判绕过解析 —— 破坏 SSOT，纠偏管线拿不到模板，否决（用户要求通用）。
  - B. 解析层加 Google 专用正则分支 —— 服务绑定，用户明确否决。
  - C. path 模式泛化：全路径 token 扫描 + 全部三元组枚举 + 合法性校验 + x+y 最大（**选定**）—— 不依赖任何服务语法，一处修复双路由 + 纠偏管线全受益；重建复用字符区间替换，缓存 key 由 `template_id`（含占位符 URL）自动派生。
- **关键决策**：
  - 「x+y 最大」而非「尾段优先」：pb 尾部样式参数（`!1e6`）与前缀标记数字会凑出合法小三元组，量级判据是唯一服务无关的稳健选择；实测低 zoom（z≤2）合法坐标（x,y ≤ 3）下无竞争候选，行为不变；
  - 三模式顺序保持 format → query → path：常规 URL 零回归（回归测试覆盖）；
  - 全部三元组枚举的 O(n³) 开销对瓦片 URL（token 数 < 15）可忽略。

## 性能指标

未实测（token 扫描为纯字符串正则，O(n³) 枚举 n<15，单次微秒级；缓存 key 逻辑不变）。

## 测试方案

### Agent 已执行

- `python -m unittest tests.test_url_template -v`：9/9 通过（含修复前必现失败的复现用例）
- `python -m unittest discover -s tests -p "test_*.py"`：全量 34 个后端测试通过
- 直连实测 4 类 URL：Google pb → path 模式 (10,500,800) 重建保留 `!`；高德 x=y=z → format；天地图 WMTS 别名 → format；OSM `/z/x/y` → path，重建全部正确
- `python CheckStructureTree.py` / `python CheckConfigRegistry.py`：见门禁结果

### 待用户实机验证

1. 本地起后端，请求
   `http://localhost:7860/proxy/gcj2wgs/https://www.google.com/maps/vt/pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6`
   → 预期 200 + 纠偏 PNG（修复前 400）；
2. 生产环境（HF Space）部署后同验 `https://negiao-webgis.hf.space/proxy/gcj2wgs/...`；
3. 前端如需把 pb 图层接入底图（如 `terrain_google` 走代理），走 basemapConfig 标准流程。

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `backend/gcj_rectify/url_template.py` | path 模式重写：全路径 token 扫描 + 三元组枚举 + x+y 最大；新增 path/spans 字段；删除废弃函数 |
| `backend/tests/test_url_template.py` | 新增：9 用例（pb 风格、尾随垃圾、内嵌 xyz 序、端到端、三模式回归） |
| `Docs/Guide/backend-structure.md` | tests/ 结构树登记新测试文件 |
| `README.md` | 版本号三处更新至 V3.5.24 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.24 条目 |
| `Docs/LLM_record/26-08/2026-08-18/2026-08-18-fix-proxy-google-pb-url.md` | 本日志 |

## 遗留与风险

- ⚠️ 未实测：真实 Google 上游对 pb URL 的响应（仅本地解析层验证，fetch 链路复用既有逻辑）；
- 「x+y 最大」判据的已知极限：若 URL 尾部存在**同时合法且量级更大的**非坐标数字（如版本号恰好构成合法 zxy），理论上可能误选——常规瓦片服务无此写法，已用测试锁定主流场景行为；
- 前端底图接入（如新增「Google地形(WGS)」图层）未在本任务范围，待用户确认后另行实施。