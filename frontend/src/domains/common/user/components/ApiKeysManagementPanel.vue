<template>
    <div class="api-keys-container">
        <div class="keys-header">
            <h2>{{ t('apiKeys.title') }}</h2>
            <p class="subtitle">{{ t('apiKeys.subtitle') }}</p>
            <p class="subtitle layer-note">{{ t('apiKeys.keyNote') }}</p>
        </div>

        <div class="keys-section">
            <div v-if="loading" class="loading-state">
                <span class="spinner"></span> {{ t('apiKeys.loading') }}
            </div>

            <div v-else class="keys-grid">
                <div class="key-card">
                    <div class="key-header">
                        <h3>{{ t('apiKeys.amapKey') }}</h3>
                        <span :class="['status-badge', keysStatus.amap_key?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.amap_key?.is_set ? t('apiKeys.configured') : t('apiKeys.notConfigured') }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'amap_key'" class="edit-form">
                            <textarea
                                v-model="editValues.amap_key"
                                :placeholder="t('apiKeys.amapKeyPlaceholder')"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('amap_key')">{{ t('apiKeys.save') }}</button>
                                <button class="btn btn-cancel" @click="cancelEdit">{{ t('apiKeys.cancel') }}</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.amap_key?.is_set ? t('apiKeys.masked') : t('apiKeys.notConfigured') }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('amap_key')">{{ t('apiKeys.edit') }}</button>
                                <button
                                    v-if="keysStatus.amap_key?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('amap_key')"
                                >
                                    {{ t('apiKeys.delete') }}
                                </button>
                            </div>
                            <p class="key-hint">
                                {{ t('apiKeys.getAmapKey') }}
                                <a
                                    href="https://lbs.amap.com/api/webservice/guide/create-project/api-key"
                                    target="_blank"
                                >
                                    {{ t('apiKeys.amapPlatform') }}
                                </a>
                            </p>
                        </div>
                    </div>
                    <div class="key-footer">
                        {{ t('apiKeys.lastUpdated', { time: formatTime(keysStatus.amap_key?.updated_at) }) }}
                    </div>
                </div>

                <div class="key-card">
                    <div class="key-header">
                        <h3>{{ t('apiKeys.agentKey') }}</h3>
                        <span :class="['status-badge', keysStatus.agent_api_key?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.agent_api_key?.is_set ? t('apiKeys.configured') : t('apiKeys.notConfigured') }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'agent_api_key'" class="edit-form">
                            <textarea
                                v-model="editValues.agent_api_key"
                                :placeholder="t('apiKeys.agentKeyPlaceholder')"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('agent_api_key')">{{ t('apiKeys.save') }}</button>
                                <button class="btn btn-cancel" @click="cancelEdit">{{ t('apiKeys.cancel') }}</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.agent_api_key?.is_set ? t('apiKeys.masked') : t('apiKeys.notConfigured') }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('agent_api_key')">{{ t('apiKeys.edit') }}</button>
                                <button
                                    v-if="keysStatus.agent_api_key?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('agent_api_key')"
                                >
                                    {{ t('apiKeys.delete') }}
                                </button>
                            </div>
                            <p class="key-hint">{{ t('apiKeys.agentKeyHint') }}</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        {{ t('apiKeys.lastUpdated', { time: formatTime(keysStatus.agent_api_key?.updated_at) }) }}
                    </div>
                </div>

                <div class="key-card">
                    <div class="key-header">
                        <h3>{{ t('apiKeys.tiandituKey') }}</h3>
                        <span :class="['status-badge', keysStatus.tianditu_tk?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.tianditu_tk?.is_set ? t('apiKeys.configured') : t('apiKeys.notConfigured') }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'tianditu_tk'" class="edit-form">
                            <textarea
                                v-model="editValues.tianditu_tk"
                                :placeholder="t('apiKeys.tiandituKeyPlaceholder')"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('tianditu_tk')">{{ t('apiKeys.save') }}</button>
                                <button class="btn btn-cancel" @click="cancelEdit">{{ t('apiKeys.cancel') }}</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.tianditu_tk?.is_set ? t('apiKeys.masked') : t('apiKeys.notConfigured') }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('tianditu_tk')">{{ t('apiKeys.edit') }}</button>
                                <button
                                    v-if="keysStatus.tianditu_tk?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('tianditu_tk')"
                                >
                                    {{ t('apiKeys.delete') }}
                                </button>
                            </div>
                            <p class="key-hint">{{ t('apiKeys.tiandituKeyHint') }}</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        {{ t('apiKeys.lastUpdated', { time: formatTime(keysStatus.tianditu_tk?.updated_at) }) }}
                    </div>
                </div>

                <div class="key-card">
                    <div class="key-header">
                        <h3>{{ t('apiKeys.cesiumKey') }}</h3>
                        <span :class="['status-badge', keysStatus.cesium_ion_token?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.cesium_ion_token?.is_set ? t('apiKeys.configured') : t('apiKeys.notConfigured') }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'cesium_ion_token'" class="edit-form">
                            <textarea
                                v-model="editValues.cesium_ion_token"
                                :placeholder="t('apiKeys.cesiumKeyPlaceholder')"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('cesium_ion_token')">{{ t('apiKeys.save') }}</button>
                                <button class="btn btn-cancel" @click="cancelEdit">{{ t('apiKeys.cancel') }}</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.cesium_ion_token?.is_set ? t('apiKeys.masked') : t('apiKeys.notConfigured') }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('cesium_ion_token')">{{ t('apiKeys.edit') }}</button>
                                <button
                                    v-if="keysStatus.cesium_ion_token?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('cesium_ion_token')"
                                >
                                    {{ t('apiKeys.delete') }}
                                </button>
                            </div>
                            <p class="key-hint">{{ t('apiKeys.cesiumKeyHint') }}</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        {{ t('apiKeys.lastUpdated', { time: formatTime(keysStatus.cesium_ion_token?.updated_at) }) }}
                    </div>
                </div>
            </div>

            <div v-if="!loading" class="backup-token-section">
                <div class="section-header-row">
                    <h3>{{ t('apiKeys.backupPoolTitle') }}</h3>
                    <p class="config-note">{{ t('apiKeys.backupPoolNote') }}</p>
                </div>
                <div class="backup-grid">
                    <div v-for="item in managedApiKeys" :key="item.key" class="backup-card">
                        <div class="backup-card-head">
                            <strong>{{ item.label }}</strong>
                            <span>{{ t('apiKeys.backupCount', { count: getBackupCount(item.key) }) }}</span>
                        </div>
                        <div v-if="getBackups(item.key).length" class="backup-list">
                            <div
                                v-for="backup in getBackups(item.key)"
                                :key="backup.id"
                                class="backup-row"
                            >
                                <span>{{ t('apiKeys.backupItemSet', { n: Number(backup.priority || 0) + 1 }) }}</span>
                                <button
                                    class="btn btn-delete btn-compact"
                                    @click="deleteBackupKey(item.key, backup.id)"
                                >
                                    {{ t('apiKeys.delete') }}
                                </button>
                            </div>
                        </div>
                        <p v-else class="backup-empty">{{ t('apiKeys.backupEmpty') }}</p>

                        <div v-if="editingBackupKey === item.key" class="backup-edit">
                            <textarea
                                v-model="backupEditValues[item.key]"
                                class="key-input"
                                rows="2"
                                :placeholder="t('apiKeys.backupPlaceholder', { label: item.label })"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveBackupKey(item.key)">
                                    {{ t('apiKeys.saveBackup') }}
                                </button>
                                <button class="btn btn-cancel" @click="cancelBackupEdit">
                                    {{ t('apiKeys.cancel') }}
                                </button>
                            </div>
                        </div>
                        <button v-else class="btn btn-edit" @click="startBackupEdit(item.key)">
                            {{ t('apiKeys.addBackup') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="agent-config-section">
            <div class="section-header-row">
                <h3>{{ t('apiKeys.agentParamsTitle') }}</h3>
                <div class="section-actions">
                    <button class="btn btn-edit" @click="loadAgentConfigWrapper">{{ t('apiKeys.refresh') }}</button>
                    <button
                        v-if="!editingAgentConfig"
                        class="btn btn-edit"
                        @click="startEditAgentConfig"
                    >
                        {{ t('apiKeys.editParams') }}
                    </button>
                </div>
            </div>

            <div v-if="agentConfigLoading" class="loading-state">
                <span class="spinner"></span> {{ t('apiKeys.loadingConfig') }}
            </div>

            <div v-else-if="editingAgentConfig" class="edit-form">
                <div class="config-grid">
                    <label class="config-item">
                        <span>Base URL</span>
                        <input
                            v-model="agentConfigDraft.base_url"
                            class="key-input"
                            placeholder="https://api.xxx.com/v1"
                        />
                    </label>
                    <label class="config-item">
                        <span>Model</span>
                        <input
                            v-model="agentConfigDraft.model"
                            class="key-input"
                            :placeholder="t('admin.modelRandomPlaceholder')"
                        />
                    </label>
                    <label class="config-item config-item-full">
                        <span>{{ t('apiKeys.availableModelsLabel') }}</span>
                        <textarea
                            v-model="agentConfigDraft.available_models_text"
                            rows="3"
                            class="key-input"
                            placeholder="qwen-plus\ndeepseek-chat\ngpt-4o-mini"
                        ></textarea>
                    </label>
                    <label class="config-item">
                        <span>Timeout (seconds)</span>
                        <input
                            v-model.number="agentConfigDraft.timeout_seconds"
                            type="number"
                            min="5"
                            max="180"
                            class="key-input"
                        />
                    </label>
                    <label class="config-item">
                        <span>Max Tokens</span>
                        <input
                            v-model.number="agentConfigDraft.max_tokens"
                            type="number"
                            min="1"
                            max="32768"
                            class="key-input"
                        />
                    </label>
                    <label class="config-item">
                        <span>Temperature</span>
                        <input
                            v-model.number="agentConfigDraft.temperature"
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            class="key-input"
                        />
                    </label>
                    <label class="config-item">
                        <span>Top P</span>
                        <input
                            v-model.number="agentConfigDraft.top_p"
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            class="key-input"
                        />
                    </label>
                    <label class="config-item config-item-full">
                        <span>Extra Body (JSON)</span>
                        <textarea
                            v-model="agentConfigDraft.extra_body"
                            rows="3"
                            class="key-input"
                            placeholder='{"chat_template_kwargs":{"enable_thinking":true},"reasoning_budget":16384}'
                        ></textarea>
                    </label>
                    <label class="config-item">
                        <span>Stream</span>
                        <input
                            v-model="agentConfigDraft.stream"
                            type="checkbox"
                            class="key-input"
                            style="width: auto; margin-top: 8px;"
                        />
                    </label>
                    <label class="config-item config-item-full">
                        <span>System Prompt</span>
                        <textarea
                            v-model="agentConfigDraft.system_prompt"
                            rows="4"
                            class="key-input"
                            :placeholder="t('admin.systemPromptPlaceholder')"
                        ></textarea>
                    </label>
                </div>

                <div class="button-group">
                    <button class="btn btn-save" @click="saveAgentConfigWrapper">{{ t('apiKeys.saveParams') }}</button>
                    <button class="btn btn-cancel" @click="cancelEditAgentConfig">{{ t('apiKeys.cancel') }}</button>
                </div>
            </div>

            <div v-else class="config-view">
                <div class="config-grid">
                    <div class="config-item">
                        <span>Base URL</span>
                        <strong>{{ agentConfig.base_url || t('apiKeys.notConfigured') }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Model</span>
                        <strong>{{ agentConfig.model || t('apiKeys.notConfigured') }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>Available Models</span>
                        <strong>{{
                            (agentConfig.available_models || []).join(', ') || t('apiKeys.notConfigured')
                        }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Timeout</span>
                        <strong>{{
                            agentConfig.timeout_seconds
                                ? t('admin.secondsUnit', { n: agentConfig.timeout_seconds })
                                : '-'
                        }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Max Tokens</span>
                        <strong>{{ agentConfig.max_tokens || '-' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Temperature</span>
                        <strong>{{ agentConfig.temperature ?? '-' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Top P</span>
                        <strong>{{ agentConfig.top_p ?? '-' }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>Extra Body</span>
                        <strong>{{
                            agentConfig.extra_body
                                ? JSON.stringify(agentConfig.extra_body)
                                : t('apiKeys.notConfigured')
                        }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Stream</span>
                        <strong>{{ agentConfig.stream ? t('admin.streamOn') : t('admin.streamOff') }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>System Prompt</span>
                        <strong>{{ agentConfig.system_prompt || t('apiKeys.notConfigured') }}</strong>
                    </div>
                </div>
            </div>
        </div>

        <div class="agent-config-section">
            <div class="section-header-row">
                <h3>{{ t('apiKeys.defaultAITitle') }}</h3>
                <span :class="['status-badge', defaultAIConfig.is_configured ? 'set' : 'unset']">
                    {{ defaultAIConfig.is_configured ? t('apiKeys.configured') : t('apiKeys.notConfigured') }}
                </span>
                <div class="section-actions">
                    <button class="btn btn-edit" @click="loadDefaultAIConfig">{{ t('apiKeys.refresh') }}</button>
                    <button
                        v-if="!editingDefaultAI"
                        class="btn btn-edit"
                        @click="startEditDefaultAI"
                    >
                        {{ t('apiKeys.editConfig') }}
                    </button>
                </div>
            </div>

            <p class="config-note" style="margin-bottom: 12px">{{ t('apiKeys.defaultAIDesc') }}</p>

            <div v-if="defaultAILoading" class="loading-state">
                <span class="spinner"></span> {{ t('apiKeys.loadingConfig') }}
            </div>

            <div v-else-if="editingDefaultAI" class="edit-form">
                <div class="config-grid">
                    <label class="config-item config-item-full">
                        <span>API Key</span>
                        <input
                            v-model="defaultAIDraft.api_key"
                            type="password"
                            class="key-input"
                            :placeholder="t('apiKeys.defaultAIKeyPlaceholder')"
                        />
                    </label>
                    <label class="config-item">
                        <span>Base URL</span>
                        <input
                            v-model="defaultAIDraft.base_url"
                            class="key-input"
                            placeholder="https://token-plan-cn.xiaomimimo.com/v1"
                        />
                    </label>
                    <label class="config-item">
                        <span>Model</span>
                        <input
                            v-model="defaultAIDraft.model"
                            class="key-input"
                            placeholder="mimo-v2.5-pro"
                        />
                    </label>
                </div>

                <div class="button-group">
                    <button class="btn btn-save" @click="saveDefaultAIConfig">{{ t('apiKeys.saveConfig') }}</button>
                    <button class="btn btn-cancel" @click="cancelEditDefaultAI">{{ t('apiKeys.cancel') }}</button>
                </div>
            </div>

            <div v-else class="config-view">
                <div class="config-grid">
                    <div class="config-item config-item-full">
                        <span>API Key</span>
                        <strong>{{
                            defaultAIConfig.api_key ? t('apiKeys.masked') : t('apiKeys.notConfigured')
                        }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Base URL</span>
                        <strong>{{ defaultAIConfig.base_url || t('apiKeys.notConfigured') }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Model</span>
                        <strong>{{ defaultAIConfig.model || t('apiKeys.notConfigured') }}</strong>
                    </div>
                </div>

                <p class="config-note">
                    {{
                        defaultAIConfig.is_configured
                            ? t('apiKeys.defaultAIReady')
                            : t('apiKeys.defaultAIMissing')
                    }}
                </p>
            </div>
        </div>

        <div class="warning-box">
            <span class="warning-icon"><AlertTriangle :size="16" /></span>
            <div class="warning-content">
                <p><strong>{{ t('apiKeys.securityTitle') }}</strong></p>
                <ul>
                    <li>{{ t('apiKeys.security1') }}</li>
                    <li>{{ t('apiKeys.security2') }}</li>
                    <li>{{ t('apiKeys.security3') }}</li>
                    <li>{{ t('apiKeys.security4') }}</li>
                    <li>{{ t('apiKeys.security5') }}</li>
                    <li>{{ t('apiKeys.security6') }}</li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { AlertTriangle } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useAgentConfig } from '@common/chat/composables/useAgentConfig';
import {
    apiAdminGetApiKeysStatus,
    apiAdminAppendApiKeyBackup,
    apiAdminDeleteApiKeyBackup,
    apiAdminDeleteApiKey,
    apiAdminSetApiKey,
    apiAdminGetDefaultAIConfig,
    apiAdminUpdateDefaultAIConfig,
} from '@/api/backend';
import { clearRuntimeMapTokensCache } from '@common/services/runtimeMapTokens';

const message = useMessage();
const { t, language } = useLocale();
const frontendRuntimeKeyNames = new Set(['tianditu_tk', 'cesium_ion_token', 'amap_key']);

const managedApiKeys = computed(() => [
    { key: 'amap_key', label: t('apiKeys.amapKey') },
    { key: 'agent_api_key', label: t('apiKeys.agentKey') },
    { key: 'tianditu_tk', label: t('apiKeys.tiandituKey') },
    { key: 'cesium_ion_token', label: t('apiKeys.cesiumKey') },
]);

const loading = ref(false);
const keysStatus = ref({
    amap_key: { is_set: false, updated_at: null },
    agent_api_key: { is_set: false, updated_at: null },
    tianditu_tk: { is_set: false, updated_at: null },
    cesium_ion_token: { is_set: false, updated_at: null },
});

const editingKey = ref(null);
const editValues = ref({
    amap_key: '',
    agent_api_key: '',
    tianditu_tk: '',
    cesium_ion_token: '',
});
const editingBackupKey = ref(null);
const backupEditValues = ref({
    amap_key: '',
    agent_api_key: '',
    tianditu_tk: '',
    cesium_ion_token: '',
});

const {
    agentConfig,
    agentConfigDraft,
    loading: agentConfigLoading,
    editingConfig: editingAgentConfig,
    save: saveAgentConfig,
    load: loadAgentConfig,
    hydrate: hydrateAgentConfigDraft,
    startEdit: startEditAgentConfig,
    cancelEdit: cancelEditAgentConfig,
} = useAgentConfig();

function flattenProviderToTop() {
    const provider = agentConfig.value?.provider || {};
    if (provider.base_url || provider.model || Object.keys(provider).length > 0) {
        agentConfig.value = { ...agentConfig.value, ...provider };
    }
}

const loadAgentConfigWrapped = async () => {
    await loadAgentConfig();
    flattenProviderToTop();
    hydrateAgentConfigDraft();
};

const defaultAILoading = ref(false);
const editingDefaultAI = ref(false);
const defaultAIConfig = ref({
    api_key: '',
    base_url: '',
    model: '',
    is_configured: false,
});
const defaultAIDraft = ref({
    api_key: '',
    base_url: '',
    model: '',
});

function formatTime(isoString) {
    if (!isoString) return t('apiKeys.neverSet');
    try {
        const date = new Date(isoString);
        return date.toLocaleString(language.value || undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch (_e) {
        return isoString;
    }
}

function normalizeKeyStatus(raw = {}) {
    const backups = Array.isArray(raw?.backups) ? raw.backups : [];
    return {
        is_set: Boolean(raw?.is_set),
        updated_at: raw?.updated_at || null,
        backup_count: Number(raw?.backup_count ?? backups.length ?? 0),
        backups,
    };
}

function getBackups(keyName) {
    return Array.isArray(keysStatus.value[keyName]?.backups)
        ? keysStatus.value[keyName].backups
        : [];
}

function getBackupCount(keyName) {
    return Number(keysStatus.value[keyName]?.backup_count ?? getBackups(keyName).length ?? 0);
}

async function loadKeysStatus() {
    loading.value = true;
    try {
        const result = await apiAdminGetApiKeysStatus();
        const data = result?.data || {};
        keysStatus.value = {
            amap_key: normalizeKeyStatus(data.amap_key),
            agent_api_key: normalizeKeyStatus(data.agent_api_key),
            tianditu_tk: normalizeKeyStatus(data.tianditu_tk),
            cesium_ion_token: normalizeKeyStatus(data.cesium_ion_token),
        };
    } catch (error) {
        message.error(t('apiKeys.loadStatusFailed', { error: error.message }));
    } finally {
        loading.value = false;
    }
}

function startEdit(keyName) {
    editingKey.value = keyName;
    editValues.value[keyName] = '';
}

function cancelEdit() {
    editingKey.value = null;
    editValues.value = {
        amap_key: '',
        agent_api_key: '',
        tianditu_tk: '',
        cesium_ion_token: '',
    };
}

async function loadAgentConfigWrapper() {
    await loadAgentConfigWrapped();
}

async function saveAgentConfigWrapper() {
    const ok = await saveAgentConfig();
    if (ok) {
        flattenProviderToTop();
        cancelEditAgentConfig();
        hydrateAgentConfigDraft();
    }
}

async function saveKey(keyName) {
    const keyValue = editValues.value[keyName]?.trim();

    if (!keyValue) {
        message.error(t('apiKeys.keyValueRequired'));
        return;
    }

    try {
        await apiAdminSetApiKey(keyName, keyValue);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(t('apiKeys.keySaved', { name: keyName }));
        cancelEdit();
        await loadKeysStatus();
    } catch (error) {
        message.error(t('apiKeys.keySaveFailed', { error: error.message }));
    }
}

function startBackupEdit(keyName) {
    editingBackupKey.value = keyName;
    backupEditValues.value[keyName] = '';
}

function cancelBackupEdit() {
    editingBackupKey.value = null;
    backupEditValues.value = {
        amap_key: '',
        agent_api_key: '',
        tianditu_tk: '',
        cesium_ion_token: '',
    };
}

async function saveBackupKey(keyName) {
    const keyValue = String(backupEditValues.value[keyName] || '').trim();

    if (!keyValue) {
        message.error(t('apiKeys.backupValueRequired'));
        return;
    }

    try {
        await apiAdminAppendApiKeyBackup(keyName, keyValue);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(t('apiKeys.backupAdded', { name: keyName }));
        cancelBackupEdit();
        await loadKeysStatus();
    } catch (error) {
        message.error(t('apiKeys.backupAddFailed', { error: error.message }));
    }
}

async function deleteBackupKey(keyName, backupId) {
    if (!confirm(t('apiKeys.backupDeleteConfirm', { name: keyName }))) {
        return;
    }

    try {
        await apiAdminDeleteApiKeyBackup(keyName, backupId);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(t('apiKeys.backupDeleted', { name: keyName }));
        await loadKeysStatus();
    } catch (error) {
        message.error(t('apiKeys.backupDeleteFailed', { error: error.message }));
    }
}

async function deleteKey(keyName) {
    if (!confirm(t('apiKeys.keyDeleteConfirm', { name: keyName }))) {
        return;
    }

    try {
        await apiAdminDeleteApiKey(keyName);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(t('apiKeys.keyDeleted', { name: keyName }));
        await loadKeysStatus();
    } catch (error) {
        message.error(t('apiKeys.keyDeleteFailed', { error: error.message }));
    }
}

async function loadDefaultAIConfig() {
    defaultAILoading.value = true;
    try {
        const result = await apiAdminGetDefaultAIConfig();
        const data = result?.data || {};
        defaultAIConfig.value = {
            api_key: String(data.api_key || ''),
            base_url: String(data.base_url || ''),
            model: String(data.model || ''),
            is_configured: !!data.is_configured,
        };
        defaultAIDraft.value = {
            api_key: String(data.api_key || ''),
            base_url: String(data.base_url || ''),
            model: String(data.model || ''),
        };
    } catch (error) {
        message.error(t('apiKeys.loadDefaultAIFailed', { error: error.message }));
    } finally {
        defaultAILoading.value = false;
    }
}

function startEditDefaultAI() {
    editingDefaultAI.value = true;
    defaultAIDraft.value = {
        api_key: String(defaultAIConfig.value.api_key || ''),
        base_url: String(defaultAIConfig.value.base_url || ''),
        model: String(defaultAIConfig.value.model || ''),
    };
}

function cancelEditDefaultAI() {
    editingDefaultAI.value = false;
    defaultAIDraft.value = {
        api_key: String(defaultAIConfig.value.api_key || ''),
        base_url: String(defaultAIConfig.value.base_url || ''),
        model: String(defaultAIConfig.value.model || ''),
    };
}

async function saveDefaultAIConfig() {
    const apiKey = String(defaultAIDraft.value.api_key || '').trim();
    const baseUrl = String(defaultAIDraft.value.base_url || '').trim();
    const model = String(defaultAIDraft.value.model || '').trim();

    if (!apiKey || !baseUrl || !model) {
        message.error(t('apiKeys.defaultAIFieldsRequired'));
        return;
    }

    try {
        const result = await apiAdminUpdateDefaultAIConfig({
            api_key: apiKey,
            base_url: baseUrl,
            model: model,
        });
        const data = result?.data || {};
        defaultAIConfig.value = {
            api_key: apiKey,
            base_url: String(data.base_url || baseUrl),
            model: String(data.model || model),
            is_configured: !!data.is_configured,
        };
        editingDefaultAI.value = false;
        message.success(t('apiKeys.defaultAISaved'));
    } catch (error) {
        message.error(t('apiKeys.defaultAISaveFailed', { error: error.message }));
    }
}

onMounted(async () => {
    await loadKeysStatus();
    await loadAgentConfigWrapped();
    await loadDefaultAIConfig();
});
</script>

<style scoped>
.api-keys-container {
    padding: 20px;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    box-shadow: 0 8px 32px rgba(33, 74, 49, 0.05);
    border-radius: 12px;
    box-sizing: border-box;
    min-width: 0;
    container-type: inline-size;
}

.keys-header {
    margin-bottom: 30px;
    text-align: center;
}

.keys-header h2 {
    font-size: 28px;
    margin: 0 0 8px 0;
    color: #214a31;
}

.subtitle {
    color: #4b8b60;
    margin: 0;
    font-size: 14px;
}

/* 三层配置（L2/L3）说明文案 */
.subtitle.layer-note {
    margin-top: 6px;
    font-size: 12px;
    color: #7a9c86;
    line-height: 1.5;
}

.loading-state {
    text-align: center;
    padding: 40px;
    color: #4b8b60;
}

.spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(var(--brand-primary-rgb), 0.1);
    border-top: 2px solid var(--brand-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 8px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.keys-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.key-card {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    box-shadow: 0 4px 12px rgba(33, 74, 49, 0.05);
    display: flex;
    flex-direction: column;
    min-width: 0;
    transition:
        transform 0.25s ease,
        box-shadow 0.25s ease;
}

.key-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(33, 74, 49, 0.12);
}

.key-header {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    color: white;
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
}

.key-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    min-width: 0;
    overflow-wrap: anywhere;
}

.status-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
}

.status-badge::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    flex: 0 0 auto;
}

.status-badge.set {
    background: rgba(255, 255, 255, 0.3);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.5);
}

.status-badge.unset {
    background: rgba(244, 67, 54, 0.85);
    color: white;
}

.key-body {
    padding: 16px;
    flex: 1;
    display: flex;
    flex-direction: column;
}

.key-display {
    flex: 1;
}

.key-value {
    background: rgba(var(--brand-primary-rgb), 0.05);
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    color: #214a31;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.1);
    margin: 0 0 12px 0;
    word-break: break-all;
}

.key-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
}

.key-hint {
    font-size: 12px;
    color: #6c9e78;
    margin: 0;
}

.key-hint a {
    color: var(--brand-primary);
    text-decoration: none;
    font-weight: bold;
}

.key-hint a:hover {
    text-decoration: underline;
    color: var(--brand-primary-dark);
}

.edit-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.key-input {
    width: 100%;
    min-width: 0;
    padding: 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    resize: vertical;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.9);
    color: #214a31;
}

textarea.key-input {
    min-height: 76px;
}

.key-input:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.2);
}

.button-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    min-width: 0;
    min-height: 36px;
    white-space: normal;
}

.button-group .btn,
.key-actions .btn {
    flex: 1 1 120px;
}

.backup-card > .btn {
    align-self: flex-start;
    flex: 0 0 auto;
}

.btn-edit {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary);
    border: 1px solid var(--brand-primary);
}

.btn-edit:hover {
    background: var(--brand-primary);
    color: white;
}

.btn-delete {
    background: rgba(244, 67, 54, 0.1);
    color: #f44336;
    border: 1px solid #f44336;
}

.btn-delete:hover {
    background: #f44336;
    color: white;
}

.btn-save {
    background: var(--brand-primary);
    color: white;
}

.btn-save:hover {
    background: var(--brand-primary-dark);
}

.btn-cancel {
    background: var(--border-light);
    color: var(--text-primary);
}

.btn-cancel:hover {
    background: #bdbdbd;
}

.key-footer {
    background: rgba(var(--brand-primary-rgb), 0.02);
    padding: 8px 16px;
    border-top: 1px solid rgba(var(--brand-primary-rgb), 0.1);
    font-size: 11px;
    color: #6c9e78;
}

.agent-config-section {
    margin-top: 16px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 8px;
    padding: 16px;
    min-width: 0;
    box-sizing: border-box;
}

.section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    min-width: 0;
}

.section-header-row h3 {
    flex: 1 1 180px;
    margin: 0;
    color: #214a31;
    min-width: 0;
    overflow-wrap: anywhere;
}

.section-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
}

.section-actions .btn {
    flex: 0 1 auto;
    min-width: 86px;
}

.config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
    gap: 10px;
    min-width: 0;
}

.config-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #2e5d3e;
    font-size: 13px;
    min-width: 0;
}

.config-item span {
    min-width: 0;
    overflow-wrap: anywhere;
}

.config-item strong {
    color: #214a31;
    font-weight: 600;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
}

.config-item-full {
    grid-column: 1 / -1;
}

.edit-form,
.config-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}

.config-note {
    margin: 0;
    font-size: 12px;
    color: #4b8b60;
    line-height: 1.55;
    overflow-wrap: anywhere;
}

.section-header-row .config-note {
    flex: 1 1 100%;
}

.backup-token-section {
    margin-top: 18px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 8px;
    padding: 16px;
    min-width: 0;
    box-sizing: border-box;
}

.backup-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 12px;
    min-width: 0;
}

