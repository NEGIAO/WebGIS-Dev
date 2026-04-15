<template>
    <div class="toolbox-panel">
        <!-- <input ref="fileInputRef" type="file" multiple class="hidden-input" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.dbf,.shx,.prj,.cpg,.tif,.tiff" @change="handleFileUpload" /> -->
                <input ref="fileInputRef" type="file" multiple class="hidden-input" accept="." @change="handleFileUpload" />
        <input ref="folderInputRef" type="file" multiple webkitdirectory directory class="hidden-input" @change="handleDirectoryUpload" />

        <div class="header">
            <div>
                <div class="title">工具箱</div>
            </div>
            <button class="ghost-btn" @click="emit('close')">关闭</button>
        </div>

        <div class="tabs">
            <button class="tab" :class="{ active: activeTab === 'layers' }" @click="activeTab = 'layers'">图层</button>
            <button class="tab" :class="{ active: activeTab === 'draw' }" @click="activeTab = 'draw'">绘制</button>
            <button class="tab" :class="{ active: activeTab === 'style' }" @click="activeTab = 'style'">样式</button>
        </div>

        <div v-if="activeTab === 'layers'" class="panel-scroll">
            <LayerPanel
                :draw-layers="drawLayers"
                :route-layers="routeLayers"
                :search-layers="searchLayers"
                :upload-layers="uploadLayers"
                :has-draw-card="hasDrawCard"
                :overview="overview"
                :is-raster-layer="isRasterLayer"
                @action="handleLayerTreeAction"
            />

            <div class="upload-zone-wrap">
                <div
                    class="upload-entry"
                    :class="{ dragging: isUploadDragging }"
                    @dragenter.prevent="handleUploadDragEnter"
                    @dragover.prevent="handleUploadDragOver"
                    @dragleave.prevent="handleUploadDragLeave"
                    @drop.prevent="handleUploadDrop"
                >
                    <div class="card-top">
                        <div class="card-title upload-title">
                            <span class="upload-icon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 16V5"></path>
                                    <path d="m8 9 4-4 4 4"></path>
                                    <path d="M20 16.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5"></path>
                                </svg>
                            </span>
                            上传图层
                        </div>
                        <div class="upload-btns">
                            <button class="small-btn" @click="triggerFileUpload">上传文件</button>
                            <button class="small-btn ghost" @click="triggerFolderUpload">上传文件夹</button>
                        </div>
                    </div>
                    <div class="upload-tip">支持单文件、多文件、文件夹上传，也可拖拽到此区域</div>
                    <div class="upload-crs-tip">
                        <span>❗ 文件大小不超过 {{ MAX_FILE_SIZE_MB }} MB❗</span>
                        <span>🔔数据格式：GeoJSON、KML、KMZ、TIF、SHP</span>
                    </div>
                    <div v-if="shouldShowUploadProgress" class="upload-progress" :class="`phase-${uploadProgressView.phase}`">
                        <div class="upload-progress-head">
                            <span>导入状态：{{ uploadProgressView.current }}/{{ uploadProgressView.total || 1 }}</span>
                            <span>{{ uploadProgressLabel }}</span>
                        </div>
                        <div class="upload-progress-bar">
                            <div class="upload-progress-fill" :style="{ width: `${uploadProgressPercent}%` }"></div>
                        </div>
                        <div class="upload-progress-meta">
                            <span>成功 {{ uploadProgressView.success }}</span>
                            <span>失败 {{ uploadProgressView.failed }}</span>
                            <span v-if="uploadProgressView.warnings">警告 {{ uploadProgressView.warnings }}</span>
                            <span v-if="uploadProgressView.errors">错误 {{ uploadProgressView.errors }}</span>
                        </div>
                        <div v-if="uploadProgressView.message" class="upload-progress-message">{{ uploadProgressView.message }}</div>
                    </div>
                </div>
            </div>

            <!-- 共享资源菜单 -->
            <div class="shared-resource-wrap">
                <div class="card shared-resource-card">
                    <div class="card-title shared-resource-title">
                        <span class="share-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="18" cy="5" r="3"></circle>
                                <circle cx="6" cy="12" r="3"></circle>
                                <circle cx="18" cy="19" r="3"></circle>
                                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                            </svg>
                        </span>
                        共享资源
                    </div>
                    <div class="shared-resource-menu">
                        <button 
                            class="shared-resource-btn" 
                            :class="{ loading: sharedLoader.isScanning.value }"
                            @click="scanSharedResources"
                        >
                            <span v-if="!sharedLoader.isScanning.value">📁 加载资源</span>
                            <span v-else>⏳ 扫描中...</span>
                        </button>
                        <div v-if="sharedLoader.hasResources.value" class="resource-tree-root">
                            <SharedResourceTreeItem
                                v-for="node in sharedLoader.resourceTree.value"
                                :key="node.id"
                                :node="node"
                                :level="0"
                                @load-resource="loadSharedResource"
                            />
                        </div>
                        <div v-else-if="!sharedLoader.isScanning.value && lastScanAttempted" class="resource-empty">
                            暂无可用资源
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-else-if="activeTab === 'draw'" class="panel-scroll">
            <div class="card draw-card">
                <div class="card-title">绘制工具</div>
                <div class="draw-grid">
                    <button
                        v-for="tool in drawTools"
                        :key="tool.value"
                        class="draw-tool-btn"
                        :class="{ active: selectedDrawTool === tool.value }"
                        @click="activateDrawTool(tool.value)"
                    >
                        {{ tool.label }}
                    </button>
                </div>
                <div class="actions-row">
                    <button class="draw-op-btn draw-op-primary" @click="emit('interaction', 'ZoomToGraphics')">缩放图形</button>
                    <button class="draw-op-btn draw-op-warning" @click="emit('interaction', 'Clear')">清空</button>
                </div>

                <div class="coord-input-panel">
                    <div class="card-title">坐标绘制点位</div>
                    <div class="coord-input-grid">
                        <input
                            v-model.trim="coordInputLon"
                            class="coord-input-field"
                            type="text"
                            placeholder="请输入经度（-180 ~ 180）"
                            @keyup.enter="drawPointByCoordinates"
                        />
                        <input
                            v-model.trim="coordInputLat"
                            class="coord-input-field"
                            type="text"
                            placeholder="请输入纬度（-90 ~ 90）"
                            @keyup.enter="drawPointByCoordinates"
                        />
                    </div>

                    <div class="coord-crs-row">
                        <label class="coord-crs-label">坐标系</label>
                        <select v-model="coordInputCRS" class="coord-crs-select">
                            <option value="wgs84">WGS-84</option>
                            <option value="gcj02">GCJ-02</option>
                        </select>
                    </div>

                    <div class="coord-input-actions">
                        <button class="small-btn btn-accent" @click="drawPointByCoordinates">绘制点位</button>
                        <button class="small-btn ghost" @click="clearCoordinateInput">清空输入</button>
                    </div>

                    <div v-if="coordInputError" class="coord-input-error">{{ coordInputError }}</div>

                    <div class="coord-divider"></div>

                    <div class="card-title">p 参数绘制点位</div>
                    <div class="coord-input-grid">
                        <input
                            v-model.trim="coordInputP"
                            class="coord-input-field"
                            type="text"
                            placeholder="请输入 p 参数"
                            @keyup.enter="drawPointByPositionCode"
                        />
                    </div>
                    <div class="coord-input-actions">
                        <button class="small-btn btn-accent" :disabled="isDecodePBusy" @click="drawPointByPositionCode">
                            {{ isDecodePBusy ? '解析中...' : '按 p 绘制' }}
                        </button>
                        <button class="small-btn ghost" @click="clearPositionCodeInput">清空 p</button>
                    </div>
                    <div v-if="coordInputPError" class="coord-input-error">{{ coordInputPError }}</div>
                </div>

                <div class="coord-input-panel geocode-tool-panel">
                    <div class="card-title">地理编码工具</div>

                    <div class="geocode-subtitle">地理编码（地址 -> 坐标）</div>
                    <div class="coord-input-grid">
                        <input
                            v-model.trim="geocodeAddressInput"
                            class="coord-input-field"
                            type="text"
                            placeholder="请输入地址信息（用于编码与标注）"
                            @keyup.enter="drawPointByGeocodeAddress"
                        />
                        <input
                            v-model.trim="geocodeCityInput"
                            class="coord-input-field"
                            type="text"
                            placeholder="可选：城市限定（提升编码精度）"
                            @keyup.enter="drawPointByGeocodeAddress"
                        />
                    </div>
                    <div class="coord-input-actions">
                        <button class="small-btn btn-accent" :disabled="isGeocodeBusy" @click="drawPointByGeocodeAddress">
                            {{ isGeocodeBusy ? '编码中...' : '编码并绘制' }}
                        </button>
                        <button class="small-btn ghost" @click="clearGeocodeInput">清空地址</button>
                    </div>

                    <div class="coord-divider"></div>

                    <div class="geocode-subtitle">逆地理编码（地图点选 -> 地址）</div>
                    <div class="coord-input-actions single-action">
                        <button class="small-btn btn-accent" @click="startReverseGeocodePick">地图点选逆编码并绘制</button>
                    </div>
                    <div class="geocode-tip">点击按钮后，请在地图中单击一个点，系统将自动逆地理编码并加入 TOC。</div>

                    <div v-if="geocodeToolError" class="coord-input-error">{{ geocodeToolError }}</div>
                </div>
            </div>

            <div class="hint draw-hint">
                <div>鼠标事件</div>
                <div>左键：选中/查看图层</div>
                <div>右键：仅显示当前图层</div>
                <div>地图右键：快速触发属性查询</div>
            </div>
        </div>

        <div v-else class="panel-scroll style-scroll">
            <div class="style-panel">
                <div class="card-title">样式模板</div>
                <div class="template-chip-row">
                    <button class="template-chip" v-for="t in styleTemplates" :key="t.id" @click="applyTemplate(t.id)">
                        <span class="chip-dot" :style="{ backgroundColor: t.color }"></span>
                        <span>{{ t.name }}</span>
                    </button>
                </div>

                <div class="style-divider"></div>

                <div class="card-title">样式编辑</div>
                <div class="field">
                    <label>编辑目标</label>
                    <div class="select-wrap">
                        <select v-model="selectedEditLayerId" class="style-select">
                            <option v-for="layer in editableLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option>
                        </select>
                    </div>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <label>填充色</label>
                        <input type="color" class="style-color" v-model="styleForm.fillColor" />
                    </div>
                    <div class="field">
                        <label>边框色</label>
                        <input type="color" class="style-color" v-model="styleForm.strokeColor" />
                    </div>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <div class="slider-head">
                            <label>填充透明度</label>
                            <span>{{ styleForm.fillOpacityPct }}%</span>
                        </div>
                        <input class="style-slider" type="range" min="0" max="100" v-model.number="styleForm.fillOpacityPct" />
                    </div>
                    <div class="field">
                        <div class="slider-head">
                            <label>边框宽度</label>
                            <span>{{ styleForm.strokeWidth }}</span>
                        </div>
                        <input class="style-slider" type="range" min="1" max="8" step="0.5" v-model.number="styleForm.strokeWidth" />
                    </div>
                </div>
                <button class="small-btn style-apply-btn" @click="applyStyle">应用样式</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useMessage } from '../composables/useMessage';
