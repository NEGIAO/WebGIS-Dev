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
            @click.capture="onTabsNavClickCapture"
        >
            <button
                v-for="tab in tabs"
                :id="`admin-tab-${tab.id}`"
                :key="tab.id"
                type="button"
                role="tab"
                class="tab-btn"
                :class="{ active: activeTab === tab.id }"
                :aria-selected="activeTab === tab.id"
                :aria-controls="`admin-panel-${tab.id}`"
                @click="scrollTabIntoView(tab.id); selectTab(tab.id)"
            >
                <component :is="tab.icon" class="tab-btn__icon" :size="18" aria-hidden="true" />
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
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-overview"
            >
                <!-- <div class="panel-header-banner">
            
                </div> -->

                <!-- KPI Grid with Visual Dominance -->
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.dataTable') }}</span>
                            <span class="kpi-value">{{ overview.table_count }}</span>
                        </div>
                    </div>

                    <div class="kpi-card">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.users') }}</span>
                            <span class="kpi-value">{{ overview.total_users }}</span>
                        </div>
                    </div>

                    <div class="kpi-card">
                        <div class="kpi-icon">
                            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <div class="kpi-body">
                            <span class="kpi-label">{{ t('admin.onlineSessions') }}</span>
                            <span class="kpi-value">{{ overview.total_sessions }}</span>
                        </div>
                    </div>

                    <div class="kpi-card">
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
                            v-for="(configured, label) in overview.l3_env_status"
                            :key="label"
                            class="env-item"
                        >
                            <span class="env-name">{{ label }}</span>
                            <span :class="['status-badge', configured ? 'is-configured' : 'is-unset']">
                                <span class="dot"></span>
                                {{
                                    configured
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
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-system"
            >

                <div class="grid-layout-2col">
                    <!-- 模块 1: 运营广播 -->
                    <div class="card accent-top-blue">
                        <div class="card-header">
                            <div>
                                <h3 class="card-title"><Megaphone :size="16" /> 运营公告与联系人</h3>
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

                            <hr class="divider" />

                            <div class="form-group">
                                <label class="field-label">{{ t('admin.proxyRateLimitLabel') }}</label>
                                <input
                                    v-model.number="proxyRateLimit"
                                    class="form-input"
                                    type="number"
                                    min="0"
                                    max="100000"
                                    :placeholder="t('admin.proxyRateLimitPlaceholder')"
                                />
                                <p class="field-hint">{{ t('admin.proxyRateLimitHint') }}</p>
                                <div class="form-actions-right">
                                    <button
                                        class="btn btn-secondary"
                                        type="button"
                                        :disabled="submittingConfig"
                                        @click="handleSaveProxyRateLimit"
                                    >
                                        {{ t('admin.saveProxyRateLimit') }}
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
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-agent"
            >

                <!-- LLM Config Card -->
                <div class="card accent-left-purple">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title"><MonitorDot :size="16" /> {{ t('admin.llmConfigTitle') }}</h3>
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
                            <h3 class="card-title"><Globe :size="16" /> {{ t('admin.mapDefaultConfig') }}</h3>
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
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-database"
            >

                <div class="card accent-top-amber">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title"><Database :size="16" /> {{ t('admin.dbManagement') }}</h3>
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
                            <input
                                v-model="dbSearch"
                                class="toolbar-search"
                                type="text"
                                :placeholder="t('admin.searchRows')"
                            />
                            <span class="badge info">{{ filteredRowCount }}</span>
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

                        <div class="toolbar-pager">
                            <select v-model.number="tablePageSize" class="form-select inline-select page-size-select">
                                <option :value="30">30</option>
                                <option :value="100">100</option>
                                <option :value="200">200</option>
                                <option :value="0">{{ t('admin.pageSizeAll') }}</option>
                            </select>
                            <button
                                class="btn btn-secondary btn-sm"
                                type="button"
                                :disabled="loadingRows || !tablePageSize || tablePage <= 1"
                                @click="goToPage(tablePage - 1)"
                            >
                                {{ t('admin.prevPage') }}
                            </button>
                            <span v-if="!loadingRows" class="pager-info">
                                {{ t('admin.pageInfo', { current: tablePage, total: totalPages }) }}
                            </span>
                            <span v-else class="spinner"></span>
                            <button
                                class="btn btn-secondary btn-sm"
                                type="button"
                                :disabled="loadingRows || !tablePageSize || tablePage >= totalPages"
                                @click="goToPage(tablePage + 1)"
                            >
                                {{ t('admin.nextPage') }}
                            </button>
                            <button
                                class="btn btn-secondary btn-sm"
                                type="button"
                                :disabled="exportingCsv || loadingRows"
                                @click="exportCsv"
                            >
                                {{ exportingCsv ? t('admin.exportingCsv') : t('admin.exportCsv') }}
                            </button>
                        </div>
                    </div>

                    <!-- Rows View Container -->
                    <div class="rows-container">
                        <div v-if="!loadingRows && rowRange && tableTotal > 0" class="rows-info-bar">
                            <span class="badge info">
                                {{ t('admin.rowRange', { ...rowRange, total: tableTotal }) }}
                            </span>
                        </div>
                        <div v-if="loadingRows" class="empty-state">
                            <span class="spinner"></span> 正在读取数据表行记录...
                        </div>
                        <div v-else-if="sortedTableRows.length > 0" class="data-table-wrapper">
                            <table class="data-table">
                            <thead>
                                <tr>
                                    <th scope="col" class="row-index-th">#</th>
                                    <th
                                        v-for="col in selectedTableMeta?.columns"
                                        :key="col.name"
                                        scope="col"
                                        class="sortable-th"
                                        :class="{ active: dbSortKey === col.name }"
                                        @click="toggleDbSort(col.name)"
                                    >
                                        <span class="th-content">
                                            {{ col.name }}
                                            <span class="sort-icon" aria-hidden="true">
                                                {{ dbSortKey === col.name ? (dbSortDir === 'asc' ? '▲' : '▼') : '⇅' }}
                                            </span>
                                        </span>
                                    </th>
                                    <th scope="col" class="actions-th">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <template v-for="(row, index) in sortedTableRows" :key="getRowKey(row)">
                                    <!-- 正常浏览行 -->
                                    <tr v-if="editingRowKey !== getRowKey(row)" class="data-row" :class="{ 'row-hit': isRowHit(row) }">
                                        <td class="row-index-td">{{ rowStartIndex + index }}</td>
                                        <td
                                            v-for="col in selectedTableMeta?.columns"
                                            :key="col.name"
                                            :class="{ 'cell-editing': editingCell === `${getRowKey(row)}:${col.name}` }"
                                            @click="startEditCell(row, col.name)"
                                        >
                                            <div v-if="editingCell === `${getRowKey(row)}:${col.name}`" class="cell-edit-wrapper" @click.stop>
                                                <input
                                                    :ref="setCellInputRef"
                                                    v-model="editingCellValue"
                                                    class="cell-edit-input"
                                                    type="text"
                                                    @keyup.enter="saveEditCell(row, col.name)"
                                                    @keyup.esc="cancelEditCell"
                                                />
                                                <button class="btn-icon" title="保存" @click="saveEditCell(row, col.name)"><Check :size="14" /></button>
                                                <button class="btn-icon" title="取消" @click="cancelEditCell"><X :size="14" /></button>
                                            </div>
                                            <!-- 内容先经 escapeHtmlText 转义、再拼自产 <mark> 高亮标签，无外部 HTML 注入面 -->
                                            <!-- eslint-disable-next-line vue/no-v-html -->
                                            <span v-else class="cell-value" v-html="highlightCell(row, col.name)"></span>
                                        </td>
                                        <td class="actions-cell">
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
                                        </td>
                                    </tr>
                                    <!-- 行展开编辑模式（保留行号列，内容列 colspan = 列数 + 操作列） -->
                                    <tr v-else class="data-row editing-row">
                                        <td class="row-index-td">{{ rowStartIndex + index }}</td>
                                        <td :colspan="(selectedTableMeta?.columns?.length || 0) + 1">
                                            <div class="edit-row-container">
                                                <div class="edit-row-header">
                                                    <span class="editing-tag"><NotebookPen :size="14" /> 编辑 JSON 记录</span>
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
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                            </table>
                        </div>
                        <div v-else class="empty-state">
                            {{ dbSearch.trim() ? t('admin.searchNoMatch') : t('admin.rowsEmpty') }}
                        </div>
                    </div>

                    <!-- Insert Record Section -->
                    <div class="insert-section">
                        <div class="insert-section-header">
                            <h4 class="section-subtitle"><Plus :size="16" /> {{ t('admin.addRowTitle') }}</h4>
                            <button
                                class="btn-text"
                                type="button"
                                @click="showInsertRow = !showInsertRow"
                            >
                                {{ showInsertRow ? '收起' : '展开' }}
                            </button>
                        </div>
                        <div v-show="showInsertRow" class="data-table-wrapper">
                            <table class="data-table insert-table">
                            <thead>
                                <tr>
                                    <th
                                        v-for="col in selectedTableMeta?.columns"
                                        :key="col.name"
                                        scope="col"
                                    >
                                        {{ col.name }}
                                    </th>
                                    <th scope="col" class="actions-th">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr class="data-row insert-row">
                                    <td
                                        v-for="col in selectedTableMeta?.columns"
                                        :key="col.name"
                                    >
                                        <input
                                            v-model="insertRowData[col.name]"
                                            class="insert-input"
                                            type="text"
                                            :placeholder="col.type || col.name"
                                        />
                                    </td>
                                    <td class="actions-cell">
                                        <button
                                            class="btn-text"
                                            type="button"
                                            @click="resetInsertRow"
                                        >
                                            清空
                                        </button>
                                        <button
                                            class="btn btn-primary btn-sm"
                                            type="button"
                                            :disabled="submittingTable"
                                            @click="handleInsertRow"
                                        >
                                            {{ t('admin.insertToTable') }}
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<script lang="ts" src="./AdminControlPanel.ts"></script>

<style scoped>
/* ==========================================================================
   Design Tokens & Modern Color Hierarchy
   ========================================================================== */
.admin-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    font-family: var(--font-base);
    overflow: hidden;
    /* 容器查询基准（V3.6.38）：
       本组件恒挂在 FloatingAccountPanel 内，宽度被宿主锁死为 min(430px, 96vw)，
       与视口宽度无关。原适配规则用 @media (max-width: 768px)，在 1920px 桌面视口下
       永不触发，导致 .db-toolbar 按桌面宽度排版后被 .card 的 overflow:hidden 裁掉。
       改为以自身宽度为断点：悬浮态内容宽 ≈394px，全屏态 = 视口宽。 */
    container-type: inline-size;
    container-name: admin-panel;
}

/* ==========================================================================
   Tabs Navigation
   ========================================================================== */
.tabs-nav {
    display: flex;
    flex-wrap: nowrap;
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.14);
    border-radius: var(--radius-lg);
    background:
        linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.6)),
        radial-gradient(circle at 10% 0%, rgba(var(--brand-primary-rgb), 0.08), transparent 34%);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: rgba(var(--brand-primary-rgb), 0.3) transparent;
    -webkit-overflow-scrolling: touch;
    scroll-behavior: smooth;
}

