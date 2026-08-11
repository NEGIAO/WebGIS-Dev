<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useAgentConfig } from '@common/chat/composables/useAgentConfig';
import {
    apiAdminDeleteRows,
    apiAdminGetAgentTokensPerUnit,
    apiAdminGetDefaultBasemapIndex,
    apiAdminGetDownloadTTL,
    apiAdminGetTableRows,
    apiAdminInsertRow,
    apiAdminListTables,
    apiAdminOverview,
    apiAdminPublishAnnouncement,
    apiAdminUpdateAgentTokensPerUnit,
    apiAdminUpdateContact,
    apiAdminUpdateDefaultBasemapIndex,
    apiAdminUpdateDownloadTTL,
    apiAdminUpdateRows,
} from '@/api/backend';
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP_LAYER_INDEX } from '@common/basemap/basemapOptions';

// Navigation Tab State
const activeTab = ref('overview');

const tabs = [
    { id: 'overview', icon: '📊', label: '概览与环境', desc: '系统指标 / 密钥状态', theme: 'emerald' },
    { id: 'system', icon: '⚙️', label: '系统配置', desc: '公告 / 联系方式 / 限额', theme: 'blue' },
    { id: 'agent', icon: '🤖', label: '模型与地图', desc: 'LLM 参数 / 默认底图', theme: 'purple' },
    { id: 'database', icon: '🗄️', label: '数据管理', desc: '表浏览 / 行编辑 / 插入', theme: 'amber' },
];

function selectTab(tabId) {
    if (!tabs.some((tab) => tab.id === tabId)) return;
    activeTab.value = tabId;
}

// ── 横向拖拽滚动 tabs-nav ──
const tabsNavRef = ref(null);
let isDragging = false;
let dragStartX = 0;
let scrollStartLeft = 0;

function onTabsNavDragStart(e) {
    const el = tabsNavRef.value;
    if (!el) return;
    isDragging = true;
    dragStartX = (e.touches ? e.touches[0].clientX : e.clientX);
    scrollStartLeft = el.scrollLeft;
    el.style.scrollBehavior = 'auto';
    e.preventDefault();
}

function onTabsNavDragMove(e) {
    if (!isDragging) return;
    const el = tabsNavRef.value;
    if (!el) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    el.scrollLeft = scrollStartLeft - (x - dragStartX);
}

function onTabsNavDragEnd() {
    isDragging = false;
    const el = tabsNavRef.value;
    if (el) el.style.scrollBehavior = '';
}

// 点击 tab 时自动滚动使该 tab 居中可见
function scrollTabIntoView(tabId) {
    const el = tabsNavRef.value;
    if (!el) return;
    const btn = el.querySelector(`#admin-tab-${tabId}`);
    if (btn) {
        const offset = btn.offsetLeft - el.offsetWidth / 2 + btn.offsetWidth / 2;
        el.scrollTo({ left: offset, behavior: 'smooth' });
    }
}

// 行内编辑状态
const editingRowKey = ref(null);
const editingJsonText = ref('');

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
} = useAgentConfig();

const defaultBasemapIndex = ref(DEFAULT_BASEMAP_LAYER_INDEX);
const loadingBasemap = ref(false);
const submittingBasemap = ref(false);

const downloadTtlMinutes = ref(30);
const loadingDownloadTtl = ref(false);

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

async function loadDownloadTtl() {
    loadingDownloadTtl.value = true;
    try {
        const result = await apiAdminGetDownloadTTL();
        const ttl = result?.data?.ttl_minutes;
        downloadTtlMinutes.value = ttl != null ? ttl : 30;
    } catch {
        downloadTtlMinutes.value = 30;
    } finally {
        loadingDownloadTtl.value = false;
    }
}

async function handleSaveDownloadTtl() {
    submittingConfig.value = true;
    try {
        const ttl = Math.max(1, Math.min(1440, Number(downloadTtlMinutes.value) || 30));
        await apiAdminUpdateDownloadTTL(ttl);
        downloadTtlMinutes.value = ttl;
        message.success(t('admin.downloadTtlSaveSuccess'));
    } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || t('admin.unknownError');
        message.error(t('admin.downloadTtlSaveFailed', { error: detail }));
    } finally {
        submittingConfig.value = false;
    }
}

const agentTokensPerUnit = ref(1000);
const loadingAgentTokensPerUnit = ref(false);