import { useGisLoader } from '../composables/useGisLoader';
import { useSharedResourceLoader } from '../composables/useSharedResourceLoader';
import { useLayerStore, useAttrStore } from '../stores';
import { useStyleEditor } from '../constants';
import { COORDINATE_FORMATS, DECIMAL_PLACES, formatCoordinate } from '../utils/coordinateFormatter';
import { generatePointName, processCoordinateInput } from '../utils/coordinateInputHandler';
import { decodePos } from '../utils/urlCrypto';
import { addressToLocation, reverseGeocodeByPriority } from '../api/geocoding';
import LayerPanel from './LayerPanel.vue';
import SharedResourceTreeItem from './SharedResourceTreeItem.vue';


const props = defineProps({
    userLayers: { type: Array, default: () => [] },
    baseLayers: { type: Array, default: () => [] },
    overview: { type: Object, default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }) },
    uploadProgress: { type: Object, default: () => ({ phase: 'idle' }) }
});

const emit = defineEmits([
    'close',
    'upload-data',
    'interaction',
    'layer-selected',
    'toggle-layer-visibility',
    'change-layer-opacity',
    'zoom-layer',
    'view-layer',
    'remove-layer',
    'reorder-user-layers',
    'solo-layer',
    'set-base-layer',
    'toggle-base-layer-visibility',
    'toggle-layer-label-visibility',
    'apply-style-template',
    'update-draw-style',
    'update-layer-style',
    'highlight-attribute-feature',
    'zoom-attribute-feature',
    'draw-point-by-coordinates',
    'toggle-layer-crs',
    'export-layer-data'
]);

