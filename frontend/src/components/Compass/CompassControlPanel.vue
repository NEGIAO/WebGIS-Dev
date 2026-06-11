<template>
    <div class="compass-panel">
        <div class="panel-header">
            <div>
                <div class="panel-title">风水罗盘</div>
                <div class="panel-subtitle">Native Vector + HUD 双模式</div>
            </div>
            <button
                class="ghost-btn"
                @click="$emit('close')"
            >
                返回
            </button>
        </div>

        <div class="card-row switch-grid">
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.enabled"
                    @change="handleEnabledChange"
                />
                <span>启用罗盘</span>
            </label>
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.placementMode"
                    :disabled="!compassStore.enabled || compassStore.mode !== 'vector'"
                    @change="handlePlacementModeChange"
                />
                <span>地图点选定位</span>
            </label>
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.sensorEnabled"
                    :disabled="!compassStore.enabled"
                    @change="handleSensorToggle"
                />
                <span>硬件朝向同步</span>
            </label>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>显示模式</label>
                <select
                    :value="compassStore.mode"
                    :disabled="!compassStore.enabled"
                    @change="handleModeChange"
                >
                    <option value="vector">Mode 1: 地理实体（Vector）</option>
                    <option value="hud">Mode 2: 设备 HUD（固定屏幕）</option>
                </select>
            </div>

            <div class="field full-width">
                <label>主题（cid）</label>
                <select
                    :value="compassStore.cid"
                    :disabled="compassStore.isConfigLoading"
                    @change="handleThemeChange"
                >
                    <option
                        v-for="item in compassStore.themeOptions"
                        :key="item.cid"
                        :value="item.cid"
                    >
                        {{ item.name }}
                    </option>
                </select>
            </div>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <div
                    class="label-row"
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    "
                >
                    <label>地理半径 (米)</label>
                    <input
                        type="number"
                        class="compact-number-input"
                        :disabled="!compassStore.enabled"
                        :value="Number(compassStore.physicalRadiusMeters).toFixed(1)"
                        @input="(e) => compassStore.setPhysicalRadiusMeters(Number(e.target.value))"
                    />
                </div>

                <input
                    type="range"
                    :min="100"
                    :max="20000000"
                    step="0.5"
                    class="compass-slider"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.physicalRadiusMeters"
                    @input="(e) => compassStore.setPhysicalRadiusMeters(Number(e.target.value))"
                />

                <div
                    class="slider-ticks"
                    style="
                        display: flex;
                        justify-content: space-between;
                        font-size: 10px;
                        color: #888;
                        margin-top: 4px;
                    "
                >
                    <span>100m</span>
                    <span>10000000</span>
                    <span>20000000m</span>
                </div>
            </div>

            <div class="field full-width">
                <label>透明度：{{ (Number(compassStore.opacity) * 100).toFixed(0) }}%</label>
                <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.01"
                    class="compass-slider"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.opacity"
                    @input="(e) => compassStore.setOpacity(Number(e.target.value))"
                />
            </div>


            <div
                v-if="compassStore.mode === 'hud'"
                class="field full-width"
            >
                <label>HUD 尺寸：{{ Number(compassStore.hudSizePx).toFixed(0) }}px</label>
                <input
                    type="range"
                    min="240"
                    max="560"
                    step="1"
                    class="compass-slider"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.hudSizePx"
                    @input="(e) => compassStore.setHudSize(Number(e.target.value))"
                />
            </div>

            <div class="field full-width">
                <label>渐变背景基色</label>
                <div class="color-picker-row">
                    <input
                        type="color"
                        class="color-input"
                        :disabled="!compassStore.enabled"
                        :value="compassStore.bgColor"
                        @input="(e) => compassStore.setBgColor(e.target.value)"
                    />
                    <span class="color-hex">{{ compassStore.bgColor }}</span>
                </div>
            </div>
        </div>

        <div class="card-row">
            <div class="field">
                <label>经度</label>
                <input
                    v-model="lngInput"
                    type="number"
                    step="0.000001"
                    :disabled="!compassStore.enabled"
                />
            </div>
            <div class="field">
                <label>纬度</label>
                <input
                    v-model="latInput"
                    type="number"
                    step="0.000001"
                    :disabled="!compassStore.enabled"
                />
            </div>
            <div class="field actions-field">
                <label>&nbsp;</label>
                <div class="actions-row">
                    <button
                        class="action-btn"
                        :disabled="!compassStore.enabled"
                        @click="applyLonLat"
                    >
                        应用坐标
                    </button>
                    <button
                        class="action-btn action-muted"
                        :disabled="!compassStore.enabled || !getUserLocation"
                        @click="useGps"
                    >
                        GPS
                    </button>
                </div>
            </div>
        </div>

        <div class="card-row compact-row">
            <div
                class="status-chip"
                :class="`status-${compassStore.sensorPermission}`"
            >
                {{ sensorStatusText }}
            </div>
            <div
                v-if="compassStore.isConfigLoading"
                class="status-chip"
            >
                配置加载中...
            </div>
            <div
                v-if="compassStore.configError"
                class="status-chip status-error"
            >
                {{ compassStore.configError }}
            </div>
        </div>
    </div>
</template>

<script setup>
// TODO:√
// 风水罗盘的url参数过多，完全没有必要，关键参数是中心的经纬度和半径两个参数；
// 将两个参数使用已经实现的编码js工具，也不需要后端处理，将这个参数编码到url即可，现在的url参数过多且没必要（clng=114.347533&clat=34.813990&crot=0.00&cid=ancient-cinnabar&cmode=vector）
// 精简为一个参数即可，默认为0；
// 编码后的内容形如：uBrA0WDjW1
// 前端解析的时候要得到经纬度和半径即可实现跳转和还原，样式用默认的即可；
import { computed, ref, watch } from 'vue';
import { useMessage } from '../../composables/useMessage';
import { useCompassStore } from '../../stores';

