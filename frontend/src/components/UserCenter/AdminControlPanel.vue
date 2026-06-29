<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useMessage } from '../../composables/useMessage';
import { useAgentConfig } from '../../composables/useAgentConfig';
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
} from '../../api/backend';
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP_LAYER_INDEX } from '../../constants/basemap/basemapResolver';

const message = useMessage();

const overview = ref({
    table_count: 0,
    total_users: 0,
    total_sessions: 0,
    total_messages: 0,
    active_announcement: 0,
});

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

// LLM 参数配置 - 使用共享 composable
const {
    agentConfig: _agentConfig,
    agentConfigDraft,
    loading: loadingAgentConfig,
    submitting: submittingAgentConfig,
    load: loadAgentConfig,
    save: saveAgentConfig,
    resetQuota: resetChatQuota,
} = useAgentConfig();

// 默认底图配置
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
        message.success('默认底图已更新，刷新页面后生效');
    } catch (err) {
        message.error(`保存失败: ${err?.response?.data?.detail || err?.message || '未知错误'}`);
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

const rowCountText = computed(() => `共加载 ${tableRows.value.length} 行`);

function parseJsonObject(text, hint = 'JSON 格式错误') {
    try {
        const parsed = JSON.parse(String(text || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('JSON 必须是对象');
        }
        return parsed;
    } catch (error) {
        const detail = String(error?.message || '').trim();
        throw new Error(`${hint}${detail ? `：${detail}` : ''}`);
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
        message.error(String(error?.message || '管理员概览加载失败'));
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
        message.error(String(error?.message || '数据库表列表加载失败'));
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
        message.error(String(error?.message || '表数据加载失败'));
    } finally {
        loadingRows.value = false;
    }
}

async function handleInsertRow() {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    if (!tableName) {
        message.warning('请先选择数据表');
        return;
    }

    let rowPayload = null;
    try {
        rowPayload = parseJsonObject(insertJsonText.value, '新增数据解析失败');
    } catch (error) {
        message.error(String(error?.message || '新增数据解析失败'));
        return;
    }

    submittingTable.value = true;
    try {
        await apiAdminInsertRow(tableName, rowPayload);
        message.success('新增成功');
        await loadRows();
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || '新增失败'));
    } finally {
        submittingTable.value = false;
    }
}

async function handleEditRow(row) {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    const where = resolveWhere(row);

    if (!tableName || !where) {
        message.warning('当前行缺少可定位键，无法编辑');
        return;
    }

    const editable = toEditablePayload(row);
    const defaultText = JSON.stringify(editable, null, 2);
    const nextText = window.prompt('请输入更新后的 JSON 对象（整行替换）', defaultText);

    if (nextText === null) return;

    let nextValues = null;
    try {
        nextValues = parseJsonObject(nextText, '编辑数据解析失败');
    } catch (error) {
        message.error(String(error?.message || '编辑数据解析失败'));
        return;
    }

    submittingTable.value = true;
    try {
        await apiAdminUpdateRows(tableName, where, nextValues);
        message.success('更新成功');
        await loadRows();
    } catch (error) {
        message.error(String(error?.message || '更新失败'));
    } finally {
        submittingTable.value = false;
    }
}

async function handleDeleteRow(row) {
    if (submittingTable.value) return;

    const tableName = String(selectedTable.value || '').trim();
    const where = resolveWhere(row);

    if (!tableName || !where) {
        message.warning('当前行缺少可定位键，无法删除');
        return;
    }

    const ok = window.confirm('确认删除该行数据？此操作不可撤销。');
    if (!ok) return;

    submittingTable.value = true;
    try {
        await apiAdminDeleteRows(tableName, where);
        message.success('删除成功');
        await loadRows();
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || '删除失败'));
    } finally {
        submittingTable.value = false;
    }
}

