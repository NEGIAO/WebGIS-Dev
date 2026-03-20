<template>
    <div class="toolbox-panel">
        <input ref="fileInputRef" type="file" multiple class="hidden-input" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.tif,.tiff" @change="handleFileUpload" />

        <div class="header">
            <div>
                <div class="title">工具箱</div>
                <div class="subtitle">左键查看，右键仅显</div>
            </div>
            <button class="ghost-btn" @click="emit('close')">关闭</button>
        </div>

        <div class="tabs">
            <button class="tab" :class="{ active: activeTab === 'layers' }" @click="activeTab = 'layers'">图层</button>
            <button class="tab" :class="{ active: activeTab === 'draw' }" @click="activeTab = 'draw'">绘制</button>
            <button class="tab" :class="{ active: activeTab === 'style' }" @click="activeTab = 'style'">样式</button>
        </div>

        <div v-if="activeTab === 'layers'" class="panel-scroll">
            <div class="card">
                <div class="card-title">绘制图层</div>
                <div class="layer-item" v-if="drawLayers.length" v-for="layer in drawLayers" :key="layer.id"
                    @click.left="emit('view-layer', layer.id)" @contextmenu.prevent="emit('solo-layer', layer.id)">
                    <div class="layer-line">
                        <label class="row-label">
                            <input type="checkbox" :checked="layer.visible" @change="emit('toggle-layer-visibility', { layerId: layer.id, visible: $event.target.checked })" />
                            <span class="name">{{ layer.name }}</span>
                        </label>
                        <span class="meta">{{ layer.featureCount || 0 }}</span>
                    </div>
                    <div class="layer-actions">
                        <button class="mini btn-accent" @click.stop="setStyleTarget(layer.id)">样式</button>
                        <button class="mini btn-primary" @click.stop="emit('zoom-layer', layer.id)">缩放</button>
                        <button class="mini btn-danger" @click.stop="emit('remove-layer', layer.id)">移除</button>
                    </div>
                </div>
                <div class="layer-item" v-else @click.left="emit('interaction', 'ViewGraphics')" @contextmenu.prevent="emit('interaction', 'ZoomToGraphics')">
                    <div class="layer-line">
                        <div class="row-label">
                            <span class="name">绘制图形集合</span>
                        </div>
                        <span class="meta">{{ overview.drawCount || 0 }}</span>
                    </div>
                    <div class="layer-actions">
                        <button class="mini btn-accent" @click.stop="setStyleTarget('draw')">样式</button>
                        <button class="mini btn-primary" @click.stop="emit('interaction', 'ZoomToGraphics')">缩放</button>
                        <button class="mini btn-warning" @click.stop="emit('interaction', 'Clear')">清空</button>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-title">搜索结果图层</div>
                <div class="layer-item" v-if="searchLayers.length" v-for="layer in searchLayers" :key="layer.id" @click.left="emit('view-layer', layer.id)">
                    <div class="layer-line">
                        <label class="row-label">
                            <input type="checkbox" :checked="layer.visible" @change="emit('toggle-layer-visibility', { layerId: layer.id, visible: $event.target.checked })" />
                            <span class="name">{{ layer.name }}</span>
                        </label>
                        <span class="meta">{{ layer.featureCount || 0 }}</span>
                    </div>
                    <div class="layer-actions">
                        <button class="mini btn-accent" @click.stop="setStyleTarget(layer.id)">样式</button>
                        <button class="mini" @click.stop="emit('toggle-layer-label-visibility', { layerId: layer.id, visible: !layer.labelVisible })">
                            {{ layer.labelVisible ? '标注关' : '标注开' }}
                        </button>
                        <button class="mini btn-primary" @click.stop="emit('zoom-layer', layer.id)">缩放</button>
                        <button class="mini btn-warning" @click.stop="emit('remove-layer', layer.id)">清空</button>
                    </div>
                </div>
                <div class="empty" v-else>暂无搜索结果图层</div>
            </div>

            <div class="card">
                <div
                    class="upload-entry"
                    :class="{ dragging: isUploadDragging }"
                    @dragenter.prevent="handleUploadDragEnter"
                    @dragover.prevent="handleUploadDragOver"
                    @dragleave.prevent="handleUploadDragLeave"
                    @drop.prevent="handleUploadDrop"
                >
                    <div class="card-top">
                        <div class="card-title">上传图层</div>
                        <button class="small-btn" @click="triggerFileUpload">上传 (GeoJSON/KML/KMZ/SHP/TIF)</button>
                    </div>
                    <div class="upload-tip">点击上传，或将文件拖到此区域（支持多选）</div>
                </div>

                <div v-if="uploadLayers.length" class="layer-list">
                    <div
                        v-for="layer in uploadLayers"
                        :key="layer.id"
                        class="layer-item"
                        draggable="true"
                        @dragstart="onDragStart(layer.id)"
                        @dragover.prevent
                        @drop="onDrop(layer.id)"
                        @click.left="emit('view-layer', layer.id)"
                        @contextmenu.prevent="emit('solo-layer', layer.id)"
                    >
                        <div class="layer-line">
                            <label class="row-label">
                                <input type="checkbox" :checked="layer.visible" @change="emit('toggle-layer-visibility', { layerId: layer.id, visible: $event.target.checked })" />
                                <span class="name">{{ layer.name }}</span>
                            </label>
                            <span class="meta">{{ layer.featureCount || 0 }}</span>
                        </div>

                        <div class="layer-actions">
                            <button v-if="!isRasterLayer(layer)" class="mini btn-accent" @click.stop="setStyleTarget(layer.id)">样式</button>
                            <button v-if="canToggleLabel(layer)" class="mini" @click.stop="emit('toggle-layer-label-visibility', { layerId: layer.id, visible: !layer.labelVisible })">
                                {{ layer.labelVisible ? '标注关' : '标注开' }}
                            </button>
                            <button class="mini btn-primary" @click.stop="emit('zoom-layer', layer.id)">缩放</button>
                            <button class="mini btn-danger" @click.stop="emit('remove-layer', layer.id)">移除</button>
                        </div>
                    </div>
                </div>
                <div v-else class="empty">暂无上传图层</div>
            </div>
        </div>

        <div v-else-if="activeTab === 'draw'" class="panel-scroll">
            <div class="card">
                <div class="card-title">绘制工具</div>
                <div class="tool-grid">
                    <button class="tool-btn" @click="emit('interaction', 'AttributeQuery')">属性查询</button>
                    <button class="tool-btn" @click="emit('interaction', 'Point')">点</button>
                    <button class="tool-btn" @click="emit('interaction', 'LineString')">线</button>
                    <button class="tool-btn" @click="emit('interaction', 'Polygon')">面</button>
                    <button class="tool-btn" @click="emit('interaction', 'MeasureDistance')">测距</button>
                    <button class="tool-btn" @click="emit('interaction', 'MeasureArea')">测面</button>
                </div>
                <div class="actions-row">
                    <button class="small-btn btn-primary" @click="emit('interaction', 'ZoomToGraphics')">缩放图形</button>
                    <button class="small-btn btn-warning" @click="emit('interaction', 'Clear')">清空</button>
                </div>
            </div>

            <div class="card hint">
                <div>鼠标事件</div>
                <div>左键：选中/查看图层</div>
                <div>右键：仅显示当前图层</div>
                <div>地图右键：快速触发属性查询</div>
            </div>
        </div>

        <div v-else class="panel-scroll">
            <div class="card">
                <div class="card-title">样式模板</div>
                <div class="template-row">
                    <button class="template" v-for="t in styleTemplates" :key="t.id" @click="applyTemplate(t.id)">{{ t.name }}</button>
                </div>
            </div>

            <div class="card">
                <div class="card-title">样式编辑</div>
                <div class="field">
                    <label>编辑目标</label>
                    <select v-model="selectedEditLayerId">
                        <option v-for="layer in editableLayers" :key="layer.id" :value="layer.id">{{ layer.name }}</option>
                    </select>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <label>填充色</label>
                        <input type="color" v-model="styleForm.fillColor" />
                    </div>
                    <div class="field">
                        <label>边框色</label>
                        <input type="color" v-model="styleForm.strokeColor" />
                    </div>
                </div>
                <div class="field-grid">
                    <div class="field">
                        <label>填充透明度</label>
                        <input type="range" min="0" max="100" v-model.number="styleForm.fillOpacityPct" />
                    </div>
                    <div class="field">
                        <label>边框宽度</label>
                        <input type="range" min="1" max="8" step="0.5" v-model.number="styleForm.strokeWidth" />
                    </div>
                </div>
                <button class="small-btn" @click="applyStyle">应用样式</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
    userLayers: { type: Array, default: () => [] },
    baseLayers: { type: Array, default: () => [] },
    overview: { type: Object, default: () => ({ drawCount: 0, uploadCount: 0, layers: [] }) }
});