const fileInputRef = ref(null);
const folderInputRef = ref(null);
const message = useMessage();
const gisLoader = useGisLoader();
const sharedLoader = useSharedResourceLoader();
const layerStore = useLayerStore();
const attrStore = useAttrStore();
const styleEditor = useStyleEditor();
const activeTab = ref('layers');
const isUploadDragging = ref(false);
const lastScanAttempted = ref(false);
const coordInputLon = ref('');
const coordInputLat = ref('');
const coordInputCRS = ref('wgs84');
const coordInputError = ref('');
const coordInputP = ref('');
const coordInputPError = ref('');
const geocodeAddressInput = ref('');
const geocodeCityInput = ref('');
const geocodeToolError = ref('');
const isDecodePBusy = ref(false);
const isGeocodeBusy = ref(false);
const MB = 1024 * 1024;
const MAX_FILE_SIZE_MB = 200;
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '';

const COORD_STORAGE_KEYS = {
    FORMAT_ID: 'gis_coord_format_id',
    DECIMAL_PLACES: 'gis_coord_decimal_places'
};

function getCurrentFormatConfig() {
    const rawFormatId = String(localStorage.getItem(COORD_STORAGE_KEYS.FORMAT_ID) || 'format_6');
    const rawPlaces = Number(localStorage.getItem(COORD_STORAGE_KEYS.DECIMAL_PLACES) || 6);

    const formatId = COORDINATE_FORMATS[rawFormatId] ? rawFormatId : 'format_6';
    const decimalPlaces = DECIMAL_PLACES[rawPlaces] ? rawPlaces : 6;

    return { formatId, decimalPlaces };
}

const styleTemplates = styleEditor.styleTemplates;

const drawTools = [
    { value: 'AttributeQuery', label: '属性查询' },
    { value: 'Point', label: '点' },
    { value: 'LineString', label: '线' },
    { value: 'Polygon', label: '面' },
    { value: 'MeasureDistance', label: '测距' },
    { value: 'MeasureArea', label: '测面' }
];

const styleForm = styleEditor.styleForm;
const selectedDrawTool = computed(() => layerStore.selectedDrawTool);
const selectedEditLayerId = computed({
    get: () => layerStore.selectedEditLayerId,
    set: (value) => {
        layerStore.selectedEditLayerId = value;
    }
});
const drawLayers = computed(() => layerStore.drawLayers);
const uploadLayers = computed(() => layerStore.uploadLayers);
const routeLayers = computed(() => layerStore.routeLayers);
const searchLayers = computed(() => layerStore.searchLayers);
const hasDrawCard = computed(() => layerStore.hasDrawCard);
const editableLayers = computed(() => layerStore.editableLayers);

const uploadProgressView = computed(() => {
    const raw = props.uploadProgress || {};
    return {
        phase: String(raw.phase || 'idle'),
        total: Math.max(0, Number(raw.total) || 0),
        current: Math.max(0, Number(raw.current) || 0),
        success: Math.max(0, Number(raw.success) || 0),
        failed: Math.max(0, Number(raw.failed) || 0),
        warnings: Math.max(0, Number(raw.warnings) || 0),
        errors: Math.max(0, Number(raw.errors) || 0),
        message: String(raw.message || '')
    };
});

