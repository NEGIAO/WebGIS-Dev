# 2026-11-28 Yandex 影像 provider 修正（零散修补）

- **日期与时间**：2026-11-28 12:39
- **任务等级**：L1 微改（单文件常量值修正，≤20 行）
- **本次版本**：无版本变动（沿用并行会话推进的 V3.7.26）

## 问题分析

`definitions/category-imagery.ts` 的 `imagery_yandex`（order 21）存在三处自相矛盾的元数据：

| 字段 | 原值 | 矛盾点 |
|---|---|---|
| `provider` | `'微软'` | **不在 `BasemapProvider` 枚举中**（枚举仅含 AMAP/Google/.../Other，无微软/Yandex）；全仓仅此一处非法值 |
| `coord` | `'NONE'` | Yandex 全球影像为 WGS84，非"无坐标系" |
| `description` | `'Yandex影像 · Other / 未知'` | 与 provider='微软' 矛盾，说明迁移时字段被改但 description 未同步 |

git 历史佐证：迁移前旧定义（`group-1.ts:362`）根本没有 provider 字段，靠 taxonomy 推断为 Other；V3.7.16 迁移时被错误填入 `'微软'`。

## 修改内容

`frontend/src/domains/common/basemap/definitions/category-imagery.ts` order 21：

```diff
- provider: '微软',
- coord: 'NONE',
- description: 'Yandex影像 · Other / 未知',
+ provider: 'Other',
+ coord: 'WGS84',
+ description: 'Yandex影像 · Other / WGS84',
```

id / name / url / method / order 全部不变，分享链接编号契约不受影响。

## 验证

- `npx vue-tsc --noEmit`：0 错误。
- `npm run check:layer-definitions`：OK（174 definitions, orders 1..174）。
- 全仓扫描「微软」：仅剩 `Message.vue` 的中文字体注释，与底图无关。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`：order 21 三字段修正。
- 本日志。

## 遗留与风险

无。若后续要在目录 UI 显示「Yandex」而非「Other」，需扩展 `BasemapProvider` 枚举与 `PROVIDER_ORDER`——属新需求，非本次修复范围。
