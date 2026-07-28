# V3.4.81 — Weather 看板消息 / 图表 / API 中英文 i18n

> 日期：2026-07-28 20:45  
> 任务等级：L2  
> 版本号：V3.4.81  
> 顺延说明：接 V3.4.80 遗留「Weather 看板 message / charts 硬编码」

---

## 问题分析

### 核心症状
- 天气面板 UI 已 `t('weather.*')`，但英文下 toast、降雨卡片文案、ECharts 图例/tooltip、查询失败提示仍为中文
- `formatWeekLabel` 固定输出「周一…」

### 根本原因
- i18n 只接到了三个 Vue 组件；`api/weather.js`、`useWeatherData`、`useWeatherCharts` 仍字面量
- 高德返回的实况/预报气象文本本身是中文（数据源），不在本批翻译范围

### 受影响模块
- `api/weather.js`
- `composables/weather/useWeatherData.js` / `useWeatherCharts.js`
- `utils/weather/weatherUtils.js`（星期）
- `locales/zh-CN.js` / `en-US.js` 的 `weather.*`

---

## 修改内容

1. **语言包**：补 rain 信号/查询失败/图表系列/风力单位/weekdays 等（full 叶 1199/1199）
2. **api/weather**：adcode 校验、高德失败、配额、网络、toast 走 `translate`
3. **useWeatherData**：城市/天气未知兜底、rainFocus 全量、invalidAdcode/city/resolve 警告
4. **useWeatherCharts**：ECharts loading、图例、markPoint、风力系列/tooltip/仪表
5. **formatWeekLabel**：`weather.weekdays.{n}`，失败回退 `WEEK_LABEL_MAP`

---

## 修改原因

看板主路径已英文，但交互反馈与图表仍中文，英文体验断裂。

---

## 影响范围

- 天气看板文案与图表标签；无配置 key / 结构树文件增删；无 Git 写操作
- `weatherUtils` 顶层 import `useLocale`（与其它 utils 可接受；图标映射键仍为高德中文原文）

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅 toast | 图表仍中文 | 否 |
| B. composable/API + charts + weekdays | 用户可见路径完整 | ✓ |
| C. 翻译高德气象原文 | 数据源中文，无可靠英文字典 | 未选 |

---

## 性能指标

未实测（字符串替换；图表 setOption 时每次 t() 可忽略）

---

## 测试方案

### Agent 已执行
- [x] 运行时 CJK：api/composables/Weather 组件除 amap「未知」探测与注释外清空
- [x] zh/en full 1199/1199，diff 空；weather 叶 76
- [x] `CheckStructureTree.py` 398=398；`CheckConfigRegistry.py` 全绿

### 待用户实机
- [ ] English：刷新/查 adcode/城市解析 toast 英文
- [ ] 图表图例与风力 tooltip 英文；星期 Mon–Sun
- [ ] 高德原文（晴/小雨）仍为中文属预期

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` / `en-US.js` | weather 扩展 |
| `frontend/src/api/weather.js` | 查询错误 i18n |
| `frontend/src/composables/weather/useWeatherData.js` | 状态/雨情/校验 |
| `frontend/src/composables/weather/useWeatherCharts.js` | ECharts 文案 |
| `frontend/src/utils/weather/weatherUtils.js` | weekdays |
| `Docs/Guide/frontend-structure.md` | Weather 注释 |
| 本日志 + CHANGELOG + README | V3.4.81 |

---

## 遗留与风险

- 高德 `weather`/`dayWeather` 等字段中文原文不翻译
- `WEATHER_ICON_MAP` 仍以中文为 key（匹配 API）
- TOCPanel / Admin / Chat message 硬编码不在本批
- 未跑浏览器实机

---

## 下一步建议

- TOCPanel 共享资源 / 坐标复制 / 地理编码 toast i18n
- 或 MapDownloader `mapDownload.*` 调用点扫尾（键多已存在）
