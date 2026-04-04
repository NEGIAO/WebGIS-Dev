<template>
    <div class="toolbox-panel">
        <input ref="fileInputRef" type="file" multiple class="hidden-input" accept=".geojson,.json,.kml,.kmz,.zip,.shp,.dbf,.shx,.prj,.cpg,.tif,.tiff" @change="handleFileUpload" />
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

        <AttributeTable />

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
import { useLayerStore } from '../composables/useLayerStore';
import { useStyleEditor } from '../composables/useStyleEditor';
import AttributeTable from './AttributeTable.vue';
import LayerPanel from './LayerPanel.vue';

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
    'zoom-attribute-feature'
]);

const fileInputRef = ref(null);
const folderInputRef = ref(null);
const message = useMessage();
const gisLoader = useGisLoader();
const layerStore = useLayerStore();
const styleEditor = useStyleEditor();
const activeTab = ref('layers');
const isUploadDragging = ref(false);
const MB = 1024 * 1024;
const MAX_FILE_SIZE_MB = 200;

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

async function copyLayerCoordinates(layer) {
    if (!(Number.isFinite(layer?.longitude) && Number.isFinite(layer?.latitude))) {
        message.warning('当前图层未提供可复制的经纬度信息');
        return;
    }
    const lon = Number(layer.longitude).toFixed(6);
    const lat = Number(layer.latitude).toFixed(6);
    const text = `${lon},${lat}`;

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
        message.success(`已复制经纬度：${text}`);
    } catch (error) {
        message.error('copy coordinates failed', error);
        message.error('复制失败，请稍后重试');
    }
}

function isRasterLayer(layer) {
    return layerStore.isRasterLayer(layer);
}

watch(
    () => props.userLayers,
    (layers) => {
        layerStore.syncLayers(layers || [], props.overview || {});
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
    layerStore.showAttributeTable(layerId);
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
