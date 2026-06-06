# 2026-06-04 数据与渲染分离架构 - TOC 管理与大数据量渲染兼顾

## 📅 日期和时间
2026-06-04 17:00

---

## 📋 修改内容

**架构优化**：实现数据与渲染分离架构，TOC 管理基于 DataManager，渲染使用 OL/WebGL

---

## 🔍 问题分析

### 核心痛点
- 数据量大时，OL 渲染卡顿
- TOC 管理（导出/属性查询）依赖 OL 图层实例
- 无法独立优化渲染性能

### 根本原因
- 数据和渲染耦合在一起
- 导出功能需要遍历 OL 要素
- 属性查询依赖 OL 图层

---

## 🛠️ 解决方案：数据与渲染分离架构

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    DataManager（数据层）                  │
│  - 存储所有要素数据（GeoJSON）                           │
│  - 提供属性查询、导出功能                               │
│  - 不依赖 OL，纯数据操作                                │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                    Renderer（渲染层）                     │
│  - 从 DataManager 获取数据                               │
│  - 使用 OL 渲染（Canvas/WebGL）                         │
│  - 只负责可视化，不管理数据                              │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                    TOC Manager（管理层）                  │
│  - 基于 DataManager 管理图层                             │
│  - 导出、属性查询等操作                                 │
│  - 不依赖渲染方式                                       │
└─────────────────────────────────────────────────────────┘
```

### 关键特性

1. **数据层（DataManager）**：
   - 存储 GeoJSON 数据，不依赖 OL
   - 提供导出（GeoJSON/CSV）、属性查询功能
   - 支持大数据量高效存储

2. **渲染层（OL/WebGL）**：
   - 从 DataManager 获取数据
   - 根据数据量自动选择渲染方式
   - 只负责可视化，不管理数据

3. **TOC 管理**：
   - 基于 DataManager 进行数据操作
   - 导出、属性查询不依赖渲染
   - 支持任意渲染方式（Canvas/WebGL）

---

## 📊 性能对比

| 操作 | 旧架构（耦合） | 新架构（分离） | 说明 |
|------|----------------|----------------|------|
| 大数据渲染 | ❌ 卡顿 | ✅ 流畅 | WebGL 渲染 |
| 导出功能 | ⚠️ 依赖 OL | ✅ 独立 | 基于 DataManager |
| 属性查询 | ⚠️ 依赖 OL | ✅ 独立 | 基于 DataManager |
| TOC 管理 | ⚠️ 耦合 | ✅ 解耦 | 数据与渲染分离 |

---

## ✅ 功能兼容性

| 功能 | Canvas | WebGL | DataManager | 说明 |
|------|--------|-------|-------------|------|
| 属性查询 | ✅ | ✅ | ✅ | 基于 DataManager |
| 导出 GeoJSON | ✅ | ✅ | ✅ | 基于 DataManager |
| 导出 CSV | ✅ | ✅ | ✅ | 基于 DataManager |
| TOC 显隐 | ✅ | ✅ | ✅ | 渲染层控制 |
| 样式编辑 | ✅ | ⚠️ | ✅ | WebGL 样式语法不同 |
| 属性表 | ✅ | ✅ | ✅ | 基于 DataManager |

---

## 📁 新增文件

```
D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useDataManager.js
  - 数据管理器核心实现
  - GeoJSON/CSV 导出功能
  - 属性查询、属性表功能
  - 不依赖 OL，纯数据操作
```

---

## 📁 修改文件

```
D:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useCreateManagedVectorLayer.js
  - 集成 DataManager
  - 创建图层时同时更新 DataManager
  - 保持渲染层与数据层同步
```

---

## 🎯 使用示例

### 1. 创建 DataManager

```javascript
import { createDataManager } from './useDataManager';

const dataManager = createDataManager({
    emitUserLayersChange: () => { /* 更新 TOC */ },
    emitGraphicsOverview: () => { /* 更新概览 */ },
});
```

### 2. 创建图层（自动同步 DataManager）

```javascript
await createManagedVectorLayer({
    name: '渔网_100m_面',
    type: 'Polygon',
    sourceType: 'upload',
    features: fishnetFeatures,
    fitView: true,
});
// DataManager 自动更新
```

### 3. 导出功能（基于 DataManager）

```javascript
// 导出 GeoJSON
const geojson = dataManager.exportToGeoJSON(layerId);

// 导出 CSV
const csv = dataManager.exportToCSV(layerId);

// 属性查询
const props = dataManager.getFeatureProperties(layerId, 0);

// 属性表
const table = dataManager.getAttributeTable(layerId);
```

---

## 🎯 后续优化方向

1. **增量更新**：支持大数据量增量添加要素
2. **空间索引**：为大数据量添加 R-Tree 索引
3. **分块加载**：支持流式加载超大数据集
4. **虚拟化渲染**：只渲染可视区域内的要素

---

*"代码是写给机器看的，但文档是写给未来的自己看的。"*
