<template>
    <div class="api-management-container">
        <!-- 标签页导航（原 display:none 的 management-header 死标记已删，V3.4.62 D10） -->
        <div class="tabs-nav" role="tablist" aria-label="API 管理页签">
            <button
                v-for="tab in tabs"
                :id="`api-tab-${tab.id}`"
                :key="tab.id"
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === tab.id }"
                :aria-selected="activeTab === tab.id"
                :aria-controls="`api-panel-${tab.id}`"
                @click="selectTab(tab.id)"
            >
                <component :is="tab.icon" class="tab-btn__icon" :size="18" aria-hidden="true" />
                <span class="tab-btn__body">
                    <span class="tab-btn__label">{{ tab.label }}</span>
                    <span class="tab-btn__desc">{{ tab.desc }}</span>
                </span>
            </button>
        </div>

        <!-- 标签页内容 -->
        <div class="tabs-content">
            <!-- 1. 用户配额消耗统计 -->
            <div
                v-show="activeTab === 'by-user'"
                id="api-panel-by-user"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="api-tab-by-user"
            >
                <div class="panel-header">
                    <h2>用户配额消耗统计</h2>
                    <div class="filter-controls">
                        <input
                            v-model="userStatsSearch"
                            type="text"
                            placeholder="搜索用户名..."
                        />
                        <label>统计天数：</label>
                        <select
                            v-model.number="userStatsFilter.days"
                            @change="loadUserStats"
                        >
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                    </div>
                </div>

                <div
                    v-if="loadingUserStats"
                    class="loading-state"
                >
                    <span class="spinner"></span> 加载中...
                </div>

                <div
                    v-else-if="userStats.length > 0"
                    class="data-table-wrapper"
                >
                    <table class="data-table">
                    <thead>
                        <tr>
                            <th
                                v-for="col in userStatsColumns"
                                :key="col.key"
                                scope="col"
                                class="sortable-th"
                                :class="{ active: sortKey === col.key }"
                                @click="toggleSort(col.key)"
                            >
                                <span class="th-content">
                                    {{ col.label }}
                                    <span class="sort-icon" aria-hidden="true">
                                        {{ sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' }}
                                    </span>
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(stat, idx) in sortedUserStats"
                            :key="stat.username || idx"
                            class="data-row"
                        >
                            <td class="username">{{ stat.username }}</td>
                            <td>
                                <span
                                    class="role-badge"
                                    :class="String(stat.role || '').toLowerCase()"
                                >
                                    {{ stat.role }}
                                </span>
                            </td>
                            <td class="highlight">{{ stat.total_cost }}</td>
                            <td>{{ stat.today_cost }}</td>
                            <td>{{ stat.active_days }}</td>
                            <td class="timestamp">{{ formatTime(stat.last_used_at) }}</td>
                        </tr>
                    </tbody>
                    </table>
                </div>
                <div
                    v-else
                    class="empty-state"
                >
                    暂无数据
                </div>
            </div>

            <!-- 2. API 端点使用统计 -->
            <div
                v-show="activeTab === 'by-endpoint'"
                id="api-panel-by-endpoint"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="api-tab-by-endpoint"
            >
                <div class="panel-header">
                    <h2>模型调用统计</h2>
                    <div class="filter-controls">
                        <label>统计天数：</label>
                        <select
                            v-model.number="endpointStatsFilter.days"
                            @change="loadEndpointStats"
                        >
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                    </div>
                </div>

                <div
                    v-if="loadingEndpointStats"
                    class="loading-state"
                >
                    <span class="spinner"></span> 加载中...
                </div>

                <div
                    v-else-if="endpointStats.length > 0"
                    class="data-table-wrapper"
                >
                    <table class="data-table">
                    <thead>
                        <tr>
                            <th
                                v-for="col in endpointStatsColumns"
                                :key="col.key"
                                scope="col"
                                class="sortable-th"
                                :class="{ active: endpointSortKey === col.key }"
                                @click="toggleEndpointSort(col.key)"
                            >
                                <span class="th-content">
                                    {{ col.label }}
                                    <span class="sort-icon" aria-hidden="true">
                                        {{ endpointSortKey === col.key ? (endpointSortDir === 'asc' ? '▲' : '▼') : '⇅' }}
                                    </span>
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(stat, idx) in sortedEndpointStats"
                            :key="`${stat.base_url}-${stat.model}-${idx}`"
                            class="data-row"
                        >
                            <td class="base-url">{{ stat.base_url }}</td>
                            <td class="model-name">{{ stat.model }}</td>
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
                            <td class="timestamp">{{ formatTime(stat.last_used_at) }}</td>
                        </tr>
                    </tbody>
                    </table>
                </div>
                <div
                    v-else
                    class="empty-state"
                >
                    暂无数据
                </div>
            </div>

            <!-- 3. API 调用日志 -->
            <div
                v-show="activeTab === 'logs'"
                id="api-panel-logs"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="api-tab-logs"
            >
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
                        <select
                            v-model.number="logsFilter.days"
                            @change="loadLogs"
                        >
                            <option :value="7">最近 7 天</option>
                            <option :value="30">最近 30 天</option>
                            <option :value="90">最近 90 天</option>
                        </select>
                        <button
                            class="btn-refresh"
                            @click="loadLogs"
                        >
                            刷新
                        </button>
                    </div>
                </div>

                <div
                    v-if="loadingLogs"
                    class="loading-state"
                >
                    <span class="spinner"></span> 加载中...
                </div>

                <div
                    v-else-if="apiLogs.length > 0"
                    class="data-table-wrapper"
                >
                    <table class="data-table logs-table">
                    <thead>
                        <tr>
                            <th
                                v-for="col in logsColumns"
                                :key="col.key"
                                scope="col"
                                class="sortable-th"
                                :class="{ active: logsSortKey === col.key }"
                                @click="toggleLogsSort(col.key)"
                            >
                                <span class="th-content">
                                    {{ col.label }}
                                    <span class="sort-icon" aria-hidden="true">
                                        {{ logsSortKey === col.key ? (logsSortDir === 'asc' ? '▲' : '▼') : '⇅' }}
                                    </span>
                                </span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(log, idx) in sortedLogs"
                            :key="idx"
                            class="data-row"
                        >
                            <td class="timestamp">{{ formatTime(log.timestamp) }}</td>
                            <td>{{ log.username }}</td>
                            <td>
                                <span
                                    class="role-badge"
                                    :class="String(log.role || '').toLowerCase()"
                                >
                                    {{ log.role }}
                                </span>
                            </td>
                            <td class="endpoint-name">{{ formatEndpoint(log.api_endpoint) }}</td>
                            <td>
                                <span
                                    class="status-code"
                                    :class="getStatusClass(log.status_code)"
                                >
                                    {{ log.status_code }}
                                </span>
                            </td>
                            <td>{{ log.response_time_ms?.toFixed(2) || 'N/A' }} ms</td>
                        </tr>
                    </tbody>
                    </table>
                </div>

                <!-- 分页控制 -->
                <div
                    v-if="apiLogs.length > 0"
                    class="pagination"
                >
                    <button
                        class="btn-paging"
                        :disabled="logsFilter.offset === 0"
                        @click="prevLogsPage"
                    >
                        ← 上一页
                    </button>
                    <span class="page-info">
                        第 {{ logsFilter.offset / logsFilter.limit + 1 }} 页 (显示
                        {{ apiLogs.length }} 条)
                    </span>
                    <button
                        class="btn-paging"
                        :disabled="apiLogs.length < logsFilter.limit"
                        @click="nextLogsPage"
                    >
                        下一页 →
                    </button>
                </div>

                <div
                    v-else
                    class="empty-state"
                >
                    暂无数据
                </div>
            </div>

            <!-- 4. API 额度设置 -->
            <div
                v-show="activeTab === 'quota'"
                id="api-panel-quota"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="api-tab-quota"
            >
                <div class="panel-header">
                    <h2>API 额度设置</h2>
                    <div class="section-actions">
                        <button
                            v-if="!editingQuota"
                            class="btn btn-edit"
                            @click="startEditQuota"
                        >
                            编辑额度
                        </button>
                    </div>
                </div>

                <div
                    v-if="loadingQuota"
                    class="loading-state"
                >
                    <span class="spinner"></span> 加载中...
                </div>

                <div
                    v-else-if="editingQuota"
                    class="edit-form"
                >
                    <div class="config-grid">
                        <label class="config-item">
                            <span>游客每日限额</span>
                            <input
                                v-model.number="quotaDraft.guest_limit"
                                type="number"
                                min="1"
                                max="100000"
                                class="key-input"
                            />
                        </label>
                        <label class="config-item">
                            <span>注册用户每日限额</span>
                            <input
                                v-model.number="quotaDraft.registered_limit"
                                type="number"
                                min="1"
                                max="100000"
                                class="key-input"
                            />
                        </label>
                    </div>
                    <div class="button-group">
                        <button
                            class="btn btn-save"
                            :disabled="savingQuota"
                            @click="saveQuotaConfig"
                        >
                            {{ savingQuota ? '保存中...' : '保存' }}
                        </button>
                        <button
                            class="btn btn-cancel"
                            @click="cancelEditQuota"
                        >
                            取消
                        </button>
                    </div>
                </div>

                <div
                    v-else
                    class="quota-grid"
                >
                    <div class="quota-card">
                        <div class="quota-header">
                            <h3>游客</h3>
                            <span class="role-badge guest">Guest</span>
                        </div>
                        <div class="quota-body">
                            <div class="quota-item">
                                <label>每日限额：</label>
                                <span class="quota-value">{{ apiQuota.guest }} 次</span>
                            </div>
                        </div>
                    </div>
                    <div class="quota-card">
                        <div class="quota-header">
                            <h3>注册用户</h3>
                            <span class="role-badge registered">Registered</span>
                        </div>
                        <div class="quota-body">
                            <div class="quota-item">
                                <label>每日限额：</label>
                                <span class="quota-value">{{ apiQuota.registered }} 次</span>
                            </div>
                        </div>
                    </div>
                </div>

                <p class="quota-note">
                    <Info :size="14" /> <strong>说明：</strong> 统一 API 额度池，所有操作（API 调用、AI 对话、地图下载）共享同一每日额度，修改后立即生效。
                </p>
            </div>

            <!-- 5. API 密钥管理 -->
            <div
                v-show="activeTab === 'api-keys'"
                id="api-panel-api-keys"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="api-tab-api-keys"
            >
                <ApiKeysManagementPanel />
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Info } from '@lucide/vue';
import {
    BarChart3,
    Link2,
    ScrollText,
    Settings,
    KeyRound,
} from '@lucide/vue';
import {
    apiAdminApiUsageByModel,
    apiAdminApiLogs,
    apiAdminGetApiQuota,
    apiAdminQuotaUsageByUser,
    apiAdminUpdateApiQuota,
} from '@/api/backend';
import { useMessage } from '@common/shell/useMessage';
import ApiKeysManagementPanel from './ApiKeysManagementPanel.vue';

const message = useMessage();

const activeTab = ref('by-user');
const tabs = [
    { id: 'by-user', icon: BarChart3, label: '配额消耗', desc: '统一配额池用量' },
    { id: 'by-endpoint', icon: Link2, label: '模型调用统计', desc: 'Base URL / 模型维度' },
    { id: 'logs', icon: ScrollText, label: '调用日志', desc: '请求明细追踪' },
    { id: 'quota', icon: Settings, label: 'API 额度设置', desc: '统一 API 额度池' },
    { id: 'api-keys', icon: KeyRound, label: '密钥管理', desc: '第三方密钥池' },
];

// 修复：模板 @click="selectTab(tab.id)" 此前未定义该函数，点击 tab 完全无响应
function selectTab(tabId) {
    if (!tabs.some((tab) => tab.id === tabId)) return;
    activeTab.value = tabId;
}

// 用户统计
const userStats = ref([]);
const loadingUserStats = ref(false);
const userStatsFilter = ref({ days: 7 });
const userStatsSearch = ref('');
const sortKey = ref('total_cost');
const sortDir = ref('desc');

const userStatsColumns = [
    { key: 'username', label: '用户名' },
    { key: 'role', label: '角色' },
    { key: 'total_cost', label: '总消耗配额' },
    { key: 'today_cost', label: '今日消耗' },
    { key: 'active_days', label: '活跃天数' },
    { key: 'last_used_at', label: '最后使用' },
];

function toggleSort(key) {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        sortDir.value = 'desc';
    }
}

