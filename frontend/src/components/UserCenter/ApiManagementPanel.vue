<template>
    <div class="api-management-container">
        <div class="management-header">
            <h1>🔐 API 管理后台</h1>
            <p class="subtitle">查看和管理用户 API 调用统计与配额</p>
        </div>

        <!-- 标签页导航 -->
        <div class="tabs-nav">
            <button
                v-for="tab in tabs"
                :key="tab.id"
                class="tab-btn"
                :class="{ active: activeTab === tab.id }"
                @click="activeTab = tab.id"
            >
                {{ tab.label }}
            </button>
        </div>

        <!-- 标签页内容 -->
        <div class="tabs-content">
            <!-- 1. 用户 API 使用统计 -->
            <div v-show="activeTab === 'by-user'" class="tab-panel">
                <div class="panel-header">
                    <h2>用户 API 调用统计</h2>
                    <div class="filter-controls">
                        <label>统计天数：</label>
                        <select v-model.number="userStatsFilter.days" @change="loadUserStats">
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                    </div>
                </div>

                <div v-if="loadingUserStats" class="loading-state">
                    <span class="spinner"></span> 加载中...
                </div>

                <table v-else-if="userStats.length > 0" class="data-table">
                    <thead>
                        <tr>
                            <th>用户名</th>
                            <th>角色</th>
                            <th>调用次数</th>
                            <th>活跃天数</th>
                            <th>平均响应时间</th>
                            <th>最后调用</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(stat, idx) in userStats" :key="idx" class="data-row">
                            <td class="username">{{ stat.username }}</td>
                            <td>
                                <span class="role-badge" :class="stat.role.toLowerCase()">
                                    {{ stat.role }}
                                </span>
                            </td>
                            <td class="highlight">{{ stat.call_count }}</td>
                            <td>{{ stat.active_days }}</td>
                            <td>{{ stat.avg_response_time_ms?.toFixed(2) || 'N/A' }} ms</td>
                            <td class="timestamp">{{ formatTime(stat.last_called_at) }}</td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty-state">暂无数据</div>
            </div>

            <!-- 2. API 端点使用统计 -->
            <div v-show="activeTab === 'by-endpoint'" class="tab-panel">
                <div class="panel-header">
                    <h2>API 端点调用统计</h2>
                    <div class="filter-controls">
                        <label>统计天数：</label>
                        <select v-model.number="endpointStatsFilter.days" @change="loadEndpointStats">
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                    </div>
                </div>

                <div v-if="loadingEndpointStats" class="loading-state">
                    <span class="spinner"></span> 加载中...
                </div>

                <table v-else-if="endpointStats.length > 0" class="data-table">
                    <thead>
                        <tr>
                            <th>API 端点</th>
                            <th>调用次数</th>
                            <th>成功</th>
                            <th>错误</th>
                            <th>成功率</th>
                            <th>平均响应时间</th>
                            <th>最大/最小响应时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(stat, idx) in endpointStats" :key="idx" class="data-row">
                            <td class="endpoint-name">{{ formatEndpoint(stat.api_endpoint) }}</td>
                            <td class="highlight">{{ stat.call_count }}</td>
                            <td class="success">{{ stat.success_count }}</td>
                            <td class="error">{{ stat.error_count }}</td>
                            <td class="percentage">
                                {{ calcSuccessRate(stat.success_count, stat.call_count) }}%
                            </td>
                            <td>{{ stat.avg_response_time_ms?.toFixed(2) || 'N/A' }} ms</td>
                            <td class="response-range">
                                {{ stat.max_response_time_ms?.toFixed(0) || 'N/A' }} /
                                {{ stat.min_response_time_ms?.toFixed(0) || 'N/A' }} ms
                            </td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="empty-state">暂无数据</div>
            </div>

            <!-- 3. API 调用日志 -->
            <div v-show="activeTab === 'logs'" class="tab-panel">
                <div class="panel-header">
                    <h2>API 调用日志</h2>
                    <div class="filter-controls">
                        <input
                            v-model="logsFilter.username"
                            type="text"
                            placeholder="按用户名过滤..."
                            @change="loadLogs"
                        />
                        <input
                            v-model="logsFilter.endpoint"
                            type="text"
                            placeholder="按 API 端点过滤..."
                            @change="loadLogs"
                        />
                        <select v-model.number="logsFilter.days" @change="loadLogs">
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                        <button class="btn-refresh" @click="loadLogs">刷新</button>
                    </div>
                </div>

                <div v-if="loadingLogs" class="loading-state">
                    <span class="spinner"></span> 加载中...
                </div>

                <table v-else-if="apiLogs.length > 0" class="data-table logs-table">
                    <thead>
                        <tr>
                            <th>时间</th>
                            <th>用户</th>
                            <th>角色</th>
                            <th>API 端点</th>
                            <th>状态码</th>
                            <th>响应时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(log, idx) in apiLogs" :key="idx" class="data-row">
                            <td class="timestamp">{{ formatTime(log.timestamp) }}</td>
                            <td>{{ log.username }}</td>
                            <td>
                                <span class="role-badge" :class="log.role.toLowerCase()">
                                    {{ log.role }}
                                </span>
                            </td>
                            <td class="endpoint-name">{{ formatEndpoint(log.api_endpoint) }}</td>
                            <td>
                                <span class="status-code" :class="getStatusClass(log.status_code)">
                                    {{ log.status_code }}
                                </span>
                            </td>
                            <td>{{ log.response_time_ms?.toFixed(2) || 'N/A' }} ms</td>
                        </tr>
                    </tbody>
                </table>

                <!-- 分页控制 -->
                <div v-if="apiLogs.length > 0" class="pagination">
                    <button
                        class="btn-paging"
                        :disabled="logsFilter.offset === 0"
                        @click="logsFilter.offset = Math.max(0, logsFilter.offset - logsFilter.limit)"
                    >
                        ← 上一页
                    </button>
                    <span class="page-info">
                        第 {{ (logsFilter.offset / logsFilter.limit) + 1 }} 页
                        (显示 {{ apiLogs.length }} 条)
                    </span>
                    <button
                        class="btn-paging"
                        :disabled="apiLogs.length < logsFilter.limit"
                        @click="logsFilter.offset += logsFilter.limit"
                    >
                        下一页 →
                    </button>
                </div>

                <div v-else class="empty-state">暂无数据</div>
            </div>

            <!-- 4. 配额配置 -->
            <div v-show="activeTab === 'quota'" class="tab-panel">
                <div class="panel-header">
                    <h2>API 配额配置</h2>
                </div>

                <div v-if="loadingQuota" class="loading-state">
                    <span class="spinner"></span> 加载中...
                </div>

                <div v-else class="quota-grid">
                    <div v-for="(config, role) in quotaConfig" :key="role" class="quota-card">
                        <div class="quota-header">
                            <h3>{{ getRoleLabel(role) }}</h3>
                            <span class="role-badge" :class="role.toLowerCase()">{{ role }}</span>
                        </div>
                        <div class="quota-body">
                            <div class="quota-item">
                                <label>每日限额：</label>
                                <span class="quota-value">
                                    {{ config.daily_limit === null ? '无限制' : `${config.daily_limit} 次` }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="quota-note">
                    📝 <strong>说明：</strong> 配额通过后端环境变量配置，如需修改请编辑
                    <code>GUEST_DAILY_API_QUOTA</code>、<code>REGISTERED_DAILY_API_QUOTA</code>
                    环境变量后重启后端服务。
                </div>
            </div>

            <!-- 5. API 密钥管理 -->
            <div v-show="activeTab === 'api-keys'" class="tab-panel">
                <ApiKeysManagementPanel />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { apiAdminApiUsageByUser, apiAdminApiUsageByEndpoint, apiAdminApiLogs, apiAdminQuotaConfig } from '../../api/backend';
import { useMessage } from '../../composables/useMessage';
import ApiKeysManagementPanel from './ApiKeysManagementPanel.vue';

const message = useMessage();

const activeTab = ref('by-user');
const tabs = [
    { id: 'by-user', label: '📊 用户统计' },
    { id: 'by-endpoint', label: '🔗 端点统计' },
    { id: 'logs', label: '📝 调用日志' },
    { id: 'quota', label: '⚙️ 配额配置' },
    { id: 'api-keys', label: '🔑 密钥管理' },
];

// 用户统计
const userStats = ref([]);
const loadingUserStats = ref(false);
const userStatsFilter = ref({ days: 7 });

// 端点统计
const endpointStats = ref([]);
const loadingEndpointStats = ref(false);
const endpointStatsFilter = ref({ days: 7 });

// API 日志
const apiLogs = ref([]);
const loadingLogs = ref(false);
const logsFilter = ref({
    username: '',
    endpoint: '',
    days: 7,
    limit: 50,
    offset: 0,
});

// 配额配置
const quotaConfig = ref({});
const loadingQuota = ref(false);

function formatTime(isoString) {
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

function formatEndpoint(endpoint) {
    if (!endpoint) return 'N/A';
    // 提取最后的部分
    const parts = endpoint.split('/');
    return parts.slice(-2).join('/') || endpoint;
}

function calcSuccessRate(successCount, totalCount) {
    if (totalCount === 0) return '0';
    return ((successCount / totalCount) * 100).toFixed(1);
}

function getStatusClass(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 400 && statusCode < 500) return 'client-error';
    if (statusCode >= 500) return 'server-error';
    return 'info';
}

function getRoleLabel(role) {
    const labels = {
        guest: '游客',
        registered: '注册用户',
        admin: '管理员',
    };
    return labels[role] || role;
}

async function loadUserStats() {
    loadingUserStats.value = true;
    try {
        const result = await apiAdminApiUsageByUser(userStatsFilter.value.days, 100);
        userStats.value = result?.data || [];
    } catch (error) {
        message.error(`加载用户统计失败: ${error.message}`);
    } finally {
        loadingUserStats.value = false;
    }
}

async function loadEndpointStats() {
    loadingEndpointStats.value = true;
    try {
        const result = await apiAdminApiUsageByEndpoint(endpointStatsFilter.value.days, 50);
        endpointStats.value = result?.data || [];
    } catch (error) {
        message.error(`加载端点统计失败: ${error.message}`);
    } finally {
        loadingEndpointStats.value = false;
    }
}

async function loadLogs() {
    loadingLogs.value = true;
    try {
        const result = await apiAdminApiLogs(
            logsFilter.value.limit,
            logsFilter.value.offset,
            logsFilter.value.username || undefined,
            logsFilter.value.endpoint || undefined,
            logsFilter.value.days,
        );
        apiLogs.value = result?.data || [];
    } catch (error) {
        message.error(`加载日志失败: ${error.message}`);
    } finally {
        loadingLogs.value = false;
    }
}

async function loadQuotaConfig() {
    loadingQuota.value = true;
    try {
        const result = await apiAdminQuotaConfig();
        quotaConfig.value = result?.data || {};
    } catch (error) {
        message.error(`加载配额配置失败: ${error.message}`);
    } finally {
        loadingQuota.value = false;
    }
}

onMounted(async () => {
    await loadUserStats();
    await loadEndpointStats();
    await loadLogs();
    await loadQuotaConfig();
});
</script>

<style scoped>
.api-management-container {
    padding: 0;
    width: 100%;
    color: var(--acc-text-strong, #214a31);
}

.management-header {
    display: none;
}

/* Tabs Navigation */
.tabs-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(76, 175, 80, 0.2);
    padding-bottom: 10px;
}

.tab-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.4);
    color: var(--acc-text-soft, #5d7f6a);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.3s ease;
    border: 1px solid transparent;
}

