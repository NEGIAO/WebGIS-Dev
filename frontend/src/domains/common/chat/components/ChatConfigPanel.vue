<template>
    <div class="user-config-panel">
        <!-- ── 接入凭据 ── -->
        <section class="cfg-card">
            <div
                class="cfg-card-head"
                role="button"
                tabindex="0"
                @click="toggleSection('credentials')"
                @keydown.enter.prevent="toggleSection('credentials')"
            >
                <KeyRound
                    :size="14"
                    class="cfg-card-icon"
                />
                <span class="cfg-card-title">{{ t('chat.configTitle') }}</span>
                <span
                    v-if="config.isPersonalMode"
                    class="cfg-badge"
                >{{ t('chat.personalKeyEnabled') }}</span>
                <ChevronDown
                    :size="14"
                    class="cfg-collapse-icon"
                    :class="{ open: openSections.credentials }"
                />
            </div>

            <div v-show="openSections.credentials">
                <label class="cfg-field">
                    <span class="cfg-label">API Key</span>
                    <div class="cfg-input-wrap">
                        <input
                            v-model="config.userConfigDraft.api_key"
                            :type="showKey ? 'text' : 'password'"
                            class="cfg-input"
                            :placeholder="t('chat.apiKeyPlaceholder')"
                            autocomplete="off"
                        />
                        <button
                            class="cfg-input-btn"
                            :title="showKey ? t('chat.hide') : t('chat.show')"
                            @click="showKey = !showKey"
                        >
                            <EyeOff
                                v-if="showKey"
                                :size="14"
                            />
                            <Eye
                                v-else
                                :size="14"
                            />
                        </button>
                    </div>
                    <span class="cfg-hint">{{ t('chat.apiKeyHint') }}</span>
                </label>

                <label class="cfg-field">
                    <span class="cfg-label">Base URL</span>
                    <div class="cfg-input-wrap">
                        <Globe
                            :size="13"
                            class="cfg-input-icon"
                        />
                        <input
                            v-model="config.userConfigDraft.base_url"
                            class="cfg-input with-icon"
                            placeholder="https://api.xxx.com/v1"
                        />
                    </div>
                </label>
            </div>
        </section>

        <!-- ── 模型 ── -->
        <section class="cfg-card">
            <div
                class="cfg-card-head"
                role="button"
                tabindex="0"
                @click="toggleSection('model')"
                @keydown.enter.prevent="toggleSection('model')"
            >
                <Boxes
                    :size="14"
                    class="cfg-card-icon"
                />
                <span class="cfg-card-title">{{ t('chat.model') }}</span>
                <button
                    class="cfg-head-btn"
                    :disabled="config.isLoadingModels"
                    :title="t('chat.refreshModels')"
                    @click.stop="config.reloadAgentConfig(true)"
                >
                    <RefreshCw
                        :size="13"
                        :class="{ spin: config.isLoadingModels }"
                    />
                </button>
                <ChevronDown
                    :size="14"
                    class="cfg-collapse-icon"
                    :class="{ open: openSections.model }"
                />
            </div>

            <div
                v-show="openSections.model"
                class="cfg-field"
            >
                <div class="cfg-input-wrap model-combo">
                    <input
                        ref="modelInputRef"
                        v-model="config.userConfigDraft.model"
                        class="cfg-input"
                        :placeholder="t('chat.modelPlaceholder')"
                        autocomplete="off"
                        @focus="openModelDropdown"
                        @blur="onModelInputBlur"
                        @input="modelQuery = $event.target.value"
                    />
                    <button
                        class="cfg-input-btn"
                        :title="t('chat.expandModels')"
                        @click.stop="toggleModelDropdown"
                    >
                        <ChevronDown
                            :size="14"
                            :class="['combo-chevron', { open: showModelDropdown }]"
                        />
                    </button>
                    <div
                        v-if="showModelDropdown && filteredModels.length"
                        class="model-dropdown"
                        @mousedown.prevent
                    >
                        <div
                            v-for="m in filteredModels"
                            :key="m.id"
                            class="model-dropdown-item"
                            :class="{ selected: m.id === config.userConfigDraft.model }"
                            @mousedown.prevent="pickModel(m.id)"
                        >
                            <span class="model-name">{{ m.name || m.id }}</span>
                            <span
                                v-if="m._isFallback"
                                class="model-tag"
                            >{{ t('chat.currentTag') }}</span>
                            <span
                                v-else-if="m.source === 'upstream'"
                                class="model-tag upstream"
                            >{{ t('chat.upstreamTag') }}</span>
                        </div>
                    </div>
                </div>
                <span class="cfg-hint">{{ config.modelLoadHint || t('chat.modelLoadHint') }}</span>
            </div>
        </section>

        <!-- ── 生成参数 ── -->
        <section class="cfg-card">
            <div
                class="cfg-card-head"
                role="button"
                tabindex="0"
                @click="toggleSection('params')"
                @keydown.enter.prevent="toggleSection('params')"
            >
                <SlidersHorizontal
                    :size="14"
                    class="cfg-card-icon"
                />
                <span class="cfg-card-title">{{ t('chat.generateParams') }}</span>
                <ChevronDown
                    :size="14"
                    class="cfg-collapse-icon"
                    :class="{ open: openSections.params }"
                />
            </div>

            <div v-show="openSections.params">
                <div class="cfg-field">
                    <div class="cfg-label-row">
                        <span class="cfg-label">Temperature</span>
                        <span class="cfg-value-chip">{{ Number(config.userConfigDraft.temperature ?? 1).toFixed(1) }}</span>
                    </div>
                    <input
                        v-model.number="config.userConfigDraft.temperature"
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        class="cfg-slider"
                    />
                    <div class="cfg-slider-marks">
                        <span>{{ t('chat.precise') }}</span>
                        <span>{{ t('chat.balanced') }}</span>
                        <span>{{ t('chat.creative') }}</span>
                    </div>
                </div>

                <div class="cfg-grid-2">
                    <label class="cfg-field">
                        <span class="cfg-label">Max Tokens</span>
                        <input
                            v-model.number="config.userConfigDraft.max_tokens"
                            type="number"
                            min="1"
                            max="128000"
                            class="cfg-input"
                        />
                    </label>
                    <label class="cfg-field">
                        <span class="cfg-label">{{ t('chat.timeout') }}</span>
                        <input
                            v-model.number="config.userConfigDraft.timeout_seconds"
                            type="number"
                            min="5"
                            max="180"
                            class="cfg-input"
                        />
                    </label>
                </div>
            </div>
        </section>

        <!-- ── 系统提示词 ── -->
        <section class="cfg-card">
            <div
                class="cfg-card-head"
                role="button"
                tabindex="0"
                @click="toggleSection('prompt')"
                @keydown.enter.prevent="toggleSection('prompt')"
            >
                <MessageSquareText
                    :size="14"
                    class="cfg-card-icon"
                />
                <span class="cfg-card-title">{{ t('chat.systemPrompt') }}</span>
                <span class="cfg-card-caption">{{ t('chat.systemPromptCaption') }}</span>
                <ChevronDown
                    :size="14"
                    class="cfg-collapse-icon"
                    :class="{ open: openSections.prompt }"
                />
            </div>
            <div v-show="openSections.prompt">
                <textarea
                    v-model="config.userConfigDraft.system_prompt"
                    rows="2"
                    class="cfg-textarea"
                    :placeholder="t('chat.systemPromptPlaceholder')"
                ></textarea>
            </div>
        </section>

        <!-- ── 操作区 ── -->
        <div class="cfg-actions">
            <button
                class="cfg-primary-btn"
                :disabled="config.userConfigSaving"
                @click="config.saveUserConfig()"
            >
                <Save :size="14" />
                {{ config.userConfigSaving ? t('chat.saving') : t('chat.saveConfig') }}
            </button>
            <button
                class="cfg-text-btn"
                :disabled="config.userConfigSaving"
                :title="t('chat.clearKeyTitle')"
                @click="config.clearPersonalKey()"
            >
                <Trash2 :size="13" />
                {{ t('chat.clearKey') }}
            </button>
            <button
                class="cfg-text-btn"
                :disabled="config.userConfigSaving"
                :title="t('chat.resetDefaultTitle')"
                @click="config.resetProviderOverrides()"
            >
                <RotateCcw :size="13" />
                {{ t('chat.resetDefault') }}
            </button>
        </div>
    </div>
