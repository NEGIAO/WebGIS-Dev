# 2026-11-28 NASA VIIRS 夜间灯光瓦片矩阵集修复（V3.7.36）

- **日期与时间**：2026-11-28 15:02 – 15:05（CST）
- **任务等级**：L1（URL 参数修复）
- **本次版本**：V3.7.36（V3.7.35 已被并发会话占用）
- **任务来源**：用户反馈夜间灯光图层返回 `ExceptionReport`：`TILEMATRIXSET is invalid for LAYER`。

## 问题分析

`imagery_nasa_viirs_night` 的 URL 使用 `GoogleMapsCompatible_Level9`，但 NASA GIBS 的 `VIIRS_CityLights_2012` 图层只登记到 `GoogleMapsCompatible_Level8`；请求矩阵集超出图层登记范围，服务端返回 OWS 400 XML 而非图像。这与定义里的 `maxZoom: 8` 本身一致，说明 URL 参数写错。

## 实测证据

坐标 `z=8, x=210, y=96`（北京）：

| 矩阵集 | HTTP | Content-Type | 字节 |
| :--- | ---: | :--- | ---: |
| `GoogleMapsCompatible_Level8` | 200 | `image/jpeg` | 12,894 |
| `GoogleMapsCompatible_Level9` | 400 | `text/xml` | 431 |
| `GoogleMapsCompatible_Level7` | 400 | `text/xml` | 431 |
| `GoogleMapsCompatible_Level6` | 400 | `text/xml` | 431 |

## 修改内容

仅改 `category-imagery.ts` 中 `imagery_nasa_viirs_night` 的 URL 矩阵集：`GoogleMapsCompatible_Level9` → `GoogleMapsCompatible_Level8`，并补 V3.7.36 注释。其他字段（分类 imagery、provider NASA、coord WGS84、`maxZoom: 8`、`date: 2012`）不变。

## 修改原因

修正 URL 与图层登记能力不一致导致的 400；不改数据与语义，风险最低。

## 影响范围

仅 NASA VIIRS 夜间灯光一个图层；MODIS 真彩色仍用 Level9（实测 200），无需调整。

## 测试方案

- Agent：`Level6/7/8/9` 四组请求对照，确认仅 Level8 有效；全量门禁与类型检查。
- 用户：在底图目录选择「NASA VIIRS夜间灯光」，应显示全球夜间灯光影像而非 XML 错误页。

## 变更文件清单

- `frontend/src/domains/common/basemap/definitions/category-imagery.ts`——VIIRS URL 矩阵集修正
- `README.md` / `Docs/Guide/CHANGELOG.md`——V3.7.36
- 本日志
