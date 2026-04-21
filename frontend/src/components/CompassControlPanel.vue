<template>
    <div class="compass-panel">
        <div class="compass-header">
            <div>
                <div class="compass-title">风水罗盘控制台</div>
                <div class="compass-subtitle">地理实体缩放 + 图层级样式控制</div>
            </div>
            <button class="ghost-btn" @click="$emit('close')">返回</button>
        </div>

        <div class="card-row">
            <label class="switch-row">
                <input type="checkbox" :checked="compassStore.enabled" @change="handleToggleEnabled" />
                <span>启用罗盘覆盖层</span>
            </label>
            <label class="switch-row">
                <input
                    type="checkbox"
                    :checked="compassStore.placementMode"
                    :disabled="!compassStore.enabled"
                    @change="handleTogglePlacementMode"
                />
                <span>放置模式（点击地图定位）</span>
            </label>
            <label class="switch-row">
                <input
                    type="checkbox"
                    :checked="Boolean(compassStore.config?.isShowScale !== false)"
                    :disabled="!compassStore.enabled"
                    @change="handleToggleScaleVisibility"
                />
                <span>显示刻度圈</span>
            </label>
            <label class="switch-row">
                <input
                    type="checkbox"
                    :checked="Boolean(compassStore.config?.isShowTianxinCross !== false)"
                    :disabled="!compassStore.enabled"
                    @change="handleToggleCrossVisibility"
                />
                <span>显示天心十字</span>
            </label>
        </div>

        <div class="card-row">
            <div class="field">
                <label>经度</label>
                <input v-model="lngInput" type="number" step="0.000001" :disabled="!compassStore.enabled" />
            </div>
            <div class="field">
                <label>纬度</label>
                <input v-model="latInput" type="number" step="0.000001" :disabled="!compassStore.enabled" />
            </div>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>地理实体直径（米）：{{ formattedRealWorldDiameter }}m</label>
                <input
                    type="range"
                    min="500"
                    max="500000"
                    step="10"
                    :value="compassStore.realWorldDiameterMeters"
                    :disabled="!compassStore.enabled"
                    @input="handleDiameterInput"
                />
                <small class="hint">实际像素尺寸按公式计算：显示直径 = 地理直径 / 分辨率。</small>
            </div>
        </div>

        <div class="card-row buttons-row">
            <button class="action-btn" :disabled="!compassStore.enabled" @click="handleApplyPosition">应用坐标</button>
            <button class="action-btn action-btn-muted" :disabled="!props.getUserLocation || !compassStore.enabled" @click="handleLocateByGps">GPS 放置</button>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>罗盘主题</label>
                <select :value="String(compassStore.activeThemeId)" :disabled="!compassStore.enabled" @change="handleThemeChange">
                    <option
                        v-for="theme in compassStore.themeOptions"
                        :key="String(theme.id)"
                        :value="String(theme.id)"
                    >
                        {{ theme.name }}
                    </option>
                </select>
            </div>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>旋转角度：{{ formattedRotation }}°</label>
                <input
                    type="range"
                    min="0"
                    max="359"
                    step="1"
                    :value="compassStore.rotation"
                    :disabled="!compassStore.enabled || compassStore.sensorEnabled"
                    @input="handleRotationInput"
                />
                <small v-if="compassStore.sensorEnabled" class="hint">传感器模式启用时，角度由设备朝向实时驱动。</small>
            </div>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>基础缩放：{{ formattedScale }}</label>
                <input
                    type="range"
                    min="0.35"
                    max="2.4"
                    step="0.05"
                    :value="compassStore.scale"
                    :disabled="!compassStore.enabled"
                    @input="handleScaleInput"
                />
            </div>
        </div>

        <div class="card-row">
            <div class="field">
                <label>主边框颜色</label>
                <input
                    type="color"
                    :value="toPickerColor(compassStore.config?.line?.borderColor, '#aaaaaa')"
                    :disabled="!compassStore.enabled"
                    @input="handleLineBorderColorInput"
                />
            </div>
            <div class="field">
                <label>刻度线颜色</label>
                <input
                    type="color"
                    :value="toPickerColor(compassStore.config?.line?.scaleColor, '#aaaaaa')"
                    :disabled="!compassStore.enabled"
                    @input="handleScaleColorInput"
                />
            </div>
            <div class="field">
                <label>刻度高亮色</label>
                <input
                    type="color"
                    :value="toPickerColor(compassStore.config?.line?.scaleHighlightColor, '#ff0000')"
                    :disabled="!compassStore.enabled"
                    @input="handleScaleHighlightColorInput"
                />
            </div>
        </div>

        <div class="card-row sensor-row">
            <button class="action-btn" :disabled="!compassStore.enabled" @click="handleToggleSensor">
                {{ compassStore.sensorEnabled ? '关闭设备朝向同步' : '启用设备朝向同步' }}
            </button>
            <span class="sensor-badge" :class="`sensor-${compassStore.sensorPermission}`">
                {{ sensorLabel }}
            </span>
        </div>

        <div class="card-row">
            <div class="field">
                <label>十字线颜色</label>
                <input
                    type="color"
                    :value="String(compassStore.config?.tianxinCrossColor || '#ff0000')"
                    :disabled="!compassStore.enabled"
                    @input="handleCrossColorInput"
                />
            </div>
            <div class="field">
                <label>十字线宽度</label>
                <input
                    type="number"
                    min="1"
                    max="8"
                    step="1"
                    :value="Number(compassStore.config?.tianxinCrossWidth || 2)"
                    :disabled="!compassStore.enabled"
                    @input="handleCrossWidthInput"
                />
            </div>
            <div class="field">
                <label>十字线长度比（半径）</label>
                <input
                    type="number"
                    min="0.1"
                    max="1"
                    step="0.05"
                    :value="Number(compassStore.config?.tianxinCrossLengthRatio || 1 / 3).toFixed(2)"
                    :disabled="!compassStore.enabled"
                    @input="handleCrossLengthRatioInput"
                />
            </div>
        </div>

        <div class="card-row">
            <div class="field">
                <label>刻度短线长度</label>
                <input
                    type="number"
                    min="4"
                    max="80"
                    step="1"
                    :value="Number(compassStore.config?.scaclStyle?.minLineHeight || 10)"
                    :disabled="!compassStore.enabled"
                    @input="(event) => handleScaleLineHeightInput('minLineHeight', event)"
                />
            </div>
            <div class="field">
                <label>刻度中线长度</label>
                <input
                    type="number"
                    min="4"
                    max="120"
                    step="1"
                    :value="Number(compassStore.config?.scaclStyle?.midLineHeight || 20)"
                    :disabled="!compassStore.enabled"
                    @input="(event) => handleScaleLineHeightInput('midLineHeight', event)"
                />
            </div>
            <div class="field">
                <label>刻度长线长度</label>
                <input
                    type="number"
                    min="4"
                    max="160"
                    step="1"
                    :value="Number(compassStore.config?.scaclStyle?.maxLineHeight || 25)"
                    :disabled="!compassStore.enabled"
                    @input="(event) => handleScaleLineHeightInput('maxLineHeight', event)"
                />
            </div>
        </div>

        <div class="card-row layers-section">
            <div class="section-title">分层样式（逐层控制）</div>
            <div
                v-for="layer in compassStore.layerEditors"
                :key="`layer-editor-${layer.index}`"
                class="layer-editor"
            >
                <div class="layer-editor-header">
                    <strong>{{ layer.name }}</strong>
                    <label class="switch-row">
                        <input
                            type="checkbox"
                            :checked="layer.visible"
                            :disabled="!compassStore.enabled"
                            @change="(event) => handleLayerVisibilityChange(layer.index, event)"
                        />
                        <span>可见</span>
                    </label>
                </div>

                <div class="layer-grid">
                    <div class="field">
                        <label>文字大小</label>
                        <input
                            type="number"
                            min="8"
                            max="72"
                            step="1"
                            :value="layer.fontSize"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerFontSizeInput(layer.index, event)"
                        />
                    </div>

                    <div class="field">
                        <label>文字透明度</label>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            :value="layer.textOpacity"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerTextOpacityInput(layer.index, event)"
                        />
                    </div>

                    <div class="field">
                        <label>层边框颜色</label>
                        <input
                            type="color"
                            :value="toPickerColor(layer.borderColor, '#aaaaaa')"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerBorderColorInput(layer.index, event)"
                        />
                    </div>

                    <div class="field">
                        <label>层线宽</label>
                        <input
                            type="number"
                            min="0.5"
                            max="8"
                            step="0.5"
                            :value="layer.strokeWidth"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerStrokeWidthInput(layer.index, event)"
                        />
                    </div>

                    <div class="field">
                        <label>宫格填充色</label>
                        <input
                            type="color"
                            :value="toPickerColor(layer.latticeFillColor, '#ffffff')"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerLatticeFillInput(layer.index, event)"
                        />
                    </div>

                    <div class="field">
                        <label>文字颜色（统一）</label>
                        <input
                            type="color"
                            :value="toPickerColor(resolveLayerPrimaryTextColor(layer.textColor), '#ffffff')"
                            :disabled="!compassStore.enabled"
                            @input="(event) => handleLayerTextColorInput(layer.index, event)"
                        />
                    </div>
                </div>

                <div class="field full-width">
                    <label>文字颜色数组（JSON，可选）</label>
                    <input
                        :value="formatLayerTextColorRaw(layer.textColor)"
                        :disabled="!compassStore.enabled"
                        placeholder='例如：["#ffffff", "#ff0000"] 或 "#ffffff"'
                        @change="(event) => handleLayerTextColorRawInput(layer.index, event)"
                    />
                </div>
            </div>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>完整配置 JSON（映射全部 props）</label>
                <textarea
                    v-model="rawConfigInput"
                    rows="8"
                    :disabled="!compassStore.enabled"
                    spellcheck="false"
                />
                <div class="buttons-row">
                    <button class="action-btn" :disabled="!compassStore.enabled" @click="handleApplyRawConfig">应用 JSON</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useMessage } from '../composables/useMessage';