.tabs-nav::-webkit-scrollbar { height: 4px; }
.tabs-nav::-webkit-scrollbar-track { background: transparent; }
.tabs-nav::-webkit-scrollbar-thumb { background: rgba(var(--brand-primary-rgb), 0.3); border-radius: 2px; }

.tab-btn {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 180px;
    min-height: 60px;
    padding: 10px 14px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.7);
    color: var(--text-secondary);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-btn:hover {
    color: var(--text-primary);
    background: var(--bg-primary);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.tab-btn.active {
    border-color: rgba(var(--brand-primary-rgb), 0.4);
    background: linear-gradient(135deg, var(--bg-primary), rgba(var(--brand-primary-rgb), 0.06));
    color: var(--brand-primary-dark);
    box-shadow: 0 8px 20px rgba(var(--brand-primary-rgb), 0.15);
}

.tab-btn__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-md);
    background: rgba(0, 0, 0, 0.04);
    color: var(--text-secondary);
    font-size: 16px;
}

.tab-btn.active .tab-btn__icon {
    color: var(--brand-primary);
    background: var(--bg-primary);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
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
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ==========================================================================
   Main Body Scroll Region
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

/* ==========================================================================
   Card Hierarchy
   ========================================================================== */
.card {
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    overflow: hidden;
}

.card[class*="accent-"] { border-color: var(--border-light); }
.card.accent-left-emerald,
.card.accent-left-purple { border-left: 4px solid var(--brand-primary); }
.card.accent-top-blue,
.card.accent-top-amber { border-top: 3px solid var(--brand-primary); }

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
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
}

