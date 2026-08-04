<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useAgentConfig } from '@common/chat/composables/useAgentConfig';
import {
    apiAdminDeleteRows,
    apiAdminGetDefaultBasemapIndex,
    apiAdminGetTableRows,
    apiAdminInsertRow,
    apiAdminListTables,
    apiAdminOverview,
    apiAdminPublishAnnouncement,
    apiAdminUpdateContact,
    apiAdminUpdateDefaultBasemapIndex,
    apiAdminUpdateRows,
} from '@/api/backend';
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP_LAYER_INDEX } from '@common/basemap/basemapOptions';

const message = useMessage();
const { t } = useLocale();

const overview = ref({
    table_count: 0,
    total_users: 0,
    total_sessions: 0,
    total_messages: 0,
    active_announcement: 0,
    l3_env_status: {},
});

// L3（HF Secrets）环境密钥状态：仅展示是否已配置，不回显明文
const L3_STATUS_LABELS = [
    { key: 'super_user', labelKey: 'admin.envKeys.super_user' },
    { key: 'oauth_state_secret', label: 'OAUTH_STATE_SECRET' },
    { key: 'google_oauth', label: 'Google OAuth' },
    { key: 'github_oauth', label: 'GitHub OAuth' },
    { key: 'smtp', labelKey: 'admin.envKeys.smtp' },
    { key: 'supabase', label: 'Supabase URL/Key' },
];

function l3StatusLabel(item) {
    return item.labelKey ? t(item.labelKey) : item.label;
}

const tables = ref([]);
const selectedTable = ref('');
const tableRows = ref([]);

const tableLimit = ref(30);
const tableOffset = ref(0);
const insertJsonText = ref('{\n  \n}');

const adminContactText = ref('');
const announcementText = ref('');

const loadingOverview = ref(false);
const loadingTables = ref(false);
const loadingRows = ref(false);
const submittingConfig = ref(false);
const submittingTable = ref(false);

const {
    agentConfig: _agentConfig,
    agentConfigDraft,
    loading: loadingAgentConfig,
    submitting: submittingAgentConfig,
    load: loadAgentConfig,
    save: saveAgentConfig,
    resetQuota: resetChatQuota,
} = useAgentConfig();

const defaultBasemapIndex = ref(DEFAULT_BASEMAP_LAYER_INDEX);
const loadingBasemap = ref(false);
const submittingBasemap = ref(false);

const basemapOptions = BASEMAP_OPTIONS.map((opt, i) => ({ index: i, label: opt.label }));

async function loadDefaultBasemapIndex() {
    loadingBasemap.value = true;
    try {
        const result = await apiAdminGetDefaultBasemapIndex();
        const idx = result?.data?.index;
        defaultBasemapIndex.value = idx != null ? idx : DEFAULT_BASEMAP_LAYER_INDEX;
    } catch {
        defaultBasemapIndex.value = DEFAULT_BASEMAP_LAYER_INDEX;
    } finally {
        loadingBasemap.value = false;
    }
}

async function saveDefaultBasemapIndex() {
    submittingBasemap.value = true;
    try {
        await apiAdminUpdateDefaultBasemapIndex(defaultBasemapIndex.value);
        message.success(t('admin.basemapSaveSuccess'));
    } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || t('admin.unknownError');
        message.error(t('admin.basemapSaveFailed', { error: detail }));
    } finally {
        submittingBasemap.value = false;
    }
}

function resetDefaultBasemapIndex() {
    defaultBasemapIndex.value = DEFAULT_BASEMAP_LAYER_INDEX;
}

const selectedTableMeta = computed(() => {
    return tables.value.find((item) => item.name === selectedTable.value) || null;
});

const rowCountText = computed(() => t('admin.rowCountText', { count: tableRows.value.length }));