</template>

<script setup>
/**
 * ChatConfigPanel - 个人 Agent 配置面板（对标网页版设置面板重设计）
 *
 * 结构：接入凭据 / 模型 / 生成参数 / 系统提示词 四张分组卡片 + 主次分层操作区。
 * 交互增强：API Key 显隐切换、Temperature 滑杆（含刻度语义）、模型下拉带来源标签与选中态、
 *           刷新按钮加载中旋转。
 * 状态来源：inject 容器 provide 的 reactive 配置对象（store 型共享对象）。
 */
import { computed, inject, reactive, ref } from 'vue';
import {
    Boxes,
    ChevronDown,
    Eye,
    EyeOff,
    Globe,
    KeyRound,
    MessageSquareText,
    RefreshCw,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Trash2,
} from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

/** 容器 ChatPanelContent provide 的 Agent 配置对象 */
const config = inject('chatAgentConfig', reactive({}));
const { t } = useLocale();

const modelInputRef = ref(null);
const showModelDropdown = ref(false);
const showKey = ref(false);

/** 卡片折叠态：默认只展开「模型」（最常用），其余收起以控制面板高度占比 */
const openSections = reactive({
    credentials: false,
    model: true,
    params: false,
    prompt: false,
});

function toggleSection(key) {
    openSections[key] = !openSections[key];
}