.card-title svg {
    color: var(--brand-primary);
    flex-shrink: 0;
}

.card-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
}

.card-subtitle code {
    background: var(--bg-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    color: var(--brand-primary);
}

/* ==========================================================================
   KPI Cards Grid
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
    border-radius: var(--radius-lg);
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-bottom: 3px solid var(--brand-primary);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.kpi-card .kpi-icon {
    background: rgba(var(--brand-primary-rgb), 0.12);
    color: var(--brand-primary-dark);
}

.kpi-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
}

.kpi-body { display: flex; flex-direction: column; }
.kpi-label { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
.kpi-value { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height: 1.2; }

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
    border-radius: var(--radius-md);
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
}

.env-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }

.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
}

.status-badge .dot { width: 6px; height: 6px; border-radius: 50%; }

.status-badge.is-configured {
    background: rgba(var(--success-rgb), 0.12);
    color: var(--brand-primary-dark);
}
.status-badge.is-configured .dot { background: var(--success); }

.status-badge.is-unset {
    background: var(--bg-secondary);
    color: var(--text-secondary);
}
.status-badge.is-unset .dot { background: var(--text-muted); }

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
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
}

.section-box-tag {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.form-stack { display: flex; flex-direction: column; gap: 14px; }

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

.form-group { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.field-hint { margin: 2px 0 0; font-size: 11px; color: var(--text-secondary); }

.form-input,
.form-textarea,
.form-select {
    width: 100%;
    padding: 8px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
    box-sizing: border-box;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    outline: none;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.12);
}

.form-textarea { resize: vertical; min-height: 68px; }
.form-textarea.monospace {
    font-family: var(--font-mono);
    font-size: 12px;
}

.field-action-group { display: flex; gap: 8px; }

.form-inline-action {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.inline-buttons { display: flex; gap: 8px; }

.form-actions-right {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
}

.border-top-pt {
    border-top: 1px solid var(--border-light);
    padding-top: 12px;
}

.form-inline-checkbox { display: flex; align-items: center; }

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
    border-top: 1px dashed var(--border-light);
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
    border-radius: var(--radius-md);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    border: 1px solid transparent;
    white-space: nowrap;
}

.btn-primary { background: var(--brand-primary); color: var(--text-on-brand); }
.btn-primary:hover:not(:disabled) { background: var(--brand-primary-dark); }

.btn-secondary {
    background: var(--bg-secondary);
    border-color: var(--border-light);
    color: var(--text-primary);
}
.btn-secondary:hover:not(:disabled) { background: var(--bg-hover); }

.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-sm);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}
.btn-icon:hover { background: var(--bg-hover); }

.btn-text {
    background: transparent;
    border: none;
    color: var(--brand-primary);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
}

.btn-text.danger { color: var(--danger); }

.mt-2 { margin-top: 8px; }
.flex-1 { flex: 1; }

/* ==========================================================================
   Database Toolbar
   ========================================================================== */
.db-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
    flex-wrap: wrap;
}