import { useCompassStore } from '../stores';

const COLOR_ALIAS_TO_HEX = {
    white: '#ffffff',
    black: '#000000',
    red: '#ff0000',
    aqua: '#00ffff',
    yellow: '#ffff00',
    gray: '#808080',
    grey: '#808080',
    blue: '#0000ff',
    green: '#008000'
};

const props = defineProps({
    getUserLocation: {
        type: Function,
        default: null
    }
});

defineEmits(['close']);

const message = useMessage();
const compassStore = useCompassStore();

const lngInput = ref(String(compassStore.position?.lng ?? ''));
const latInput = ref(String(compassStore.position?.lat ?? ''));
const rawConfigInput = ref('');

watch(() => compassStore.config, (nextConfig) => {
    rawConfigInput.value = JSON.stringify(nextConfig || {}, null, 2);
}, { immediate: true, deep: true });

watch(() => compassStore.position, (next) => {
    lngInput.value = Number.isFinite(Number(next?.lng)) ? String(next.lng) : '';
    latInput.value = Number.isFinite(Number(next?.lat)) ? String(next.lat) : '';
}, { deep: true });

const formattedRotation = computed(() => Number(compassStore.rotation || 0).toFixed(0));
const formattedScale = computed(() => Number(compassStore.scale || 1).toFixed(2));
const formattedRealWorldDiameter = computed(() => Number(compassStore.realWorldDiameterMeters || 500000).toFixed(0));