async function handlePublishAnnouncement() {
    if (submittingConfig.value) return;

    const content = String(announcementText.value || '').trim();
    if (!content) {
        message.warning('请输入公告内容');
        return;
    }

    submittingConfig.value = true;
    try {
        await apiAdminPublishAnnouncement(content);
        message.success('公告发布成功');
        announcementText.value = '';
        await loadOverview();
    } catch (error) {
        message.error(String(error?.message || '公告发布失败'));
    } finally {
        submittingConfig.value = false;
    }
}

async function handleSaveContact() {
    if (submittingConfig.value) return;

    const contact = String(adminContactText.value || '').trim();
    if (!contact) {
        message.warning('管理员联系方式不能为空');
        return;
    }

    submittingConfig.value = true;
    try {
        await apiAdminUpdateContact(contact);
        message.success('管理员联系方式已更新');
    } catch (error) {
        message.error(String(error?.message || '联系方式更新失败'));
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
                <h4 class="admin-title">管理员控制台</h4>
                <button
                    class="admin-mini-btn"
                    type="button"
                    :disabled="loadingOverview"
                    @click="loadOverview"
                >
                    刷新概览
                </button>
            </div>

            <div class="overview-grid">
                <div class="overview-item">
                    <span class="overview-label">数据表</span>
                    <strong class="overview-value">{{ overview.table_count }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">用户</span>
                    <strong class="overview-value">{{ overview.total_users }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">在线会话</span>
                    <strong class="overview-value">{{ overview.total_sessions }}</strong>
                </div>
                <div class="overview-item">
                    <span class="overview-label">留言</span>
                    <strong class="overview-value">{{ overview.total_messages }}</strong>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <h5 class="admin-subtitle">系统配置</h5>

            <label class="admin-field-label">管理员联系方式</label>
            <input
                v-model="adminContactText"
                class="admin-input"
                type="text"
                placeholder="例如：邮箱 / 微信 / QQ"
            />

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingConfig"
                @click="handleSaveContact"
            >
                保存联系方式
            </button>

            <label class="admin-field-label">常驻顶部公告</label>
            <textarea
                v-model="announcementText"
                class="admin-textarea"
                placeholder="发布后会同步给所有用户，用户点击后才会消失"
            ></textarea>

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingConfig"
                @click="handlePublishAnnouncement"
            >
                发布公告
            </button>
        </div>

        <!-- 地图默认配置 -->
        <div class="admin-card">
            <h5 class="admin-subtitle">🗺️ 地图默认配置</h5>
            <p class="config-description">设置系统默认加载的底图预设，修改后新用户打开页面将自动使用该底图。URL 中带 l= 参数时仍优先使用 URL 指定的底图。</p>

            <div v-if="loadingBasemap" class="loading-state">
                <span class="spinner"></span> 正在加载底图配置...
            </div>

            <div v-else class="agent-config-form">
                <div class="config-row">
                    <div class="config-field config-field-full">
                        <label class="config-label">默认底图预设</label>
                        <select v-model.number="defaultBasemapIndex" class="config-input">
                            <option
                                v-for="opt in basemapOptions"
                                :key="opt.index"
                                :value="opt.index"
                            >
                                {{ opt.label }} (索引 {{ opt.index }})
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
                        {{ submittingBasemap ? '保存中...' : '💾 保存' }}
                    </button>
                    <button
                        class="btn-edit"
                        type="button"
                        :disabled="submittingBasemap"
                        @click="resetDefaultBasemapIndex"
                    >
                        🔄 重置为默认
                    </button>
                </div>
            </div>
        </div>

        <!-- LLM 参数动态配置 -->
        <div class="admin-card">
            <h5 class="admin-subtitle">🤖 LLM 对话参数配置（后端动态读取，实时生效）</h5>
            <p class="config-description">以下参数存储在数据库 system_config 表中，后端运行时动态读取，修改后无需重启服务即可生效。前端 AI 助手、Agent 对话、模型列表等功能均使用这些配置。</p>

            <div v-if="loadingAgentConfig" class="loading-state">
                <span class="spinner"></span> 正在加载 Agent 配置...
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
                            placeholder="留空则按 available_models 随机调度"
                        />
                    </label>
                </div>

                <label class="config-field config-field-full">
                    <span>Available Models（逗号或换行分隔）</span>
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
                        placeholder='{"chat_template_kwargs":{"enable_thinking":true},"reasoning_budget":16384}'
                    ></textarea>
                </label>

                <label class="config-field config-field-full">
                    <span>System Prompt</span>
                    <textarea
                        v-model="agentConfigDraft.system_prompt"
                        class="config-textarea"
                        rows="4"
                        placeholder="用于后端统一注入的系统提示词"
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
                        <span>Guest 每日额度</span>
                        <input
                            v-model.number="agentConfigDraft.guest_daily_quota"
                            class="config-input"
                            type="number"
                            min="1"
                            max="100000"
                        />
                    </label>
                    <label class="config-field">
                        <span>Registered 每日额度</span>
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
                        {{ submittingAgentConfig ? '保存中...' : '保存 LLM 参数' }}
                    </button>
                    <button
                        class="btn btn-edit"
                        type="button"
                        :disabled="submittingAgentConfig"
                        @click="resetChatQuota"
                    >
                        恢复默认对话额度
                    </button>
                    <button
                        class="btn btn-cancel"
                        type="button"
                        :disabled="submittingAgentConfig"
                        @click="loadAgentConfig"
                    >
                        重新加载
                    </button>
                </div>
            </div>
        </div>

        <div class="admin-card">
            <div class="admin-title-row">
                <h5 class="admin-subtitle">数据库管理</h5>
                <button
                    class="admin-mini-btn"
                    type="button"
                    :disabled="loadingTables"
                    @click="loadTables"
                >
                    刷新表
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
                        请选择数据表
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
                    刷新行
                </button>
            </div>

            <div class="admin-meta-row">
                <span>{{ rowCountText }}</span>
                <span v-if="selectedTableMeta"
                    >字段数：{{ selectedTableMeta.columns?.length || 0 }}</span
                >
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
                            编辑
                        </button>
                        <button
                            class="admin-mini-btn danger"
                            type="button"
                            :disabled="submittingTable"
                            @click="handleDeleteRow(row)"
                        >
                            删除
                        </button>
                    </div>
                </div>
            </div>
            <div
                v-else
                class="rows-empty"
            >
                当前表暂无可展示数据
            </div>

            <label class="admin-field-label">新增一行（JSON 对象）</label>
            <textarea
                v-model="insertJsonText"
                class="admin-textarea"
                placeholder='例如：{"username":"demo","content":"hello"}'
            ></textarea>

            <button
                class="admin-action-btn"
                type="button"
                :disabled="submittingTable"
                @click="handleInsertRow"
            >
                新增到当前表
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
    color: var(--acc-text-strong, #214a31);
    font-weight: 600;
}

.admin-subtitle {
    margin: 0 0 10px;
    font-size: 13px;
    color: var(--acc-text-main, #2c5f3e);
}

.overview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.overview-item {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.15);
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.overview-label {
    font-size: 12px;
    color: var(--acc-text-soft, #5d7f6a);
}

.overview-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--acc-text-strong, #214a31);
}

.admin-field-label {
    display: block;
    margin: 10px 0 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--acc-text-strong, #214a31);
}

.admin-input,
.admin-select,
.admin-textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 8px;
    background: #ffffff;
    color: #333333;
    padding: 10px;
    font-size: 13px;
    transition: border-color 0.2s;
}

.admin-input:focus,
.admin-select:focus,
.admin-textarea:focus {
    outline: none;
    border-color: var(--brand-primary-light);
    box-shadow: 0 0 0 3px rgba(89, 182, 106, 0.15);
}

.admin-textarea {
    min-height: 88px;
    resize: vertical;
    font-family: Consolas, Monaco, 'Courier New', monospace;
}

.admin-action-btn,
.admin-mini-btn {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    color: #ffffff;
    border: 1px solid rgba(63, 148, 75, 0.55);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
}

.admin-action-btn {
    margin-top: 8px;
    padding: 10px 14px;
    font-size: 13px;
    width: 100%;
    box-shadow: 0 4px 10px rgba(58, 129, 76, 0.15);
}

.admin-mini-btn {
    padding: 6px 12px;
    font-size: 12px;
}

.admin-mini-btn:hover:not(:disabled),
.admin-action-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(58, 129, 76, 0.25);
}

.admin-mini-btn:disabled,
.admin-action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
    background: #a9d9b4;
    border-color: transparent;
}

.admin-mini-btn.danger {
    background: linear-gradient(135deg, #f87171 0%, var(--danger) 100%);
    border-color: rgba(220, 38, 38, 0.5);
}

.admin-mini-btn.danger:hover:not(:disabled) {
    background: linear-gradient(135deg, #fca5a5 0%, #f87171 100%);
    box-shadow: 0 4px 10px rgba(220, 38, 38, 0.2);
}

.admin-select-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    align-items: center;
}

.admin-meta-row {
    margin-top: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--acc-text-soft, #5d7f6a);
}

.rows-wrap {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 300px;
    overflow-y: auto;
    padding-right: 4px;
}

.rows-wrap::-webkit-scrollbar {
    width: 6px;
}

.rows-wrap::-webkit-scrollbar-thumb {
    background: rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 4px;
}

.row-item {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.8);
    padding: 10px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.row-json {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: #1d4027;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(243, 255, 247, 0.8);
    padding: 8px;
    border-radius: 6px;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.2);
}

.row-actions {
    margin-top: 8px;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.rows-empty {
    margin-top: 10px;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.4);
    border-radius: 10px;
    padding: 16px;
    font-size: 13px;
    color: var(--acc-text-soft, #5d7f6a);
    text-align: center;
    background: rgba(255, 255, 255, 0.4);
}

/* LLM 参数配置样式 */
.config-description {
    margin: 0 0 12px 0;
    font-size: 12px;
    color: var(--acc-text-soft, #5d7f6a);
    line-height: 1.5;
}

.agent-config-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.config-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
    gap: 10px;
}

.config-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--acc-text-main, #2c5f3e);
    min-width: 0;
}

.config-field-full {
    grid-column: 1 / -1;
}

.config-field span {
    font-weight: 500;
    color: var(--acc-text-strong, #214a31);
}

.config-input,
.config-textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 8px;
    background: #ffffff;
    color: #333333;
    padding: 8px 10px;
    font-size: 13px;
    transition: border-color 0.2s;
    font-family: Consolas, Monaco, 'Courier New', monospace;
}

.config-input:focus,
.config-textarea:focus {
    outline: none;
    border-color: var(--brand-primary-light);
    box-shadow: 0 0 0 3px rgba(89, 182, 106, 0.15);
}

.config-textarea {
    min-height: 70px;
    resize: vertical;
}

.config-checkbox {
    width: auto;
    margin-top: 4px;
    transform: scale(1.1);
    accent-color: var(--brand-primary);
}

.loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: var(--acc-text-soft, #5d7f6a);
}

.spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(var(--brand-primary-rgb), 0.2);
    border-top: 2px solid var(--brand-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 8px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.button-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 36px;
}

.btn-save {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    color: #ffffff;
    border: 1px solid rgba(63, 148, 75, 0.55);
    box-shadow: 0 4px 10px rgba(58, 129, 76, 0.15);
}

.btn-save:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(58, 129, 76, 0.25);
}

.btn-edit {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary);
    border: 1px solid var(--brand-primary);
}

.btn-edit:hover:not(:disabled) {
    background: var(--brand-primary);
    color: white;
}

.btn-cancel {
    background: var(--border-light);
    color: var(--text-primary);
}

.btn-cancel:hover:not(:disabled) {
    background: #bdbdbd;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}
</style>