/** 通用排序逻辑工厂：给定源数据 + 排序键/方向，返回排序后列表 */
function createSortedComputed(source, sortKeyRef, sortDirRef) {
    return computed(() => {
        const list = [...source.value];
        const key = sortKeyRef.value;
        const dir = sortDirRef.value;
        const multiplier = dir === 'asc' ? 1 : -1;

        return list.sort((a, b) => {
            let va = a[key];
            let vb = b[key];

            // 字符串字段：字典序
            if (typeof va === 'string' && typeof vb === 'string') {
                return multiplier * (va < vb ? -1 : va > vb ? 1 : 0);
            }

            // 时间字段
            if (key === 'last_used_at' || key === 'timestamp') {
                va = new Date(va).getTime() || 0;
                vb = new Date(vb).getTime() || 0;
            } else {
                va = Number(va) || 0;
                vb = Number(vb) || 0;
            }

            return multiplier * (va - vb);
        });
    });
}

const sortedUserStats = computed(() => {
    const keyword = userStatsSearch.value.trim().toLowerCase();
    const list = keyword
        ? userStats.value.filter((s) => String(s.username || '').toLowerCase().includes(keyword))
        : [...userStats.value];

    const key = sortKey.value;
    const multiplier = sortDir.value === 'asc' ? 1 : -1;

    return list.sort((a, b) => {
        let va = a[key];
        let vb = b[key];

        if (typeof va === 'string' && typeof vb === 'string') {
            return multiplier * (va < vb ? -1 : va > vb ? 1 : 0);
        }

        if (key === 'last_used_at' || key === 'timestamp') {
            va = new Date(va).getTime() || 0;
            vb = new Date(vb).getTime() || 0;
        } else {
            va = Number(va) || 0;
            vb = Number(vb) || 0;
        }

        return multiplier * (va - vb);
    });
});