const sensorLabel = computed(() => {
    if (compassStore.sensorPermission === 'granted') return '传感器已授权';
    if (compassStore.sensorPermission === 'denied') return '传感器被拒绝';
    if (compassStore.sensorPermission === 'unsupported') return '当前设备不支持';
    return '传感器未授权';
});

function handleToggleEnabled(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setEnabled(checked);
    if (!checked) {
        compassStore.setPlacementMode(false);
        compassStore.setSensorEnabled(false);
    }
}

function handleTogglePlacementMode(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setPlacementMode(checked);
}

function handleToggleScaleVisibility(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.patchConfig({
        isShowScale: checked
    });
}

function handleToggleCrossVisibility(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.patchConfig({
        isShowTianxinCross: checked
    });
}

function handleApplyPosition() {
    const lng = Number(lngInput.value);
    const lat = Number(latInput.value);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        message.warning('请输入有效经纬度');
        return;
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        message.warning('经纬度超出范围');
        return;
    }

    compassStore.setPosition(lng, lat);
    compassStore.setEnabled(true);
    message.success('罗盘已定位到指定坐标');
}

async function handleLocateByGps() {
    if (typeof props.getUserLocation !== 'function') return;

    try {
        const location = await props.getUserLocation(true);
        const lng = Number(location?.lng);
        const lat = Number(location?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            message.warning('未获取到可用 GPS 坐标');
            return;
        }
        compassStore.setPosition(lng, lat);
        compassStore.setEnabled(true);
        message.success('罗盘已移动到 GPS 位置');
    } catch (error) {
        const detail = String(error?.message || error || '定位失败');
        message.warning(`GPS 放置失败：${detail}`);
    }
}

function handleThemeChange(event) {
    const value = String(event?.target?.value || '').trim();
    if (!value) return;
    compassStore.applyThemeById(value);
}

function handleRotationInput(event) {
    compassStore.setRotation(Number(event?.target?.value));
}

