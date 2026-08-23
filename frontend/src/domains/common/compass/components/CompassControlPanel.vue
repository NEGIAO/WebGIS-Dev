<template>
    <div class="compass-panel">
        <!-- 头部 -->
        <div class="panel-header">
            <div class="header-left">
                <span class="panel-badge">
                    <Compass
                        :size="16"
                        :stroke-width="1.9"
                    />
                </span>
                <div>
                    <div class="panel-title">{{ t('compass.title') }}</div>
                    <div class="panel-subtitle">{{ t('compass.subtitle') }}</div>
                </div>
            </div>
            <button
                class="back-btn"
                @click="$emit('close')"
            >
                <ArrowLeft
                    :size="13"
                    :stroke-width="2"
                />
                <span>{{ t('compass.back') }}</span>
            </button>
        </div>

        <!-- 开关组 -->
        <div class="switch-group">
            <label class="switch-row">
                <span class="switch-label">{{ t('compass.enable') }}</span>
                <input
                    type="checkbox"
                    class="switch-input"
                    :checked="compassStore.enabled"
                    @change="handleEnabledChange"
                />
            </label>
            <label class="switch-row">
                <span class="switch-label">{{ t('compass.placement') }}</span>
                <input
                    type="checkbox"
                    class="switch-input"
                    :checked="compassStore.placementMode"
                    :disabled="!compassStore.enabled || compassStore.mode !== 'vector'"
                    @change="handlePlacementModeChange"
                />
            </label>
            <label class="switch-row">
                <span class="switch-label">{{ t('compass.sensorSync') }}</span>
                <input
                    type="checkbox"
                    class="switch-input"
                    :checked="compassStore.sensorEnabled"
                    :disabled="!compassStore.enabled"
                    @change="handleSensorToggle"
                />
            </label>
        </div>

        <!-- 显示模式：分段控件 -->
        <div
            class="field-block"
            :class="{ disabled: !compassStore.enabled }"
        >
            <label class="field-label">{{ t('compass.displayMode') }}</label>
            <div class="seg">
                <button
                    type="button"
                    class="seg-btn"
                    :class="{ active: compassStore.mode === 'vector' }"
                    :disabled="!compassStore.enabled"
                    @click="compassStore.setMode('vector')"
                >
                    {{ t('compass.modeVector') }}
                </button>
                <button
                    type="button"
                    class="seg-btn"
                    :class="{ active: compassStore.mode === 'hud' }"
                    :disabled="!compassStore.enabled"
                    @click="compassStore.setMode('hud')"
                >
                    {{ t('compass.modeHud') }}
                </button>
            </div>
        </div>

        <!-- 主题 -->
        <div class="join-bar">
            <span class="join-lead">
                <Palette
                    :size="13"
                    :stroke-width="1.9"
                />
            </span>
            <select
                class="join-select"
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

        <!-- 半径 -->
        <div class="field-block">
            <div class="slider-head">
                <label>{{ t('compass.radius') }}</label>
                <span class="slider-value">{{ formatMeters(compassStore.physicalRadiusMeters) }}</span>
            </div>
            <input
                type="range"
                min="100"
                max="20000000"
                step="0.5"
                class="range-slider"
                :disabled="!compassStore.enabled"
                :value="compassStore.physicalRadiusMeters"
                :style="{ '--fill': `${((Number(compassStore.physicalRadiusMeters) - 100) / (20000000 - 100)) * 100}%` }"
                @input="(e) => compassStore.setPhysicalRadiusMeters(Number(e.target.value))"
            />
        </div>

        <!-- 透明度 -->
        <div class="field-block">
            <div class="slider-head">
                <label>{{ t('compass.opacity') }}</label>
                <span class="slider-value">{{ (Number(compassStore.opacity) * 100).toFixed(0) }}%</span>
            </div>
            <input
                type="range"
                min="0.1"
                max="1"
                step="0.01"
                class="range-slider"
                :disabled="!compassStore.enabled"
                :value="compassStore.opacity"
                :style="{ '--fill': `${((Number(compassStore.opacity) - 0.1) / 0.9) * 100}%` }"
                @input="(e) => compassStore.setOpacity(Number(e.target.value))"
            />
        </div>

        <!-- HUD 尺寸 -->
        <div
            v-if="compassStore.mode === 'hud'"
            class="field-block"
        >
            <div class="slider-head">
                <label>{{ t('compass.hudSize') }}</label>
                <span class="slider-value">{{ Number(compassStore.hudSizePx).toFixed(0) }}px</span>
            </div>
            <input
                type="range"
                min="240"
                max="560"
                step="1"
                class="range-slider"
                :disabled="!compassStore.enabled"
                :value="compassStore.hudSizePx"
                :style="{ '--fill': `${((Number(compassStore.hudSizePx) - 240) / 320) * 100}%` }"
                @input="(e) => compassStore.setHudSize(Number(e.target.value))"
            />
        </div>

        <!-- 渐变基色 -->
        <label
            class="color-card"
            :class="{ disabled: !compassStore.enabled }"
        >
            <input
                type="color"
                class="swatch-color"
                :disabled="!compassStore.enabled"
                :value="compassStore.bgColor"
                @input="(e) => compassStore.setBgColor(e.target.value)"
            />
            <span class="color-meta">
                <span class="color-label">{{ t('compass.gradientBase') }}</span>
                <span class="color-hex">{{ compassStore.bgColor }}</span>
            </span>
        </label>

        <!-- 坐标定位 -->
        <div class="join-bar">
            <span class="join-lead">
                <MapPin
                    :size="13"
                    :stroke-width="2"
                />
            </span>
            <input
                v-model="lngInput"
                type="number"
                step="0.000001"
                class="join-field"
                :aria-label="t('compass.longitude')"
                :disabled="!compassStore.enabled"
            />
            <span class="join-sep"></span>
            <input
                v-model="latInput"
                type="number"
                step="0.000001"
                class="join-field"
                :aria-label="t('compass.latitude')"
                :disabled="!compassStore.enabled"
            />
            <button
                class="join-go"
                :disabled="!compassStore.enabled"
                @click="applyLonLat"
            >
                {{ t('compass.applyCoord') }}
            </button>
        </div>

        <button
            class="gps-btn"
            :disabled="!compassStore.enabled || !getUserLocation"
            @click="useGps"
        >
            <Satellite
                :size="13"
                :stroke-width="2"
            />
            GPS
        </button>

        <!-- 状态 -->
        <div class="status-row">
            <div
                class="status-chip"
                :class="`status-${compassStore.sensorPermission}`"
            >
                {{ sensorStatusText }}
            </div>
            <div
                v-if="compassStore.isConfigLoading"
                class="status-chip status-loading"
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
/**
 * WeatherChartPanel 同款设计语言：
 * - 渐变徽章头部 + 幽灵返回钮
 * - 自绘开关 / 分段控件 / 一体式输入条 / 渐变填充滑杆
 */