const shouldShowUploadProgress = computed(() => uploadProgressView.value.phase !== 'idle');

const uploadProgressPercent = computed(() => {
    const total = uploadProgressView.value.total;
    const current = uploadProgressView.value.current;
    if (!total) {
        if (uploadProgressView.value.phase === 'done') return 100;
        if (uploadProgressView.value.phase === 'error') return 100;
        return 12;
    }
    return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
});

const uploadProgressLabel = computed(() => {
    const phase = uploadProgressView.value.phase;
    if (phase === 'validating') return '文件校验中';
    if (phase === 'dispatching') return '容器解析中';
    if (phase === 'importing') return '数据导入中';
    if (phase === 'done') return '导入已完成';
    if (phase === 'error') return '导入失败';
    return '等待导入';
});

// 复制图层经纬度信息到剪贴板
// 应当识别当前用户选择的格式，进行转化后复制
async function copyLayerCoordinates(layer) {
    if (!(Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude))) {
        message.warning('当前图层未提供可复制的经纬度信息');
        return;
    }

    const { formatId, decimalPlaces } = getCurrentFormatConfig();
    const lon = Number(layer.longitude);
    const lat = Number(layer.latitude);
    const text = formatCoordinate(lon, lat, formatId, decimalPlaces);

    if (!text) {
        message.warning('坐标格式化失败，无法复制');
        return;
    }

    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        message.success(`已复制坐标：${text}`);
    } catch {
        message.error('复制失败，请稍后重试');
    }
}

function clearCoordinateInput() {
    coordInputLon.value = '';
    coordInputLat.value = '';
    coordInputError.value = '';
}

function clearPositionCodeInput() {
    coordInputP.value = '';
    coordInputPError.value = '';
}

function clearGeocodeInput() {
    geocodeAddressInput.value = '';
    geocodeCityInput.value = '';
    geocodeToolError.value = '';
}

function buildReverseGeocodeProperties(reverseResult) {
    const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
    const province = String(reverseResult?.province || '').trim();
    const city = String(reverseResult?.city || '').trim();
    const district = String(reverseResult?.district || '').trim();
    const township = String(reverseResult?.township || '').trim();
    const provider = String(reverseResult?.provider || '').trim();
    const businessAreaText = Array.isArray(reverseResult?.businessAreas)
        ? reverseResult.businessAreas
            .map((item) => String(item?.name || '').trim())
            .filter(Boolean)
            .join('、')
        : '';

    return {
        逆地理编码地址: formattedAddress || '未解析',
        逆地理编码省: province || '未知',
        逆地理编码市: city || '未知',
        逆地理编码区县: district || '未知',
        逆地理编码乡镇: township || '未知',
        逆地理编码商圈: businessAreaText || '无',
        逆地理编码服务: provider || 'unknown'
    };
}

function drawPointByCoordinates() {
    coordInputError.value = '';
    const crsType = String(coordInputCRS.value || 'wgs84').toLowerCase();
    const result = processCoordinateInput(coordInputLon.value, coordInputLat.value, crsType);

    if (!result.valid) {
        coordInputError.value = result.message;
        message.warning(result.message);
        return;
    }

    emit('draw-point-by-coordinates', {
        lng: result.lng,
        lat: result.lat,
        crsType,
        displayName: generatePointName(result.lng, result.lat, crsType)
    });

    clearCoordinateInput();
}

async function drawPointByPositionCode() {
    coordInputPError.value = '';
    const code = String(coordInputP.value || '').trim();

    if (!code || code === '0') {
        coordInputPError.value = '请输入有效的 p 参数（不能为 0）';
        message.warning(coordInputPError.value);
        return;
    }

    const decoded = decodePos(code);
    if (!decoded || !Number.isFinite(decoded.lng) || !Number.isFinite(decoded.lat)) {
        coordInputPError.value = 'p 参数解码失败，请检查编码内容';
        message.warning(coordInputPError.value);
        return;
    }

    isDecodePBusy.value = true;
    try {
        let reverseResult = null;
        try {
            reverseResult = await reverseGeocodeByPriority(decoded.lng, decoded.lat, {
                tiandituTk: TIANDITU_TK,
                silent: true
            });
        } catch {
            reverseResult = null;
        }

        const formattedAddress = String(reverseResult?.formattedAddress || '').trim();
        const layerName = formattedAddress || `P_${code}`;

        emit('draw-point-by-coordinates', {
            lng: decoded.lng,
            lat: decoded.lat,
            crsType: 'wgs84',
            displayName: layerName,
            label: layerName,
            layerName,
            properties: {
                来源: 'p参数解码',
                原始编码: code,
                解析后经度: Number(decoded.lng.toFixed(6)),
                解析后纬度: Number(decoded.lat.toFixed(6)),
                ...buildReverseGeocodeProperties(reverseResult)
            }
        });

        message.success(`已按 p 参数绘制点位：${layerName}`);
        clearPositionCodeInput();
    } finally {
        isDecodePBusy.value = false;
    }
}