// 模型调用统计（按 base_url + model 聚合）
const endpointStats = ref([]);
const loadingEndpointStats = ref(false);
const endpointStatsFilter = ref({ days: 7 });
const endpointSortKey = ref('call_count');
const endpointSortDir = ref('desc');

const endpointStatsColumns = [
    { key: 'base_url', label: 'Base URL' },
    { key: 'model', label: '模型' },
    { key: 'call_count', label: '调用次数' },
    { key: 'success_count', label: '成功' },
    { key: 'error_count', label: '错误' },
    { key: 'avg_response_time_ms', label: '平均响应时间' },
    { key: 'max_response_time_ms', label: '最大/最小响应时间' },
    { key: 'last_used_at', label: '最后使用' },
];

function toggleEndpointSort(key) {
    if (endpointSortKey.value === key) {
        endpointSortDir.value = endpointSortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        endpointSortKey.value = key;
        endpointSortDir.value = 'desc';
    }
}

const sortedEndpointStats = createSortedComputed(endpointStats, endpointSortKey, endpointSortDir);

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
const logsSortKey = ref('timestamp');
const logsSortDir = ref('desc');

const logsColumns = [
    { key: 'timestamp', label: '时间' },
    { key: 'username', label: '用户' },
    { key: 'role', label: '角色' },
    { key: 'api_endpoint', label: 'API 端点' },
    { key: 'status_code', label: '状态码' },
    { key: 'response_time_ms', label: '响应时间' },
];