const props = defineProps({
    getUserLocation: {
        type: Function,
        default: null,
    },
});

defineEmits(['close']);

const message = useMessage();
const compassStore = useCompassStore();

const lngInput = ref(String(compassStore.position?.lng ?? ''));
const latInput = ref(String(compassStore.position?.lat ?? ''));

watch(
    () => compassStore.position,
    (nextPosition) => {
        lngInput.value = Number.isFinite(Number(nextPosition?.lng)) ? String(nextPosition.lng) : '';
        latInput.value = Number.isFinite(Number(nextPosition?.lat)) ? String(nextPosition.lat) : '';
    },
    { deep: true, immediate: true },
);

const sensorStatusText = computed(() => {
    if (compassStore.sensorPermission === 'granted') return '传感器权限：已授权';
    if (compassStore.sensorPermission === 'denied') return '传感器权限：已拒绝';
    if (compassStore.sensorPermission === 'unsupported') return '传感器权限：设备不支持';
    return '传感器权限：未知';
});

function handleEnabledChange(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setEnabled(checked);
}

function handlePlacementModeChange(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setPlacementMode(checked);
}

function handleModeChange(event) {
    const mode = String(event?.target?.value || 'vector')
        .trim()
        .toLowerCase();
    compassStore.setMode(mode === 'hud' ? 'hud' : 'vector');
}

async function handleThemeChange(event) {
    const nextCid = String(event?.target?.value || '').trim();
    if (!nextCid) return;

    await compassStore.setCidAndLoad(nextCid);
}

async function handleSensorToggle(event) {
    const checked = Boolean(event?.target?.checked);

    if (!checked) {
        compassStore.setSensorEnabled(false);
        return;
    }

    const granted = await compassStore.requestOrientationPermission();
    if (!granted) {
        compassStore.setSensorEnabled(false);
        message.warning('未授予设备朝向权限');
        return;
    }

    compassStore.setSensorEnabled(true);
}

function applyLonLat() {
    const lng = Number(lngInput.value);
    const lat = Number(latInput.value);

    if (
        !Number.isFinite(lng) ||
        !Number.isFinite(lat) ||
        lng < -180 ||
        lng > 180 ||
        lat < -90 ||
        lat > 90
    ) {
        message.warning('请输入有效经纬度');
        return;
    }

    compassStore.setPosition(lng, lat);
    compassStore.setEnabled(true);
}

async function useGps() {
    if (typeof props.getUserLocation !== 'function') return;

    try {
        const gps = await props.getUserLocation(true);
        const lng = Number(gps?.lng);
        const lat = Number(gps?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            message.warning('未获取到可用 GPS 坐标');
            return;
        }

        compassStore.setPosition(lng, lat);
        compassStore.setEnabled(true);
    } catch (error) {
        message.warning(`GPS 获取失败：${String(error?.message || error || 'unknown')}`);
    }
}
</script>

<style scoped>
.compass-panel {
    height: 100%;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: linear-gradient(180deg, #f8fff8 0%, #eef8ef 100%);
}

.panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.panel-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--brand-accent-dark);
}

.panel-subtitle {
    margin-top: 2px;
    font-size: 12px;
    color: var(--brand-accent-muted);
}

.ghost-btn {
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border-brand);
    border-radius: 8px;
    background: #ffffff;
    color: var(--brand-primary-dark);
    cursor: pointer;
}

.card-row {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    background: rgba(255, 255, 255, 0.92);
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.switch-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
}

.switch-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--brand-accent-dark);
    font-size: 13px;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 130px;
    flex: 1;
}

.field.full-width {
    min-width: 100%;
}

.field label {
    color: var(--brand-primary-dark);
    font-size: 12px;
    font-weight: 600;
}

input,
select,
button {
    font: inherit;
}

input[type='number'],
select {
    height: 34px;
    border: 1px solid var(--border-brand-light);
    border-radius: 8px;
    padding: 0 10px;
    color: var(--text-brand-dark);
    background: #fff;
}

input[type='range'] {
    width: 100%;
}

.actions-field {
    min-width: 100%;
}

.actions-row {
    display: flex;
    gap: 8px;
}

.action-btn {
    height: 34px;
    border: none;
    border-radius: 8px;
    padding: 0 12px;
    cursor: pointer;
    background: var(--brand-primary);
    color: #fff;
    font-weight: 600;
}

.action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.action-muted {
    background: var(--brand-accent-muted);
}

.compact-row {
    align-items: center;
}

.status-chip {
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(35, 129, 67, 0.16);
    color: var(--brand-primary-dark);
}

.status-granted {
    background: rgba(35, 129, 67, 0.18);
    color: #1e6a39;
}

.status-denied {
    background: rgba(220, 80, 80, 0.2);
    color: #a02626;
}

.status-unsupported {
    background: rgba(150, 150, 150, 0.2);
    color: #555;
}

.status-unknown {
    background: rgba(255, 193, 7, 0.25);
    color: #805b00;
}

.status-error {
    background: rgba(220, 80, 80, 0.18);
    color: #9b2424;
}

.color-picker-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.color-input {
    width: 40px;
    height: 34px;
    border: 1px solid var(--border-brand-light);
    border-radius: 8px;
    padding: 2px;
    cursor: pointer;
    background: #fff;
}

.color-input:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.color-hex {
    font-size: 13px;
    font-family: monospace;
    color: var(--text-brand-dark);
}
</style>