const emit = defineEmits([
    'close',
    'upload-data',
    'interaction',
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
    'update-layer-style'
]);

const fileInputRef = ref(null);
const activeTab = ref('layers');
const draggingLayerId = ref('');
const isUploadDragging = ref(false);
const selectedEditLayerId = ref('draw');
const MB = 1024 * 1024;
const WARN_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_MB = 200;
const SUPPORTED_UPLOAD_TYPES = new Set(['geojson', 'json', 'kml', 'kmz', 'zip', 'shp', 'tif', 'tiff']);

const styleTemplates = [
    { id: 'classic', name: '经典绿' },
    { id: 'warning', name: '警示橙' },
    { id: 'water', name: '水系蓝' },
    { id: 'magenta', name: '品红' }
];

const styleForm = ref({
    fillColor: '#5fbf7a',
    strokeColor: '#2f7d3c',
    fillOpacityPct: 24,
    strokeWidth: 2
});

const sortedUserLayers = computed(() => [...props.userLayers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
const drawLayers = computed(() => sortedUserLayers.value.filter(layer => layer.sourceType === 'draw'));
const uploadLayers = computed(() => sortedUserLayers.value.filter(layer => layer.sourceType === 'upload'));
const searchLayers = computed(() => sortedUserLayers.value.filter(layer => layer.sourceType === 'search'));

function canToggleLabel(layer) {
    return !!layer?.autoLabel;
}

function isRasterLayer(layer) {
    const t = String(layer?.type || '').toLowerCase();
    return t === 'tif' || t === 'tiff';
}

const editableLayers = computed(() => [
    { id: 'draw', name: `绘制图形 (${props.overview.drawCount || 0})` },
    ...searchLayers.value.map(layer => ({ id: layer.id, name: `${layer.name} (${layer.featureCount || 0})` })),
    ...sortedUserLayers.value
        .filter(layer => layer.sourceType !== 'search' && !isRasterLayer(layer))
        .map(layer => ({ id: layer.id, name: `${layer.name} (${layer.featureCount || 0})` }))
]);

watch(editableLayers, (list) => {
    if (!list.length) {
        selectedEditLayerId.value = 'draw';
        return;
    }
    if (!list.find(item => item.id === selectedEditLayerId.value)) {
        selectedEditLayerId.value = list[0].id;
    }
}, { immediate: true });

function triggerFileUpload() {
    fileInputRef.value?.click();
}

function formatFileSize(fileSizeInBytes) {
    if (!Number.isFinite(fileSizeInBytes) || fileSizeInBytes < 0) return '未知';
    if (fileSizeInBytes < 1024) return `${fileSizeInBytes} B`;
    if (fileSizeInBytes < MB) return `${(fileSizeInBytes / 1024).toFixed(1)} KB`;
    return `${(fileSizeInBytes / MB).toFixed(1)} MB`;
}

function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    files.forEach(file => processUploadFile(file));
    event.target.value = '';
}

function processUploadFile(file) {
    if (!file) return;

    const fileSizeMb = file.size / MB;
    const sizeText = formatFileSize(file.size);
    if (fileSizeMb > MAX_FILE_SIZE_MB) {
        alert(`文件过大（${sizeText}），请控制在 ${MAX_FILE_SIZE_MB} MB 以内后再上传。`);
        return;
    }
    if (fileSizeMb > WARN_FILE_SIZE_MB) {
        const proceed = window.confirm(
            `当前文件大小为 ${sizeText}，超过建议值 ${WARN_FILE_SIZE_MB} MB。\n继续上传可能导致页面卡顿或无法显示，是否继续？`
        );
        if (!proceed) {
            return;
        }
    }

    const extension = file.name.split('.').pop().toLowerCase();
    if (!SUPPORTED_UPLOAD_TYPES.has(extension)) {
        alert(`暂不支持该文件类型：.${extension || '未知'}`);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        emit('upload-data', {
            content: e.target.result,
            type: extension,
            name: file.name
        });
    };

    try {
        if (extension === 'zip' || extension === 'shp' || extension === 'kmz' || extension === 'tif' || extension === 'tiff') {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    } catch (err) {
        console.error('File read error', err);
        alert('文件读取失败');
    }
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
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    files.forEach(file => processUploadFile(file));
}

function onDragStart(layerId) {
    draggingLayerId.value = layerId;
}

function onDrop(targetLayerId) {
    if (!draggingLayerId.value || draggingLayerId.value === targetLayerId) return;
    emit('reorder-user-layers', { fromId: draggingLayerId.value, toId: targetLayerId });
    draggingLayerId.value = '';
}

function setStyleTarget(layerId) {
    selectedEditLayerId.value = layerId || 'draw';
    activeTab.value = 'style';
}

function applyTemplate(templateId) {
    if (selectedEditLayerId.value === 'draw') {
        emit('apply-style-template', { target: 'draw', templateId });
        return;
    }
    if (selectedEditLayerId.value) {
        emit('apply-style-template', { target: 'layer', layerId: selectedEditLayerId.value, templateId });
    }
}

function applyStyle() {
    const payload = {
        fillColor: styleForm.value.fillColor,
        strokeColor: styleForm.value.strokeColor,
        fillOpacity: styleForm.value.fillOpacityPct / 100,
        strokeWidth: styleForm.value.strokeWidth
    };
    if (selectedEditLayerId.value === 'draw') {
        emit('update-draw-style', payload);
        return;
    }
    if (selectedEditLayerId.value) {
        emit('update-layer-style', { layerId: selectedEditLayerId.value, styleConfig: payload });
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
}

.tab {
    border: 1px solid #deebe3;
    background: #f8fcfa;
    border-radius: 8px;
    padding: 8px 4px;
    font-size: 12px;
    cursor: pointer;
}

.tab.active {
    border-color: #81c79b;
    background: linear-gradient(180deg, #eef9f2, #e4f3ea);
    color: #1f7a44;
    font-weight: 600;
}

.panel-scroll {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.card {
    border: 1px solid #e2ece6;
    border-radius: 10px;
    padding: 11px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(58, 91, 67, 0.04);
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.card-title {
    font-size: 13px;
    font-weight: 700;
    color: #2e4b3a;
    margin-bottom: 6px;
}

.upload-tip {
    margin-bottom: 8px;
    font-size: 12px;
    color: #6b7f72;
    background: #f8fbf9;
    border: 1px solid #d9e8df;
    border-radius: 6px;
    padding: 6px 8px;
}

.upload-entry {
    margin-bottom: 10px;
    border: 1.5px dashed #c8ded0;
    border-radius: 8px;
    background: #fbfefd;
    padding: 8px;
    transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}

.upload-entry.dragging {
    border-color: #5aa97a;
    background: #eaf7f0;
    box-shadow: 0 0 0 3px rgba(90, 169, 122, 0.15);
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
    border: 1px solid #e2ece6;
    border-radius: 8px;
    padding: 8px;
    background: #f8fcf9;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;
}

.layer-item:hover {
    background: #f0f8f3;
    border-color: #cfe4d8;
}

.layer-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.meta {
    font-size: 11px;
    color: #78907f;
}

.layer-actions {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-top: 6px;
}

.tool-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
}

.actions-row,
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

.ghost-btn,
.small-btn,
.tool-btn,
.mini,
.template {
    border: 1px solid #d5e4db;
    background: #f6fbf8;
    color: #2d4f3a;
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
    cursor: pointer;
}

.btn-primary {
    border-color: #7eaed8;
    background: #edf5fc;
    color: #245f95;
}

.btn-accent {
    border-color: #9bc9af;
    background: #eef8f2;
    color: #1d7541;
}

.btn-warning {
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
.tool-btn:hover,
.mini:hover,
.template:hover {
    background: #ebf7f0;
    border-color: #7fc397;
    color: #1d7541;
}

.hint {
    font-size: 12px;
    color: #5e7565;
    line-height: 1.7;
}

.empty {
    color: #7a8f80;
    font-size: 12px;
}

@media (max-width: 768px) {
    .toolbox-panel {
        padding: 10px;
    }

    .tool-grid {
        grid-template-columns: 1fr 1fr;
    }

    .actions-row,
    .template-row,
    .field-grid {
        grid-template-columns: 1fr;
    }
}
</style>
