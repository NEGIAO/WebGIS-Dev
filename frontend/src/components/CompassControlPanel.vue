<template>
    <div class="compass-panel">
        <div class="panel-header">
            <div>
                <div class="panel-title">风水罗盘</div>
                <div class="panel-subtitle">Native Vector + HUD 双模式</div>
            </div>
            <button class="ghost-btn" @click="$emit('close')">返回</button>
        </div>

        <div class="card-row switch-grid">
            <label class="switch-item">
                <input type="checkbox" :checked="compassStore.enabled" @change="handleEnabledChange" />
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
                <select :value="compassStore.mode" :disabled="!compassStore.enabled" @change="handleModeChange">
                    <option value="vector">Mode 1: 地理实体（Vector）</option>
                    <option value="hud">Mode 2: 设备 HUD（固定屏幕）</option>
                </select>
            </div>

            <div class="field full-width">
                <label>主题（cid）</label>
                <select :value="compassStore.cid" :disabled="compassStore.isConfigLoading" @change="handleThemeChange">
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
                <label>地理直径（米）：{{ Number(compassStore.physicalDiameterMeters).toFixed(0) }}</label>
                <input
                    type="range"
                    min="20"
                    max="12000"
                    step="10"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.physicalDiameterMeters"
                    @input="(event) => compassStore.setPhysicalDiameterMeters(event?.target?.value)"
                />
            </div>

            <div class="field full-width">
                <label>透明度：{{ Number(compassStore.opacity).toFixed(2) }}</label>
                <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.01"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.opacity"
                    @input="(event) => compassStore.setOpacity(event?.target?.value)"
                />
            </div>

            <div class="field full-width" v-if="compassStore.mode === 'vector'">
                <label>最小分辨率阈值（zoom out 自动隐藏）：{{ Number(compassStore.minResolution).toFixed(2) }}</label>
                <input
                    type="range"
                    min="1"
                    max="1500"
                    step="1"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.minResolution"
                    @input="(event) => compassStore.setMinResolution(event?.target?.value)"
                />
            </div>

            <div class="field full-width" v-if="compassStore.mode === 'hud'">
                <label>HUD 尺寸（像素）：{{ Number(compassStore.hudSizePx).toFixed(0) }}</label>
                <input
                    type="range"
                    min="180"
                    max="520"
                    step="1"
                    :disabled="!compassStore.enabled"
                    :value="compassStore.hudSizePx"
                    @input="(event) => compassStore.setHudSize(event?.target?.value)"
                />
            </div>
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
            <div class="field actions-field">
                <label>&nbsp;</label>
                <div class="actions-row">
                    <button class="action-btn" :disabled="!compassStore.enabled" @click="applyLonLat">应用坐标</button>
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
            <div class="status-chip" :class="`status-${compassStore.sensorPermission}`">
                {{ sensorStatusText }}
            </div>
            <div class="status-chip" v-if="compassStore.isConfigLoading">配置加载中...</div>
            <div class="status-chip status-error" v-if="compassStore.configError">{{ compassStore.configError }}</div>
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
import { useMessage } from '../composables/useMessage';
import { useCompassStore } from '../stores';

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

watch(() => compassStore.position, (nextPosition) => {
    lngInput.value = Number.isFinite(Number(nextPosition?.lng)) ? String(nextPosition.lng) : '';
    latInput.value = Number.isFinite(Number(nextPosition?.lat)) ? String(nextPosition.lat) : '';
}, { deep: true, immediate: true });

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
    const mode = String(event?.target?.value || 'vector').trim().toLowerCase();
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

    if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
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
    color: #1f5e2a;
}

.panel-subtitle {
    margin-top: 2px;
    font-size: 12px;
    color: #568362;
}

.ghost-btn {
    height: 30px;
    padding: 0 10px;
    border: 1px solid #a2cda9;
    border-radius: 8px;
    background: #ffffff;
    color: #2f6940;
    cursor: pointer;
}

.card-row {
    border: 1px solid rgba(49, 133, 70, 0.18);
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
    color: #285d39;
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
    color: #2f6940;
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
    border: 1px solid #bfdac5;
    border-radius: 8px;
    padding: 0 10px;
    color: #1f3b28;
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
    background: #2f9d52;
    color: #fff;
    font-weight: 600;
}

.action-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.action-muted {
    background: #4d6f5a;
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
    color: #2b6e3f;
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
</style>