async function loadAgentTokensPerUnit() {
    loadingAgentTokensPerUnit.value = true;
    try {
        const result = await apiAdminGetAgentTokensPerUnit();
        const val = result?.data?.tokens_per_unit;
        agentTokensPerUnit.value = val != null ? val : 1000;
    } catch {
        agentTokensPerUnit.value = 1000;
    } finally {
        loadingAgentTokensPerUnit.value = false;
    }
}

async function handleSaveAgentTokensPerUnit() {
    if (loadingAgentTokensPerUnit.value) return;
    submittingConfig.value = true;
    try {
        const val = Math.max(100, Math.min(100000, Number(agentTokensPerUnit.value) || 1000));
        await apiAdminUpdateAgentTokensPerUnit(val);
        agentTokensPerUnit.value = val;
        message.success(t('admin.agentTokensPerUnitSaveSuccess'));
    } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || t('admin.unknownError');
        message.error(t('admin.agentTokensPerUnitSaveFailed', { error: detail }));
    } finally {
        submittingConfig.value = false;
    }
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
    if (row && row.__rowid != null) return { __rowid: row.__rowid };
    if (row && row.id != null) return { id: row.id };
    if (row && row.token != null) return { token: row.token };
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

function getRowKey(row) {
    return String(row.__rowid || row.id || row.token || row.username || JSON.stringify(row));
}

function startEditRow(row) {
    editingRowKey.value = getRowKey(row);
    const editable = toEditablePayload(row);
    editingJsonText.value = JSON.stringify(editable, null, 2);
}

function cancelEditRow() {
    editingRowKey.value = null;
    editingJsonText.value = '';
}

async function saveEditRow(row) {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    const where = resolveWhere(row);

    if (!tableName || !where) {
        message.warning(t('admin.noLocateKey'));
        return;
    }

    let nextValues = null;
    try {
        nextValues = parseJsonObject(editingJsonText.value, t('admin.editParseFailed'));
    } catch (error) {
        message.error(String(error?.message || t('admin.editParseFailed')));
        return;
    }

    submittingTable.value = true;
    try {
        await apiAdminUpdateRows(tableName, where, nextValues);
        message.success(t('admin.updateSuccess'));
        cancelEditRow();
        await loadRows();
    } catch (error) {
        message.error(String(error?.message || t('admin.updateFailed')));
    } finally {
        submittingTable.value = false;
    }
}

async function loadOverview() {
    loadingOverview.value = true;
    try {
        const result = await apiAdminOverview();
        overview.value = { ...overview.value, ...(result?.data || {}) };
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
    cancelEditRow();
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
    await loadDownloadTtl();
    await loadAgentTokensPerUnit();
});
</script>