function toggleLogsSort(key) {
    if (logsSortKey.value === key) {
        logsSortDir.value = logsSortDir.value === 'asc' ? 'desc' : 'asc';
    } else {
        logsSortKey.value = key;
        logsSortDir.value = 'desc';
    }
}

const sortedLogs = createSortedComputed(apiLogs, logsSortKey, logsSortDir);

// API 额度设置（统一配额池）
const apiQuota = ref({ guest: 100, registered: 1000 });
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
    } catch (_e) {
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


async function loadUserStats() {
    loadingUserStats.value = true;
    try {
        const result = await apiAdminQuotaUsageByUser(userStatsFilter.value.days, 100);
        userStats.value = result?.data || [];
    } catch (error) {
        message.error(`加载配额统计失败: ${error.message}`);
    } finally {
        loadingUserStats.value = false;
    }
}

async function loadEndpointStats() {
    loadingEndpointStats.value = true;
    try {
        const result = await apiAdminApiUsageByModel(endpointStatsFilter.value.days, 50);
        endpointStats.value = result?.data || [];
    } catch (error) {
        message.error(`加载模型统计失败: ${error.message}`);
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

async function prevLogsPage() {
    if (loadingLogs.value || logsFilter.value.offset === 0) return;
    logsFilter.value.offset = Math.max(0, logsFilter.value.offset - logsFilter.value.limit);
    await loadLogs();
}

async function nextLogsPage() {
    if (loadingLogs.value || apiLogs.value.length < logsFilter.value.limit) return;
    logsFilter.value.offset += logsFilter.value.limit;
    await loadLogs();
}

async function loadQuotaConfig() {
    loadingQuota.value = true;
    try {
        const result = await apiAdminGetApiQuota();
        const src = result?.data;
        if (src && typeof src.guest_daily_quota === 'number' && typeof src.registered_daily_quota === 'number') {
            apiQuota.value = { guest: src.guest_daily_quota, registered: src.registered_daily_quota };
        } else {
            apiQuota.value = { guest: 100, registered: 1000 };
        }
    } catch (error) {
        console.warn('[ApiManagementPanel] 读取 API 额度失败:', error);
        message.error(`加载额度失败: ${error.message}`);
    } finally {
        loadingQuota.value = false;
    }
}

// 配额可编辑状态
const editingQuota = ref(false);
const savingQuota = ref(false);
const quotaDraft = ref({ guest_limit: 100, registered_limit: 1000 });

function startEditQuota() {
    quotaDraft.value = {
        guest_limit: apiQuota.value.guest,
        registered_limit: apiQuota.value.registered,
    };
    editingQuota.value = true;
}

function cancelEditQuota() {
    editingQuota.value = false;
}

async function saveQuotaConfig() {
    const guestLimit = Number(quotaDraft.value.guest_limit);
    const registeredLimit = Number(quotaDraft.value.registered_limit);

    if (!Number.isFinite(guestLimit) || guestLimit < 1) {
        message.error('游客每日限额必须 ≥ 1');
        return;
    }
    if (!Number.isFinite(registeredLimit) || registeredLimit < 1) {
        message.error('注册用户每日限额必须 ≥ 1');
        return;
    }

    savingQuota.value = true;
    try {
        await apiAdminUpdateApiQuota(guestLimit, registeredLimit);
        message.success('API 额度已保存');
        editingQuota.value = false;
        await loadQuotaConfig();
    } catch (error) {
        message.error(`保存额度失败: ${error.message}`);
    } finally {
        savingQuota.value = false;
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
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    color: var(--acc-text-strong, #214a31);
}

.management-header {
    display: none;
}

/* Tabs Navigation */
.tabs-nav {
    display: grid;
    grid-template-columns: repeat(5, minmax(148px, 1fr));
    gap: 10px;
    margin-bottom: 22px;
    padding: 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.14);
    border-radius: 20px;
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.48)),
        radial-gradient(circle at 10% 0%, rgba(var(--brand-primary-rgb), 0.12), transparent 34%);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.72),
        0 14px 34px rgba(49, 111, 69, 0.08);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--brand-primary-rgb), 0.26) transparent;
}