function handleScaleInput(event) {
    compassStore.setScale(Number(event?.target?.value));
}

function handleDiameterInput(event) {
    compassStore.setRealWorldDiameterMeters(Number(event?.target?.value));
}

function toPickerColor(inputValue, fallback = '#ffffff') {
    const compact = String(inputValue || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(compact)) return compact;
    if (/^#[0-9a-f]{3}$/i.test(compact)) {
        return `#${compact[1]}${compact[1]}${compact[2]}${compact[2]}${compact[3]}${compact[3]}`;
    }
    return COLOR_ALIAS_TO_HEX[compact] || fallback;
}

function resolveLayerPrimaryTextColor(textColorValue) {
    if (Array.isArray(textColorValue)) {
        return String(textColorValue[0] || '#ffffff');
    }
    return String(textColorValue || '#ffffff');
}

function formatLayerTextColorRaw(textColorValue) {
    if (Array.isArray(textColorValue)) {
        return JSON.stringify(textColorValue);
    }
    return String(textColorValue || '');
}

function handleCrossColorInput(event) {
    const color = String(event?.target?.value || '#ff0000').trim() || '#ff0000';
    compassStore.patchConfig({
        tianxinCrossColor: color
    });
}

function handleCrossWidthInput(event) {
    const width = Number(event?.target?.value);
    compassStore.patchConfig({
        tianxinCrossWidth: Number.isFinite(width) ? Math.max(1, Math.min(8, width)) : 2
    });
}

function handleCrossLengthRatioInput(event) {
    const ratio = Number(event?.target?.value);
    compassStore.patchConfig({
        tianxinCrossLengthRatio: Number.isFinite(ratio) ? Math.max(0.1, Math.min(1, ratio)) : 1 / 3
    });
}

function handleLineBorderColorInput(event) {
    const borderColor = String(event?.target?.value || '#aaaaaa').trim() || '#aaaaaa';
    compassStore.patchConfig({
        line: {
            ...(compassStore.config?.line || {}),
            borderColor
        }
    });
}

function handleScaleColorInput(event) {
    const scaleColor = String(event?.target?.value || '#aaaaaa').trim() || '#aaaaaa';
    compassStore.patchConfig({
        line: {
            ...(compassStore.config?.line || {}),
            scaleColor
        }
    });
}

function handleScaleHighlightColorInput(event) {
    const scaleHighlightColor = String(event?.target?.value || '#ff0000').trim() || '#ff0000';
    compassStore.patchConfig({
        line: {
            ...(compassStore.config?.line || {}),
            scaleHighlightColor
        }
    });
}

function handleScaleLineHeightInput(fieldName, event) {
    const numericValue = Number(event?.target?.value);
    if (!Number.isFinite(numericValue)) return;

    compassStore.patchConfig({
        scaclStyle: {
            ...(compassStore.config?.scaclStyle || {}),
            [fieldName]: Math.max(4, Math.min(200, numericValue))
        }
    });
}

function handleLayerVisibilityChange(layerIndex, event) {
    compassStore.setLayerVisibility(layerIndex, Boolean(event?.target?.checked));
}

function handleLayerFontSizeInput(layerIndex, event) {
    compassStore.setLayerFontSize(layerIndex, Number(event?.target?.value));
}

function handleLayerTextOpacityInput(layerIndex, event) {
    compassStore.setLayerTextOpacity(layerIndex, Number(event?.target?.value));
}

function handleLayerBorderColorInput(layerIndex, event) {
    compassStore.setLayerBorderColor(layerIndex, String(event?.target?.value || '#aaaaaa'));
}

function handleLayerStrokeWidthInput(layerIndex, event) {
    compassStore.setLayerStrokeWidth(layerIndex, Number(event?.target?.value));
}

function handleLayerLatticeFillInput(layerIndex, event) {
    compassStore.setLayerLatticeFillColor(layerIndex, String(event?.target?.value || '#ffffff'));
}

function handleLayerTextColorInput(layerIndex, event) {
    compassStore.setLayerTextColor(layerIndex, String(event?.target?.value || '#ffffff'));
}

function handleLayerTextColorRawInput(layerIndex, event) {
    const rawInput = String(event?.target?.value || '').trim();
    if (!rawInput) return;

    try {
        if (rawInput.startsWith('[')) {
            const parsed = JSON.parse(rawInput);
            if (Array.isArray(parsed)) {
                compassStore.setLayerTextColor(layerIndex, parsed.map((item) => String(item || '').trim()).filter(Boolean));
                return;
            }
        }

        compassStore.setLayerTextColor(layerIndex, rawInput);
    } catch {
        message.warning('文字颜色数组 JSON 解析失败，请检查格式');
    }
}