<template>
    <div class="admin-layout" :data-active-tab="activeTab">
        <!-- 顶部 Tab 导航 -->
        <div
            ref="tabsNavRef"
            class="tabs-nav"
            role="tablist"
            aria-label="管理后台页签"
            @mousedown="onTabsNavDragStart"
            @mousemove="onTabsNavDragMove"
            @mouseup="onTabsNavDragEnd"
            @mouseleave="onTabsNavDragEnd"
            @touchstart="onTabsNavDragStart"
            @touchmove="onTabsNavDragMove"
            @touchend="onTabsNavDragEnd"
        >
            <button
                v-for="tab in tabs"
                :id="`admin-tab-${tab.id}`"
                :key="tab.id"
                type="button"
                role="tab"
                class="tab-btn"
                :class="[{ active: activeTab === tab.id }, `theme-${tab.theme}`]"
                :aria-selected="activeTab === tab.id"
                :aria-controls="`admin-panel-${tab.id}`"
                @click="scrollTabIntoView(tab.id); selectTab(tab.id)"
            >
                <span class="tab-btn__icon" aria-hidden="true">{{ tab.icon }}</span>
                <span class="tab-btn__body">
                    <span class="tab-btn__label">{{ tab.label }}</span>
                    <span class="tab-btn__desc">{{ tab.desc }}</span>
                </span>
            </button>
        </div>

        <!-- 主内容区域 -->
        <main class="admin-body">
            <!-- TAB 1: OVERVIEW & SECRETS STATUS -->
            <div
                v-show="activeTab === 'overview'"
                id="admin-panel-overview"
                class="tab-panel theme-panel-emerald"
                role="tabpanel"
                aria-labelledby="admin-tab-overview"
            >
                <!-- <div class="panel-header-banner">
            
                </div> -->

                <!-- KPI Grid with Visual Dominance -->
                <div class="kpi-grid">
                    <div class="kpi-card highlight-card teal">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.dataTable') }}</span>
                            <span class="kpi-value">{{ overview.table_count }}</span>
                        </div>
                    </div>

                    <div class="kpi-card highlight-card blue">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.users') }}</span>
                            <span class="kpi-value">{{ overview.total_users }}</span>
                        </div>
                    </div>

                    <div class="kpi-card highlight-card indigo">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.onlineSessions') }}</span>
                            <span class="kpi-value">{{ overview.total_sessions }}</span>
                        </div>
                    </div>

                    <div class="kpi-card highlight-card purple">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.messages') }}</span>
                            <span class="kpi-value">{{ overview.total_messages }}</span>
                        </div>
                    </div>
                </div>

                <!-- L3 Environment Status Card -->
                <div class="card accent-left-emerald">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">{{ t('admin.envStatusTitle') }}</h3>
                            <p class="card-subtitle">
                                {{ t('admin.envStatusDesc') }}
                                {{ t('admin.envStatusNote') }}
                                <code>.env.example</code>
                                {{ t('admin.envStatusDocsHint') }}
                            </p>
                        </div>
                    </div>

                    <div class="env-grid">
                        <div
                            v-for="item in L3_STATUS_LABELS"
                            :key="item.key"
                            class="env-item"
                        >
                            <span class="env-name">{{ l3StatusLabel(item) }}</span>
                            <span :class="['status-badge', overview.l3_env_status?.[item.key] ? 'is-configured' : 'is-unset']">
                                <span class="dot"></span>
                                {{
                                    overview.l3_env_status?.[item.key]
                                        ? t('admin.configured')
                                        : t('admin.notConfigured')
                                }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 2: SYSTEM CONFIGURATION -->
            <div
                v-show="activeTab === 'system'"
                id="admin-panel-system"
                class="tab-panel theme-panel-blue"
                role="tabpanel"
                aria-labelledby="admin-tab-system"
            >

                <div class="grid-layout-2col">
                    <!-- 模块 1: 运营广播 -->
                    <div class="card accent-top-blue">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">📢 运营公告与联系人</h3>
                                <p class="card-subtitle">实时更新全局系统顶部广播信息与联系通道</p>
                            </div>
                        </div>

                        <div class="form-stack">
                            <div class="form-group">
                                <label class="field-label">{{ t('admin.adminContact') }}</label>
                                <div class="field-action-group">
                                    <input
                                        v-model="adminContactText"
                                        class="form-input"
                                        type="text"
                                        :placeholder="t('admin.adminContactPlaceholder')"
                                    />
                                    <button
                                        class="btn btn-primary"
                                        type="button"
                                        :disabled="submittingConfig"
                                        @click="handleSaveContact"
                                    >
                                        {{ t('admin.saveContact') }}
                                    </button>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="field-label">{{ t('admin.topAnnouncement') }}</label>
                                <textarea
                                    v-model="announcementText"
                                    class="form-textarea"
                                    rows="3"
                                    :placeholder="t('admin.announcementPlaceholder')"
                                ></textarea>
                                <div class="form-actions-right">
                                    <button
                                        class="btn btn-primary"
                                        type="button"
                                        :disabled="submittingConfig"
                                        @click="handlePublishAnnouncement"
                                    >
                                        {{ t('admin.publishAnnouncement') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 模块 2: 限额策略 -->
                    <div class="card accent-top-blue">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title">⏱️ 资源与缓存限额设置</h3>
                                <p class="card-subtitle">控制后台任务过期销毁与 AI Agent Token 单位计算</p>
                            </div>
                        </div>

                        <div class="form-stack">
                            <div class="form-group">
                                <label class="field-label">{{ t('admin.downloadTtlLabel') }}</label>
                                <input
                                    v-model.number="downloadTtlMinutes"
                                    class="form-input"
                                    type="number"
                                    min="1"
                                    max="1440"
                                    :placeholder="t('admin.downloadTtlPlaceholder')"
                                />
                                <p class="field-hint">{{ t('admin.downloadTtlHint') }}</p>
                                <div class="form-actions-right">
                                    <button
                                        class="btn btn-secondary"
                                        type="button"
                                        :disabled="submittingConfig"
                                        @click="handleSaveDownloadTtl"
                                    >
                                        {{ t('admin.saveDownloadTtl') }}
                                    </button>
                                </div>
                            </div>

                            <hr class="divider" />

                            <div class="form-group">
                                <label class="field-label">{{ t('admin.agentTokensPerUnitLabel') }}</label>
                                <input
                                    v-model.number="agentTokensPerUnit"
                                    class="form-input"
                                    type="number"
                                    min="100"
                                    max="100000"
                                    :placeholder="t('admin.agentTokensPerUnitPlaceholder')"
                                />
                                <p class="field-hint">{{ t('admin.agentTokensPerUnitHint') }}</p>
                                <div class="form-actions-right">
                                    <button
                                        class="btn btn-secondary"
                                        type="button"
                                        :disabled="submittingConfig"
                                        @click="handleSaveAgentTokensPerUnit"
                                    >
                                        {{ t('admin.saveAgentTokensPerUnit') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 3: MODEL & MAP CONFIG -->
            <div
                v-show="activeTab === 'agent'"
                id="admin-panel-agent"
                class="tab-panel theme-panel-purple"
                role="tabpanel"
                aria-labelledby="admin-tab-agent"
            >

                <!-- LLM Config Card -->
                <div class="card accent-left-purple">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">🤖 {{ t('admin.llmConfigTitle') }}</h3>
                            <p class="card-subtitle">{{ t('admin.llmConfigDesc') }}</p>
                        </div>
                        <div v-if="loadingAgentConfig" class="status-indicator">
                            <span class="spinner"></span> {{ t('admin.loadingAgentConfig') }}
                        </div>
                    </div>

                    <div v-if="!loadingAgentConfig" class="form-stack">
                        <!-- 核心基础配置组 -->
                        <div class="section-box">
                            <span class="section-box-tag">接口节点与模型选型</span>
                            <div class="form-grid-2 mt-2">
                                <div class="form-group">
                                    <label class="field-label">Base URL</label>
                                    <input
                                        v-model="agentConfigDraft.base_url"
                                        class="form-input"
                                        type="text"
                                        placeholder="https://api.example.com/v1"
                                    />
                                </div>
                                <div class="form-group">
                                    <label class="field-label">Model (主模型)</label>
                                    <input
                                        v-model="agentConfigDraft.model"
                                        class="form-input"
                                        type="text"
                                        :placeholder="t('admin.modelRandomPlaceholder')"
                                    />
                                </div>
                            </div>

                            <div class="form-group mt-2">
                                <label class="field-label">{{ t('admin.availableModels') }}</label>
                                <textarea
                                    v-model="agentConfigDraft.available_models_text"
                                    class="form-textarea monospace"
                                    rows="2"
                                    placeholder="qwen-plus&#10;deepseek-chat&#10;gpt-4o-mini"
                                ></textarea>
                            </div>
                        </div>

                        <!-- 超参数控制组 -->
                        <div class="section-box">
                            <span class="section-box-tag">生成超参数控制 (Hyperparameters)</span>
                            <div class="form-grid-4 mt-2">
                                <div class="form-group">
                                    <label class="field-label">Timeout (s)</label>
                                    <input
                                        v-model.number="agentConfigDraft.timeout_seconds"
                                        class="form-input"
                                        type="number"
                                        min="5"
                                        max="180"
                                    />
                                </div>
                                <div class="form-group">
                                    <label class="field-label">Max Tokens</label>
                                    <input
                                        v-model.number="agentConfigDraft.max_tokens"
                                        class="form-input"
                                        type="number"
                                        min="1"
                                        max="32768"
                                    />
                                </div>
                                <div class="form-group">
                                    <label class="field-label">Temperature</label>
                                    <input
                                        v-model.number="agentConfigDraft.temperature"
                                        class="form-input"
                                        type="number"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                    />
                                </div>
                                <div class="form-group">
                                    <label class="field-label">Top P</label>
                                    <input
                                        v-model.number="agentConfigDraft.top_p"
                                        class="form-input"
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                    />
                                </div>
                            </div>
                        </div>

                        <!-- 扩展提示词与 Extra Body -->
                        <div class="form-grid-2">
                            <div class="form-group">
                                <label class="field-label">System Prompt (系统级提示词)</label>
                                <textarea
                                    v-model="agentConfigDraft.system_prompt"
                                    class="form-textarea"
                                    rows="3"
                                    :placeholder="t('admin.systemPromptPlaceholder')"
                                ></textarea>
                            </div>
                            <div class="form-group">
                                <label class="field-label">Extra Body (扩展 JSON 参数)</label>
                                <textarea
                                    v-model="agentConfigDraft.extra_body"
                                    class="form-textarea monospace"
                                    rows="3"
                                    placeholder="{}"
                                ></textarea>
                            </div>
                        </div>

                        <div class="form-inline-checkbox">
                            <label class="checkbox-container">
                                <input
                                    v-model="agentConfigDraft.stream"
                                    type="checkbox"
                                />
                                <span class="checkbox-label">开启 Stream 流式增量响应</span>
                            </label>
                        </div>

                        <div class="form-actions-right border-top-pt">
                            <button
                                class="btn btn-secondary"
                                type="button"
                                :disabled="submittingAgentConfig"
                                @click="loadAgentConfig"
                            >
                                {{ t('admin.reload') }}
                            </button>
                            <button
                                class="btn btn-primary"
                                type="button"
                                :disabled="submittingAgentConfig"
                                @click="saveAgentConfig"
                            >
                                {{ submittingAgentConfig ? t('common.saving') : t('admin.saveLLMParams') }}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Basemap Config Card -->
                <div class="card accent-left-purple">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">🗺️ {{ t('admin.mapDefaultConfig') }}</h3>
                            <p class="card-subtitle">{{ t('admin.mapDefaultDesc') }}</p>
                        </div>
                        <div v-if="loadingBasemap" class="status-indicator">
                            <span class="spinner"></span> {{ t('admin.loadingBasemap') }}
                        </div>
                    </div>

                    <div v-if="!loadingBasemap" class="form-inline-action">
                        <div class="form-group flex-1">
                            <label class="field-label">{{ t('admin.defaultBasemapPreset') }}</label>
                            <select v-model.number="defaultBasemapIndex" class="form-select">
                                <option
                                    v-for="opt in basemapOptions"
                                    :key="opt.index"
                                    :value="opt.index"
                                >
                                    {{ t('admin.basemapOptionLabel', { label: opt.label, index: opt.index }) }}
                                </option>
                            </select>
                        </div>
                        <div class="inline-buttons">
                            <button
                                class="btn btn-secondary"
                                type="button"
                                :disabled="submittingBasemap"
                                @click="resetDefaultBasemapIndex"
                            >
                                {{ t('admin.resetDefault') }}
                            </button>
                            <button
                                class="btn btn-primary"
                                type="button"
                                :disabled="submittingBasemap"
                                @click="saveDefaultBasemapIndex"
                            >
                                {{ submittingBasemap ? t('common.saving') : t('admin.save') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 4: DATABASE MANAGEMENT -->
            <div
                v-show="activeTab === 'database'"
                id="admin-panel-database"
                class="tab-panel theme-panel-amber"
                role="tabpanel"
                aria-labelledby="admin-tab-database"
            >

                <div class="card accent-top-amber">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title">🗄️ {{ t('admin.dbManagement') }}</h3>
                            <p class="card-subtitle">实时查看、动态插入与快速维护数据表记录</p>
                        </div>
                        <div class="header-actions">
                            <button
                                class="btn btn-secondary btn-sm"
                                type="button"
                                :disabled="loadingTables"
                                @click="loadTables"
                            >
                                {{ t('admin.refreshTables') }}
                            </button>
                        </div>
                    </div>

                    <!-- Database Controls Toolbar -->
                    <div class="db-toolbar">
                        <div class="select-wrapper">
                            <label class="toolbar-label">切换当前操作表：</label>
                            <select v-model="selectedTable" class="form-select inline-select">
                                <option value="" disabled>{{ t('admin.selectTable') }}</option>
                                <option v-for="item in tables" :key="item.name" :value="item.name">
                                    {{ item.name }}
                                </option>
                            </select>
                        </div>

                        <div class="toolbar-stats">
                            <span class="badge info">{{ rowCountText }}</span>
                            <span v-if="selectedTableMeta" class="badge secondary">
                                {{ t('admin.columnCount', { count: selectedTableMeta.columns?.length || 0 }) }}
                            </span>
                            <button
                                class="btn btn-secondary btn-sm"
                                type="button"
                                :disabled="loadingRows"
                                @click="loadRows"
                            >
                                {{ t('admin.refreshRows') }}
                            </button>
                        </div>
                    </div>

                    <!-- Rows View Container -->
                    <div class="rows-container">
                        <div v-if="loadingRows" class="empty-state">
                            <span class="spinner"></span> 正在读取数据表行记录...
                        </div>
                        <div v-else-if="tableRows.length > 0" class="rows-list">
                            <div
                                v-for="row in tableRows"
                                :key="getRowKey(row)"
                                :class="['row-card', { 'is-editing': editingRowKey === getRowKey(row) }]"
                            >
                                <!-- 行内编辑模式 -->
                                <div v-if="editingRowKey === getRowKey(row)" class="edit-row-container">
                                    <div class="edit-row-header">
                                        <span class="editing-tag">📝 编辑 JSON 记录</span>
                                    </div>
                                    <textarea
                                        v-model="editingJsonText"
                                        class="form-textarea monospace edit-json-textarea"
                                        rows="6"
                                        placeholder="请输入有效 JSON..."
                                    ></textarea>
                                    <div class="row-card-actions">
                                        <button
                                            class="btn btn-secondary btn-sm"
                                            type="button"
                                            :disabled="submittingTable"
                                            @click="cancelEditRow"
                                        >
                                            取消
                                        </button>
                                        <button
                                            class="btn btn-primary btn-sm"
                                            type="button"
                                            :disabled="submittingTable"
                                            @click="saveEditRow(row)"
                                        >
                                            保存更新
                                        </button>
                                    </div>
                                </div>

                                <!-- 正常浏览模式 -->
                                <div v-else class="view-row-container">
                                    <div class="row-card-body">
                                        <pre class="json-code">{{ JSON.stringify(row, null, 2) }}</pre>
                                    </div>
                                    <div class="row-card-actions">
                                        <button
                                            class="btn-text"
                                            type="button"
                                            :disabled="submittingTable"
                                            @click="startEditRow(row)"
                                        >
                                            {{ t('admin.edit') }}
                                        </button>
                                        <button
                                            class="btn-text danger"
                                            type="button"
                                            :disabled="submittingTable"
                                            @click="handleDeleteRow(row)"
                                        >
                                            {{ t('admin.delete') }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="empty-state">
                            {{ t('admin.rowsEmpty') }}
                        </div>
                    </div>

                    <!-- Insert Record Section -->
                    <div class="insert-section">
                        <h4 class="section-subtitle">➕ {{ t('admin.addRowTitle') }}</h4>
                        <textarea
                            v-model="insertJsonText"
                            class="form-textarea monospace"
                            rows="4"
                            :placeholder="t('admin.insertJsonExample')"
                        ></textarea>
                        <div class="form-actions-right">
                            <button
                                class="btn btn-primary"
                                type="button"
                                :disabled="submittingTable"
                                @click="handleInsertRow"
                            >
                                {{ t('admin.insertToTable') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<style scoped>
/* ==========================================================================
   Design Tokens & Modern Color Hierarchy
   ========================================================================== */
.admin-layout {
    --brand-color: var(--brand-primary, #059669);
    --brand-color-dark: var(--brand-primary-dark, #047857);
    --brand-rgb: var(--brand-primary-rgb, 5, 150, 105);

    --theme-emerald: #10b981;
    --theme-blue: #3b82f6;
    --theme-purple: #8b5cf6;
    --theme-amber: #f59e0b;
    
    --bg-base: var(--bg-primary, #f8fafc);
    --bg-card: var(--bg-secondary, #ffffff);
    --border-color: var(--border-light, #e2e8f0);
    
    --text-main: var(--text-primary, #0f172a);
    --text-muted: var(--text-secondary, #64748b);
    --danger-color: var(--danger, #ef4444);
    
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    background-color: var(--bg-base);
    color: var(--text-main);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    overflow: hidden;
}

/* ==========================================================================
   Tabs Navigation (Enhanced Contrast & Visual Distinctions)
   ========================================================================== */
.tabs-nav {
    display: flex;
    flex-wrap: nowrap;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(var(--brand-rgb), 0.14);
    border-radius: 20px;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.6)),
        radial-gradient(circle at 10% 0%, rgba(var(--brand-rgb), 0.08), transparent 34%);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--brand-rgb), 0.3) transparent;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
}

.tabs-nav::-webkit-scrollbar {
    height: 4px;
}

.tabs-nav::-webkit-scrollbar-track {
    background: transparent;
}

.tabs-nav::-webkit-scrollbar-thumb {
    background: rgba(var(--brand-rgb), 0.3);
    border-radius: 2px;
}

.tab-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    min-width: 140px;
    min-height: 60px;
    padding: 10px 12px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.7);
    color: var(--text-muted);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-btn:hover {
    color: var(--text-main);
    background: #ffffff;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

/* Theme Active Accents for Tab Navigation */
.tab-btn.active.theme-emerald {
    border-color: rgba(16, 185, 129, 0.4);
    background: linear-gradient(135deg, #ffffff, #ecfdf5);
    color: #047857;
    box-shadow: 0 8px 20px rgba(16, 185, 129, 0.15);
}
.tab-btn.active.theme-blue {
    border-color: rgba(59, 130, 246, 0.4);
    background: linear-gradient(135deg, #ffffff, #eff6ff);
    color: #1d4ed8;
    box-shadow: 0 8px 20px rgba(59, 130, 246, 0.15);
}
.tab-btn.active.theme-purple {
    border-color: rgba(139, 92, 246, 0.4);
    background: linear-gradient(135deg, #ffffff, #f5f3ff);
    color: #6d28d9;
    box-shadow: 0 8px 20px rgba(139, 92, 246, 0.15);
}
.tab-btn.active.theme-amber {
    border-color: rgba(245, 158, 11, 0.4);
    background: linear-gradient(135deg, #ffffff, #fffbeb);
    color: #b45309;
    box-shadow: 0 8px 20px rgba(245, 158, 11, 0.15);
}

.tab-btn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.04);
    font-size: 16px;
}

.tab-btn.active .tab-btn__icon {
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.08);
}

.tab-btn__body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.tab-btn__label {
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tab-btn__desc {
    overflow: hidden;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ==========================================================================
   Main Body Scroll Region & Panel Theming
   ========================================================================== */
.admin-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    box-sizing: border-box;
}

.tab-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
}

.banner-title-group {
    display: flex;
    align-items: center;
    gap: 12px;
}

.banner-title-group h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-main);
}

.banner-badge {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: #ecfdf5;
    color: #047857;
}

.banner-badge.blue { background: #eff6ff; color: #1d4ed8; }
.banner-badge.purple { background: #f5f3ff; color: #6d28d9; }
.banner-badge.amber { background: #fffbeb; color: #b45309; }

/* ==========================================================================
   Card Hierarchy & Accent Top/Left Borders
   ========================================================================== */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    overflow: hidden;
}

.card.accent-left-emerald { border-left: 4px solid var(--theme-emerald); }
.card.accent-top-blue { border-top: 3px solid var(--theme-blue); }
.card.accent-left-purple { border-left: 4px solid var(--theme-purple); }
.card.accent-top-amber { border-top: 3px solid var(--theme-amber); }

.card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
}

.card-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-main);
}

.card-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
}

.card-subtitle code {
    background: var(--bg-base);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    color: var(--brand-color);
}

/* ==========================================================================
   KPI Cards Grid (Visually Prominent)
   ========================================================================== */
.kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 12px;
}

.kpi-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.kpi-card.teal { border-bottom: 3px solid #14b8a6; }
.kpi-card.teal .kpi-icon { background: rgba(20, 184, 166, 0.12); color: #0d9488; }

.kpi-card.blue { border-bottom: 3px solid #3b82f6; }
.kpi-card.blue .kpi-icon { background: rgba(59, 130, 246, 0.12); color: #2563eb; }

.kpi-card.indigo { border-bottom: 3px solid #6366f1; }
.kpi-card.indigo .kpi-icon { background: rgba(99, 102, 241, 0.12); color: #4f46e5; }

.kpi-card.purple { border-bottom: 3px solid #a855f7; }
.kpi-card.purple .kpi-icon { background: rgba(168, 85, 247, 0.12); color: #9333ea; }

.kpi-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
}

.kpi-body {
    display: flex;
    flex-direction: column;
}

.kpi-label {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
}

.kpi-value {
    font-size: 22px;
    font-weight: 800;
    color: var(--text-main);
    line-height: 1.2;
}

/* ==========================================================================
   Environment Status Badges Grid
   ========================================================================== */
.env-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
}

.env-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
}

.env-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-main);
}

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
}

.status-badge .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.status-badge.is-configured {
    background: rgba(16, 185, 129, 0.12);
    color: #047857;
}
.status-badge.is-configured .dot {
    background: #10b981;
}

.status-badge.is-unset {
    background: #f1f5f9;
    color: var(--text-muted);
}
.status-badge.is-unset .dot {
    background: #94a3b8;
}

/* ==========================================================================
   Section Boxes & Form Layout
   ========================================================================== */
.grid-layout-2col {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
}

.section-box {
    padding: 12px 14px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    border-radius: 10px;
}

.section-box-tag {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.form-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.form-grid-2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
}

.form-grid-4 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-main);
}

.field-hint {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--text-muted);
}

.form-input,
.form-textarea,
.form-select {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-main);
    font-size: 13px;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    outline: none;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
    border-color: var(--theme-purple);
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.12);
}

.form-textarea {
    resize: vertical;
    min-height: 68px;
}

.form-textarea.monospace {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
}

.field-action-group {
    display: flex;
    gap: 8px;
}

.form-inline-action {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.inline-buttons {
    display: flex;
    gap: 8px;
}

.form-actions-right {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
}

.border-top-pt {
    border-top: 1px solid var(--border-color);
    padding-top: 12px;
}

.form-inline-checkbox {
    display: flex;
    align-items: center;
}

.checkbox-container {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 13px;
    user-select: none;
    font-weight: 600;
}

.divider {
    border: none;
    border-top: 1px dashed var(--border-color);
    margin: 4px 0;
}

/* ==========================================================================
   Buttons
   ========================================================================== */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    white-space: nowrap;
}

.btn-primary {
    background: var(--brand-color);
    color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
    background: var(--brand-color-dark);
}

.btn-secondary {
    background: var(--bg-base);
    border-color: var(--border-color);
    color: var(--text-main);
}

.btn-secondary:hover:not(:disabled) {
    background: #f1f5f9;
}

.btn-sm {
    padding: 4px 10px;
    font-size: 12px;
}

.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-base);
    color: var(--text-muted);
    cursor: pointer;
}

.btn-text {
    background: transparent;
    border: none;
    color: var(--brand-color);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
}

.btn-text.danger {
    color: var(--danger-color);
}

.mt-2 { margin-top: 8px; }
.flex-1 { flex: 1; }

/* ==========================================================================
   Database Toolbar & Visual Inspector
   ========================================================================== */
.db-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-base);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    flex-wrap: wrap;
}

.select-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
}

.toolbar-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
}

.inline-select {
    width: auto;
    min-width: 180px;
}

.toolbar-stats {
    display: flex;
    align-items: center;
    gap: 8px;
}

.badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
}