.select-wrapper { display: flex; align-items: center; gap: 8px; }
.toolbar-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.inline-select { width: auto; min-width: 180px; }

.toolbar-stats { display: flex; align-items: center; gap: 8px; }

.toolbar-pager { display: flex; align-items: center; gap: 8px; }
.page-size-select { min-width: 88px; }
.pager-info { font-size: 12px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }

.toolbar-search {
    padding: 5px 10px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    font-size: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    width: 180px;
}
.toolbar-search:focus {
    border-color: var(--brand-primary);
    outline: none;
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.15);
}

.badge { padding: 3px 8px; border-radius: var(--radius-md); font-size: 11px; font-weight: 600; }
.badge.info { background: rgba(var(--warning-rgb), 0.15); color: var(--warning); }
.badge.secondary { background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-light); }

/* ==========================================================================
   Rows Container & Data Table
   ========================================================================== */
.rows-container {
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    max-height: 480px;
    overflow: auto;
    background: var(--bg-secondary);
}

.rows-info-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
}

/* 行号列 */
.row-index-th {
    width: 46px;
    text-align: center;
    color: var(--text-muted);
}
.row-index-td {
    text-align: center;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    user-select: none;
}

.data-table-wrapper { overflow-x: auto; }

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
}

.data-table thead { position: sticky; top: 0; z-index: 1; }