function handleApplyRawConfig() {
    try {
        const parsed = JSON.parse(String(rawConfigInput.value || '{}'));
        if (!parsed || typeof parsed !== 'object') {
            message.warning('JSON 配置必须是对象');
            return;
        }
        compassStore.replaceConfig(parsed);
        message.success('完整配置已应用');
    } catch {
        message.warning('完整配置 JSON 解析失败，请检查格式');
    }
}

async function ensureOrientationPermission() {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
        compassStore.setSensorPermission('unsupported');
        return false;
    }

    const maybeRequest = DeviceOrientationEvent.requestPermission;
    if (typeof maybeRequest !== 'function') {
        compassStore.setSensorPermission('granted');
        return true;
    }

    try {
        const permission = await maybeRequest.call(DeviceOrientationEvent);
        if (permission === 'granted') {
            compassStore.setSensorPermission('granted');
            return true;
        }
        compassStore.setSensorPermission('denied');
        return false;
    } catch {
        compassStore.setSensorPermission('denied');
        return false;
    }
}

async function handleToggleSensor() {
    if (compassStore.sensorEnabled) {
        compassStore.setSensorEnabled(false);
        message.info('设备朝向同步已关闭');
        return;
    }

    const granted = await ensureOrientationPermission();
    if (!granted) {
        message.warning('未授予设备朝向权限');
        compassStore.setSensorEnabled(false);
        return;
    }

    compassStore.setSensorEnabled(true);
    message.success('设备朝向同步已启用');
}
</script>

<style scoped>
.compass-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: linear-gradient(180deg, #f8fff8 0%, #eef9ee 100%);
    height: 100%;
    overflow-y: auto;
}

.compass-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.compass-title {
    font-size: 16px;
    font-weight: 700;
    color: #1f5e2a;
}

.compass-subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: #4f7f5a;
}

.card-row {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(49, 133, 70, 0.18);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 110px;
}

.field.full-width {
    min-width: 100%;
}

.field label {
    font-size: 12px;
    color: #2f6940;
    font-weight: 600;
}

input,
select,
button,
textarea {
    font: inherit;
}

input[type='number'],
select,
input[type='text'] {
    height: 34px;
    border: 1px solid #b8d8be;
    border-radius: 8px;
    padding: 0 10px;
    background: #fff;
    color: #1f3b28;
}

textarea {
    width: 100%;
    min-height: 120px;
    border: 1px solid #b8d8be;
    border-radius: 8px;
    padding: 8px 10px;
    resize: vertical;
    background: #fff;
    color: #1f3b28;
}

input[type='range'] {
    width: 100%;
}

.switch-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #245736;
}

.buttons-row {
    justify-content: flex-start;
}

.action-btn {
    height: 34px;
    border: none;
    border-radius: 8px;
    padding: 0 12px;
    cursor: pointer;
    background: #2f9d52;
    color: #fff;
    font-weight: 600;
}

.action-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.action-btn-muted {
    background: #4d6f5a;
}

.ghost-btn {
    height: 30px;
    border: 1px solid #90bea2;
    border-radius: 8px;
    background: #fff;
    color: #2f6940;
    padding: 0 10px;
    cursor: pointer;
}

.sensor-row {
    align-items: center;
    justify-content: space-between;
}

.section-title {
    width: 100%;
    color: #245736;
    font-size: 13px;
    font-weight: 700;
}

.layers-section {
    flex-direction: column;
}

.layer-editor {
    width: 100%;
    border: 1px solid rgba(49, 133, 70, 0.2);
    border-radius: 8px;
    background: #f7fff8;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.layer-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.layer-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

@media (max-width: 640px) {
    .layer-grid {
        grid-template-columns: 1fr;
    }
}

.sensor-badge {
    font-size: 12px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 999px;
    white-space: nowrap;
}

.sensor-granted {
    background: rgba(56, 171, 94, 0.2);
    color: #1f7d3f;
}

.sensor-denied {
    background: rgba(220, 70, 70, 0.18);
    color: #a12626;
}

.sensor-unsupported {
    background: rgba(160, 160, 160, 0.2);
    color: #555;
}

.sensor-unknown {
    background: rgba(255, 193, 7, 0.25);
    color: #805b00;
}

.hint {
    color: #53775f;
    font-size: 11px;
}
</style>
