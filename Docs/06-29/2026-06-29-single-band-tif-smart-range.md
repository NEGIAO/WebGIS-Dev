# 2026-06-29 单波段 TIF 渲染范围优化：智能 nodata 检测 + 全有效范围

## 日期和时间
2026-06-29 17:00

## 修改内容
重构单波段 TIF 栅格数据的 nodata 检测和渲染范围计算算法，从固定 2%-98% 百分位截断改为智能检测全有效数据范围。

## 修改原因
原算法使用 `computePercentileStretch(data, nodata, 2, 98)` 计算渲染范围，存在两个问题：
1. 数据两端各 2% 的有效值被截断，用户看不到完整数据范围
2. nodata 检测仅识别固定哨兵值（0/-9999/-32768/32767/65535）且需占比≥5%，对非标准 nodata 值无法识别

## 影响范围
- 栅格数据处理工具（rasterUtils.js）
- TIF 数据导入（useLayerDataImport.js）—— 2 处调用

## 问题分析

### 原算法问题
```
原流程: GDAL nodata → 哨兵值推断（≥5%占比）→ 2%-98% 百分位截断
问题: 
  - 百分位截断丢失有效数据（如高程 0-5m 和 995-1000m 不可见）
  - 哨兵值推断过于保守（需 5% 占比 + 固定候选列表）
  - 无法识别非标准 nodata 值（如 -3.4e38）
```

### 新算法设计
```
新流程: 采样 → 统计量 → 哨兵 nodata 检测（3σ 离群）→ GAP 离群检测 → 全有效范围
核心改进:
  1. 哨兵值检测：不仅看占比，还检查是否远离主数据分布（> 3σ）
  2. GAP 离群检测：排序后寻找最大间隔，若 > 10× 中位间隔 → 小端为离群
  3. 渲染范围 = 有效数据的 min/max（不再截断）
```

### 算法流程
1. **采样**：≤20万像素随机采样，排除 NaN/Infinity
2. **统计**：计算 min, max, mean, stdDev
3. **哨兵 nodata**：检查 0/-9999/-32768/32767/65535，若距均值 > 3σ 则标记
4. **排除 nodata**：过滤哨兵值后重新排序
5. **GAP 检测**：找最大间隔，若 > 中位间隔 10 倍且少数端 < 20% → 分离离群
6. **返回**：{ nodataValue, min, max }

## 测试方案
1. 加载 nodata=-9999 的 DEM TIF → nodata 区域透明，有效区域覆盖全范围
2. 加载 nodata=0 的 TIF → 0 远离主分布时透明，合法 0 值（如温度 0°C）不被误判
3. 加载无 nodata 的连续数据 TIF → 全范围 min-max 渲染
4. 加载含离群低值的 TIF → GAP 检测自动剔除离群

## 修改的文件路径
- `frontend/src/composables/dataImport/rasterUtils.js` — 新增 `detectDataRange()` 函数
- `frontend/src/composables/useLayerDataImport.js` — 2 处调用替换为 `detectDataRange`