.backup-card {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    border-radius: 10px;
    padding: 12px;
    background: rgba(var(--brand-primary-rgb), 0.03);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
}

.backup-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(33, 74, 49, 0.08);
}

.backup-card-head,
.backup-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    min-width: 0;
}

.backup-card-head strong {
    color: #214a31;
    font-size: 14px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.backup-card-head span,
.backup-empty,
.backup-row span {
    color: #5f8f6f;
    font-size: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.backup-row span {
    flex: 1 1 150px;
}

.backup-list,
.backup-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.backup-row {
    min-height: 32px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.75);
}

.backup-empty {
    margin: 0;
}

.btn-compact {
    flex: 0 1 auto;
    padding: 5px 10px;
}

.warning-box {
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    border-radius: 6px;
    padding: 16px;
    display: flex;
    gap: 12px;
    margin-top: 20px;
}

.warning-icon {
    font-size: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    color: var(--warning);
}

.warning-content {
    flex: 1;
}

.warning-content p {
    margin: 0 0 8px 0;
    color: #e65100;
    font-size: 13px;
    font-weight: bold;
}

.warning-content ul {
    margin: 8px 0 0 20px;
    padding: 0;
    color: #e65100;
    font-size: 13px;
}

.warning-content li {
    margin: 4px 0;
}

@media (max-width: 900px) {
    .config-grid,
    .backup-grid {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 640px) {
    .api-keys-container {
        padding: 12px;
        border-radius: 10px;
    }

    .keys-header {
        margin-bottom: 18px;
    }

    .keys-header h2 {
        font-size: 20px;
        overflow-wrap: anywhere;
    }

    .keys-grid,
    .config-grid,
    .backup-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .key-header,
    .section-header-row,
    .backup-card-head,
    .backup-row {
        align-items: stretch;
        flex-direction: column;
    }

    .key-header {
        padding: 14px;
    }

    .key-header h3 {
        font-size: 15px;
    }

    .status-badge {
        align-self: flex-start;
    }

    .key-body,
    .agent-config-section,
    .backup-token-section,
    .warning-box {
        padding: 12px;
    }

    .button-group,
    .key-actions,
    .section-actions {
        width: 100%;
    }

    .section-actions {
        justify-content: stretch;
        margin-left: 0;
    }

    .btn,
    .btn-compact,
    .section-actions .btn {
        min-height: 38px;
        width: 100%;
    }

    .button-group .btn,
    .key-actions .btn,
    .section-actions .btn,
    .backup-row .btn,
    .backup-card > .btn {
        flex: 1 1 auto;
    }

    .backup-card > .btn {
        align-self: stretch;
    }
}

@media (max-width: 640px), (max-width: 900px) and (orientation: portrait) {
    .keys-grid {
        grid-template-columns: 1fr;
        gap: 12px;
        margin-bottom: 18px;
    }
}

@container (max-width: 640px) {
    .keys-header {
        margin-bottom: 18px;
    }

    .keys-header h2 {
        font-size: 20px;
        overflow-wrap: anywhere;
    }

    .keys-grid,
    .config-grid,
    .backup-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .key-header,
    .section-header-row,
    .backup-card-head,
    .backup-row {
        align-items: stretch;
        flex-direction: column;
    }

    .key-header {
        padding: 14px;
    }

    .key-header h3 {
        font-size: 15px;
    }

    .status-badge {
        align-self: flex-start;
    }

    .key-body,
    .agent-config-section,
    .backup-token-section,
    .warning-box {
        padding: 12px;
    }

    .button-group,
    .key-actions,
    .section-actions {
        width: 100%;
    }

    .section-actions {
        justify-content: stretch;
        margin-left: 0;
    }

    .btn,
    .btn-compact,
    .section-actions .btn {
        min-height: 38px;
        width: 100%;
    }

    .button-group .btn,
    .key-actions .btn,
    .section-actions .btn,
    .backup-row .btn,
    .backup-card > .btn {
        flex: 1 1 auto;
    }

    .backup-card > .btn {
        align-self: stretch;
    }
}
</style>