.tab-btn:hover {
    color: var(--acc-text-main, #2c5f3e);
    background: rgba(91, 207, 137, 0.15);
}

.tab-btn.active {
    color: white;
    background: linear-gradient(135deg, #6fca7a 0%, #4caf50 100%);
    box-shadow: 0 4px 10px rgba(58, 129, 76, 0.2);
}

/* Tab Content */
.tab-panel {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(76, 175, 80, 0.15);
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 16px rgba(49, 111, 69, 0.05);
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
}

.panel-header h2 {
    margin: 0;
    font-size: 16px;
    color: var(--acc-text-strong, #214a31);
}

.filter-controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.filter-controls label {
    font-weight: 500;
    color: var(--acc-text-main, #2c5f3e);
    font-size: 13px;
}

.filter-controls select,
.filter-controls input {
    padding: 6px 12px;
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 8px;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.9);
    color: #333;
    outline: none;
    transition: border-color 0.2s;
}

.filter-controls select:focus,
.filter-controls input:focus {
    border-color: #59b66a;
    box-shadow: 0 0 0 3px rgba(89, 182, 106, 0.15);
}

.btn-refresh {
    padding: 6px 16px;
    background: linear-gradient(135deg, #6fca7a 0%, #4caf50 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    font-size: 13px;
    transition: all 0.3s ease;
    box-shadow: 0 2px 6px rgba(58, 129, 76, 0.2);
}

.btn-refresh:hover {
    background: linear-gradient(135deg, #7fd489 0%, #57b862 100%);
    transform: translateY(-1px);
}

/* Data Table */
.data-table-wrapper {
    overflow-x: auto;
    border-radius: 8px;
    border: 1px solid rgba(76, 175, 80, 0.15);
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.4);
}

.data-table thead {
    background: rgba(76, 175, 80, 0.1);
    border-bottom: 2px solid rgba(76, 175, 80, 0.2);
}

.data-table th {
    padding: 12px;
    text-align: left;
    font-weight: 600;
    color: var(--acc-text-strong, #214a31);
}

.data-table td {
    padding: 12px;
    border-bottom: 1px solid rgba(76, 175, 80, 0.1);
    color: #444;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.8);
}

.username {
    font-weight: 600;
    color: var(--acc-text-main, #2c5f3e);
}

.endpoint-name {
    font-family: ''Courier New'', monospace;
    color: #444;
    word-break: break-all;
    background: rgba(76, 175, 80, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
}

.role-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
}

.role-badge.guest { background: rgba(33, 150, 243, 0.15); color: #1976d2; }
.role-badge.registered { background: rgba(76, 175, 80, 0.15); color: #388e3c; }
.role-badge.admin { background: rgba(255, 152, 0, 0.15); color: #f57c00; }

.highlight {
    color: #3c8d4c;
    font-weight: 700;
}

.timestamp {
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 12px;
}

.success { color: #388e3c; font-weight: 600; }
.error { color: #d32f2f; font-weight: 600; }

.percentage {
    font-weight: 600;
    color: #555;
}

.response-range {
    font-size: 12px;
    color: var(--acc-text-soft, #5d7f6a);
}

.status-code {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
}

.status-code.success { background: rgba(76, 175, 80, 0.15); color: #1b5e20; }
.status-code.client-error { background: rgba(255, 87, 34, 0.15); color: #bf360c; }
.status-code.server-error { background: rgba(244, 67, 54, 0.15); color: #b71c1c; }
.status-code.info { background: rgba(33, 150, 243, 0.15); color: #0d47a1; }

.loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--acc-text-soft, #5d7f6a);
}

.spinner {
    display: inline-block;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(76, 175, 80, 0.2);
    border-top: 2px solid #4caf50;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 13px;
}

.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    padding-top: 16px;
}

.btn-paging {
    padding: 6px 16px;
    background: white;
    border: 1px solid rgba(76, 175, 80, 0.3);
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    color: var(--acc-text-strong, #214a31);
    transition: all 0.2s ease;
}

.btn-paging:hover:not(:disabled) {
    background: rgba(76, 175, 80, 0.1);
    border-color: #4caf50;
}

.btn-paging:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
}

.page-info {
    color: var(--acc-text-main, #2c5f3e);
    font-size: 13px;
    font-weight: 500;
}

.quota-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.quota-card {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(76, 175, 80, 0.2);
    border-radius: 12px;
    padding: 20px;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(49, 111, 69, 0.05);
}

.quota-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(49, 111, 69, 0.1);
}

.quota-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(76, 175, 80, 0.1);
    padding-bottom: 10px;
}

.quota-header h3 {
    margin: 0;
    font-size: 15px;
    color: var(--acc-text-strong, #214a31);
}

.quota-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.quota-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.quota-item label {
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 13px;
}

.quota-value {
    font-size: 16px;
    font-weight: 700;
    color: #4caf50;
}

.quota-note {
    background: rgba(255, 243, 224, 0.6);
    border-left: 4px solid #ffb300;
    padding: 12px 16px;
    border-radius: 8px;
    color: #5d4d23;
    font-size: 13px;
    line-height: 1.5;
}

.quota-note code {
    background: rgba(255, 255, 255, 0.8);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: ''Courier New'', monospace;
    font-weight: 600;
}

@media (max-width: 768px) {
    .panel-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .filter-controls {
        width: 100%;
    }

    .data-table {
        font-size: 12px;
    }

    .tabs-nav {
        flex-wrap: wrap;
    }

    .quota-grid {
        grid-template-columns: 1fr;
    }
}
</style>