function parseJsonObject(text, hint) {
    const fallbackHint = hint || t('admin.jsonFormatError');
    try {
        const parsed = JSON.parse(String(text || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(t('admin.jsonMustBeObject'));
        }
        return parsed;
    } catch (error) {
        const detail = String(error?.message || '').trim();
        throw new Error(`${fallbackHint}${detail ? `：${detail}` : ''}`);
    }
}

function resolveWhere(row) {
    if (row && row.__rowid != null) {
        return { __rowid: row.__rowid };
    }
    if (row && row.id != null) {
        return { id: row.id };
    }
    if (row && row.token != null) {
        return { token: row.token };
    }
    if (row && row.username != null && selectedTable.value === 'user_metrics') {
        return { username: row.username };
    }
    return null;
}

function toEditablePayload(row) {
    const payload = { ...(row || {}) };
    delete payload.__rowid;
    return payload;
}

async function loadOverview() {
    loadingOverview.value = true;
    try {
        const result = await apiAdminOverview();
        overview.value = {
            ...overview.value,
            ...(result?.data || {}),
        };
    } catch (error) {
        message.error(String(error?.message || t('admin.overviewLoadFailed')));
    } finally {
        loadingOverview.value = false;
    }
}

async function loadTables() {
    loadingTables.value = true;
    try {
        const result = await apiAdminListTables();
        const list = Array.isArray(result?.data) ? result.data : [];
        tables.value = list;

        if (!selectedTable.value && list.length > 0) {
            selectedTable.value = String(list[0].name || '');
        }

        if (selectedTable.value && !list.some((item) => item.name === selectedTable.value)) {
            selectedTable.value = String(list[0]?.name || '');
        }
    } catch (error) {
        message.error(String(error?.message || t('admin.tableListLoadFailed')));
    } finally {
        loadingTables.value = false;
    }
}

async function loadRows() {
    const tableName = String(selectedTable.value || '').trim();
    if (!tableName) {
        tableRows.value = [];
        return;
    }

    loadingRows.value = true;
    try {
        const result = await apiAdminGetTableRows(tableName, tableLimit.value, tableOffset.value);
        tableRows.value = Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
        tableRows.value = [];
        message.error(String(error?.message || t('admin.tableDataLoadFailed')));
    } finally {
        loadingRows.value = false;
    }
}

async function handleInsertRow() {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    if (!tableName) {
        message.warning(t('admin.selectTableFirst'));
        return;
    }

    let rowPayload = null;
    try {
        rowPayload = parseJsonObject(insertJsonText.value, t('admin.addParseFailed'));
    } catch (error) {
        message.error(String(error?.message || t('admin.addParseFailed')));
        return;
    }

    submittingTable.value = true;
    try {
        await apiAdminInsertRow(tableName, rowPayload);
        message.success(t('admin.addSuccess'));
        await loadRows();
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || t('admin.addFailed')));
    } finally {
        submittingTable.value = false;
    }
}

async function handleEditRow(row) {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    const where = resolveWhere(row);

    if (!tableName || !where) {
        message.warning(t('admin.noLocateKey'));
        return;
    }

    const editable = toEditablePayload(row);
    const defaultText = JSON.stringify(editable, null, 2);
    const nextText = window.prompt(t('admin.editJsonPrompt'), defaultText);

    if (nextText === null) return;

    let nextValues = null;
    try {
        nextValues = parseJsonObject(nextText, t('admin.editParseFailed'));
    } catch (error) {
        message.error(String(error?.message || t('admin.editParseFailed')));
        return;
    }

    submittingTable.value = true;
    try {
        await apiAdminUpdateRows(tableName, where, nextValues);
        message.success(t('admin.updateSuccess'));
        await loadRows();
    } catch (error) {
        message.error(String(error?.message || t('admin.updateFailed')));
    } finally {
        submittingTable.value = false;
    }
}

async function handleDeleteRow(row) {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    const where = resolveWhere(row);

    if (!tableName || !where) {
        message.warning(t('admin.noLocateKeyDelete'));
        return;
    }

    const ok = window.confirm(t('admin.deleteConfirm'));
    if (!ok) return;

    submittingTable.value = true;
    try {
        await apiAdminDeleteRows(tableName, where);
        message.success(t('admin.deleteSuccess'));
        await loadRows();
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || t('admin.deleteFailed')));
    } finally {
        submittingTable.value = false;
    }
}

async function handlePublishAnnouncement() {
    if (submittingConfig.value) return;

    const content = String(announcementText.value || '').trim();
    if (!content) {
        message.warning(t('admin.announcementEmpty'));
        return;
    }

    submittingConfig.value = true;
    try {
        await apiAdminPublishAnnouncement(content);
        message.success(t('admin.announcementSuccess'));
        announcementText.value = '';
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || t('admin.announcementFailed')));
    } finally {
        submittingConfig.value = false;
    }
}

async function handleSaveContact() {
    if (submittingConfig.value) return;

    const contact = String(adminContactText.value || '').trim();
    if (!contact) {
        message.warning(t('admin.contactEmpty'));
        return;
    }

    submittingConfig.value = true;
    try {
        await apiAdminUpdateContact(contact);
        message.success(t('admin.contactUpdateSuccess'));
    } catch (error) {
        message.error(String(error?.message || t('admin.contactUpdateFailed')));
    } finally {
        submittingConfig.value = false;
    }
}

