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

<script lang="ts" src="./ApiManagementPanel.ts"></script>
<style scoped lang="scss" src="./styles/ApiManagementPanel.scss"></style>
