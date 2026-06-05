<!--
  PreferencesTab.vue
  Purpose: Displays the user preferences tab of the floating account panel.
  Includes default basemap, language, unit system, preferred agent model,
  theme style selection, and avatar picker.
  Parent passes draft state and options; save actions bubble up via emits.
-->
<script setup>
// PreferencesTab — no extra imports needed

defineProps({
    /** Draft preferences object { default_basemap, language, unit_system, preferred_agent_model } */
    preferenceDraft: {
        type: Object,
        default: () => ({
            default_basemap: '',
            language: 'zh-CN',
            unit_system: 'metric',
            preferred_agent_model: '',
        }),
    },
    /** Whether preferences are currently being saved */
    preferenceSaving: {
        type: Boolean,
        default: false,
    },
    /** Available agent model IDs */
    preferenceModelOptions: {
        type: Array,
        default: () => [],
    },
    /** Available basemap options for the select */
    basemapPreferenceOptions: {
        type: Array,
        default: () => [],
    },
    /** Currently selected avatar index */
    selectedAvatarIndex: {
        type: Number,
        default: 0,
    },
    /** Whether avatar save request is in flight */
    avatarSaving: {
        type: Boolean,
        default: false,
    },
    /** Current user object (used to compare avatar_index) */
    user: {
        type: Object,
        default: null,
    },
    /** Current theme name */
    currentTheme: {
        type: String,
        default: 'default',
    },
});

const emit = defineEmits([
    /** Update a preference draft field. Payload: { key, value } */
    'update:preference-draft',
    /** Request parent to save preferences */
    'save-preferences',
    /** Update selected avatar index. Payload: new index */
    'update:selected-avatar-index',
    /** Request parent to save the avatar */
    'save-avatar',
    /** Request parent to set theme. Payload: theme name string */
    'set-theme',
]);