/** 用户手动键入的过滤词；点开下拉/选中模型后清空，恢复全量列表。
 * 不直接用 draft.model 当过滤词——它常驻显示当前模型名，会把列表过滤到只剩自己 */
const modelQuery = ref('');

/** 过滤下拉列表：无键入时展示全量，键入时按 id/name 忽略大小写过滤 */
const filteredModels = computed(() => {
    const q = modelQuery.value.trim().toLowerCase();
    const list = config.selectModels || [];
    if (!q) return list;
    return list.filter(
        (m) => m.id.toLowerCase().includes(q) || String(m.name || '').toLowerCase().includes(q),
    );
});

/** 从下拉列表选中某个模型：仅写入草稿，实际请求模型保持不变 */
function pickModel(id) {
    // 只改草稿：默认 AI / 个人 Key 的请求模型源（defaultAIModel / directConfig.model）
    // 必须等用户点击「保存设置」由 saveUserConfig 提交后才变更，未保存前不影响在途请求
    config.userConfigDraft.model = id;
    modelQuery.value = '';
    showModelDropdown.value = false;
}

/** 聚焦输入框打开下拉：清空过滤词，展示全部可选模型 */
function openModelDropdown() {
    modelQuery.value = '';
    showModelDropdown.value = true;
}

/** 切换下拉显示 */
function toggleModelDropdown() {
    showModelDropdown.value = !showModelDropdown.value;
    if (showModelDropdown.value) {
        modelQuery.value = '';
        modelInputRef.value?.focus();
    }
}

/** 输入框失焦时延迟关闭下拉（给 @mousedown.prevent 留时间） */
function onModelInputBlur() {
    setTimeout(() => {
        showModelDropdown.value = false;
    }, 150);
}
</script>

<style scoped>
.user-config-panel {
    border-bottom: 1px solid #eef2ef;
    background: #f6f9f6;
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* ========== 分组卡片 ========== */
.cfg-card {
    background: #fff;
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 10px;
    padding: 10px 12px 11px;
    box-shadow: 0 1px 2px rgba(34, 50, 38, 0.03);
}

.cfg-card-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    cursor: pointer;
    user-select: none;
}

.cfg-collapse-icon {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform 0.18s ease;
}

