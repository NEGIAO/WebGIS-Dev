<template>
    <div class="layer-switcher">
        <LocationSearch
            :fetcher="fetcher"
            :amapKey="amapKey"
            :services="services"
            storageKey="map_search_selected_service"
            @select-result="handleSearchJump"
        />

        <div class="layer-label">选择底图</div>
        <select class="layer-select" :value="selectedLayer" @change="handleLayerChange">
            <option
                v-for="option in BASEMAP_OPTIONS"
                :key="option.value"
                :value="option.value"
            >
                {{ option.label }}
            </option>
        </select>

        <button class="layer-manage-btn" @click="showLayerManager = !showLayerManager" title="图层管理">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8 9.5 9.25 12 11zm0 2.5l-5-2.5-2 1L12 15.5l7-3.5-2-1-5 2.5zm0 5l-5-2.5-2 1L12 21l7-3.5-2-1-5 2.5z"/>
            </svg>
        </button>

        <button
            class="graticule-btn"
            :class="{ active: activeGraticule }"
            @click="emit('toggle-graticule')"
            title="经纬度分割线"
        >
            经纬线
        </button>

        <div v-if="selectedLayer === 'custom'" class="custom-url-wrapper">
            <input
                v-model="customUrlInput"
                class="custom-url-input"
                placeholder="输入 https://.../{z}/{x}/{y}.png"
            />
            <button class="custom-url-btn" @click="submitCustomUrl" title="加载">ok</button>
        </div>

        <div v-if="showLayerManager" class="layer-manager-panel">
            <div class="panel-header">
                <span>图层排序与显示</span>
                <span class="close-panel-btn" @click="showLayerManager = false">×</span>
            </div>
            <div class="layer-list">
                <div
                    v-for="(layer, index) in layerList"
                    :key="layer.id"
                    class="layer-item"
                    draggable="true"
                    @dragstart="onDragStart($event, index)"
                    @dragover.prevent
                    @drop="onDrop($event, index)"
                    :class="{ dragging: draggingIndex === index }"
                >
                    <div class="drag-handle">⋮⋮</div>
                    <input
                        type="checkbox"
                        :checked="layer.visible"
                        @change="updateLayerVisibility(layer, $event)"
                    >
                    <span class="layer-name">{{ layer.name }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { defineAsyncComponent, ref, watch } from 'vue';

// ========== 异步导入子组件 ==========
/** 地名搜索组件，支持多个服务源（天地图、国际、高德） */
const LocationSearch = defineAsyncComponent(() => import('./LocationSearch.vue'));

// ========== 底图供应商配置 (共 27 种) ==========
/**
 * 预设底图选项列表
 * 包含本地瓦片、天地图、Google、OSM、高德、腾讯、Yandex 等全球服务
 * 支持自定义 URL 底图输入
 */
const BASEMAP_OPTIONS = [
    { value: 'local', label: '自定义瓦片' },
    { value: 'tianDiTu_vec', label: '天地图矢量' },
    { value: 'tianDiTu', label: '天地图影像' },
    { value: 'google', label: 'Google(gac)' },
    { value: 'Google', label: 'Google原版' },
    { value: 'google_standard', label: 'Google标准' },
    { value: 'google_clean', label: 'Google简洁' },
    { value: 'osm', label: 'OSM(需梯子)' },
    { value: 'yandex_sat', label: 'Yandex卫星' },
    { value: 'geoq_gray', label: 'GeoQ灰(GCJ)' },
    { value: 'geoq_hydro', label: 'GeoQ水(GCJ)' },
    { value: 'amap', label: '高德地图(GCJ)' },
    { value: 'amap_image', label: '高德影像(GCJ)' },
    { value: 'tengxun', label: '腾讯地图(GCJ)' },
    { value: 'topo', label: '地形图' },
    { value: 'opentopomap', label: 'OpenTopoMap' },
    { value: 'esa_topo', label: '欧空局地形' },
    { value: 'windy', label: 'windy' },
    { value: 'windy2', label: 'windy2' },
    { value: 'windy_outer', label: 'windy轮廓' },
    { value: 'windy_greenland', label: 'windy Gray' },
    { value: 'carton_light', label: 'CartoDB' },
    { value: 'carton_dark', label: 'CartoDB Dark' },
    { value: 'wikepedia', label: 'Wikipedia' },
    { value: 'toner', label: 'Stamen Toner' },
    { value: 'alidade', label: 'Alidade Sm' },
    { value: 'custom', label: '自定义URL' }
];

// ========== 组件 Props 定义 ==========
/**
 * @prop {Object} mapInstance - OpenLayers Map 实例（ShallowRef 包装）
 * @prop {Array} layerList - 当前图层列表，每项含 { id, name, visible }
 * @prop {Boolean} activeGraticule - 经纬网是否激活对象常用
 * @prop {String} selectedLayer - 当前选中底图的 ID
 * @prop {String} customMapUrl - 自定义 XYZ 底图 URL
 * @prop {Function} fetcher - 地名检索请求函数（由父组件 MapContainer 提供）
 * @prop {String} amapKey - 高德地图 API Key（用于逆地理编码等服务）
 * @prop {Array} services - 启用的地名检索服务列表（如 ['tianditu', 'nominatim']）
 */
const props = defineProps({
    mapInstance: {
        type: Object,
        default: null
    },
    layerList: {
        type: Array,
        default: () => []
    },
    activeGraticule: {
        type: Boolean,
        default: false
    },
    selectedLayer: {
        type: String,
        default: 'google'
    },
    customMapUrl: {
        type: String,
        default: ''
    },
    fetcher: {
        type: Function,
        required: true
    },
    amapKey: {
        type: String,
        default: ''
    },
    services: {
        type: Array,
        default: () => []
    }
});

const emit = defineEmits([
    'change-layer',
    'update-order',
    'toggle-graticule',
    'search-jump'
]);

const showLayerManager = ref(false);
const draggingIndex = ref(-1);
const customUrlInput = ref(props.customMapUrl || '');

watch(
    () => props.customMapUrl,
    (value) => {
        customUrlInput.value = value || '';
    }
);

function handleLayerChange(event) {
    emit('change-layer', {
        layerId: event.target.value,
        source: 'dropdown'
    });
}

function submitCustomUrl() {
    emit('change-layer', {
        layerId: 'custom',
        source: 'custom-url',
        customUrl: customUrlInput.value
    });
}

function onDragStart(evt, index) {
    draggingIndex.value = index;
    evt.dataTransfer.effectAllowed = 'move';
}

function onDrop(evt, dropIndex) {
    emit('update-order', {
        type: 'reorder',
        dragIndex: draggingIndex.value,
        dropIndex
    });
    draggingIndex.value = -1;
}

function updateLayerVisibility(layer, event) {
    emit('update-order', {
        type: 'visibility',
        layerId: layer.id,
        visible: !!event?.target?.checked
    });
}

function handleSearchJump(payload) {
    emit('search-jump', payload);
}
</script>

<style scoped>
.layer-switcher {
    position: absolute;
    top: 15px;
    right: 15px;
    background: rgb(48, 148, 65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(14, 178, 71, 0.35);
    padding: 4px;
    border-radius: 8px;
    box-shadow: 0 10px 24px rgba(16, 65, 41, 0.22);
    z-index: 10;
}

.layer-select {
    padding: 4px 8px;
    border: 1px solid rgba(22, 158, 69, 0.45);
    border-radius: 4px;
    outline: none;
    display: inline-block;
    margin: 0 0 0 6px;
    vertical-align: middle;
    background: rgba(255, 255, 255, 0.832);
    color: #000000;
}

.layer-select option {
    color: #0f172a;
}

.layer-label {
    color: #ecfdf5;
    font-size: 13px;
    display: inline-block;
    margin: 0;
    vertical-align: middle;
}

.custom-url-wrapper {
    margin-top: 6px;
    display: flex;
    gap: 4px;
}

.custom-url-input {
    flex: 1;
    width: 160px;
    padding: 4px;
    border-radius: 4px;
    border: 1px solid rgba(220, 252, 231, 0.35);
    font-size: 12px;
    background: rgba(255, 255, 255, 0.18);
    color: #f0fdf4;
}

.custom-url-input::placeholder {
    color: rgba(236, 253, 245, 0.7);
}

.custom-url-btn {
    padding: 2px 6px;
    border-radius: 4px;
    border: none;
    background: rgba(240, 253, 244, 0.92);
    color: #14532d;
    cursor: pointer;
    font-size: 12px;
}

.layer-manage-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #ecfdf5;
    padding: 4px;
    margin-left: 4px;
    vertical-align: middle;
}

.layer-manage-btn:hover {
    color: #bbf7d0;
}

.graticule-btn {
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(220, 252, 231, 0.45);
    color: #ecfdf5;
    border-radius: 4px;
    cursor: pointer;
    padding: 3px 8px;
    margin-left: 4px;
    font-size: 12px;
    vertical-align: middle;
}

.graticule-btn:hover {
    background: rgba(255, 255, 255, 0.24);
}

.graticule-btn.active {
    background: #f0fdf4;
    color: #166534;
    border-color: #f0fdf4;
    font-weight: 700;
}

.layer-manager-panel {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 6px;
    width: 200px;
    background: rgba(255, 255, 255, 0.96);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
    z-index: 2000;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    background: #f0fdf4;
    border-bottom: 1px solid #bbf7d0;
    border-radius: 4px 4px 0 0;
    font-size: 13px;
    font-weight: bold;
    color: #166534;
}

.close-panel-btn {
    cursor: pointer;
    font-size: 16px;
    color: #86efac;
    line-height: 1;
}

.close-panel-btn:hover {
    color: #ef4444;
}

.layer-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
}

.layer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 4px;
    cursor: move;
    font-size: 13px;
    user-select: none;
}

.layer-item:hover {
    background: #f0f0f0;
}

.layer-item.dragging {
    opacity: 0.5;
    background: #e0e0e0;
}

.drag-handle {
    cursor: grab;
    color: #999;
    font-weight: bold;
    padding-right: 4px;
}

.layer-name {
    flex: 1;
}
</style>