.badge.info { background: rgba(245, 158, 11, 0.15); color: #b45309; }
.badge.secondary { background: #e2e8f0; color: #475569; }

.rows-container {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    max-height: 400px;
    overflow-y: auto;
    background: var(--bg-base);
}

.rows-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.row-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px;
    transition: all 0.2s ease;
}

.row-card.is-editing {
    border-color: var(--theme-amber);
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.view-row-container,
.edit-row-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.edit-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.editing-tag {
    font-size: 11px;
    font-weight: 700;
    color: #b45309;
    background: rgba(245, 158, 11, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
}

.edit-json-textarea {
    width: 100%;
    border-color: var(--theme-amber);
}

.row-card-body {
    overflow-x: auto;
}

.json-code {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    color: var(--text-main);
    white-space: pre-wrap;
    word-break: break-all;
}

.row-card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--border-color);
    padding-top: 6px;
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: var(--text-muted);
    font-size: 13px;
}

.insert-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
    border-top: 1px solid var(--border-color);
    padding-top: 14px;
}

.section-subtitle {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-main);
}

/* ==========================================================================
   Loading Spinner
   ========================================================================== */
.status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
}

.spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--brand-color);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.spinning {
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* ==========================================================================
   Responsive Adaptations
   ========================================================================== */
@media (max-width: 768px) {
    .tabs-nav {
        gap: 8px;
        padding: 8px;
    }

    .tab-btn {
        min-width: 120px;
        min-height: 52px;
        padding: 8px;
    }

    .tab-btn__desc {
        display: none;
    }
}
</style>