import { computed, ref, watch } from 'vue';
import { ArrowLeft, Compass, MapPin, Palette, Satellite } from '@lucide/vue';
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

function formatMeters(value) {
    const n = Number(value) || 0;
    if (n >= 1000) {
        const digits = n >= 100000 ? 0 : 1;
        return `${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: digits })} km`;
    }
    return `${n} m`;
}

function handleEnabledChange(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setEnabled(checked);
}

function handlePlacementModeChange(event) {
    const checked = Boolean(event?.target?.checked);
    compassStore.setPlacementMode(checked);
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

/* ===== 头部 ===== */
.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
}

.panel-badge {
    flex-shrink: 0;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--brand-gradient);
    color: #ffffff;
    box-shadow:
        0 4px 10px rgba(var(--brand-primary-dark-rgb), 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.panel-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--brand-accent-dark);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.panel-subtitle {
    margin-top: 1px;
    font-size: 11px;
    color: var(--brand-accent-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.back-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--toc-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background 0.12s ease,
        color 0.12s ease,
        transform 0.12s ease;
}

.back-btn:hover {
    background: #ffffff;
    transform: translateY(-1px);
}

.back-btn:active {
    transform: scale(0.96);
}

/* ===== 开关组 ===== */
.switch-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 2px;
    cursor: pointer;
}

.switch-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-brand-dark);
}

/* 自绘开关 */
.switch-input {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    margin: 0;
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.22);
    cursor: pointer;
    transition: background 0.18s ease;
}

.switch-input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: left 0.18s cubic-bezier(0.34, 1.4, 0.44, 1);
}

.switch-input:checked {
    background: var(--brand-gradient);
}

.switch-input:checked::after {
    left: 16px;
}

.switch-input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

/* ===== 字段块通用 ===== */
.field-block {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.field-block.disabled {
    opacity: 0.55;
    pointer-events: none;
}

.field-label,
.slider-head label {
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary-dark);
}

/* 分段控件 */
.seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 10px;
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.seg-btn {
    flex: 1;
    border: none;
    background: transparent;
    padding: 6px 0;
    font-size: 12px;
    color: var(--brand-accent-muted);
    border-radius: 8px;
    cursor: pointer;
    transition:
        background 0.14s ease,
        color 0.14s ease,
        box-shadow 0.14s ease;
}

.seg-btn:hover:not(:disabled):not(.active) {
    color: var(--brand-accent-dark);
}

.seg-btn.active {
    background: #ffffff;
    color: var(--brand-accent-dark);
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(35, 105, 61, 0.18);
}

