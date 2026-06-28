<template>
    <div class="api-keys-container">
        <div class="keys-header">
            <h2>🔑 API 密钥管理</h2>
            <p class="subtitle">管理第三方 API 密钥，确保系统正常运行</p>
        </div>

        <!-- 密钥列表 -->
        <div class="keys-section">
            <div
                v-if="loading"
                class="loading-state"
            >
                <span class="spinner"></span> 加载中...
            </div>

            <div
                v-else
                class="keys-grid"
            >
                <!-- 高德地图 API Key -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🗺️ 高德地图 API Key</h3>
                        <span
                            :class="['status-badge', keysStatus.amap_key?.is_set ? 'set' : 'unset']"
                        >
                            {{ keysStatus.amap_key?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div
                            v-if="editingKey === 'amap_key'"
                            class="edit-form"
                        >
                            <textarea
                                v-model="editValues.amap_key"
                                placeholder="粘贴您的高德地图 Web 服务 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button
                                    class="btn btn-save"
                                    @click="saveKey('amap_key')"
                                >
                                    保存
                                </button>
                                <button
                                    class="btn btn-cancel"
                                    @click="cancelEdit"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <div
                            v-else
                            class="key-display"
                        >
                            <p class="key-value">
                                {{ keysStatus.amap_key?.is_set ? '●●●●●●●●●●(已设置)' : '未配置' }}
                            </p>
                            <div class="key-actions">
                                <button
                                    class="btn btn-edit"
                                    @click="startEdit('amap_key')"
                                >
                                    编辑
                                </button>
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
                                <a
                                    href="https://lbs.amap.com/api/webservice/guide/create-project/api-key"
                                    target="_blank"
                                >
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
                        <span
                            :class="[
                                'status-badge',
                                keysStatus.agent_api_key?.is_set ? 'set' : 'unset',
                            ]"
                        >
                            {{ keysStatus.agent_api_key?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div
                            v-if="editingKey === 'agent_api_key'"
                            class="edit-form"
                        >
                            <textarea
                                v-model="editValues.agent_api_key"
                                placeholder="粘贴您的 Agent 对话 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button
                                    class="btn btn-save"
                                    @click="saveKey('agent_api_key')"
                                >
                                    保存
                                </button>
                                <button
                                    class="btn btn-cancel"
                                    @click="cancelEdit"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <div
                            v-else
                            class="key-display"
                        >
                            <p class="key-value">
                                {{
                                    keysStatus.agent_api_key?.is_set
                                        ? '●●●●●●●●●●(已设置)'
                                        : '未配置'
                                }}
                            </p>
                            <div class="key-actions">
                                <button
                                    class="btn btn-edit"
                                    @click="startEdit('agent_api_key')"
                                >
                                    编辑
                                </button>
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
                        <span
                            :class="[
                                'status-badge',
                                keysStatus.tianditu_tk?.is_set ? 'set' : 'unset',
                            ]"
                        >
                            {{ keysStatus.tianditu_tk?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div
                            v-if="editingKey === 'tianditu_tk'"
                            class="edit-form"
                        >
                            <textarea
                                v-model="editValues.tianditu_tk"
                                placeholder="粘贴您的天地图 API Key"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button
                                    class="btn btn-save"
                                    @click="saveKey('tianditu_tk')"
                                >
                                    保存
                                </button>
                                <button
                                    class="btn btn-cancel"
                                    @click="cancelEdit"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <div
                            v-else
                            class="key-display"
                        >
                            <p class="key-value">
                                {{
                                    keysStatus.tianditu_tk?.is_set ? '●●●●●●●●●●(已设置)' : '未配置'
                                }}
                            </p>
                            <div class="key-actions">
                                <button
                                    class="btn btn-edit"
                                    @click="startEdit('tianditu_tk')"
                                >
                                    编辑
                                </button>
                                <button
                                    v-if="keysStatus.tianditu_tk?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('tianditu_tk')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">天地图底图 API 密钥（可选）</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.tianditu_tk?.updated_at) }}
                    </div>
                </div>

                <!-- Cesium Ion Token -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🧊 Cesium Ion Token</h3>
                        <span
                            :class="[
                                'status-badge',
                                keysStatus.cesium_ion_token?.is_set ? 'set' : 'unset',
                            ]"
                        >
                            {{ keysStatus.cesium_ion_token?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div
                            v-if="editingKey === 'cesium_ion_token'"
                            class="edit-form"
                        >
                            <textarea
                                v-model="editValues.cesium_ion_token"
                                placeholder="粘贴您的 Cesium Ion Access Token"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button
                                    class="btn btn-save"
                                    @click="saveKey('cesium_ion_token')"
                                >
                                    保存
                                </button>
                                <button
                                    class="btn btn-cancel"
                                    @click="cancelEdit"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <div
                            v-else
                            class="key-display"
                        >
                            <p class="key-value">
                                {{
                                    keysStatus.cesium_ion_token?.is_set
                                        ? '●●●●●●●●●●(已设置)'
                                        : '未配置'
                                }}
                            </p>
                            <div class="key-actions">
                                <button
                                    class="btn btn-edit"
                                    @click="startEdit('cesium_ion_token')"
                                >
                                    编辑
                                </button>
                                <button
                                    v-if="keysStatus.cesium_ion_token?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('cesium_ion_token')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">
                                Cesium ion 资源直连使用，请在 Cesium ion 后台限制可用域名。
                            </p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.cesium_ion_token?.updated_at) }}
                    </div>
                </div>
            </div>

            <div
                v-if="!loading"
                class="backup-token-section"
            >
                <div class="section-header-row">
                    <h3>🔁 备用 Token 池</h3>
                    <p class="config-note">
                        系统会按主 token → 备用 token 顺序尝试，直连类 token 请同步在服务商后台限制域名。
                    </p>
                </div>
                <div class="backup-grid">
                    <div
                        v-for="item in managedApiKeys"
                        :key="item.key"
                        class="backup-card"
                    >
                        <div class="backup-card-head">
                            <strong>{{ item.label }}</strong>
                            <span>{{ getBackupCount(item.key) }} 个备用</span>
                        </div>
                        <div
                            v-if="getBackups(item.key).length"
                            class="backup-list"
                        >
                            <div
                                v-for="backup in getBackups(item.key)"
                                :key="backup.id"
                                class="backup-row"
                            >
                                <span>备用 {{ Number(backup.priority || 0) + 1 }} · 已设置</span>
                                <button
                                    class="btn btn-delete btn-compact"
                                    @click="deleteBackupKey(item.key, backup.id)"
                                >
                                    删除
                                </button>
                            </div>
                        </div>
                        <p
                            v-else
                            class="backup-empty"
                        >
                            暂无备用 token
                        </p>

                        <div
                            v-if="editingBackupKey === item.key"
                            class="backup-edit"
                        >
                            <textarea
                                v-model="backupEditValues[item.key]"
                                class="key-input"
                                rows="2"
                                :placeholder="`粘贴 ${item.label} 的备用 token`"
                            ></textarea>
                            <div class="button-group">
                                <button
                                    class="btn btn-save"
                                    @click="saveBackupKey(item.key)"
                                >
                                    保存备用
                                </button>
                                <button
                                    class="btn btn-cancel"
                                    @click="cancelBackupEdit"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                        <button
                            v-else
                            class="btn btn-edit"
                            @click="startBackupEdit(item.key)"
                        >
                            新增备用 token
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="agent-config-section">
            <div class="section-header-row">
                <h3>⚙️ Agent 对话参数</h3>
                <div class="section-actions">
                    <button
                        class="btn btn-edit"
                        @click="loadAgentConfigWrapper"
                    >
                        刷新
                    </button>
                    <button
                        v-if="!editingAgentConfig"
                        class="btn btn-edit"
                        @click="startEditAgentConfig"
                    >
                        编辑参数
                    </button>
                </div>
            </div>

            <div
                v-if="agentConfigLoading"
                class="loading-state"
            >
                <span class="spinner"></span> 加载配置中...
            </div>

            <div
                v-else-if="editingAgentConfig"
                class="edit-form"
            >
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
                            placeholder="留空时按 available_models 随机调度"
                        />
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
                    <label class="config-item">
                        <span>Guest 每日额度</span>
                        <input
                            v-model.number="agentConfigDraft.guest_daily_quota"
                            type="number"
                            min="1"
                            max="100000"
                            class="key-input"
                        />
                    </label>
                    <label class="config-item">
                        <span>Registered 每日额度</span>
                        <input
                            v-model.number="agentConfigDraft.registered_daily_quota"
                            type="number"
                            min="1"
                            max="100000"
                            class="key-input"
                        />
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
                    <button
                        class="btn btn-save"
                        @click="saveAgentConfigWrapper"
                    >
                        保存参数
                    </button>
                    <button
                        class="btn btn-edit"
                        @click="resetChatQuotaWrapper"
                    >
                        恢复默认额度
                    </button>
                    <button
                        class="btn btn-cancel"
                        @click="cancelEditAgentConfig"
                    >
                        取消
                    </button>
                </div>
            </div>

            <div
                v-else
                class="config-view"
            >
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
                        <strong>{{
                            (agentConfig.available_models || []).join(', ') || '未配置'
                        }}</strong>
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
                    <div class="config-item">
                        <span>Top P</span>
                        <strong>{{ agentConfig.top_p ?? '-' }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>Extra Body</span>
                        <strong>{{ agentConfig.extra_body ? JSON.stringify(agentConfig.extra_body) : '未配置' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Stream</span>
                        <strong>{{ agentConfig.stream ? '开启' : '关闭' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Guest 每日额度</span>
                        <strong>{{ agentQuota.guest }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Registered 每日额度</span>
                        <strong>{{ agentQuota.registered }}</strong>
                    </div>
                    <div class="config-item config-item-full">
                        <span>System Prompt</span>
                        <strong>{{ agentConfig.system_prompt || '未配置' }}</strong>
                    </div>
                </div>

                <p class="config-note">
                    对话额度：游客 {{ agentQuota.guest }} 次/日，注册用户
                    {{ agentQuota.registered }} 次/日，管理员不限。
                </p>
            </div>
        </div>

        <!-- 默认 AI 专属配置 -->
        <div class="agent-config-section">
            <div class="section-header-row">
                <h3>🤖 默认 AI 专属配置</h3>
                <span
                    :class="['status-badge', defaultAIConfig.is_configured ? 'set' : 'unset']"
                >
                    {{ defaultAIConfig.is_configured ? '已配置' : '未配置' }}
                </span>
                <div class="section-actions">
                    <button
                        class="btn btn-edit"
                        @click="loadDefaultAIConfig"
                    >
                        刷新
                    </button>
                    <button
                        v-if="!editingDefaultAI"
                        class="btn btn-edit"
                        @click="startEditDefaultAI"
                    >
                        编辑配置
                    </button>
                </div>
            </div>

            <p class="config-note" style="margin-bottom: 12px">
                配置前端用户默认使用的 AI 模型专属参数。用户打开 AI 助手时将自动使用此配置，无需手动输入 API Key。
                api_key 安全存储在后端数据库中，前端不会暴露。
            </p>

            <div
                v-if="defaultAILoading"
                class="loading-state"
            >
                <span class="spinner"></span> 加载配置中...
            </div>

            <div
                v-else-if="editingDefaultAI"
                class="edit-form"
            >
                <div class="config-grid">
                    <label class="config-item config-item-full">
                        <span>API Key</span>
                        <input
                            v-model="defaultAIDraft.api_key"
                            type="password"
                            class="key-input"
                            placeholder="sk-... 或 tp-...（专属 LLM 服务密钥）"
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
                    <button
                        class="btn btn-save"
                        @click="saveDefaultAIConfig"
                    >
                        保存配置
                    </button>
                    <button
                        class="btn btn-cancel"
                        @click="cancelEditDefaultAI"
                    >
                        取消
                    </button>
                </div>
            </div>

            <div
                v-else
                class="config-view"
            >
                <div class="config-grid">
                    <div class="config-item config-item-full">
                        <span>API Key</span>
                        <strong>{{ defaultAIConfig.api_key ? '●●●●●●●●●●（已设置）' : '未配置' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Base URL</span>
                        <strong>{{ defaultAIConfig.base_url || '未配置' }}</strong>
                    </div>
                    <div class="config-item">
                        <span>Model</span>
                        <strong>{{ defaultAIConfig.model || '未配置' }}</strong>
                    </div>
                </div>

                <p class="config-note">
                    {{ defaultAIConfig.is_configured
                        ? '✅ 前端用户打开 AI 助手时将自动使用此配置（默认 AI 模式），api_key 不会暴露到前端。'
                        : '⚠️ 尚未配置。前端用户需手动填写个人 API Key 或使用后端代理模式。' }}
                </p>
            </div>
        </div>

        <!-- 提示信息 -->
        <div class="warning-box">
            <span class="warning-icon">⚠️</span>
            <div class="warning-content">
                <p><strong>安全提示：</strong></p>
                <ul>
                    <li>LLM、高德等后端代理密钥仅存储在后端数据库中，不会暴露到前端运行时</li>
                    <li>天地图 TK 与 Cesium Ion Token 属于浏览器直连密钥，会通过运行时配置下发给前端</li>
                    <li>请在天地图、Cesium ion 控制台绑定生产域名或 Referer，限制 token 的可用范围</li>
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
import { useAgentConfig } from '../../composables/useAgentConfig';
import {
    apiAdminGetApiKeysStatus,
    apiAdminAppendApiKeyBackup,
    apiAdminDeleteApiKeyBackup,
    apiAdminDeleteApiKey,
    apiAdminSetApiKey,
    apiAdminGetDefaultAIConfig,
    apiAdminUpdateDefaultAIConfig,
} from '../../api/backend';
import { clearRuntimeMapTokensCache } from '../../services/runtimeMapTokens';

const message = useMessage();
const frontendRuntimeKeyNames = new Set(['tianditu_tk', 'cesium_ion_token']);
const managedApiKeys = [
    { key: 'amap_key', label: '高德地图 API Key' },
    { key: 'agent_api_key', label: 'Agent 对话 API Key' },
    { key: 'tianditu_tk', label: '天地图 TK' },
    { key: 'cesium_ion_token', label: 'Cesium Ion Token' },
];

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

// Agent 配置 - 使用共享 composable
const {
    agentConfig,
    agentConfigDraft,
    loading: agentConfigLoading,
    editingConfig: editingAgentConfig,
    save: saveAgentConfig,
    resetQuota: resetChatQuota,
    load: loadAgentConfig,
    hydrate: hydrateAgentConfigDraft,
    startEdit: startEditAgentConfig,
    cancelEdit: cancelEditAgentConfig,
} = useAgentConfig();

// 兼容旧代码的额度引用
const agentQuota = ref({
    guest: 10,
    registered: 100,
});

// 同步 agentQuota 与 composable 内部状态
const hydrateWithQuotaSync = () => {
    hydrateAgentConfigDraft();
    const chatQuota = agentConfig.value?.chat_quota || {};
    agentQuota.value = {
        guest: Number(chatQuota.guest || 10),
        registered: Number(chatQuota.registered || 100),
    };
};

// 重写 load 方法以同步 quota
const loadAgentConfigWithQuota = async () => {
    await loadAgentConfig();
    hydrateWithQuotaSync();
};

// 默认 AI 专属配置状态
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
            agent_api_key: normalizeKeyStatus(data.agent_api_key || data.agent_token),
            tianditu_tk: normalizeKeyStatus(data.tianditu_tk),
            cesium_ion_token: normalizeKeyStatus(data.cesium_ion_token),
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
        cesium_ion_token: '',
    };
}

async function loadAgentConfigWrapper() {
    // 使用共享 composable 的 load 方法，但需要同步 agentConfig 和 agentQuota
    await loadAgentConfigWithQuota();
}

async function saveAgentConfigWrapper() {
    // 保存成功后退出编辑模式，并同步额度显示
    const ok = await saveAgentConfig();
    if (ok) {
        cancelEditAgentConfig();
        hydrateWithQuotaSync();
    }
}

async function resetChatQuotaWrapper() {
    // 使用共享 composable 的 resetQuota 方法
    await resetChatQuota();
}

async function saveKey(keyName) {
    const keyValue = editValues.value[keyName]?.trim();

    if (!keyValue) {
        message.error('密钥值不能为空');
        return;
    }

    try {
        await apiAdminSetApiKey(keyName, keyValue);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(`密钥 ${keyName} 已保存`);
        cancelEdit();
        await loadKeysStatus();
    } catch (error) {
        message.error(`保存密钥失败: ${error.message}`);
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
        message.error('备用 token 不能为空');
        return;
    }

    try {
        await apiAdminAppendApiKeyBackup(keyName, keyValue);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(`已为 ${keyName} 新增备用 token`);
        cancelBackupEdit();
        await loadKeysStatus();
    } catch (error) {
        message.error(`新增备用 token 失败: ${error.message}`);
    }
}

async function deleteBackupKey(keyName, backupId) {
    if (!confirm(`确定要删除 ${keyName} 的这个备用 token 吗？此操作无法撤销！`)) {
        return;
    }

    try {
        await apiAdminDeleteApiKeyBackup(keyName, backupId);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(`已删除 ${keyName} 的备用 token`);
        await loadKeysStatus();
    } catch (error) {
        message.error(`删除备用 token 失败: ${error.message}`);
    }
}

async function deleteKey(keyName) {
    if (!confirm(`确定要删除 ${keyName} 吗？此操作无法撤销！`)) {
        return;
    }

    try {
        await apiAdminDeleteApiKey(keyName);
        if (frontendRuntimeKeyNames.has(keyName)) {
            clearRuntimeMapTokensCache();
        }
        message.success(`密钥 ${keyName} 已删除`);
        await loadKeysStatus();
    } catch (error) {
        message.error(`删除密钥失败: ${error.message}`);
    }
}

/**
 * 加载管理员配置的默认 AI 专属配置
 */
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
        message.error(`加载默认 AI 配置失败: ${error.message}`);
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
        message.error('API Key、Base URL、Model 均不能为空');
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
        message.success('默认 AI 专属配置已保存，前端用户将自动使用该配置');
    } catch (error) {
        message.error(`保存默认 AI 配置失败: ${error.message}`);
    }
}

onMounted(async () => {
    await loadKeysStatus();
    await loadAgentConfig();
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
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    box-shadow: 0 4px 12px rgba(33, 74, 49, 0.05);
    display: flex;
    flex-direction: column;
    min-width: 0;
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
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 12px;
    font-weight: 500;
    white-space: nowrap;
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
    border-radius: 8px;
    padding: 12px;
    background: rgba(var(--brand-primary-rgb), 0.03);
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
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