/** Helper to get avatar SVG path */
function getAvatarSrc(avatarIndex) {
    const base = String(import.meta.env.BASE_URL || '/').trim();
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}avatars/avatar-${avatarIndex}.svg`;
}

function updateDraftField(key, value) {
    emit('update:preference-draft', { key, value });
}

function handleSelectChange(key, event) {
    updateDraftField(key, event.target.value);
}

function handleSavePreferences() {
    emit('save-preferences');
}

function handleSelectAvatar(index) {
    emit('update:selected-avatar-index', index);
}

function handleSaveAvatar() {
    emit('save-avatar');
}

function handleSetTheme(theme) {
    emit('set-theme', theme);
}
</script>

<template>
    <div class="view-content prefs-view">
        <div class="pref-list">
            <div class="pref-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-map"></i> 默认底图</span>
                    <span class="pref-desc">刷新后自动应用当前选择的底图</span>
                </div>
                <select
                    class="pref-select"
                    :value="preferenceDraft.default_basemap"
                    @change="handleSelectChange('default_basemap', $event)"
                >
                    <option value="">跟随系统默认</option>
                    <option
                        v-for="option in basemapPreferenceOptions"
                        :key="option.value"
                        :value="option.value"
                    >
                        {{ option.label }}
                    </option>
                </select>
            </div>

            <div class="pref-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-language"></i> 界面语言</span>
                    <span class="pref-desc">设置账号默认语言偏好</span>
                </div>
                <select
                    class="pref-select"
                    :value="preferenceDraft.language"
                    @change="handleSelectChange('language', $event)"
                >
                    <option value="zh-CN">简体中文</option>
                    <option value="en-US">English</option>
                </select>
            </div>

            <div class="pref-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-ruler-combined"></i> 单位制</span>
                    <span class="pref-desc">控制距离等数值默认单位</span>
                </div>
                <select
                    class="pref-select"
                    :value="preferenceDraft.unit_system"
                    @change="handleSelectChange('unit_system', $event)"
                >
                    <option value="metric">公制 (km / m)</option>
                    <option value="imperial">英制 (mi / ft)</option>
                </select>
            </div>

            <div class="pref-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-robot"></i> 偏好 Agent 模型</span>
                    <span class="pref-desc">设置后将锁定优先使用该模型（若可用）</span>
                </div>
                <select
                    class="pref-select"
                    :value="preferenceDraft.preferred_agent_model"
                    @change="handleSelectChange('preferred_agent_model', $event)"
                >
                    <option value="">自动调度（后端随机）</option>
                    <option
                        v-for="modelId in preferenceModelOptions"
                        :key="modelId"
                        :value="modelId"
                    >
                        {{ modelId }}
                    </option>
                </select>
            </div>

            <!-- Theme selector -->
            <div class="pref-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-palette"></i> 主题风格</span>
                    <span class="pref-desc">选择界面主题色调</span>
                </div>
            </div>
            <div class="theme-grid">
                <div
                    class="theme-option"
                    :class="{ selected: currentTheme === 'default' }"
                    @click="handleSetTheme('default')"
                >
                    <div
                        class="theme-preview"
                        style="background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))"
                    ></div>
                    <span class="theme-label">默认绿</span>
                </div>
                <div
                    class="theme-option"
                    :class="{ selected: currentTheme === 'blue' }"
                    @click="handleSetTheme('blue')"
                >
                    <div
                        class="theme-preview"
                        style="background: linear-gradient(135deg, #1976d2, #0d47a1)"
                    ></div>
                    <span class="theme-label">海洋蓝</span>
                </div>
            </div>

            <button
                class="btn-primary w-100"
                type="button"
                :disabled="preferenceSaving"
                @click="handleSavePreferences"
            >
                <i
                    class="fas"
                    :class="preferenceSaving ? 'fa-spinner fa-spin' : 'fa-save'"
                ></i>
                {{ preferenceSaving ? '保存中...' : '保存偏好设置' }}
            </button>

            <!-- Avatar selector -->
            <div class="pref-item avatar-selector-item">
                <div class="pref-info">
                    <span class="pref-title"><i class="fas fa-image"></i> 个人头像</span>
                    <span class="pref-desc">选择你喜欢的头像样式</span>
                </div>
            </div>

            <div class="avatar-grid">
                <div
                    v-for="index in 12"
                    :key="index - 1"
                    class="avatar-option"
                    :class="{ selected: selectedAvatarIndex === index - 1 }"
                    @click="handleSelectAvatar(index - 1)"
                >
                    <img :src="getAvatarSrc(index - 1)" :alt="`Avatar ${index}`" />
                </div>
            </div>
            <button
                v-if="selectedAvatarIndex !== (user?.avatar_index || 0)"
                class="avatar-save-btn"
                :disabled="avatarSaving"
                @click="handleSaveAvatar"
            >
                <i class="fas fa-save"></i>
                {{ avatarSaving ? '保存中...' : '保存头像' }}
            </button>
            <div v-else class="avatar-status">
                <i class="fas fa-check-circle"></i> 当前头像
            </div>
        </div>
    </div>
</template>

<style scoped>
/* View: Preferences */
.pref-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.pref-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(16, 32, 22, 0.6);
    padding: 16px;
    border-radius: 10px;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.25);
    transition: border-color 0.3s ease;
}

.pref-item:hover {
    border-color: rgba(var(--brand-accent-light-rgb), 0.4);
}

.pref-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.pref-title {
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 10px;
}

.pref-title i {
    color: var(--brand-accent-light);
}

.pref-desc {
    font-size: 13px;
    color: #8fbc9f;
}

.pref-select {
    min-width: 150px;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.35);
    border-radius: 8px;
    background: rgba(8, 20, 14, 0.7);
    color: #e6fff1;
    padding: 8px 10px;
}

.pref-select:focus {
    outline: none;
    border-color: var(--brand-accent-light);
    box-shadow: 0 0 10px rgba(var(--brand-accent-light-rgb), 0.2);
}

/* Theme selector */
.theme-grid {
    display: flex;
    gap: 12px;
    padding: 8px 0 16px;
}

.theme-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 2px solid var(--border-light);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s ease;
    background: var(--bg-primary);
}

.theme-option:hover {
    border-color: var(--brand-primary-light);
    background: var(--bg-hover);
}

.theme-option.selected {
    border-color: var(--brand-primary);
    background: var(--bg-active);
    box-shadow: 0 0 0 2px var(--bg-hover);
}

.theme-preview {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    flex-shrink: 0;
}

.theme-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
}

/* Avatar selector */
.avatar-selector-item {
    border-bottom: 1px solid rgba(var(--brand-accent-light-rgb), 0.1);
    margin-bottom: 16px;
    padding-bottom: 12px;
}

.avatar-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    padding: 16px 0;
    margin: 12px 0;
}

.avatar-option {
    position: relative;
    aspect-ratio: 1;
    border: 2px solid rgba(var(--brand-accent-light-rgb), 0.3);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(var(--brand-accent-light-rgb), 0.05);
}

.avatar-option img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
}

.avatar-option:hover {
    border-color: rgba(var(--brand-accent-light-rgb), 0.6);
    background: rgba(var(--brand-accent-light-rgb), 0.15);
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(var(--brand-accent-light-rgb), 0.2);
}

.avatar-option.selected {
    border-color: var(--brand-accent-light);
    background: rgba(var(--brand-accent-light-rgb), 0.25);
    box-shadow:
        0 0 0 3px rgba(var(--brand-accent-light-rgb), 0.1),
        inset 0 0 0 2px var(--brand-accent-light);
}

.avatar-option.selected::after {
    content: '\2713';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 20px;
    color: var(--brand-accent-light);
    font-weight: bold;
    background: rgba(255, 255, 255, 0.9);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(var(--brand-accent-light-rgb), 0.3);
}

.avatar-save-btn {
    width: 100%;
    padding: 10px;
    margin-top: 12px;
    background: linear-gradient(135deg, rgba(var(--brand-accent-light-rgb), 0.8), rgba(var(--brand-accent-light-rgb), 0.6));
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.4);
    color: white;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.avatar-save-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(var(--brand-accent-light-rgb), 1), rgba(var(--brand-accent-light-rgb), 0.8));
    border-color: rgba(var(--brand-accent-light-rgb), 0.7);
    box-shadow: 0 6px 16px rgba(var(--brand-accent-light-rgb), 0.3);
    transform: translateY(-2px);
}

.avatar-save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.avatar-status {
    text-align: center;
    color: var(--brand-accent-light);
    font-size: 13px;
    padding: 8px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
}

.avatar-status i {
    font-size: 14px;
}

/* Shared button styles needed by this tab */
.btn-primary {
    background: linear-gradient(135deg, rgba(var(--brand-accent-light-rgb), 0.85) 0%, var(--brand-primary-dark) 100%);
    color: white;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.6);
    height: 48px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
    margin-top: 8px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(var(--brand-accent-light-rgb), 0.35);
    border-color: var(--brand-accent-light);
    background: linear-gradient(135deg, var(--brand-accent-light) 0%, var(--brand-primary) 100%);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(0.5);
}

.w-100 {
    width: 100%;
}

/* Light Mint Theme Override */
.pref-item {
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(var(--brand-primary-rgb), 0.2);
    box-shadow: 0 4px 12px rgba(76, 130, 88, 0.08);
}

.pref-item:hover {
    background: rgba(252, 255, 253, 0.95);
    border-color: rgba(var(--brand-primary-rgb), 0.35);
}

.pref-title {
    color: var(--acc-text-strong, #214a31);
    text-shadow: none;
}

.pref-title i {
    color: var(--acc-mint-700, var(--brand-primary-dark));
}

.pref-desc {
    color: var(--acc-text-soft, #5d7f6a);
}

.pref-select {
    color: var(--acc-text-strong, #214a31);
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(var(--brand-primary-rgb), 0.3);
}

.pref-select:focus {
    border-color: rgba(var(--brand-primary-rgb), 0.52);
    box-shadow: 0 0 0 3px rgba(var(--brand-accent-light-rgb), 0.18);
}

.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    border-color: rgba(63, 148, 75, 0.55);
    color: #f8fff9;
    box-shadow: 0 6px 16px rgba(58, 129, 76, 0.24);
    text-shadow: none;
}

.btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    box-shadow: 0 8px 18px rgba(58, 129, 76, 0.3);
}
</style>