.seg-btn:disabled {
    cursor: not-allowed;
}

/* ===== 一体式输入条 ===== */
.join-bar {
    display: flex;
    align-items: stretch;
    min-height: 34px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 11px;
    overflow: hidden;
    transition:
        border-color 0.2s ease-out,
        box-shadow 0.2s ease-out,
        background 0.2s ease-out;
}

.join-bar:focus-within {
    border-color: var(--brand-primary-light);
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 0 0 3px rgba(60, 165, 101, 0.14);
}

.join-lead {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding-left: 11px;
    color: var(--brand-accent-muted);
    transition: color 0.16s ease;
}

.join-bar:focus-within .join-lead {
    color: var(--brand-primary);
}

.join-field,
.join-select {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-brand-dark);
    outline: none;
}

.join-field::-webkit-outer-spin-button,
.join-field::-webkit-inner-spin-button {
    opacity: 0.35;
}

.join-sep {
    flex-shrink: 0;
    width: 1px;
    margin: 7px 0;
    background: rgba(var(--brand-primary-rgb), 0.16);
}

.join-select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238faa9b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    cursor: pointer;
}

.join-go {
    flex-shrink: 0;
    border: none;
    background: var(--brand-gradient);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    padding: 0 14px;
    cursor: pointer;
    white-space: nowrap;
    transition:
        filter 0.12s ease,
        opacity 0.12s ease;
}

.join-go:hover:not(:disabled) {
    filter: brightness(1.06);
}

/* ===== GPS 软按钮 ===== */
.gps-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 32px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-accent-dark);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition:
        background 0.12s ease,
        transform 0.12s ease;
}

.gps-btn:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.16);
    transform: translateY(-1px);
}

.gps-btn:active:not(:disabled) {
    transform: scale(0.97);
}

/* ===== 滑杆：渐变填充轨道 ===== */
.slider-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.slider-value {
    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    color: var(--toc-primary);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-radius: 999px;
    padding: 1px 8px;
    font-variant-numeric: tabular-nums;
}

.range-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(
        90deg,
        var(--brand-primary-light) var(--fill, 50%),
        rgba(var(--brand-primary-rgb), 0.16) var(--fill, 50%)
    );
}

.range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--brand-primary);
    box-shadow: 0 1px 4px rgba(var(--brand-primary-dark-rgb), 0.32);
    transition: transform 0.15s ease;
}

.range-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
}

.range-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--brand-primary);
    box-shadow: 0 1px 4px rgba(var(--brand-primary-dark-rgb), 0.32);
}

.range-slider:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* ===== 颜色卡片 ===== */
.color-card {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    background: rgba(255, 255, 255, 0.72);
    border-radius: 11px;
    cursor: pointer;
    transition:
        border-color 0.12s ease,
        background 0.12s ease;
}

.color-card:hover {
    border-color: rgba(var(--brand-primary-dark-rgb), 0.42);
    background: #ffffff;
}

.color-card.disabled {
    opacity: 0.55;
    pointer-events: none;
}

.swatch-color {
    -webkit-appearance: none;
    appearance: none;
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
}

.swatch-color::-webkit-color-swatch-wrapper {
    padding: 0;
}

.swatch-color::-webkit-color-swatch {
    border-radius: 8px;
    border: 2px solid #ffffff;
    box-shadow:
        0 0 0 1px rgba(var(--brand-primary-rgb), 0.28),
        0 2px 5px rgba(0, 0, 0, 0.14);
}

.swatch-color::-moz-color-swatch {
    border-radius: 8px;
    border: 2px solid #ffffff;
    box-shadow:
        0 0 0 1px rgba(var(--brand-primary-rgb), 0.28),
        0 2px 5px rgba(0, 0, 0, 0.14);
}

.color-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}

.color-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary-dark);
}

.color-hex {
    font-size: 11px;
    font-family: monospace;
    text-transform: uppercase;
    color: var(--brand-accent-muted);
}

/* ===== 状态条 ===== */
.status-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
}

.status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    background: rgba(35, 129, 67, 0.14);
    color: var(--brand-primary-dark);
}

.status-chip::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.75;
}

.status-granted {
    background: rgba(35, 129, 67, 0.16);
    color: #1e6a39;
}

.status-denied {
    background: rgba(220, 80, 80, 0.16);
    color: #a02626;
}

.status-unsupported {
    background: rgba(150, 150, 150, 0.18);
    color: #555;
}

.status-unknown {
    background: rgba(255, 193, 7, 0.22);
    color: #805b00;
}

.status-loading {
    background: rgba(45, 140, 255, 0.14);
    color: #1c62b9;
}

.status-error {
    max-width: 100%;
    background: rgba(220, 80, 80, 0.14);
    color: #9b2424;
}
</style>
