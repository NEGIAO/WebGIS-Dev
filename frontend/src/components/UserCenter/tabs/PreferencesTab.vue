<!--
  PreferencesTab.vue
  Purpose: Displays the user preferences tab of the floating account panel.
  Includes default basemap, language, unit system, preferred agent model,
  theme style selection, and avatar picker.
  Parent passes draft state and options; save actions bubble up via emits.
-->
<script setup>
import { computed } from 'vue';

const props = defineProps({
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
    /** Current user object (third-party avatar_url detection) */
    user: {
        type: Object,
        default: null,
    },
    /**
     * 当前生效头像索引（父组件归一化后下传，V3.4.62 A2）。
     * 原比较基准 user.avatar_index || 0 与实际显示基准（admin 默认 1）不一致，
     * 导致 admin 默认头像误显「保存头像」；改为与显示同源的归一化值。
     */
    currentAvatarIndex: {
        type: Number,
        default: 0,
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

/** 当前是否正在使用第三方（Google/GitHub）头像 */
const hasThirdPartyAvatar = computed(() => {
    return /^https?:\/\//i.test(String(props.user?.avatar_url || '').trim());
});

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
                    <span class="pref-desc">保存后下次进入（或刷新）自动应用；分享链接中的底图参数优先</span>
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
                    <span class="pref-desc">当前界面以中文为主，该偏好用于页面语言标记与后续多语言支持</span>
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
                    <span class="pref-desc">测量工具的距离/面积单位：公制（m/km）或英制（ft/mi/acre）</span>
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
                    <span class="pref-desc">AI 助手将优先使用该模型（在可用列表中时生效）</span>
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
                    <span class="pref-desc">{{ hasThirdPartyAvatar ? '当前使用第三方账号头像，选择预设头像可替换' : '选择你喜欢的头像样式' }}</span>
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
                v-if="hasThirdPartyAvatar || selectedAvatarIndex !== currentAvatarIndex"
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
/* 偏好页（浅色单套设计，与账号中心壳统一视觉语言） */
.prefs-view {
    display: flex;
    flex-direction: column;
}

.pref-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* 偏好项卡片行 */
.pref-item {
    background: var(--bg-primary);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 12px;
    padding: 11px 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.04);
    transition: border-color 0.15s ease;
}

.pref-item:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.3);
}

.pref-item.avatar-selector-item {
    flex-direction: column;
    align-items: stretch;
}

.pref-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.pref-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 7px;
}

.pref-title i {
    color: var(--brand-primary);
    font-size: 12px;
    width: 14px;
    text-align: center;
}

.pref-desc {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.4;
}

/* 下拉选择 */
.pref-select {
    min-width: 128px;
    max-width: 168px;
    height: 34px;
    border: 1px solid var(--border-light);
    border-radius: 9px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12.5px;
    padding: 0 8px;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.pref-select:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

/* 主题选择 */
.theme-grid {
    display: flex;
    gap: 8px;
}

.theme-option {
    display: flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    background: var(--bg-secondary);
    padding: 6px 10px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.theme-option:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.5);
    transform: translateY(-1px);
}

.theme-option.selected {
    border-color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.07);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.15);
}

.theme-preview {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.theme-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
}

/* 头像选择 */
.avatar-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
}

.avatar-option {
    position: relative;
    border: 2px solid transparent;
    border-radius: 50%;
    padding: 2px;
    cursor: pointer;
    background: none;
    transition: all 0.15s ease;
    aspect-ratio: 1;
}

.avatar-option img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}

.avatar-option:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--brand-primary-rgb), 0.4);
}

.avatar-option.selected {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.18);
}

.avatar-option.selected::after {
    content: '\2713';
    position: absolute;
    right: -3px;
    bottom: -3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--brand-primary);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(var(--brand-primary-rgb), 0.4);
}

.avatar-save-btn {
    margin-top: 10px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    box-shadow: 0 3px 10px rgba(var(--brand-primary-rgb), 0.28);
    transition: all 0.18s ease;
}

.avatar-save-btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.avatar-save-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.avatar-status {
    margin-top: 6px;
    font-size: 11.5px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 5px;
}

.avatar-status i {
    color: var(--brand-primary);
}

/* 保存按钮 */
.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
    height: 40px;
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 3px 10px rgba(var(--brand-primary-rgb), 0.28);
    transition: all 0.18s ease;
    margin-top: 10px;
}

.btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.w-100 {
    width: 100%;
}
</style>