.cfg-collapse-icon.open {
    transform: rotate(180deg);
}

.cfg-card-icon {
    color: var(--brand-primary);
    flex-shrink: 0;
}

.cfg-card-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-primary);
}

.cfg-card-caption {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
}

.cfg-badge {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 999px;
    padding: 1px 8px;
}

.cfg-head-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.cfg-head-btn:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.cfg-head-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.spin {
    animation: cfgSpin 0.9s linear infinite;
}

@keyframes cfgSpin {
    to { transform: rotate(360deg); }
}

/* ========== 字段 ========== */
.cfg-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
}

.cfg-card .cfg-field:last-child,
.cfg-card .cfg-grid-2:last-child {
    margin-bottom: 0;
}

.cfg-label {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-secondary);
}

.cfg-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.cfg-value-chip {
    font-size: 11px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-radius: 6px;
    padding: 1px 8px;
    font-variant-numeric: tabular-nums;
}

.cfg-hint {
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--text-muted);
}

.cfg-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
}

/* ========== 输入控件 ========== */
.cfg-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
}

.cfg-input {
    width: 100%;
    border: 1px solid #dde7e0;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12.5px;
    font-family: inherit;
    color: var(--text-primary);
    background: #fbfdfb;
    box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.cfg-input.with-icon {
    padding-left: 28px;
}

.cfg-input:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.5);
}

.cfg-input:focus {
    outline: none;
    border-color: var(--brand-primary);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

.cfg-input-icon {
    position: absolute;
    left: 9px;
    color: var(--text-muted);
    pointer-events: none;
}

/* 输入框内嵌按钮（显隐 Key / 下拉箭头） */
.cfg-input-btn {
    position: absolute;
    right: 4px;
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
}

.cfg-input-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary-dark);
}

.combo-chevron {
    transition: transform 0.18s ease;
}

.combo-chevron.open {
    transform: rotate(180deg);
}

.cfg-textarea {
    width: 100%;
    border: 1px solid #dde7e0;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12.5px;
    line-height: 1.55;
    font-family: inherit;
    color: var(--text-primary);
    background: #fbfdfb;
    box-sizing: border-box;
    resize: vertical;
    min-height: 62px;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.cfg-textarea:focus {
    outline: none;
    border-color: var(--brand-primary);
    background: #fff;
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

/* ========== Temperature 滑杆 ========== */
.cfg-slider {
    width: 100%;
    accent-color: var(--brand-primary);
    cursor: pointer;
    margin: 2px 0 0;
}

.cfg-slider-marks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
    user-select: none;
}

/* ========== 模型下拉 ========== */
.model-combo .cfg-input {
    padding-right: 30px;
}

.model-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: #fff;
    border: 1px solid #dde7e0;
    border-radius: 8px;
    max-height: 200px;
    overflow-y: auto;
    z-index: var(--z-float);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.model-dropdown-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.12s;
}

.model-dropdown-item:hover {
    background: rgba(var(--brand-primary-rgb), 0.07);
}

.model-dropdown-item.selected {
    background: rgba(var(--brand-primary-rgb), 0.1);
}

.model-dropdown-item.selected .model-name {
    color: var(--brand-primary-dark);
    font-weight: 600;
}

.model-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
}

.model-tag {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-radius: 4px;
    padding: 0 5px;
    line-height: 16px;
}

.model-tag.upstream {
    color: #1565c0;
    background: #e3f2fd;
}

/* ========== 操作区 ========== */
.cfg-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.cfg-primary-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(var(--brand-primary-rgb), 0.3);
    transition: all 0.15s;
}

.cfg-primary-btn:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.cfg-primary-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.cfg-text-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: none;
    border-radius: 7px;
    padding: 7px 8px;
    color: var(--text-secondary);
    font-size: 11.5px;
    cursor: pointer;
    transition: all 0.15s;
}

.cfg-text-btn:hover:not(:disabled) {
    background: rgba(var(--danger-rgb), 0.07);
    color: var(--danger);
}

.cfg-text-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
