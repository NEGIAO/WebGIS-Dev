/**
 * useLayerMetadataNormalization.ts
 *
 * 图层元数据与属性快照标准化 — 公共入口。
 * 输出统一的属性结构，供图层注册、属性表和联动高亮共用。
 *
 * 实现按职责分层在同目录 `metadata/` 下：
 * - `htmlAttributes`  富文本属性（table / dl）解析
 * - `valueUtils`      克隆/纯对象判定/值类型推断/嵌套扁平化
 * - `geometry`        3857 反算、几何类型与范围、要素代表点
 * - `featureRecords`  稳定 ID、原始属性抽取、字段配置、单条统计
 * - `layerSnapshot`   图层元数据补齐与属性快照聚合
 *
 * 对外 API（`normalizeHtmlAttributes` / `createLayerMetadataNormalizationFeature`）保持不变。
 */

import { normalizeHtmlAttributes } from './metadata/htmlAttributes';
import {
    ensureStableFeatureId,
    normalizeFeatureRecord,
    readExistingFeatureId,
} from './metadata/featureRecords';
import {
    getFeatureRepresentativeLonLat,
    inferLayerRepresentativeLonLat,
} from './metadata/geometry';
import { normalizeLayerAttributeSnapshot, normalizeLayerMetadata } from './metadata/layerSnapshot';
import { flattenAttributes, inferValueType } from './metadata/valueUtils';

export { normalizeHtmlAttributes };

export function createLayerMetadataNormalizationFeature() {
    return {
        flattenAttributes,
        inferValueType,
        readExistingFeatureId,
        ensureStableFeatureId,
        normalizeFeatureRecord,
        normalizeLayerAttributeSnapshot,
        getFeatureRepresentativeLonLat,
        inferLayerRepresentativeLonLat,
        normalizeLayerMetadata,
    };
}
