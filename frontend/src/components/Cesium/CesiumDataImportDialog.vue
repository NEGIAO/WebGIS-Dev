<template>
    <Teleport to="body">
        <div
            v-if="visible"
            class="cesium-data-dialog-overlay"
            @click.self="$emit('cancel')"
        >
            <div
                class="cesium-data-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="输入 3D 模型放置坐标"
            >
                <header class="dialog-header">
                    <div class="dialog-title-row">
                        <Box
                            :size="18"
                            stroke-width="2"
                        />
                        <span class="dialog-title">输入模型放置坐标</span>
                    </div>
                    <p class="dialog-file-name">{{ fileName }}</p>
                    <p class="dialog-hint">
                        该模型未包含嵌入的地理坐标，请输入要放置的位置。
                    </p>
                </header>

                <form
                    class="dialog-form"
                    @submit.prevent="handleConfirm"
                >
                    <div class="coord-fields">
                        <label class="coord-field">
                            <span class="coord-label">经度 (Longitude)</span>
                            <input
                                ref="lngInputRef"
                                v-model="lngStr"
                                class="coord-input"
                                type="number"
                                step="any"
                                :min="-180"
                                :max="180"
                                placeholder="例如: 104.1954"
                                @input="validate"
                            />
                            <span
                                v-if="lngError"
                                class="coord-error"
                            >{{ lngError }}</span>
                        </label>

                        <label class="coord-field">
                            <span class="coord-label">纬度 (Latitude)</span>
                            <input
                                v-model="latStr"
                                class="coord-input"
                                type="number"
                                step="any"
                                :min="-90"
                                :max="90"
                                placeholder="例如: 35.8617"
                                @input="validate"
                            />
                            <span
                                v-if="latError"
                                class="coord-error"
                            >{{ latError }}</span>
                        </label>

                        <label class="coord-field">
                            <span class="coord-label">高度 (Height 米)</span>
                            <input
                                v-model="heightStr"
                                class="coord-input"
                                type="number"
                                step="any"
                                min="0"
                                placeholder="例如: 0"
                                @input="validate"
                            />
                            <span
                                v-if="heightError"
                                class="coord-error"
                            >{{ heightError }}</span>
                        </label>
                    </div>

                    <div class="dialog-actions">
                        <button
                            class="dialog-btn cancel-btn"
                            type="button"
                            @click="$emit('cancel')"
                        >
                            取消
                        </button>
                        <button
                            class="dialog-btn confirm-btn"
                            type="submit"
                            :disabled="!valid"
                        >
                            <Send
                                :size="14"
                                stroke-width="2"
                            />
                            确认放置
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { Box, Send } from 'lucide-vue-next';

const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
    fileName: {
        type: String,
        default: '',
    },
});

const emit = defineEmits(['confirm', 'cancel']);

const lngStr = ref('');
const latStr = ref('');
const heightStr = ref('0');
const lngInputRef = ref(null);

const lngError = ref('');
const latError = ref('');
const heightError = ref('');

const valid = computed(() => {
    return (
        lngStr.value !== '' &&
        latStr.value !== '' &&
        !lngError.value &&
        !latError.value &&
        !heightError.value
    );
});

/**
 * 验证三个坐标字段
 */
function validate() {
    const lng = parseFloat(lngStr.value);
    const lat = parseFloat(latStr.value);
    const height = parseFloat(heightStr.value);

    lngError.value = '';
    latError.value = '';
    heightError.value = '';

    if (lngStr.value !== '' && (isNaN(lng) || lng < -180 || lng > 180)) {
        lngError.value = '经度范围: -180 ~ 180';
    }

    if (latStr.value !== '' && (isNaN(lat) || lat < -90 || lat > 90)) {
        latError.value = '纬度范围: -90 ~ 90';
    }

    if (heightStr.value !== '' && (isNaN(height) || height < 0)) {
        heightError.value = '高度必须 ≥ 0';
    }
}