.tabs-nav::-webkit-scrollbar {
    height: 6px;
}

.tabs-nav::-webkit-scrollbar-thumb {
    background: rgba(var(--brand-primary-rgb), 0.25);
    border-radius: 999px;
}

.tab-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 64px;
    padding: 11px 12px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.1);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.54);
    color: var(--acc-text-soft, #5d7f6a);
    cursor: pointer;
    text-align: left;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66);
    transition:
        color 0.22s ease,
        background 0.22s ease,
        border-color 0.22s ease,
        box-shadow 0.22s ease,
        transform 0.22s ease;
}

.tab-btn::after {
    content: '';
    position: absolute;
    inset: auto 14px 8px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--brand-primary-light), var(--brand-primary));
    opacity: 0;
    transform: scaleX(0.45);
    transition: opacity 0.22s ease, transform 0.22s ease;
}

.tab-btn:hover {
    color: var(--acc-text-main, #2c5f3e);
    background: rgba(255, 255, 255, 0.82);
    border-color: rgba(var(--brand-primary-rgb), 0.22);
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(49, 111, 69, 0.1);
}

.tab-btn.active {
    color: var(--acc-text-strong, #214a31);
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(241, 250, 244, 0.92)),
        radial-gradient(circle at 20% 0%, rgba(var(--brand-primary-rgb), 0.18), transparent 48%);
    border-color: rgba(var(--brand-primary-rgb), 0.32);
    box-shadow:
        0 12px 28px rgba(58, 129, 76, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.86);
    transform: translateY(-1px);
}

.tab-btn.active::after {
    opacity: 1;
    transform: scaleX(1);
}

.tab-btn:focus-visible {
    outline: 2px solid var(--brand-primary);
    outline-offset: 3px;
}

.tab-btn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    border-radius: 12px;
    background: rgba(var(--brand-primary-rgb), 0.09);
    font-size: 17px;
    box-shadow: inset 0 0 0 1px rgba(var(--brand-primary-rgb), 0.08);
}