.data-table th {
    background: var(--bg-primary);
    border-bottom: 2px solid var(--border-light);
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
}

.data-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
}

.data-row:hover { background: var(--bg-hover); }

/* 搜索命中整行弱高亮 */
.data-row.row-hit,
.data-row.row-hit:hover { background: rgba(var(--warning-rgb), 0.07); }

/* 搜索命中单元格片段高亮（v-html 注入内容需 :deep 穿透 scoped） */
.cell-value :deep(mark.search-hit) {
    background: rgba(var(--warning-rgb), 0.38);
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
}

/* 排序表头 */
.sortable-th { cursor: pointer; user-select: none; }
.sortable-th:hover { color: var(--text-primary); background: var(--bg-hover); }
.sortable-th.active { color: var(--brand-primary); }

.th-content { display: inline-flex; align-items: center; gap: 4px; }
.sort-icon { font-size: 10px; opacity: 0.5; }
.sortable-th.active .sort-icon { opacity: 1; }

/* 单元格行内编辑 */
.cell-value {
    cursor: pointer;
    display: block;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 4px;
    border-radius: var(--radius-sm);
}
.cell-value:hover { background: var(--bg-hover); }

.cell-editing { padding: 0 !important; }

.cell-edit-wrapper { display: flex; align-items: center; gap: 4px; }

.cell-edit-input {
    flex: 1;
    min-width: 60px;
    padding: 4px 6px;
    border: 1px solid var(--brand-primary);
    border-radius: var(--radius-sm);
    font-size: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
}

.actions-cell { white-space: nowrap; text-align: right; }
.actions-th { width: 1%; white-space: nowrap; }

/* 行展开编辑模式 */
.editing-row td {
    padding: 12px;
    background: rgba(var(--brand-primary-rgb), 0.04);
}

.edit-row-container { display: flex; flex-direction: column; gap: 8px; }
.edit-row-header { display: flex; align-items: center; justify-content: space-between; }

.editing-tag {
    font-size: 11px;
    font-weight: 700;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.15);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.editing-tag svg {
    color: var(--brand-primary);
}

.edit-json-textarea { width: 100%; border-color: var(--brand-primary); }

.row-card-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

/* ===== Insert Section ===== */
.insert-section {
    margin-top: 8px;
    border-top: 1px solid var(--border-light);
    padding-top: 14px;
}

.insert-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.insert-table { margin-top: 12px; }

.insert-row td {
    padding: 4px 6px;
    background: rgba(var(--brand-primary-rgb), 0.03);
}

.insert-input {
    width: 100%;
    padding: 5px 8px;
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    font-size: 12px;
    background: var(--bg-primary);
    color: var(--text-primary);
    box-sizing: border-box;
}
.insert-input:focus {
    border-color: var(--brand-primary);
    outline: none;
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.15);
}

.section-subtitle {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 6px;
}

.section-subtitle svg {
    color: var(--brand-primary);
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    color: var(--text-secondary);
    font-size: 13px;
}

/* ==========================================================================
   Loading Spinner
   ========================================================================== */
