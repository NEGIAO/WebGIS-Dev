<template>
    <div class="compass-panel">
        <div class="panel-header">
            <div>
                <div class="panel-title">{{ t('compass.title') }}</div>
                <div class="panel-subtitle">{{ t('compass.subtitle') }}</div>
            </div>
            <button
                class="ghost-btn"
                @click="$emit('close')"
            >
                {{ t('compass.back') }}
            </button>
        </div>

        <div class="card-row switch-grid">
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.enabled"
                    @change="handleEnabledChange"
                />
                <span>{{ t('compass.enable') }}</span>
            </label>
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.placementMode"
                    :disabled="!compassStore.enabled || compassStore.mode !== 'vector'"
                    @change="handlePlacementModeChange"
                />
                <span>{{ t('compass.placement') }}</span>
            </label>
            <label class="switch-item">
                <input
                    type="checkbox"
                    :checked="compassStore.sensorEnabled"
                    :disabled="!compassStore.enabled"
                    @change="handleSensorToggle"
                />
                <span>{{ t('compass.sensorSync') }}</span>
            </label>
        </div>

        <div class="card-row">
            <div class="field full-width">
                <label>{{ t('compass.displayMode') }}</label>
                <select
                    :value="compassStore.mode"
                    :disabled="!compassStore.enabled"
                    @change="handleModeChange"
                >
                    <option value="vector">{{ t('compass.modeVector') }}</option>
                    <option value="hud">{{ t('compass.modeHud') }}</option>
                </select>
            </div>

            <div class="field full-width">
                <label>{{ t('compass.theme') }}</label>
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
                    <label>{{ t('compass.radius') }}</label>
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
                <label>{{ t('compass.opacity') }}：{{ (Number(compassStore.opacity) * 100).toFixed(0) }}%</label>
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
                <label>{{ t('compass.hudSize') }}：{{ Number(compassStore.hudSizePx).toFixed(0) }}px</label>
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
                <label>{{ t('compass.gradientBase') }}</label>
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
                <label>{{ t('compass.longitude') }}</label>
                <input
                    v-model="lngInput"
                    type="number"
                    step="0.000001"
                    :disabled="!compassStore.enabled"
                />
            </div>
            <div class="field">
                <label>{{ t('compass.latitude') }}</label>
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
                        {{ t('compass.applyCoord') }}
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
                {{ t('compass.loading') }}
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
import { computed, ref, watch } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useCompassStore } from '@/stores';

const props = defineProps({
    getUserLocation: {
        type: Function,
        default: null,
    },
});

defineEmits(['close']);

const { t } = useLocale();
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
    if (compassStore.sensorPermission === 'granted') return t('compass.sensorGranted');
    if (compassStore.sensorPermission === 'denied') return t('compass.sensorDenied');
    if (compassStore.sensorPermission === 'unsupported') return t('compass.sensorUnsupported');
    return t('compass.sensorUnknown');
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
        message.warning(t('compass.noHeadingPermission'));
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
        message.warning(t('compass.invalidLonLat'));
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
            message.warning(t('compass.noGps'));
            return;
        }

        compassStore.setPosition(lng, lat);
        compassStore.setEnabled(true);
    } catch (error) {
        message.warning(t('compass.gpsFailed', { error: String(error?.message || error || 'unknown') }));
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