.tab-btn.active .tab-btn__icon {
    background: linear-gradient(135deg, var(--brand-primary-light), var(--brand-primary));
    box-shadow: 0 8px 18px rgba(58, 129, 76, 0.22);
}

.tab-btn__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.tab-btn__label {
    overflow: hidden;
    color: inherit;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tab-btn__desc {
    overflow: hidden;
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 11px;
    font-weight: 500;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tab-btn.active .tab-btn__desc {
    color: var(--acc-text-main, #2c5f3e);
}

/* Tab Content */
.tabs-content {
    width: 100%;
    min-width: 0;
}

.tab-panel {
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.15);
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 16px rgba(49, 111, 69, 0.05);
    min-width: 0;
    box-sizing: border-box;
}

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
    min-width: 0;
}

.panel-header h2 {
    margin: 0;
    font-size: 16px;
    color: var(--acc-text-strong, #214a31);
    min-width: 0;
}

.filter-controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    min-width: 0;
}

.filter-controls label {
    font-weight: 500;
    color: var(--acc-text-main, #2c5f3e);
    font-size: 13px;
}

.filter-controls select,
.filter-controls input {
    min-width: 0;
    padding: 6px 12px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 8px;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.9);
    color: var(--text-primary);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
}

.filter-controls select:focus,
.filter-controls input:focus {
    border-color: var(--brand-primary-light);
    box-shadow: 0 0 0 3px rgba(89, 182, 106, 0.15);
}

.btn-refresh {
    padding: 6px 16px;
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
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
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    transform: translateY(-1px);
}

/* Data Table */
.data-table-wrapper {
    overflow-x: auto;
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.15);
    -webkit-overflow-scrolling: touch;
}

.data-table {
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
    font-size: 13px;
    background: rgba(255, 255, 255, 0.4);
}

