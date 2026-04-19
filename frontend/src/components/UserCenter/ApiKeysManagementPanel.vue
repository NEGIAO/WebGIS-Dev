<template>
    <div class="api-keys-container">
        <div class="keys-header">
            <h2>🔑 API 密钥管理</h2>
            <p class="subtitle">管理第三方 API 密钥，确保系统正常运行</p>
        </div>

        <!-- 密钥列表 -->
        <div class="keys-section">
            <div v-if="loading" class="loading-state">
                <span class="spinner"></span> 加载中...
            </div>

            <div v-else class="keys-grid">
                <!-- 高德地图 API Key -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🗺️ 高德地图 API Key</h3>
                        <span :class="['status-badge', keysStatus.amap_key?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.amap_key?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'amap_key'" class="edit-form">
                            <textarea
                                v-model="editValues.amap_key"
                                placeholder="粘贴您的高德地图 Web 服务 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('amap_key')">保存</button>
                                <button class="btn btn-cancel" @click="cancelEdit">取消</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.amap_key?.is_set ? '●●●●●●●●●●(已设置)' : '未配置' }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('amap_key')">编辑</button>
                                <button
                                    v-if="keysStatus.amap_key?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('amap_key')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">
                                如需获取密钥，访问
                                <a href="https://lbs.amap.com/api/webservice/guide/create-project/api-key" target="_blank">
                                    高德地图开放平台
                                </a>
                            </p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.amap_key?.updated_at) }}
                    </div>
                </div>

                <!-- Agent 对话 API Key -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🤖 Agent 对话 API Key</h3>
                        <span :class="['status-badge', keysStatus.agent_api_key?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.agent_api_key?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'agent_api_key'" class="edit-form">
                            <textarea
                                v-model="editValues.agent_api_key"
                                placeholder="粘贴您的 Agent 对话 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('agent_api_key')">保存</button>
                                <button class="btn btn-cancel" @click="cancelEdit">取消</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.agent_api_key?.is_set ? '●●●●●●●●●●(已设置)' : '未配置' }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('agent_api_key')">编辑</button>
                                <button
                                    v-if="keysStatus.agent_api_key?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('agent_api_key')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">后端代理对话使用，仅管理员可配置</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.agent_api_key?.updated_at) }}
                    </div>
                </div>

                <!-- 天地图 API Key (可选) -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🌍 天地图 TK</h3>
                        <span :class="['status-badge', keysStatus.tianditu_tk?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.tianditu_tk?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'tianditu_tk'" class="edit-form">
                            <textarea
                                v-model="editValues.tianditu_tk"
                                placeholder="粘贴您的天地图 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('tianditu_tk')">保存</button>
                                <button class="btn btn-cancel" @click="cancelEdit">取消</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.tianditu_tk?.is_set ? '●●●●●●●●●●(已设置)' : '未配置' }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('tianditu_tk')">编辑</button>
                                <button
                                    v-if="keysStatus.tianditu_tk?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('tianditu_tk')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">
                                天地图底图 API 密钥（可选）
                            </p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.tianditu_tk?.updated_at) }}
                    </div>
                </div>
            </div>
        </div>

        <div class="agent-config-section">
            <div class="section-header-row">
                <h3>⚙️ Agent 对话参数</h3>
                <div class="section-actions">
                    <button class="btn btn-edit" @click="loadAgentConfig">刷新</button>
                    <button
                        v-if="!editingAgentConfig"
                        class="btn btn-edit"
                        @click="startEditAgentConfig"
                    >
                        编辑参数
                    </button>
                </div>
            </div>

            <div v-if="agentConfigLoading" class="loading-state">
                <span class="spinner"></span> 加载配置中...
            </div>

            <div v-else-if="editingAgentConfig" class="edit-form">
                <div class="config-grid">
                    <label class="config-item">
                        <span>Base URL</span>
                        <input v-model="agentConfigDraft.base_url" class="key-input" placeholder="https://api.xxx.com/v1" />
                    </label>
                    <label class="config-item">
                        <span>Model</span>
                        <input v-model="agentConfigDraft.model" class="key-input" placeholder="留空时按 available_models 随机调度" />
                    </label>
                    <label class="config-item config-item-full">
                        <span>Available Models（逗号或换行分隔）</span>
                        <textarea
                            v-model="agentConfigDraft.available_models_text"
                            rows="3"
                            class="key-input"
                            placeholder="qwen-plus\ndeepseek-chat\ngpt-4o-mini"
                        ></textarea>
                    </label>
                    <label class="config-item">
                        <span>Timeout (seconds)</span>
                        <input v-model.number="agentConfigDraft.timeout_seconds" type="number" min="5" max="180" class="key-input" />
                    </label>
                    <label class="config-item">
                        <span>Max Tokens</span>
                        <input v-model.number="agentConfigDraft.max_tokens" type="number" min="1" max="8192" class="key-input" />
                    </label>
                    <label class="config-item">
                        <span>Temperature</span>
                        <input v-model.number="agentConfigDraft.temperature" type="number" min="0" max="2" step="0.1" class="key-input" />
                    </label>
                    <label class="config-item config-item-full">
                        <span>System Prompt</span>
                        <textarea
                            v-model="agentConfigDraft.system_prompt"
                            rows="4"
                            class="key-input"
                            placeholder="用于后端统一注入的系统提示词"
                        ></textarea>
                    </label>
                </div>

                <div class="button-group">
                    <button class="btn btn-save" @click="saveAgentConfig">保存参数</button>
                    <button class="btn btn-cancel" @click="cancelEditAgentConfig">取消</button>
                </div>
            </div>

            <div v-else class="config-view">
                <div class="config-grid">
                    <div class="config-item">
                        <span>Base URL</span>
                        <strong>{{ agentConfig.base_url || '未配置' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Model</span>
                        <strong>{{ agentConfig.model || '未配置' }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>Available Models</span>
                        <strong>{{ (agentConfig.available_models || []).join(', ') || '未配置' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Timeout</span>
                        <strong>{{ agentConfig.timeout_seconds || '-' }} 秒</strong>
                    </div>
                    <div class="config-item">
                        <span>Max Tokens</span>
                        <strong>{{ agentConfig.max_tokens || '-' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Temperature</span>
                        <strong>{{ agentConfig.temperature ?? '-' }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>System Prompt</span>
                        <strong>{{ agentConfig.system_prompt || '未配置' }}</strong>
                    </div>
                </div>

                <p class="config-note">
                    对话额度：游客 {{ agentQuota.guest }} 次/日，注册用户 {{ agentQuota.registered }} 次/日，管理员不限。
                </p>
            </div>
        </div>

        <!-- 提示信息 -->
        <div class="warning-box">
            <span class="warning-icon">⚠️</span>
            <div class="warning-content">
                <p><strong>安全提示：</strong></p>
                <ul>
                    <li>密钥仅存储在后端数据库中，不会暴露到前端运行时</li>
                    <li>仅管理员可以修改和查看密钥</li>
                    <li>不要在前端代码中硬编码 API 密钥</li>
                    <li>定期检查密钥使用情况和安全性</li>
                </ul>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useMessage } from '../../composables/useMessage';
import {
    apiAdminGetAgentConfig,
    apiAdminGetApiKeysStatus,
    apiAdminDeleteApiKey,
    apiAdminSetApiKey,
    apiAdminUpdateAgentConfig,
} from '../../api/backend';

const message = useMessage();

const loading = ref(false);
const keysStatus = ref({
    amap_key: { is_set: false, updated_at: null },
    agent_api_key: { is_set: false, updated_at: null },
    tianditu_tk: { is_set: false, updated_at: null },
});

const editingKey = ref(null);
const editValues = ref({
    amap_key: '',
    agent_api_key: '',
    tianditu_tk: '',
});

const agentConfigLoading = ref(false);
const editingAgentConfig = ref(false);
const agentConfig = ref({
    base_url: '',
    model: '',
    available_models: [],
    timeout_seconds: 45,
    max_tokens: 512,
    temperature: 0.2,
    system_prompt: '',
});
const agentConfigDraft = ref({
    ...agentConfig.value,
    available_models_text: '',
});
const agentQuota = ref({
    guest: 10,
    registered: 100,
});

function formatTime(isoString) {
    if (!isoString) return '从未设置';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch (e) {
        return isoString;
    }
}

async function loadKeysStatus() {
    loading.value = true;
    try {
        const result = await apiAdminGetApiKeysStatus();
        const data = result?.data || {};
        keysStatus.value = {
            amap_key: data.amap_key || { is_set: false, updated_at: null },
            agent_api_key: data.agent_api_key || data.agent_token || { is_set: false, updated_at: null },
            tianditu_tk: data.tianditu_tk || { is_set: false, updated_at: null },
        };
    } catch (error) {
        message.error(`加载密钥状态失败: ${error.message}`);
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
    };
}

function hydrateAgentConfigDraft() {
    agentConfigDraft.value = {
        base_url: String(agentConfig.value.base_url || ''),
        model: String(agentConfig.value.model || ''),
        available_models_text: Array.isArray(agentConfig.value.available_models)
            ? agentConfig.value.available_models.join('\n')
            : '',
        timeout_seconds: Number(agentConfig.value.timeout_seconds || 45),
        max_tokens: Number(agentConfig.value.max_tokens || 512),
        temperature: Number(agentConfig.value.temperature ?? 0.2),
        system_prompt: String(agentConfig.value.system_prompt || ''),
    };
}

function parseAvailableModelsText(rawText) {
    return String(rawText || '')
        .split(/[,\n]/g)
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
        .slice(0, 200);
}

function startEditAgentConfig() {
    editingAgentConfig.value = true;
    hydrateAgentConfigDraft();
}

function cancelEditAgentConfig() {
    editingAgentConfig.value = false;
    hydrateAgentConfigDraft();
}

async function loadAgentConfig() {
    agentConfigLoading.value = true;
    try {
        const result = await apiAdminGetAgentConfig();
        const data = result?.data || {};
        const provider = data?.provider || {};
        agentConfig.value = {
            base_url: String(provider.base_url || ''),
            model: String(provider.model || ''),
            available_models: Array.isArray(provider.available_models) ? provider.available_models : [],
            timeout_seconds: Number(provider.timeout_seconds || 45),
            max_tokens: Number(provider.max_tokens || 512),
            temperature: Number(provider.temperature ?? 0.2),
            system_prompt: String(provider.system_prompt || ''),
        };

        const quota = data?.chat_quota || {};
        agentQuota.value = {
            guest: Number(quota.guest || 10),
            registered: Number(quota.registered || 100),
        };

        hydrateAgentConfigDraft();
    } catch (error) {
        message.error(`加载 Agent 配置失败: ${error.message}`);
    } finally {
        agentConfigLoading.value = false;
    }
}

async function saveAgentConfig() {
    const availableModels = parseAvailableModelsText(agentConfigDraft.value.available_models_text)
    const payload = {
        base_url: String(agentConfigDraft.value.base_url || '').trim(),
        model: String(agentConfigDraft.value.model || '').trim(),
        available_models: availableModels,
        timeout_seconds: Number(agentConfigDraft.value.timeout_seconds || 45),
        max_tokens: Number(agentConfigDraft.value.max_tokens || 512),
        temperature: Number(agentConfigDraft.value.temperature ?? 0.2),
        system_prompt: String(agentConfigDraft.value.system_prompt || '').trim(),
    };

    if (!payload.base_url || !payload.system_prompt) {
        message.error('Base URL、System Prompt 不能为空');
        return;
    }

    if (!payload.model && payload.available_models.length === 0) {
        message.error('请至少配置一个固定 Model 或 available_models 列表');
        return;
    }

    try {
        const result = await apiAdminUpdateAgentConfig(payload);
        const provider = result?.data?.provider || {};
        agentConfig.value = {
            base_url: String(provider.base_url || payload.base_url),
            model: String(provider.model || payload.model),
            available_models: Array.isArray(provider.available_models)
                ? provider.available_models
                : payload.available_models,
            timeout_seconds: Number(provider.timeout_seconds || payload.timeout_seconds),
            max_tokens: Number(provider.max_tokens || payload.max_tokens),
            temperature: Number(provider.temperature ?? payload.temperature),
            system_prompt: String(provider.system_prompt || payload.system_prompt),
        };
        hydrateAgentConfigDraft();
        editingAgentConfig.value = false;
        message.success('Agent 参数已保存');
    } catch (error) {
        message.error(`保存 Agent 配置失败: ${error.message}`);
    }
}

async function saveKey(keyName) {
    const keyValue = editValues.value[keyName]?.trim();

    if (!keyValue) {
        message.error('密钥值不能为空');
        return;
    }

    try {
        await apiAdminSetApiKey(keyName, keyValue);
        message.success(`密钥 ${keyName} 已保存`);
        cancelEdit();
        await loadKeysStatus();
    } catch (error) {
        message.error(`保存密钥失败: ${error.message}`);
    }
}

async function deleteKey(keyName) {
    if (!confirm(`确定要删除 ${keyName} 吗？此操作无法撤销！`)) {
        return;
    }

    try {
        await apiAdminDeleteApiKey(keyName);
        message.success(`密钥 ${keyName} 已删除`);
        await loadKeysStatus();
    } catch (error) {
        message.error(`删除密钥失败: ${error.message}`);
    }
}

onMounted(async () => {
    await loadKeysStatus();
    await loadAgentConfig();
});
</script>

<style scoped>
.api-keys-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(76, 175, 80, 0.2);
    box-shadow: 0 8px 32px rgba(33, 74, 49, 0.05);
    border-radius: 12px;
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

.loading-state {
    text-align: center;
    padding: 40px;
    color: #4b8b60;
}

.spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(76, 175, 80, 0.1);
    border-top: 2px solid #4caf50;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 8px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.keys-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.key-card {
    background: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(76, 175, 80, 0.2);
    box-shadow: 0 4px 12px rgba(33, 74, 49, 0.05);
    display: flex;
    flex-direction: column;
}

.key-header {
    background: linear-gradient(135deg, #6fca7a 0%, #4caf50 100%);
    color: white;
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.key-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}

.status-badge {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 12px;
    font-weight: 500;
}

.status-badge.set {
    background: rgba(255, 255, 255, 0.3);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.5);
}

.status-badge.unset {
    background: rgba(244, 67, 54, 0.8);
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
    background: rgba(76, 175, 80, 0.05);
    padding: 12px;
    border-radius: 4px;
    font-family: monospace;
    color: #214a31;
    border: 1px solid rgba(76, 175, 80, 0.1);
    margin: 0 0 12px 0;
    word-break: break-all;
}

.key-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

.key-hint {
    font-size: 12px;
    color: #6c9e78;
    margin: 0;
}

.key-hint a {
    color: #4caf50;
    text-decoration: none;
    font-weight: bold;
}

.key-hint a:hover {
    text-decoration: underline;
    color: #388e3c;
}

.edit-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.key-input {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 4px;
    font-family: monospace;
    font-size: 12px;
    resize: vertical;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.9);
    color: #214a31;
}

.key-input:focus {
    outline: none;
    border-color: #4caf50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

.button-group {
    display: flex;
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
    flex: 1;
}

.btn-edit {
    background: rgba(76, 175, 80, 0.1);
    color: #4caf50;
    border: 1px solid #4caf50;
}

.btn-edit:hover {
    background: #4caf50;
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
    background: #4caf50;
    color: white;
}

.btn-save:hover {
    background: #388e3c;
}

.btn-cancel {
    background: #e0e0e0;
    color: #333;
}

.btn-cancel:hover {
    background: #bdbdbd;
}

.key-footer {
    background: rgba(76, 175, 80, 0.02);
    padding: 8px 16px;
    border-top: 1px solid rgba(76, 175, 80, 0.1);
    font-size: 11px;
    color: #6c9e78;
}

.agent-config-section {
    margin-top: 16px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(76, 175, 80, 0.2);
    border-radius: 8px;
    padding: 16px;
}

.section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
}

.section-header-row h3 {
    margin: 0;
    color: #214a31;
}

.section-actions {
    display: flex;
    gap: 8px;
}

.config-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(240px, 1fr));
    gap: 10px;
}

.config-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #2e5d3e;
    font-size: 13px;
}

.config-item strong {
    color: #214a31;
    font-weight: 600;
    white-space: pre-wrap;
    word-break: break-word;
}

.config-item-full {
    grid-column: 1 / -1;
}

.config-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.config-note {
    margin: 0;
    font-size: 12px;
    color: #4b8b60;
}

@media (max-width: 900px) {
    .config-grid {
        grid-template-columns: 1fr;
    }
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
</style>