watch(selectedTable, async () => {
    tableOffset.value = 0;
    await loadRows();
});

onMounted(async () => {
    await loadOverview();
    await loadTables();
    await loadRows();
    await loadAgentConfig();
    await loadDefaultBasemapIndex();
});
</script>

<template>
    <div class="admin-console">
        <div class="admin-card">
            <div class="admin-title-row">
                <h4 class="admin-title">{{ t('admin.title') }}</h4>
                <button
                    class="admin-mini-btn"
                    type="button"
                    :disabled="loadingOverview"
                    @click="loadOverview"
                >
                    {{ t('admin.refreshOverview') }}
                </button>
            </div>

            <div class="overview-grid">
                <div class="overview-item">
                    <span class="overview-label">{{ t('admin.dataTable') }}</span>
                    <strong class="overview-value">{{ overview.table_count }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">{{ t('admin.users') }}</span>
                    <strong class="overview-value">{{ overview.total_users }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">{{ t('admin.onlineSessions') }}</span>
                    <strong class="overview-value">{{ overview.total_sessions }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">{{ t('admin.messages') }}</span>
                    <strong class="overview-value">{{ overview.total_messages }}</strong>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h5 class="admin-subtitle">{{ t('admin.envStatusTitle') }}</h5>
            <p class="config-description">
                {{ t('admin.envStatusDesc') }}
                {{ t('admin.envStatusNote') }}
                <code>.env.example</code>
                {{ t('admin.envStatusDocsHint') }}
            </p>
            <div class="env-status-grid">
                <div
                    v-for="item in L3_STATUS_LABELS"
                    :key="item.key"
                    class="env-status-item"
                >
                    <span class="env-status-label">{{ l3StatusLabel(item) }}</span>
                    <span :class="['env-status-badge', overview.l3_env_status?.[item.key] ? 'set' : 'unset']">
                        {{
                            overview.l3_env_status?.[item.key]
                                ? t('admin.configured')
                                : t('admin.notConfigured')
                        }}
                    </span>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h5 class="admin-subtitle">{{ t('admin.systemConfig') }}</h5>

            <label class="admin-field-label">{{ t('admin.adminContact') }}</label>
            <input
                v-model="adminContactText"
                class="admin-input"
                type="text"
                :placeholder="t('admin.adminContactPlaceholder')"
            />

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingConfig"
                @click="handleSaveContact"
            >
                {{ t('admin.saveContact') }}
            </button>

            <label class="admin-field-label">{{ t('admin.topAnnouncement') }}</label>
            <textarea
                v-model="announcementText"
                class="admin-textarea"
                :placeholder="t('admin.announcementPlaceholder')"
            ></textarea>

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingConfig"
                @click="handlePublishAnnouncement"
            >
                {{ t('admin.publishAnnouncement') }}
            </button>
        </div>

        <div class="admin-card">
            <h5 class="admin-subtitle">{{ t('admin.mapDefaultConfig') }}</h5>
            <p class="config-description">{{ t('admin.mapDefaultDesc') }}</p>

            <div v-if="loadingBasemap" class="loading-state">
                <span class="spinner"></span> {{ t('admin.loadingBasemap') }}
            </div>

            <div v-else class="agent-config-form">
                <div class="config-row">
                    <div class="config-field config-field-full">
                        <label class="config-label">{{ t('admin.defaultBasemapPreset') }}</label>
                        <select v-model.number="defaultBasemapIndex" class="config-input">
                            <option
                                v-for="opt in basemapOptions"
                                :key="opt.index"
                                :value="opt.index"
                            >
                                {{ t('admin.basemapOptionLabel', { label: opt.label, index: opt.index }) }}
                            </option>
                        </select>
                    </div>
                </div>
                <div class="button-group">
                    <button
                        class="btn-save"
                        type="button"
                        :disabled="submittingBasemap"
                        @click="saveDefaultBasemapIndex"
                    >
                        {{ submittingBasemap ? t('common.saving') : t('admin.save') }}
                    </button>
                    <button
                        class="btn-edit"
                        type="button"
                        :disabled="submittingBasemap"
                        @click="resetDefaultBasemapIndex"
                    >
                        {{ t('admin.resetDefault') }}
                    </button>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h5 class="admin-subtitle">{{ t('admin.llmConfigTitle') }}</h5>
            <p class="config-description">{{ t('admin.llmConfigDesc') }}</p>

            <div v-if="loadingAgentConfig" class="loading-state">
                <span class="spinner"></span> {{ t('admin.loadingAgentConfig') }}
            </div>

            <div v-else class="agent-config-form">
                <div class="config-row">
                    <label class="config-field">
                        <span>Base URL</span>
                        <input
                            v-model="agentConfigDraft.base_url"
                            class="config-input"
                            type="text"
                            placeholder="https://api.example.com/v1"
                        />
                    </label>
                    <label class="config-field">
                        <span>Model</span>
                        <input
                            v-model="agentConfigDraft.model"
                            class="config-input"
                            type="text"
                            :placeholder="t('admin.modelRandomPlaceholder')"
                        />
                    </label>
                </div>

                <label class="config-field config-field-full">
                    <span>{{ t('admin.availableModels') }}</span>
                    <textarea
                        v-model="agentConfigDraft.available_models_text"
                        class="config-textarea"
                        rows="3"
                        placeholder="qwen-plus\ndeepseek-chat\ngpt-4o-mini"
                    ></textarea>
                </label>

                <div class="config-row">
                    <label class="config-field">
                        <span>Timeout (seconds)</span>
                        <input
                            v-model.number="agentConfigDraft.timeout_seconds"
                            class="config-input"
                            type="number"
                            min="5"
                            max="180"
                        />
                    </label>
                    <label class="config-field">
                        <span>Max Tokens</span>
                        <input
                            v-model.number="agentConfigDraft.max_tokens"
                            class="config-input"
                            type="number"
                            min="1"
                            max="32768"
                        />
                    </label>
                </div>

                <div class="config-row">
                    <label class="config-field">
                        <span>Temperature</span>
                        <input
                            v-model.number="agentConfigDraft.temperature"
                            class="config-input"
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                        />
                    </label>
                    <label class="config-field">
                        <span>Top P</span>
                        <input
                            v-model.number="agentConfigDraft.top_p"
                            class="config-input"
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                        />
                    </label>
                </div>

                <label class="config-field config-field-full">
                    <span>Extra Body (JSON)</span>
                    <textarea
                        v-model="agentConfigDraft.extra_body"
                        class="config-textarea"
                        rows="3"
                        placeholder="{}"
                    ></textarea>
                </label>

                <label class="config-field config-field-full">
                    <span>System Prompt</span>
                    <textarea
                        v-model="agentConfigDraft.system_prompt"
                        class="config-textarea"
                        rows="4"
                        :placeholder="t('admin.systemPromptPlaceholder')"
                    ></textarea>
                </label>

                <div class="config-row">
                    <label class="config-field">
                        <span>Stream</span>
                        <input
                            v-model="agentConfigDraft.stream"
                            class="config-checkbox"
                            type="checkbox"
                        />
                    </label>
                </div>

                <div class="config-row">
                    <label class="config-field">
                        <span>{{ t('admin.guestQuota') }}</span>
                        <input
                            v-model.number="agentConfigDraft.guest_daily_quota"
                            class="config-input"
                            type="number"
                            min="1"
                            max="100000"
                        />
                    </label>
                    <label class="config-field">
                        <span>{{ t('admin.registeredQuota') }}</span>
                        <input
                            v-model.number="agentConfigDraft.registered_daily_quota"
                            class="config-input"
                            type="number"
                            min="1"
                            max="100000"
                        />
                    </label>
                </div>

                <div class="button-group">
                    <button
                        class="btn btn-save"
                        type="button"
                        :disabled="submittingAgentConfig"
                        @click="saveAgentConfig"
                    >
                        {{
                            submittingAgentConfig
                                ? t('common.saving')
                                : t('admin.saveLLMParams')
                        }}
                    </button>
                    <button
                        class="btn btn-edit"
                        type="button"
                        :disabled="submittingAgentConfig"
                        @click="resetChatQuota"
                    >
                        {{ t('admin.resetQuota') }}
                    </button>
                    <button
                        class="btn btn-cancel"
                        type="button"
                        :disabled="submittingAgentConfig"
                        @click="loadAgentConfig"
                    >
                        {{ t('admin.reload') }}
                    </button>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <div class="admin-title-row">
                <h5 class="admin-subtitle">{{ t('admin.dbManagement') }}</h5>
                <button
                    class="admin-mini-btn"
                    type="button"
                    :disabled="loadingTables"
                    @click="loadTables"
                >
                    {{ t('admin.refreshTables') }}
                </button>
            </div>

            <div class="admin-select-row">
                <select
                    v-model="selectedTable"
                    class="admin-select"
                >
                    <option
                        value=""
                        disabled
                    >
                        {{ t('admin.selectTable') }}
                    </option>
                    <option
                        v-for="item in tables"
                        :key="item.name"
                        :value="item.name"
                    >
                        {{ item.name }}
                    </option>
                </select>
                <button
                    class="admin-mini-btn"
                    type="button"
                    :disabled="loadingRows"
                    @click="loadRows"
                >
                    {{ t('admin.refreshRows') }}
                </button>
            </div>

            <div class="admin-meta-row">
                <span>{{ rowCountText }}</span>
                <span v-if="selectedTableMeta">
                    {{ t('admin.columnCount', { count: selectedTableMeta.columns?.length || 0 }) }}
                </span>
            </div>

            <div
                v-if="tableRows.length > 0"
                class="rows-wrap"
            >
                <div
                    v-for="row in tableRows"
                    :key="String(row.__rowid || row.id || row.token || Math.random())"
                    class="row-item"
                >
                    <pre class="row-json">{{ JSON.stringify(row, null, 2) }}</pre>
                    <div class="row-actions">
                        <button
                            class="admin-mini-btn"
                            type="button"
                            :disabled="submittingTable"
                            @click="handleEditRow(row)"
                        >
                            {{ t('admin.edit') }}
                        </button>
                        <button
                            class="admin-mini-btn danger"
                            type="button"
                            :disabled="submittingTable"
                            @click="handleDeleteRow(row)"
                        >
                            {{ t('admin.delete') }}
                        </button>
                    </div>
                </div>
            </div>
            <div
                v-else
                class="rows-empty"
            >
                {{ t('admin.rowsEmpty') }}
            </div>

            <label class="admin-field-label">{{ t('admin.addRowTitle') }}</label>
            <textarea
                v-model="insertJsonText"
                class="admin-textarea"
                :placeholder="t('admin.insertJsonExample')"
            ></textarea>

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingTable"
                @click="handleInsertRow"
            >
                {{ t('admin.insertToTable') }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.admin-console {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.admin-card {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.55);
    padding: 12px;
    box-shadow: 0 4px 12px rgba(49, 111, 69, 0.05);
}

.admin-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.admin-title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
}

.admin-subtitle {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
}

.overview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.overview-item {
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--bg-primary);
}

.overview-label {
    display: block;
    font-size: 11px;
    color: var(--text-muted);
}

.overview-value {
    font-size: 16px;
    color: var(--text-primary);
}

.config-description {
    margin: 0 0 10px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-secondary);
}

.env-status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.env-status-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--bg-primary);
}