/**
 * 确认坐标并发射事件
 */
function handleConfirm() {
    if (!valid.value) {
        validate();
        return;
    }

    const lng = parseFloat(lngStr.value);
    const lat = parseFloat(latStr.value);
    const height = parseFloat(heightStr.value) || 0;

    emit('confirm', { lng, lat, height });
}

// 弹窗打开/关闭时统一重置表单 + 必要时聚焦到经度输入框
watch(
    () => props.visible,
    (isVisible) => {
        // 仅在状态变化为打开时重置，避免重复创建文件时把进行中的输入擦除
        if (!isVisible) {
            lngError.value = '';
            latError.value = '';
            heightError.value = '';
            return;
        }

        // 打开时统一清空，避免残留上次的输入或报错
        lngStr.value = '';
        latStr.value = '';
        heightStr.value = '0';
        lngError.value = '';
        latError.value = '';
        heightError.value = '';

        if (isVisible) {
            // 等待 Teleport 把 dialog 挂载到 body 后再聚焦
            setTimeout(() => {
                lngInputRef.value?.focus();
            }, 60);
        }
    },
);
</script>

<style scoped>
.cesium-data-dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(4, 14, 22, 0.78);
    backdrop-filter: blur(8px);
}

.cesium-data-dialog {
    width: min(400px, calc(100vw - 32px));
    border: 1px solid rgba(155, 216, 255, 0.28);
    border-radius: 12px;
    background: rgba(12, 28, 40, 0.96);
    box-shadow: 0 24px 56px rgba(0, 8, 15, 0.52);
    color: #eefbf3;
    overflow: hidden;
}

.dialog-header {
    padding: 16px 18px;
    border-bottom: 1px solid rgba(155, 216, 255, 0.14);
}

.dialog-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    color: #b9e8ff;
}

.dialog-title {
    font-size: 15px;
    font-weight: 800;
    color: #f6fffb;
}

.dialog-file-name {
    margin: 0 0 6px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(74, 222, 128, 0.12);
    color: #a7f3d0;
    font-size: 12px;
    font-weight: 700;
    word-break: break-all;
}

.dialog-hint {
    margin: 0;
    color: rgba(220, 243, 255, 0.58);
    font-size: 12px;
    line-height: 1.4;
}

.dialog-form {
    padding: 18px;
}

.coord-fields {
    display: grid;
    gap: 14px;
    margin-bottom: 18px;
}

.coord-field {
    display: grid;
    gap: 5px;
}

.coord-label {
    color: rgba(238, 251, 243, 0.82);
    font-size: 12px;
    font-weight: 700;
}

.coord-input {
    height: 36px;
    border: 1px solid rgba(155, 216, 255, 0.24);
    border-radius: 7px;
    padding: 0 10px;
    background: rgba(4, 22, 34, 0.92);
    color: #f6fffb;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    transition: border-color 0.18s ease;
}

.coord-input:focus {
    border-color: rgba(74, 222, 128, 0.56);
    outline: none;
    box-shadow: 0 0 0 2px rgba(74, 222, 128, 0.14);
}

.coord-input::placeholder {
    color: rgba(220, 243, 255, 0.32);
}

.coord-error {
    color: #ff8f8f;
    font-size: 12px;
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}

.dialog-btn {
    min-width: 96px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    transition: all 0.18s ease;
}

.cancel-btn {
    border-color: rgba(155, 216, 255, 0.22);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(238, 251, 243, 0.78);
}

.cancel-btn:hover {
    border-color: rgba(155, 216, 255, 0.42);
    background: rgba(255, 255, 255, 0.12);
}

.confirm-btn {
    border-color: rgba(74, 222, 128, 0.48);
    background: rgba(21, 128, 79, 0.78);
    color: #f5fff9;
}

.confirm-btn:hover:not(:disabled) {
    border-color: rgba(74, 222, 128, 0.72);
    background: rgba(21, 128, 79, 0.92);
}

.confirm-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
</style>