async function drawPointByGeocodeAddress() {
    geocodeToolError.value = '';

    const inputAddress = String(geocodeAddressInput.value || '').trim();
    const inputCity = String(geocodeCityInput.value || '').trim();
    if (!inputAddress) {
        geocodeToolError.value = '请输入待编码的地址信息';
        message.warning(geocodeToolError.value);
        return;
    }

    isGeocodeBusy.value = true;
    try {
        const geocodeResult = await addressToLocation(inputAddress, inputCity, { silent: true });
        let reverseResult = null;
        try {
            reverseResult = await reverseGeocodeByPriority(geocodeResult.lng, geocodeResult.lat, {
                tiandituTk: TIANDITU_TK,
                silent: true
            });
        } catch {
            reverseResult = null;
        }

        emit('draw-point-by-coordinates', {
            lng: geocodeResult.lng,
            lat: geocodeResult.lat,
            crsType: 'wgs84',
            displayName: inputAddress,
            label: inputAddress,
            layerName: inputAddress,
            properties: {
                来源: '地理编码',
                输入地址: inputAddress,
                城市限定: inputCity || '无',
                地理编码地址: String(geocodeResult?.formattedAddress || '').trim() || inputAddress,
                地理编码级别: String(geocodeResult?.level || '').trim() || 'unknown',
                地理编码ADCODE: String(geocodeResult?.adcode || '').trim() || 'unknown',
                ...buildReverseGeocodeProperties(reverseResult)
            }
        });

        message.success(`地理编码成功：${inputAddress}`);
    } catch (error) {
        const detail = error instanceof Error ? error.message : '地理编码失败';
        geocodeToolError.value = detail;
        message.error(`地理编码失败：${detail}`);
    } finally {
        isGeocodeBusy.value = false;
    }
}

function startReverseGeocodePick() {
    geocodeToolError.value = '';
    emit('interaction', 'ReverseGeocodePick');
}

function isRasterLayer(layer) {
    return layerStore.isRasterLayer(layer);
}

watch(
    () => props.userLayers,
    (layers) => {
        layerStore.syncLayers(layers || [], props.overview || {});
        attrStore.syncLayers(layers || []);
    },
    { immediate: true, deep: true }
);

watch(
    () => props.overview,
    (overview) => {
        layerStore.syncLayers(props.userLayers || [], overview || {});
    },
    { immediate: true, deep: true }
);

layerStore.bindHandlers({
    onReorder: (payload) => emit('reorder-user-layers', payload),
    onHighlightFeature: (payload) => emit('highlight-attribute-feature', payload),
    onZoomFeature: (payload) => emit('zoom-attribute-feature', payload),
    onViewFeature: (payload) => emit('zoom-attribute-feature', payload)
});

function triggerFileUpload() {
    fileInputRef.value?.click();
}

function triggerFolderUpload() {
    folderInputRef.value?.click();
}

function openAttributeTable(layerId) {
    const targetLayer = (props.userLayers || []).find((item) => item.id === layerId);
    attrStore.openTable(layerId, targetLayer?.name || '未命名图层');
    activeTab.value = 'layers';
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    // Check file sizes
    const oversized = files.filter(file => (file.size / MB) > MAX_FILE_SIZE_MB);
    if (oversized.length) {
        message.error(`选中 ${oversized.length} 个文件超过 ${MAX_FILE_SIZE_MB} MB 限制：${oversized.map(f => f.name).join(', ')}`);
        event.target.value = '';
        return;
    }

    emit('upload-data', gisLoader.createUploadPayloadsFromFiles(files));

    event.target.value = '';
}

function handleDirectoryUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const oversized = files.filter(file => (file.size / MB) > MAX_FILE_SIZE_MB);
    if (oversized.length) {
        message.warning(`文件夹中有 ${oversized.length} 个文件超过 ${MAX_FILE_SIZE_MB} MB，将在导入阶段按规则处理。`, { duration: 5200 });
    }

    emit('upload-data', gisLoader.createUploadPayloadFromFolder(files));

    event.target.value = '';
}

function handleUploadDragEnter() {
    isUploadDragging.value = true;
}

function handleUploadDragOver() {
    isUploadDragging.value = true;
}

function handleUploadDragLeave(event) {
    if (event.currentTarget === event.target) {
        isUploadDragging.value = false;
    }
}

function handleUploadDrop(event) {
    isUploadDragging.value = false;
    const items = Array.from(event.dataTransfer?.items || []);

    const entryItems = items
        .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
        .filter(Boolean);

    if (entryItems.length) {
        emit('upload-data', gisLoader.createUploadPayloadFromEntries(entryItems));
        return;
    }

    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    emit('upload-data', gisLoader.createUploadPayloadsFromFiles(files));
}

function onDragStart(layerId) {
    layerStore.onDragStart(layerId);
}

function onDrop(targetLayerId) {
    layerStore.onDrop(targetLayerId);
}

