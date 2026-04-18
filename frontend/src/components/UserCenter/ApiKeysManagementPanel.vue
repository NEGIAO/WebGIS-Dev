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

                <!-- Agent 会话 API Token -->
                <div class="key-card">
                    <div class="key-header">
                        <h3>🤖 Agent 会话 Token</h3>
                        <span :class="['status-badge', keysStatus.agent_token?.is_set ? 'set' : 'unset']">
                            {{ keysStatus.agent_token?.is_set ? '已配置' : '未配置' }}
                        </span>
                    </div>
                    <div class="key-body">
                        <div v-if="editingKey === 'agent_token'" class="edit-form">
                            <textarea
                                v-model="editValues.agent_token"
                                placeholder="粘贴您的 Agent API Token"
                                rows="3"
                                class="key-input"
                            ></textarea>
                            <div class="button-group">
                                <button class="btn btn-save" @click="saveKey('agent_token')">保存</button>
                                <button class="btn btn-cancel" @click="cancelEdit">取消</button>
                            </div>
                        </div>
                        <div v-else class="key-display">
                            <p class="key-value">
                                {{ keysStatus.agent_token?.is_set ? '●●●●●●●●●●(已设置)' : '未配置' }}
                            </p>
                            <div class="key-actions">
                                <button class="btn btn-edit" @click="startEdit('agent_token')">编辑</button>
                                <button
                                    v-if="keysStatus.agent_token?.is_set"
                                    class="btn btn-delete"
                                    @click="deleteKey('agent_token')"
                                >
                                    删除
                                </button>
                            </div>
                            <p class="key-hint">Agent 会话认证令牌</p>
                        </div>
                    </div>
                    <div class="key-footer">
                        最后更新: {{ formatTime(keysStatus.agent_token?.updated_at) }}
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

        <!-- 提示信息 -->
        <div class="warning-box">
            <span class="warning-icon">⚠️</span>
            <div class="warning-content">
                <p><strong>安全提示：</strong></p>
                <ul>
                    <li>密钥将被加密存储在后端数据库中</li>
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
    apiAdminGetApiKeysStatus,
    apiAdminSetApiKey,
    apiAdminDeleteApiKey,
} from '../../api/backend';

const message = useMessage();

const loading = ref(false);
const keysStatus = ref({
    amap_key: { is_set: false, updated_at: null },
    agent_token: { is_set: false, updated_at: null },
    tianditu_tk: { is_set: false, updated_at: null },
});

const editingKey = ref(null);
const editValues = ref({
    amap_key: '',
    agent_token: '',
    tianditu_tk: '',
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
        keysStatus.value = result?.data || {};
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
        agent_token: '',
        tianditu_tk: '',
    };
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