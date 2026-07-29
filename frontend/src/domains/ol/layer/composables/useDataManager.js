/**
 * DataManager - 数据与渲染分离架构的核心
 *
 * 职责：
 * 1. 管理所有矢量图层的数据（GeoJSON 格式）
 * 2. 提供属性查询、导出功能（不依赖 OL）
 * 3. 支持大数据量高效存储和检索
 * 4. 为渲染层提供数据接口
 *
 * 优势：
 * - 数据与渲染解耦，可独立优化
 * - 导出/查询不依赖 OL 渲染
 * - 支持 WebGL/Canvas 等多种渲染方式
 */

import GeoJSON from 'ol/format/GeoJSON';

// 复用 GeoJSON 格式实例（避免每次转换都创建新实例）
const geoJSONFormat = new GeoJSON();

// 字段提取采样数量（大数据量时只采样前 N 个要素）
const FIELD_SAMPLE_SIZE = 100;

// UTF-8 BOM 头（用于 CSV 导出，防止中文乱码）
const UTF8_BOM = '﻿';

/**
 * 创建数据管理器
 * @param {Object} options 配置选项
 * @param {Function} options.emitUserLayersChange - 图层变化事件
 * @param {Function} options.emitGraphicsOverview - 图形概览事件
 * @returns {Object} 数据管理器实例
 */