function handleLayerTreeAction(evt) {
    const type = evt?.type;
    if (!type) return;

    if (type === 'layer-selected') {
        // 图层行被选中，可用于高亮地图上的图层等操作
        emit('layer-selected', evt.layerId);
        return;
    }
    if (type === 'open-attribute-table') {
        openAttributeTable(evt.layerId);
        return;
    }
    if (type === 'set-style-target') {
        setStyleTarget(evt.layerId);
        return;
    }
    if (type === 'copy-layer-coordinates') {
        copyLayerCoordinates(evt.layer);
        return;
    }
    if (type === 'toggle-layer-crs' || type === 'toggle-search-layer-crs') {
        emit('toggle-layer-crs', {
            layerId: evt.layerId,
            crs: evt.crs
        });
        return;
    }
    if (type === 'export-layer-data') {
        emit('export-layer-data', {
            layerId: evt.layerId,
            format: evt.format
        });
        return;
    }
    if (type === 'drag-layer-start') {
        onDragStart(evt.layerId);
        return;
    }
    if (type === 'drop-layer') {
        onDrop(evt.layerId);
        return;
    }
    if (type === 'toggle-layer-visibility') {
        emit('toggle-layer-visibility', { layerId: evt.layerId, visible: !!evt.visible });
        return;
    }
    if (type === 'toggle-layer-label-visibility') {
        emit('toggle-layer-label-visibility', { layerId: evt.layerId, visible: !!evt.visible });
        return;
    }
    if (type === 'zoom-layer' || type === 'view-layer' || type === 'remove-layer' || type === 'solo-layer') {
        emit(type, evt.layerId);
        return;
    }
    if (type === 'interaction') {
        emit('interaction', evt.interaction);
    }
}

function setStyleTarget(layerId) {
    layerStore.setStyleTarget(layerId);
    activeTab.value = 'style';
}

function activateDrawTool(tool) {
    layerStore.setDrawTool(tool);
    emit('interaction', tool);
}

function applyTemplate(templateId) {
    // 1. 获取当前选中的目标 ID
    const targetId = selectedEditLayerId.value;
    if (!targetId) return; // 如果没有选中任何图层，直接返回

    // 2. 更新本地 styleForm (让界面底部的颜色选择器实时同步变色)
    const targetTemplate = styleTemplates.find(t => t.id === templateId);
    if (targetTemplate) {
        styleForm.value.fillColor = targetTemplate.color;
        // 建议：描边色通常可以设为和填充色一致，或者加深一点
        styleForm.value.strokeColor = targetTemplate.color; 
    }

    // 3. 执行原有的业务 emit (保持与父组件/地图引擎的通信)
    if (targetId === 'draw') {
        emit('apply-style-template', { target: 'draw', templateId });
    } else {
        emit('apply-style-template', { target: 'layer', layerId: targetId, templateId });
    }

    // 4. 【核心修复】关键：立即调用 applyStyle() 触发地图渲染
    // 这样用户点击模板按钮后，地图会立刻变色，不再需要二次点击“应用样式”
    applyStyle();
}

function applyStyle() {
    const payload = styleEditor.buildStylePayload();
    if (selectedEditLayerId.value === 'draw') {
        emit('update-draw-style', payload);
        return;
    }
    if (selectedEditLayerId.value) {
        emit('update-layer-style', { layerId: selectedEditLayerId.value, styleConfig: payload });
    }
}

/**
 * 扫描共享资源目录
 * 此方法触发一次性扫描，结果存储在 sharedLoader 的反应式状态中
 */
async function scanSharedResources() {
    try {
        await sharedLoader.scanResources();
        lastScanAttempted.value = true;
        if (sharedLoader.hasResources.value) {
            message.success(`发现 ${sharedLoader.resources.value.length} 个共享文件`);
        } else {
            message.info('未发现共享资源，请在 public/ShareDate 目录中添加数据文件');
        }
    } catch (error) {
        message.error(`扫描共享资源失败: ${String(error)}`);
        console.error('Error scanning shared resources:', error);
    }
}

/**
 * 加载选中的共享资源
 * 复用现有的上传逻辑来导入数据
 * 
 * @param {Object} resource - 共享资源对象
 */
async function loadSharedResource(resource) {
    if (!resource || !resource.path) {
        message.warning('资源信息不完整');
        return;
    }

    try {
        // 使用共享加载器将资源转换为 File 对象
        const files = await sharedLoader.loadResourceAsFiles(resource.path);
        
        if (!files || files.length === 0) {
            message.warning('无法加载该资源');
            return;
        }

        // 显示加载中的提示
        message.info(`正在加载共享资源: ${resource.name}`, { duration: 2000 });

        // 复用上传逻辑来处理资源导入
        // 这样可以保证共享资源与手动上传的资源拥有完全相同的处理流程
        emit('upload-data', gisLoader.createUploadPayloadsFromFiles(files));
    } catch (error) {
        message.error(`加载共享资源失败: ${String(error)}`);
        console.error('Error loading shared resource:', error);
    }
}
</script>

<style scoped>
.toolbox-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: linear-gradient(180deg, #fdfefd 0%, #f3f8f5 100%);
    color: #2f3a45;
}

.hidden-input { display: none; }

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #dde9e2;
    padding-bottom: 8px;
}

.title { font-size: 20px; font-weight: 700; color: #2b8a4b; letter-spacing: 0.2px; }
.subtitle { font-size: 12px; color: #72897a; }

.tabs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 4px;
    border-radius: 12px;
    border: 1px solid rgba(121, 174, 141, 0.32);
    background: rgba(235, 246, 240, 0.58);
    backdrop-filter: blur(10px);
}

.tab {
    border: 1px solid rgba(130, 176, 146, 0.18);
    background: rgba(255, 255, 255, 0.42);
    border-radius: 10px;
    padding: 8px 4px;
    font-size: 12px;
    cursor: pointer;
    color: #4e6656;
    transition: transform 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
}

.tab:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(77, 150, 103, 0.3);
}

