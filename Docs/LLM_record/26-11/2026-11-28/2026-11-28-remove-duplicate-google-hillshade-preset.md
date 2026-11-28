# 2026-11-28 删除重复的 Google 山体阴影预设

- **日期与时间**：2026-11-28 16:22
- **任务等级**：L2（删除重复预设）
- **版本号顺延**：V3.7.21 已被同会话前一任务占用，本任务顺延为 **V3.7.22**。

## 一、问题分析（阶段一：写代码前完成）

### 核心症状

用户两张截图显示「山体」（预设 60）与「PB山体阴影」（预设 147）的 URL 完全一致，要求删除其中一个。

### 根本原因

两个预设都在 `basemapPresets.ts` 中指向同一个图层定义：

- `terrain_google_preset`（label「山体」，line 216）→ stack `['vector_google_combo_pb_hillshade_wgs']`
- `vector_google_combo_pb_hillshade_wgs_preset`（label「PB山体阴影」，line 625）→ stack 同上

`catalog/registry.ts` 以 stack[0] 查定义并生成描述，因此两条目录项显示同一个 URL / 同一个源定义「GooglePB山体阴影(WGS)」。这不是定义重复，而是**预设层重复登记**；底层定义还被另两个组合预设引用，不能删定义。

### 取舍与影响

全仓引用核对：两个 preset id 均无其他业务引用（不在精选清单、快捷命令、罗盘规则中）。

选定**删除 `terrain_google_preset`（山体）**，保留 `vector_google_combo_pb_hillshade_wgs_preset`（PB山体阴影），理由：

1. 保留项的 id 与 stack 定义 id 一一对应，维护时可直接定位；
2. 保留项 label 明确写出服务（PB / WGS），而「山体」泛化且与 ESRI 山体阴影条目易混；
3. 两者分类与渲染完全相同，删除泛化项不损失能力。

### 受影响模块

- `basemapPresets.ts`：删一行预设。
- `scripts/check-basemap-catalog.mjs`：数量护栏 180→179。
- 计数文档：README、架构两篇现行态文档（预设总量）。
- 不触碰定义文件与 order（定义仍 198 条）。

### 候选方案对比

| 方案 | 做法 | 评估 |
|---|---|---|
| A（选定） | 删泛化预设「山体」 | 保留精确命名；无业务引用损失 |
| B | 删「PB山体阴影」 | 保留旧编号 60 的短链接，但留下泛化标签与 id/stack 不一致 |
| C | 删底层定义 | 会破坏另外两个组合预设的 stack，绝对不可行 |

## 二、修改内容

1. `basemapPresets.ts`：删除 `terrain_google_preset`（label「山体」）一行。
2. `scripts/check-basemap-catalog.mjs`：`MIN_PRESET_COUNT` 180→179，注释追加本次删除说明。
3. 计数文档同步：README（预设 180→179）、`basemap-source-system.md`、`basemap-catalog-redesign.md` 中现行态数量与门禁描述。
4. README 三处 + CHANGELOG 新增 V3.7.22 条目。

## 三、修改原因

重复来自预设层而非定义层：两个 preset id 指向同一 stack，目录因此展示两条 URL 完全相同的入口。底层定义还被另外两个组合预设引用，删除定义会破坏它们的 stack；只删泛化预设即可消除重复且保留全部能力。

## 四、影响范围

- 底图目录预设数量与 URL `l` 编号；198 条定义与 order 完全不变。
- 不涉及后端、鉴权与地图引擎加载代码。

## 五、解决方案

采用候选方案 A。顺序：写分析段 → 删预设 → 下调护栏 → 同步文档 → 跑门禁与残留检查。

## 六、性能指标

未实测（静态数据变更）。

## 七、测试方案

### Agent 已执行

1. `npm run typecheck`（`vue-tsc --noEmit`）：0 错误。
2. `node scripts/check-layer-definitions.mjs`：OK，198 条定义、orders 1..198、stacks 可解析。
3. `node scripts/check-basemap-catalog.mjs`：OK，179 预设、20 AMAP + 30 Google combos、20 推荐。
4. `python Scripts/CheckStructureTree.py`：769/769，漏登记 0、幽灵条目 0。
5. `python Scripts/CheckConfigRegistry.py`：B1–B4 / F1–F3 全绿。
6. `frontend/src` 搜索：被删 id 零命中；保留的 `vector_google_combo_pb_hillshade_wgs_preset` 仍存在且 stack 完整。

### 待用户实机验证

底图目录中只保留一条「PB山体阴影」（Google / WGS84），「山体」条目消失；点击后瓦片正常加载。

## 八、变更文件清单

- `frontend/src/domains/common/basemap/basemapPresets.ts`：删重复预设。
- `frontend/scripts/check-basemap-catalog.mjs`：数量护栏下调。
- `README.md`、`Docs/Architecture/basemap-source-system.md`、`Docs/Architecture/basemap-catalog-redesign.md`、`Docs/Guide/CHANGELOG.md`：计数与版本同步。
- `Docs/LLM_record/26-11/2026-11-28/2026-11-28-remove-duplicate-google-hillshade-preset.md`：本日志。

## 九、遗留与风险

- **URL 编号前移**：删除点之后的预设编号整体 -1，历史 `?l=` 链接可能指向相邻底图（延续上一任务的既有风险）。
- 其它预设是否也存在相同 stack 未做全量扫描；本次仅处理用户指出的两条，若后续发现重复按同法处理。
- 版本号因同日连续任务顺延至 V3.7.22；提交前需核对叠加 diff。
- 未执行任何 Git 写操作。