export function createDataManager({
    emitUserLayersChange = () => {},
    emitGraphicsOverview = () => {},
}) {
    // 数据存储：layerId -> { id, name, type, sourceType, metadata, features, geojson }
    const dataStore = new Map();

    // 图层顺序
    const layerOrder = [];

    // ID 计数器
    let nextId = 1;

    /**
     * 生成唯一 ID
     * @returns {string} 图层 ID
     */
    function generateId() {
        return `layer_${nextId++}`;
    }

    /**
     * 添加图层数据
     * @param {Object} params 图层参数
     * @param {string} params.name - 图层名称
     * @param {string} params.type - 图层类型（Point/LineString/Polygon）
     * @param {string} params.sourceType - 数据来源（upload/draw/analysis）
     * @param {Array} params.features - OL Feature 数组
     * @param {Object} params.metadata - 元数据
     * @returns {string} 图层 ID
     */
    function addLayer({ name, type, sourceType, features, metadata = {} }) {
        const id = generateId();

        // 转换为 GeoJSON（标准化格式）
        const geojson = convertFeaturesToGeoJSON(features);

        // 提取属性字段（采样优化，避免遍历所有要素）
        const fields = extractFields(features);

        // 存储数据
        dataStore.set(id, {
            id,
            name,
            type,
            sourceType,
            metadata: {
                ...metadata,
                featureCount: features.length,
                fields,
                createdAt: new Date().toISOString(),
            },
            features, // OL Feature 引用（用于渲染）
            geojson,   // GeoJSON 数据（用于导出/查询）
        });

        // 添加到顺序列表
        layerOrder.push(id);

        // 触发事件
        emitUserLayersChange();
        emitGraphicsOverview();

        return id;
    }

    /**
     * 删除图层
     * @param {string} layerId 图层 ID
     */
    function removeLayer(layerId) {
        if (!dataStore.has(layerId)) return;

        dataStore.delete(layerId);
        const index = layerOrder.indexOf(layerId);
        if (index > -1) {
            layerOrder.splice(index, 1);
        }

        emitUserLayersChange();
        emitGraphicsOverview();
    }

    /**
     * 获取图层数据
     * @param {string} layerId 图层 ID
     * @returns {Object|null} 图层数据
     */
    function getLayer(layerId) {
        return dataStore.get(layerId) || null;
    }

    /**
     * 获取所有图层列表（用于 TOC）
     * @returns {Array} 图层列表
     */
    function getAllLayers() {
        return layerOrder.map(id => {
            const layer = dataStore.get(id);
            if (!layer) return null;
            return {
                id: layer.id,
                name: layer.name,
                type: layer.type,
                sourceType: layer.sourceType,
                featureCount: layer.metadata.featureCount,
                fields: layer.metadata.fields,
                visible: true, // 可见性由渲染层控制
            };
        }).filter(Boolean);
    }

    /**
     * 导出图层为 GeoJSON
     * @param {string} layerId 图层 ID
     * @returns {Object|null} GeoJSON 数据
     */
    function exportToGeoJSON(layerId) {
        const layer = dataStore.get(layerId);
        if (!layer) return null;

        return {
            ...layer.geojson,
            name: layer.name,
            _metadata: layer.metadata,
        };
    }

    /**
     * 导出图层为 CSV
     * @param {string} layerId 图层 ID
     * @returns {string|null} CSV 字符串
     */
    function exportToCSV(layerId) {
        const layer = dataStore.get(layerId);
        if (!layer) return null;

        const features = layer.geojson.features;
        if (!features.length) return null;

        // 提取所有字段
        const fields = layer.metadata.fields;
        const headers = ['id', ...fields, 'geometry_type', 'coordinates'];

        // 生成 CSV 行
        const rows = features.map((f, index) => {
            const props = f.properties || {};
            const values = [
                index + 1,
                ...fields.map(field => props[field] ?? ''),
                f.geometry?.type || '',
                JSON.stringify(f.geometry?.coordinates || []),
            ];
            return values.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });

        // 添加 UTF-8 BOM 头（防止 Excel 打开中文乱码）
        return UTF8_BOM + headers.join(',') + '\n' + rows.join('\n');
    }

    /**
     * 查询要素属性
     * @param {string} layerId 图层 ID
     * @param {number} featureIndex 要素索引
     * @returns {Object|null} 要素属性
     */
    function getFeatureProperties(layerId, featureIndex) {
        const layer = dataStore.get(layerId);
        if (!layer) return null;

        const feature = layer.geojson.features[featureIndex];
        if (!feature) return null;

        return {
            ...feature.properties,
            _geometry: feature.geometry,
        };
    }

    /**
     * 查询属性表数据
     * @param {string} layerId 图层 ID
     * @returns {Array|null} 属性表数据
     */
    function getAttributeTable(layerId) {
        const layer = dataStore.get(layerId);
        if (!layer) return null;

        return layer.geojson.features.map((f, index) => ({
            _index: index,
            ...f.properties,
        }));
    }

    /**
     * 获取图层统计信息
     * @param {string} layerId 图层 ID
     * @returns {Object|null} 统计信息
     */
    function getLayerStatistics(layerId) {
        const layer = dataStore.get(layerId);
        if (!layer) return null;

        return {
            featureCount: layer.metadata.featureCount,
            fields: layer.metadata.fields,
            type: layer.type,
            sourceType: layer.sourceType,
            createdAt: layer.metadata.createdAt,
        };
    }

    /**
     * 清空所有数据
     */
    function clearAll() {
        dataStore.clear();
        layerOrder.length = 0;
        emitUserLayersChange();
        emitGraphicsOverview();
    }

    /**
     * 获取数据存储（用于渲染层）
     * @returns {Map} 数据存储
     */
    function getDataStore() {
        return dataStore;
    }

    /**
     * 获取图层顺序
     * @returns {Array} 图层 ID 顺序
     */
    function getLayerOrder() {
        return [...layerOrder];
    }

    /**
     * 获取图层总数
     * @returns {number} 图层数量
     */
    function getLayerCount() {
        return dataStore.size;
    }

    /**
     * 检查图层是否存在
     * @param {string} layerId 图层 ID
     * @returns {boolean} 是否存在
     */
    function hasLayer(layerId) {
        return dataStore.has(layerId);
    }

    return {
        addLayer,
        removeLayer,
        getLayer,
        getAllLayers,
        exportToGeoJSON,
        exportToCSV,
        getFeatureProperties,
        getAttributeTable,
        getLayerStatistics,
        clearAll,
        getDataStore,
        getLayerOrder,
        getLayerCount,
        hasLayer,
    };
}

/**
 * 将 OL Feature 数组转换为 GeoJSON
 * @param {Array} features OL Feature 数组
 * @returns {Object} GeoJSON 数据
 */
function convertFeaturesToGeoJSON(features) {
    return geoJSONFormat.writeFeaturesObject(features, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
    });
}

/**
 * 从要素中提取属性字段（采样优化）
 * 大数据量时只采样前 FIELD_SAMPLE_SIZE 个要素，避免遍历所有要素
 * @param {Array} features OL Feature 数组
 * @returns {Array} 字段名列表
 */
function extractFields(features) {
    const fieldsSet = new Set();

    // 采样：只遍历前 N 个要素，避免大数据量时性能问题
    const sampleSize = Math.min(features.length, FIELD_SAMPLE_SIZE);
    for (let i = 0; i < sampleSize; i++) {
        const props = features[i].getProperties();
        Object.keys(props).forEach(key => {
            // 排除几何对象和内部字段
            if (key !== 'geometry' && !key.startsWith('_')) {
                fieldsSet.add(key);
            }
        });
    }

    return Array.from(fieldsSet);
}
