# 行政区划图层被误判「不是矢量图层」排查与修复记录

- 日期：2026-10-17
- 版本：V3.6.20（第四节）
- 用户诉求：加载行政区划图层后坐标转换警告「该图层不是矢量图层，无法进行坐标转换」——「他不是矢量图层？？？？」
- 涉及文件：
  - `frontend/src/domains/ol/services/DistrictManager.ts`（托管记录字段 `_layer` → `layer`，清理历史字段）
  - `frontend/src/domains/ol/drawing/composables/useGeometryEdit.js`（注释同步，兜底保留）

## 一、链路定位

警告文案出自 `frontend/src/domains/ol/utils/useCoordinateSystemConversion.js:97`：

```js
if (!isVectorManagedLayer(layerData)) {
    message.warning?.('该图层不是矢量图层，无法进行坐标转换');
    return;
}
```

`isVectorManagedLayer`（`common/layer-tree/actions/layerExportService.js:207`）：

```js
export function isVectorManagedLayer(layerData) {
    const source = layerData?.layer?.getSource?.();
    return !!source && typeof source.getFeatures === 'function';
}
```

完整链路（全部正确，无断点）：
TOC 右键「WGS-84 => GCJ-02」→ `commandDispatcher.js:166-180` 推 `{type:'toggle-layer-crs', payload:{layerId, fromCrs, toCrs}}` → `contextActionManager.js:160-168` emit → TOCPanel dispatcher → SidePanel 透传 → `HomeView.handleToggleLayerCRS`（1527 行）→ `mapContainerRef.toggleLayerCRS` → `createCoordinateSystemConversionFeature.toggleLayerCRS`。

能力位也无问题：`resolveLayerCapabilities` 的 `toggleLayerCRS` 来自 `supportsCoordinateOperations`（非栅格即 true），区划节点菜单项正常显示——用户能点到并看到警告，证明链路通到最后一跳。

## 二、根因：托管记录字段约定漂移

`userDataLayers` 托管记录的统一约定（`useManagedLayerRegistry.addManagedLayerRecord:160`）：**OL 图层实例存 `layer` 字段**。坐标转换、坐标导出、可见性、样式、导入 3D 等所有消费方均读 `.layer`。

但 `DistrictManager.syncManagedLayerRecord`（`services/DistrictManager.ts:310`，历史版本）把 OL 图层存成了 `_layer`：

```js
const nextRecord = { ..., _layer };  // ← 与约定不符
```

于是 `layerData?.layer?.getSource?.()` 取空 → 判非矢量 → 警告。**区划图层本身是标准 OL VectorLayer + VectorSource（DistrictManager.createLayerForDistrict 构建），字段名错了而已。**

佐证：`useGeometryEdit.js:43-48` 早有补丁 `layerItem?.layer || layerItem?._layer`，注释写明"兼容两种字段"——同一字段漂移的第三处暴露点（前两处：几何编辑曾静默失败；本次坐标转换/导出直接报错）。

## 三、修复

1. `DistrictManager.ts`：记录字段迁移 `_layer` → `layer: _layer`；previousRecord 扩散会带回旧 `_layer`，显式 `delete` 清理；补注释说明约定来源与历史缺陷。
2. `useGeometryEdit.js`：注释更新为"约定字段 layer，`_layer` 为历史兜底"，逻辑不动（`layer` 优先，行为不变）。

区划记录 `metadata.crs='wgs84'`（DistrictManager:307），转换方向判定（explicitFromCrs/currentCrs）、要素序列化（serializeManagedFeatures）、`source.changed()`/`emitUserLayersChange()` 回流链路本就完备，字段对齐后即通。

## 四、验证

- ESLint（DistrictManager.ts / useGeometryEdit.js）：0 error。
- esbuild 语法转换通过。
- 全项目 `tsc --noEmit -p tsconfig.json`：**零错误**。

## 五、影响面（同一字段修复的受益项）

| 功能 | 修复前 | 修复后 |
|---|---|---|
| 区划坐标转换 WGS-84 ⇄ GCJ-02 | 报错"不是矢量图层" | 正常 |
| 区划坐标导出 CSV/TXT/GeoJSON/KML | 报错"不是矢量图层，无法导出坐标" | 正常 |
| 区划几何编辑（TOC 编辑要素） | 靠兼容补丁侥幸可用 | 走标准字段 |
| 区划样式设置（setUserLayerStyle 读 .layer） | 静默无操作 | 正常 |
| 区划「导入到 3D」（exportUserLayerGeoJSON 读 .layer） | 提示"没有可导入的矢量要素" | 正常 |

建议人工回归：加载行政区划 → 右键 WGS-84 => GCJ-02 → 应成功且边界几何偏移生效；再切回 GCJ-02 => WGS-84 往返一致。