.status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
}

.spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--brand-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.spinning { animation: spin 0.8s linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

/* ==========================================================================
   Responsive Adaptations — 容器查询（V3.6.38）
   ==========================================================================
   为什么不是 @media：面板宽度恒为 min(430px, 96vw)，桌面端 1920px 视口下面板
   内容宽仍只有 ~394px。用视口断点会出现「视口很宽、容器很窄」的错配——正是数据
   管理页工具栏被裁切的成因。以下断点一律以 .admin-layout 自身宽度为准：
     ≤640px：卡片头部竖排 / 双列网格降单列 / 工具栏三组竖排（覆盖悬浮态与平板全屏）
     ≤440px：页签 2×2 / 内边距压缩 / 数据表加密度（仅悬浮态与手机全屏）
   ========================================================================== */
@container admin-panel (max-width: 640px) {
    /* 卡片头部：标题块在上、操作按钮右对齐在下，避免按钮被标题挤成窄条 */
    .card-header {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
    }
    .header-actions {
        display: flex;
        justify-content: flex-end;
    }

    /* 双列网格降单列：minmax(340px, 1fr) 的 340px 下限 > 卡片内容宽 332px，
       必然横向溢出并被 .card 的 overflow:hidden 裁掉右侧 */
    .grid-layout-2col {
        grid-template-columns: 1fr;
    }

    /* 工具栏三组（表选择 / 统计 / 分页）竖排堆叠，组内再按需换行 */
    .db-toolbar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 10px;
    }
    .select-wrapper {
        gap: 6px;
    }
    /* 下拉框吃掉标签之外的剩余宽度，不再依赖 min-width:180px 撑开 */
    .select-wrapper .inline-select {
        flex: 1 1 auto;
        width: auto;
        min-width: 0;
    }
    .toolbar-stats {
        flex-wrap: wrap;
        gap: 6px;
    }
    /* 搜索框独占一行：与两个徽标 + 刷新按钮同行时会被压到 120px 以下 */
    .toolbar-search {
        flex: 1 1 100%;
        width: auto;
        min-width: 0;
    }
    .toolbar-pager {
        flex-wrap: wrap;
        gap: 6px;
    }
    /* 导出按钮先于页码信息换行（order 5 < 10），页码信息独占末行居中 */
    .toolbar-pager .btn:last-child {
        order: 5;
        margin-left: auto;
    }
    .toolbar-pager .pager-info {
        order: 10;
        flex: 1 1 100%;
        display: flex;
        justify-content: center;
    }

    /* 行区高度封顶：避免内层滚动区吃掉整块可视高度，把工具栏挤出视野 */
    .rows-container {
        max-height: min(420px, 45vh);
    }
}

@container admin-panel (max-width: 440px) {
    /* 页签降为 2×2 网格：4×180px 在 394px 面板内需横向滚动才能点到「数据管理」，
       且滚动条仅 4px 高、无视觉提示。两行排布换取零滚动。 */
    .tabs-nav {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        padding: 8px;
        overflow: hidden;
    }
    .tab-btn {
        min-width: 0;
        min-height: 46px;
        padding: 6px 8px;
        gap: 8px;
    }
    .tab-btn__icon {
        flex: 0 0 26px;
        width: 26px;
        height: 26px;
    }
    .tab-btn__label {
        font-size: 12px;
    }
    .tab-btn__desc {
        font-size: 10px;
    }

    /* 内边距压缩：把宽度还给数据表（18+12+18 → 14+10+14，净得 10px） */
    .admin-body {
        padding: 10px;
    }
    .card {
        padding: 14px;
        gap: 12px;
    }
    .card-subtitle {
        font-size: 11px;
    }

    /* 数据表加密度：行号列 46→30px，单元格左右留白 10→6px */
    .row-index-th,
    .row-index-td {
        width: 30px;
    }
    .data-table th,
    .data-table td {
        padding-left: 6px;
        padding-right: 6px;
    }
    .cell-value {
        max-width: 130px;
    }

    .rows-container {
        max-height: min(340px, 40vh);
    }
}

</style>