.env-status-label {
    font-size: 11px;
    color: var(--text-secondary);
}

.env-status-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
}

.env-status-badge.set {
    background: rgba(var(--brand-primary-rgb), 0.12);
    color: var(--text-brand-dark);
}

.env-status-badge.unset {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-muted);
}

.admin-field-label {
    display: block;
    margin: 10px 0 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
}

.admin-input,
.admin-textarea,
.admin-select,
.config-input,
.config-textarea {
    width: 100%;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    padding: 8px 10px;
    box-sizing: border-box;
}

.admin-textarea,
.config-textarea {
    min-height: 72px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.admin-action-btn,
.admin-mini-btn,
.btn-save,
.btn-edit,
.btn-cancel,
.btn {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-brand-dark);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    padding: 8px 12px;
}

.admin-action-btn,
.btn-save {
    margin-top: 8px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
}

.admin-mini-btn.danger {
    color: var(--danger);
    border-color: rgba(var(--danger-rgb), 0.35);
}

.admin-action-btn:disabled,
.admin-mini-btn:disabled,
.btn-save:disabled,
.btn-edit:disabled,
.btn-cancel:disabled,
.btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.loading-state {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-secondary);
}

.spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(var(--brand-primary-rgb), 0.2);
    border-top-color: var(--brand-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.agent-config-form,
.config-row,
.button-group,
.admin-select-row,
.admin-meta-row,
.row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.config-field {
    flex: 1 1 180px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-secondary);
}

.config-field-full {
    flex: 1 1 100%;
}

.config-checkbox {
    width: auto;
}

.admin-select-row {
    align-items: center;
}

.admin-select {
    flex: 1;
}

.admin-meta-row {
    margin: 8px 0;
    font-size: 11px;
    color: var(--text-muted);
}

.rows-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow: auto;
}

.row-item {
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    padding: 8px;
    background: var(--bg-primary);
}

.row-json {
    margin: 0 0 8px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    color: var(--text-secondary);
}

.rows-empty {
    padding: 12px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
    border: 1px dashed rgba(0, 0, 0, 0.1);
    border-radius: 8px;
}
</style>