.tab.active {
    border-color: rgba(33, 128, 72, 0.84);
    background: linear-gradient(135deg, rgba(48, 157, 88, 0.92) 0%, rgba(44, 133, 76, 0.92) 100%);
    color: #ffffff;
    font-weight: 600;
    box-shadow: 0 8px 20px rgba(36, 125, 72, 0.24);
}

.panel-scroll {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.card {
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    padding: 11px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px rgba(58, 91, 67, 0.08);
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.upload-zone-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.card-title {
    font-size: 13px;
    font-weight: 700;
    color: #2e4b3a;
    margin-bottom: 6px;
}

.upload-tip {
    margin-bottom: 8px;
    font-size: 11px;
    color: #6b7f72;
    padding: 0 2px;
}

.upload-crs-tip {
    margin-bottom: 6px;
    font-size: 11px;
    color: #1877f2;
    padding: 6px 8px;
    background: #e7f1ff;
    border-radius: 4px;
    border-left: 3px solid #1877f2;
}

.upload-crs-tip span {
    display: block;
    line-height: 1.4;
}


.upload-entry {
    border: 1.5px dashed #b7dcc7;
    border-radius: 8px;
    background: #f9fdfb;
    padding: 10px;
    transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.upload-entry.dragging {
    border-color: #3f9f67;
    background: #eaf7f0;
    box-shadow: 0 0 0 3px rgba(90, 169, 122, 0.15);
}

.upload-title {
    display: flex;
    align-items: center;
    gap: 6px;
}

.upload-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: #2f8e58;
    background: #eaf7f0;
}

.upload-progress {
    border: 1px solid #d8e9df;
    background: #f8fcfa;
    border-radius: 8px;
    padding: 7px;
}

.upload-progress.phase-error {
    border-color: #e8bbbb;
    background: #fff4f4;
}

.upload-progress.phase-done {
    border-color: #b8dec7;
    background: #f0fbf4;
}

.upload-progress-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #2d4f3a;
    margin-bottom: 5px;
}

.upload-progress-bar {
    height: 8px;
    background: #e3efe8;
    border-radius: 999px;
    overflow: hidden;
}

.upload-progress-fill {
    height: 100%;
    width: 0;
    background: linear-gradient(90deg, #68c282 0%, #31a05b 100%);
    transition: width 0.24s ease;
}

.upload-progress.phase-error .upload-progress-fill {
    background: linear-gradient(90deg, #f1a2a2 0%, #ca4d4d 100%);
}

.upload-progress-meta {
    margin-top: 5px;
    font-size: 10px;
    color: #7e8d83;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.upload-progress-message {
    margin-top: 3px;
    font-size: 10px;
    color: #54705f;
    word-break: break-word;
}

.row-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.layer-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.layer-item {
    border-bottom: 1px solid #e8efe9;
    padding: 8px 4px;
    background: transparent;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.layer-item:hover {
    background: #f4faf6;
}

.layer-main {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
}

.layer-title-wrap {
    min-width: 0;
    flex: 1;
}

.name {
    display: inline-block;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.feature-badge {
    flex-shrink: 0;
    font-size: 10px;
    color: #486353;
    border: 1px solid #d4e6db;
    background: #f2f8f4;
    border-radius: 999px;
    padding: 1px 7px;
    line-height: 1.5;
}

.layer-actions {
    margin-left: auto;
}

.icon-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.action-icon-btn {
    position: relative;
    border: 1px solid #d6e5dc;
    background: #f7fcf9;
    color: #2f6046;
    border-radius: 7px;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 12px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.action-icon-btn:hover {
    background: #ebf7f0;
    border-color: #87bf9d;
    color: #1f7b49;
}

.action-icon-btn.danger {
    border-color: #ebc8c8;
    background: #fff5f5;
    color: #ae4a4a;
}

.action-icon-btn.danger:hover {
    border-color: #df9d9d;
    background: #ffecec;
    color: #9f2f2f;
}

.action-icon-btn[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: #fff;
    background: rgba(35, 49, 42, 0.92);
    padding: 3px 6px;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 3;
}

.draw-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.actions-row{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 20px;
}

.coord-input-panel {
    margin-top: 12px;
    border: 1px solid #d7e7de;
    border-radius: 8px;
    padding: 10px;
    background: rgba(245, 252, 248, 0.85);
}

.coord-input-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
}

.coord-input-field {
    width: 100%;
    border: 1px solid #b9d9c8;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: #2f4f3e;
    background: #ffffff;
    box-sizing: border-box;
}

.coord-input-field:focus {
    outline: none;
    border-color: #2f9a57;
    box-shadow: 0 0 0 2px rgba(47, 154, 87, 0.16);
}

.coord-divider {
    height: 1px;
    margin: 10px 0;
    background: #dbe9e1;
}

.coord-crs-row {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.coord-crs-label {
    font-size: 12px;
    color: #466453;
    white-space: nowrap;
}

.coord-crs-select {
    flex: 1;
    border: 1px solid #b9d9c8;
    border-radius: 8px;
    padding: 6px 8px;
    background: #ffffff;
    color: #2f4f3e;
}

.coord-input-actions {
    margin-top: 10px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.coord-input-actions.single-action {
    grid-template-columns: 1fr;
}

.geocode-tool-panel {
    margin-top: 10px;
}

.geocode-subtitle {
    font-size: 12px;
    font-weight: 600;
    color: #3a5a48;
    margin-bottom: 6px;
}

.geocode-tip {
    margin-top: 8px;
    font-size: 11px;
    line-height: 1.45;
    color: #557565;
}

.coord-input-error {
    margin-top: 8px;
    color: #b83d3d;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
}

.template-row,
.field-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
}

.field select,
.field input[type='range'],
.field input[type='color'] {
    width: 100%;
}

.upload-btns {
    display: inline-flex;
    gap: 6px;
}

.ghost-btn,
.small-btn,
.template {
    border: 1px solid #d5e4db;
    background: #f6fbf8;
    color: #2d4f3a;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
}

.draw-tool-btn {
    min-height: 34px;
    border: 1px solid #7fbe98;
    background: #fbfefd;
    color: #2f6147;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.draw-tool-btn:hover {
    background: #f1f9f4;
}

.draw-tool-btn.active {
    border-color: #2f9a57;
    background: #2f9a57;
    color: #ffffff;
    font-weight: 600;
}

.draw-op-btn {
    border: 1px solid transparent;
    border-radius: 8px;
    min-height: 34px;
    background: #f6fbf8;
    padding: 6px 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.draw-op-primary {
    border-color: #7eaed8;
    background: #edf5fc;
    color: #245f95;
}

.btn-accent {
    border-color: #9bc9af;
    background: #eef8f2;
    color: #1d7541;
}

.draw-op-warning {
    border-color: #e8c080;
    background: #fff7e8;
    color: #9a5a02;
}

.btn-danger {
    border-color: #e2a3a3;
    background: #fff1f1;
    color: #a03636;
}

.ghost-btn:hover,
.small-btn:hover,
.template:hover {
    background: #ebf7f0;
    border-color: #7fc397;
    color: #1d7541;
}

.small-btn:disabled {
    opacity: 0.62;
    cursor: not-allowed;
}

.small-btn.ghost {
    background: #ffffff;
    border-color: #d7e6dd;
    color: #3e6851;
}

.style-scroll {
    padding-top: 2px;
}

.style-panel {
    padding: 2px 2px 4px;
}

.template-chip-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.template-chip {
    border: 1px solid #d9e8df;
    background: #fbfdfc;
    color: #2f4f3e;
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    cursor: pointer;
}

.template-chip:hover {
    border-color: #8bc3a3;
    background: #f1f9f4;
}

.chip-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex-shrink: 0;
}

.style-divider {
    height: 1px;
    background: #deebe3;
    margin: 12px 0;
}

.select-wrap {
    position: relative;
}

.select-wrap::after {
    content: '▾';
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #56806a;
    pointer-events: none;
    font-size: 11px;
}

.style-select {
    width: 100%;
    appearance: none;
    border: 1px solid #8ec6a5;
    background: #fbfefc;
    color: #2d4a3a;
    border-radius: 8px;
    padding: 8px 30px 8px 10px;
}

.style-color {
    border: 1px solid #d2e5da;
    border-radius: 8px;
    padding: 2px;
    background: #ffffff;
    height: 34px;
}

.slider-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #4d6154;
}

.style-slider {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(to right, #c8e1d0, #68c282);
    outline: none;
}

/* ===== 共享资源样式 ===== */
.shared-resource-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.shared-resource-card {
    border: 1px solid rgba(153, 195, 170, 0.38);
    border-radius: 10px;
    padding: 11px;
    background: rgba(255, 255, 255, 0.72);
    backdrop-filter: blur(8px);
    box-shadow: 0 8px 20px rgba(58, 91, 67, 0.08);
}

.shared-resource-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #2e4b3a;
    margin-bottom: 8px;
}

.share-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    color: #2f9a57;
    background: #eaf7f0;
}

.shared-resource-menu {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.shared-resource-btn {
    border: 1px solid #7fc397;
    background: #eef8f2;
    color: #1d7541;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 34px;
}

.shared-resource-btn:hover {
    border-color: #4fb373;
    background: #d4f1e3;
    color: #1d7541;
    transform: translateY(-1px);
}

.shared-resource-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
}

.resource-tree-root {
    max-height: 320px;
    overflow-y: auto;
    padding: 6px;
    border: 1px solid rgba(77, 150, 103, 0.2);
    border-radius: 8px;
    background: rgba(239, 248, 242, 0.5);
}

.resource-empty {
    text-align: center;
    padding: 12px 8px;
    font-size: 11px;
    color: #8a9f92;
    font-style: italic;
}

.style-slider {
    accent-color: #2f9a57;
}

.style-apply-btn {
    margin-top: 8px;
    border-color: #7cbf95;
    background: #edf9f1;
    color: #1f7a44;
}

.hint {
    font-size: 12px;
    color: #4a555e;
    line-height: 1.9;
    padding: 2px 2px 0;
}

.draw-hint {
    border: none;
    background: transparent;
}

.empty {
    color: #7a8f80;
    font-size: 12px;
}

@media (max-width: 768px) {
    .toolbox-panel {
        padding: 10px;
    }

    .draw-grid {
        grid-template-columns: 1fr 1fr;
    }

    .actions-row,
    .coord-input-actions,
    .field-grid {
        grid-template-columns: 1fr;
    }

    .template-chip-row {
        grid-template-columns: 1fr;
    }

    .name {
        max-width: 120px;
    }

    .feature-badge {
        padding: 1px 6px;
    }

    .action-icon-btn {
        width: 22px;
        height: 22px;
        font-size: 11px;
    }
}
</style>