.logs-table {
    min-width: 760px;
}

.data-table thead {
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-bottom: 2px solid rgba(var(--brand-primary-rgb), 0.2);
}

.data-table th {
    padding: 12px;
    text-align: left;
    font-weight: 600;
    color: var(--acc-text-strong, #214a31);
    white-space: nowrap;
}

.sortable-th {
    cursor: pointer;
    user-select: none;
    transition: background 0.15s;
}

.sortable-th:hover {
    background: rgba(var(--brand-primary-rgb), 0.15);
}

.sortable-th.active {
    background: rgba(var(--brand-primary-rgb), 0.18);
    color: var(--brand-primary-dark);
}

.th-content {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.sort-icon {
    font-size: 11px;
    opacity: 0.5;
    transition: opacity 0.15s;
}

.sortable-th.active .sort-icon {
    opacity: 1;
}

.data-table td {
    padding: 12px;
    border-bottom: 1px solid rgba(var(--brand-primary-rgb), 0.1);
    color: #444;
    vertical-align: middle;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.8);
}

.username {
    font-weight: 600;
    color: var(--acc-text-main, #2c5f3e);
}

.endpoint-name {
    font-family:
        '' Courier New '',
        monospace;
    color: #444;
    word-break: break-all;
    background: rgba(var(--brand-primary-rgb), 0.08);
    padding: 2px 6px;
    border-radius: 4px;
}

.base-url {
    font-family: 'Courier New', monospace;
    color: #555;
    word-break: break-all;
    font-size: 12px;
    max-width: 280px;
}

.model-name {
    font-weight: 600;
    color: var(--acc-text-main, #2c5f3e);
    white-space: nowrap;
}

.role-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
}

.role-badge.guest {
    background: rgba(33, 150, 243, 0.15);
    color: #1976d2;
}
.role-badge.registered {
    background: rgba(var(--brand-primary-rgb), 0.15);
    color: var(--brand-primary-dark);
}
.role-badge.admin {
    background: rgba(255, 152, 0, 0.15);
    color: #f57c00;
}

.highlight {
    color: var(--brand-primary-dark);
    font-weight: 700;
}

.timestamp {
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 12px;
    white-space: nowrap;
}

.success {
    color: var(--brand-primary-dark);
    font-weight: 600;
}
.error {
    color: #d32f2f;
    font-weight: 600;
}

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

.status-code.success {
    background: rgba(var(--brand-primary-rgb), 0.15);
    color: #1b5e20;
}
.status-code.client-error {
    background: rgba(255, 87, 34, 0.15);
    color: #bf360c;
}
.status-code.server-error {
    background: rgba(244, 67, 54, 0.15);
    color: #b71c1c;
}
.status-code.info {
    background: rgba(33, 150, 243, 0.15);
    color: #0d47a1;
}

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
    border: 2px solid rgba(var(--brand-primary-rgb), 0.2);
    border-top: 2px solid var(--brand-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
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
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 20px;
    padding-top: 16px;
}

.btn-paging {
    padding: 6px 16px;
    background: white;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    color: var(--acc-text-strong, #214a31);
    transition: all 0.2s ease;
}

.btn-paging:hover:not(:disabled) {
    background: rgba(var(--brand-primary-rgb), 0.1);
    border-color: var(--brand-primary);
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
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.quota-card {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 12px;
    padding: 20px;
    transition: all 0.3s ease;
    box-shadow: 0 4px 12px rgba(49, 111, 69, 0.05);
    min-width: 0;
    box-sizing: border-box;
}

.quota-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(49, 111, 69, 0.1);
}

.quota-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    border-bottom: 1px solid rgba(var(--brand-primary-rgb), 0.1);
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
    gap: 12px;
}

.quota-item label {
    color: var(--acc-text-soft, #5d7f6a);
    font-size: 13px;
}

.quota-value {
    font-size: 16px;
    font-weight: 700;
    color: var(--brand-primary);
}

.quota-note {
    background: rgba(255, 243, 224, 0.6);
    border-left: 4px solid #ffb300;
    padding: 12px 16px;
    border-radius: 8px;
    color: #5d4d23;
    font-size: 13px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    display: flex;
    align-items: flex-start;
    gap: 6px;
}

.quota-note svg {
    color: var(--info, #ffb300);
    flex-shrink: 0;
    margin-top: 2px;
}

.quota-note code {
    background: rgba(255, 255, 255, 0.8);
    padding: 2px 6px;
    border-radius: 4px;
    font-family:
        '' Courier New '',
        monospace;
    font-weight: 600;
}

/* 配额编辑表单 */
.section-actions {
    display: flex;
    gap: 8px;
}

.config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
}

.config-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--acc-text-default, #2d5a3a);
}

.config-item .key-input {
    max-width: 100%;
}

.button-group {
    display: flex;
    gap: 10px;
    margin-top: 12px;
}

@media (max-width: 768px) {
    .tabs-nav {
        grid-template-columns: repeat(5, minmax(132px, 1fr));
        gap: 8px;
        margin-bottom: 14px;
        padding: 8px;
        border-radius: 16px;
        -webkit-overflow-scrolling: touch;
    }

    .tab-btn {
        min-height: 54px;
        gap: 8px;
        padding: 9px 10px;
        border-radius: 14px;
    }

    .tab-btn::after {
        inset: auto 12px 6px;
        height: 2px;
    }

    .tab-btn__icon {
        flex-basis: 30px;
        width: 30px;
        height: 30px;
        border-radius: 10px;
        font-size: 15px;
    }

    .tab-btn__label {
        font-size: 12px;
    }

    .tab-btn__desc {
        font-size: 10px;
    }

    .tab-panel {
        padding: 14px;
        border-radius: 10px;
    }

    .panel-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
    }

    .filter-controls {
        width: 100%;
        gap: 8px;
    }

    .filter-controls label {
        width: 100%;
    }

    .filter-controls select,
    .filter-controls input,
    .btn-refresh {
        width: 100%;
        min-height: 38px;
    }

    .data-table {
        min-width: 640px;
        font-size: 12px;
    }

    .logs-table {
        min-width: 700px;
    }

    .data-table th,
    .data-table td {
        padding: 10px;
    }

    .pagination {
        justify-content: stretch;
        gap: 10px;
    }

    .btn-paging {
        flex: 1 1 120px;
        min-height: 38px;
    }

    .page-info {
        order: -1;
        width: 100%;
        text-align: center;
    }

    .quota-grid {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .quota-card {
        padding: 14px;
    }
}

@media (max-width: 560px) {
    .tabs-nav {
        grid-template-columns: repeat(5, minmax(112px, 1fr));
        padding: 7px;
    }

    .tab-btn {
        min-height: 46px;
        padding: 8px;
    }

    .tab-btn__icon {
        flex-basis: 28px;
        width: 28px;
        height: 28px;
        font-size: 14px;
    }

    .tab-btn__desc {
        display: none;
    }
}

@media (max-width: 480px) {
    .tab-panel {
        padding: 12px;
    }

    .data-table {
        min-width: 580px;
    }

    .logs-table {
        min-width: 620px;
    }

    .quota-header,
    .quota-item {
        align-items: flex-start;
        flex-direction: column;
    }

    .quota-value {
        font-size: 15px;
    }
}

/* 配额编辑按钮 */
.btn-edit {
    background: rgba(var(--brand-primary-rgb), 0.1);
    color: var(--brand-primary);
    border: 1px solid var(--brand-primary);
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-edit:hover {
    background: var(--brand-primary);
    color: white;
}

.btn-save {
    background: var(--brand-primary);
    color: white;
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-save:hover {
    background: var(--brand-primary-dark);
}

.btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-cancel {
    background: var(--border-light, #e0e0e0);
    color: var(--text-primary, #333);
    border: none;
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
}

.btn-cancel:hover {
    background: #bdbdbd;
}
</style>