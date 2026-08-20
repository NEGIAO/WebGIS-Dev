# 2026-08-19 修复 TOC 数据标注开关失效（V3.5.27）

## 日期与时间
2026-08-19

## 任务等级
L2（Bug 修复，跨 2 文件）

## 问题分析

### 核心症状
TOC 图层右键菜单中的「开启/关闭标注」无法使用：部分图层菜单项直接消失（显示层正常），
用户无法开关数据标注。

### 根本原因
`TOCTreeItem.vue` 的 `menuCapabilities.canToggleLabel` 把**图层名**当作**标注内容**做
`isValidLabel(图层名, 100)` 校验，作为标注菜单的显示闸门：

```js
const canToggleLabel = !!actions.label && isValidLabel(props.node?.raw?.name || props.node?.name, 100).valid;
```

`isValidLabel` 会拒绝以下图层名（详见 `@common/utils/labelValidator`）：
- **URL 编码名**：`%XX` 编码比例 >60% 判无效（如共享/URL 导入的编码文件名）；
- **"无/未知"开头**：`/^无/`、`/^未知/` 模式命中（如"未知来源数据"）；
- 空串、超长、乱码等。

而 TOC 显示名（`formatLayerDisplayName` 已 decodeURIComponent）正常——用户看到图层名
正常，但标注菜单项消失，表现为"标注逻辑坏了"。

**语义缺陷**：标注内容来自**要素属性字段**（`metadata.labelField` / 候选字段），与图层名
无关。渲染侧 `useManagedLayerStyle.getFeatureLabelText` 已有 `isLabelValid` 守卫——
菜单闸门纯属误加，只会误伤。

### 连带问题
`useLayerOperations.ts:90` 调用 `mapContainerRef.value?.toggleLayerLabelVisibility?.(...)`，
而 MapContainer 暴露的方法名为 `setUserLayerLabelVisibility`——方法名不匹配，若该文件被
启用将静默无操作（当前无人引用，为死代码，一并修正）。

### 受影响模块
TOC 图层树右键菜单（标注开关项）、图层标注显隐控制。

## 修改内容
1. `TOCTreeItem.vue`：`canToggleLabel` 改为仅 `!!actions.label`（标注开关可用性只看图层
   能力，不再校验图层名）；移除不再使用的 `isValidLabel` import；注释说明分层原则
   （菜单可用性 vs 渲染内容校验）。
2. `useLayerOperations.ts`：`toggleLayerLabelVisibility` → `setUserLayerLabelVisibility`
   （方法名对齐 MapContainer 暴露面）。

## 修改原因
修复标注菜单因图层名校验误判而消失的问题；对齐标注链路的方法名，消除潜在静默失效。

## 影响范围
TOC 右键菜单标注开关的显示条件（放宽）、useLayerOperations（死代码方法名修正）。

## 性能指标
未实测（无新增开销）。

## 测试方案
### Agent 已执行
- `npx eslint`（2 文件）：0 报错；
- `npx tsc --noEmit`：0 报错；
- `npm run build`：成功（29.88s）；
- node 脚本复刻 `isValidLabel` 验证：URL 编码名（100% 编码比例）、"未知来源数据"确实被
  判无效——确认根因。

### 待用户实机验证
1. 上传图层（任意文件名，含 URL 编码名/中文名）→ 右键菜单应始终出现「开启标注」；
2. 开启标注 → 地图显示要素属性标签；关闭 → 标签消失；
3. 搜索结果 POI 图层、区划图层标注开关正常；
4. 属性值本身无效（空/NULL）时标注不渲染（渲染侧校验仍生效）。

## 变更文件清单
| 文件 | 说明 |
|---|---|
| `frontend/src/domains/common/layer-tree/components/TOCTreeItem.vue` | 标注菜单闸门去掉图层名 isValidLabel 校验 |
| `frontend/src/domains/common/app/home/useLayerOperations.ts` | 方法名对齐 setUserLayerLabelVisibility |
| `README.md` | 版本号三处 → V3.5.27 |
| `Docs/Guide/CHANGELOG.md` | 追加 V3.5.27 条目 |

## 遗留与风险
- `useLayerOperations.ts` 整体仍为死代码（无人引用），本次仅修正方法名；若未来启用需
  逐项核对暴露面（已记入 TODO）；
- 标注渲染侧仍依赖 `metadata.labelField` 或候选字段存在有效值，无有效字段时开启标注
  不显示文字（预期行为，非本次问题）。

## 零散修补（L1）
无。