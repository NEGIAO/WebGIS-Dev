<template>
    <div class="view-content overview-view">
        <!-- 首载骨架屏（仅首次打开时显示，轮询刷新不闪烁） -->
        <template v-if="initialLoading">
            <div class="stats-grid">
                <div
                    v-for="i in 3"
                    :key="`sk-stat-${i}`"
                    class="stat-box"
                >
                    <span class="skeleton sk-icon"></span>
                    <span class="skeleton sk-num"></span>
                    <span class="skeleton sk-name"></span>
                </div>
            </div>
            <div class="ov-card">
                <span class="skeleton sk-line w-40"></span>
                <span class="skeleton sk-bar"></span>
            </div>
            <div class="ov-card">
                <span
                    v-for="i in 4"
                    :key="`sk-row-${i}`"
                    class="skeleton sk-line"
                    :class="i % 2 ? 'w-90' : 'w-70'"
                ></span>
            </div>
        </template>

        <!-- 个人统计卡 -->
        <div v-if="!initialLoading" class="stats-grid">
            <div class="stat-box">
                <i class="fas fa-sign-in-alt stat-icon"></i>
                <span class="stat-num">{{ formatNumber(selfStats.login_count) }}</span>
                <span class="stat-name">{{ t('overview.loginCount') }}</span>
            </div>
            <div class="stat-box">
                <i class="fas fa-chart-line stat-icon"></i>
                <span class="stat-num">{{ formatNumber(selfStats.total_visit_count) }}</span>
                <span class="stat-name">{{ t('overview.visitCount') }}</span>
            </div>
            <div class="stat-box">
                <i class="fas fa-bolt stat-icon"></i>
                <span class="stat-num">{{ formatNumber(selfStats.total_api_calls) }}</span>
                <span class="stat-name">{{ t('overview.apiCalls') }}</span>
            </div>
        </div>

        <!-- API 配额进度 -->
        <div v-if="!initialLoading" class="ov-card quota-card">
            <div class="quota-head">
                <span class="ov-card-title"><i class="fas fa-gauge-high"></i> {{ t('overview.quotaToday') }}</span>
                <span
                    class="quota-value"
                    :class="{ warning: quotaWarning }"
                >{{ quotaText }}</span>
            </div>
            <div class="quota-track">
                <div
                    class="quota-fill"
                    :class="{ warning: quotaWarning, unlimited: quotaPercent === null }"
                    :style="{ width: quotaPercent === null ? '100%' : quotaPercent + '%' }"
                ></div>
            </div>
        </div>

        <!-- 个人信息 -->
        <div v-if="!initialLoading" class="ov-card">
            <div class="ov-card-title title-with-badge">
                <span><i class="fas fa-user-clock"></i> {{ t('overview.myAccount') }}</span>
                <span
                    v-if="daysSinceRegister"
                    class="days-badge"
                >{{ t('overview.accompaniedDays', { days: daysSinceRegister }) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('overview.registeredAt') }}</span>
                <span class="info-value">{{ formatDateTime(selfStats.registered_at) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('overview.lastLogin') }}</span>
                <span class="info-value">{{ formatDateTime(selfStats.last_login_at) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('overview.currentSession') }}</span>
                <span class="info-value">{{ sessionDurationText }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">{{ t('overview.currentStatus') }}</span>
                <span class="info-value text-success">
                    <span class="online-dot"></span> {{ t('overview.online') }}
                </span>
            </div>
        </div>

        <!-- 全站实时 -->
        <div v-if="!initialLoading" class="ov-card">
            <div class="ov-card-title"><i class="fas fa-globe"></i> {{ t('overview.realtime') }}</div>
            <div class="realtime-grid">
                <div class="realtime-item">
                    <span class="realtime-num">{{ formatNumber(displayOnlineUsers) }}</span>
                    <span class="realtime-name">{{ t('overview.onlineUsers') }}</span>
                </div>
                <div class="realtime-item">
                    <span class="realtime-num">{{ formatNumber(realtimeStats.total_registered_users) }}</span>
                    <span class="realtime-name">{{ t('overview.registeredUsers') }}</span>
                </div>
                <div class="realtime-item">
                    <span class="realtime-num">{{ formatNumber(realtimeStats.total_visit_count) }}</span>
                    <span class="realtime-name">{{ t('overview.totalVisits') }}</span>
                </div>
                <div class="realtime-item">
                    <span class="realtime-num">{{ formatNumber(realtimeStats.total_api_calls) }}</span>
                    <span class="realtime-name">{{ t('overview.totalApiCalls') }}</span>
                </div>
            </div>
            <p v-if="visitorLine" class="realtime-third">
                <span class="realtime-third__tag">{{ t('overview.thirdPartyLabel') }}</span>
                <span>{{ t('overview.todayVisitors') }} <b>{{ visitorLine.todayUsers }}</b></span>
                <span>{{ t('overview.todayPv') }} <b>{{ visitorLine.todayPv }}</b></span>
                <span>{{ t('overview.totalPv') }} <b>{{ visitorLine.totalPv }}</b></span>
                <span
                    v-if="visitorUpdatedAt"
                    class="realtime-third__stamp"
                    >{{ t('overview.dataUpdatedAt', { time: visitorUpdatedAt }) }}</span
                >
            </p>
            <div class="info-row contact-row">
                <span class="info-label">{{ t('overview.adminContact') }}</span>
                <button
                    v-if="adminContact"
                    type="button"
                    class="contact-copy-btn"
                    :title="contactCopied ? t('overview.copied') : t('overview.clickToCopy')"
                    @click="copyAdminContact"
                >
                    <span class="break-text">{{ adminContact }}</span>
                    <i
                        class="fas"
                        :class="contactCopied ? 'fa-check' : 'fa-copy'"
                    ></i>
                </button>
                <span
                    v-else
                    class="info-value"
                >{{ t('overview.notConfigured') }}</span>
            </div>
        </div>

        <!-- 留言板 -->
        <div v-if="!initialLoading" class="ov-card">
            <div class="ov-card-title"><i class="fas fa-comments"></i> {{ t('overview.messages') }}</div>
            <textarea
                v-model="newMessageText"
                class="user-message-input"
                :maxlength="messageMaxLen"
                :placeholder="t('overview.messagePlaceholder')"
            ></textarea>
            <div class="compose-meta">
                <span
                    class="char-count"
                    :class="{ nearly: newMessageText.length >= messageMaxLen - 20 }"
                >{{ newMessageText.length }}/{{ messageMaxLen }}</span>
            </div>
            <button
                class="btn-primary w-100"
                type="button"
                :disabled="isPostingMessage || !newMessageText.trim()"
                @click="handleSubmit"
            >
                <i
                    class="fas"
                    :class="isPostingMessage ? 'fa-spinner fa-spin' : 'fa-paper-plane'"
                ></i>
                {{ isPostingMessage ? t('overview.posting') : t('overview.postMessage') }}
            </button>

            <div class="message-list">
                <div v-if="recentMessages.length === 0" class="message-empty">
                    {{ t('overview.emptyMessages') }}
                </div>
                <div
                    v-for="item in recentMessages"
                    :key="item.id"
                    class="message-item"
                >
                    <div class="message-item-meta">
                        <span
                            class="author-avatar"
                            :style="{ background: authorColor(item.username) }"
                        >{{ authorInitial(item.username) }}</span>
                        <span class="message-author">{{ item.username || t('overview.anonymous') }}</span>
                        <span
                            class="message-time"
                            :title="formatDateTime(item.created_at)"
                        >{{ formatRelativeTime(item.created_at) }}</span>
                    </div>
                    <div class="message-item-content">{{ item.content }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./OverviewTab.ts"></script>

<style scoped>
.overview-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* ========== 首载骨架屏 ========== */
.skeleton {
    display: block;
    border-radius: 6px;
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.05) 25%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.05) 75%);
    background-size: 200% 100%;
    animation: skeletonShimmer 1.3s ease-in-out infinite;
}

@keyframes skeletonShimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
}

.sk-icon { width: 30px; height: 30px; border-radius: 9px; }
.sk-num { width: 44px; height: 18px; margin-top: 4px; }
.sk-name { width: 52px; height: 10px; margin-top: 4px; }
.sk-bar { width: 100%; height: 8px; border-radius: 999px; margin-top: 10px; }
.sk-line { height: 12px; margin: 8px 0; }
.sk-line.w-40 { width: 40%; }
.sk-line.w-70 { width: 70%; }
.sk-line.w-90 { width: 90%; }

/* ========== 统计卡 ========== */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}

.stat-box {
    background: var(--bg-primary);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 12px;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.04);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-box:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(var(--brand-primary-rgb), 0.14);
}

.stat-icon {
    font-size: 15px;
    color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.1);
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.stat-num {
    font-size: 19px;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
}

.stat-name {
    font-size: 11px;
    color: var(--text-muted);
}

/* ========== 通用卡片 ========== */
.ov-card {
    background: var(--bg-primary);
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.04);
}

.ov-card-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.ov-card-title i {
    color: var(--brand-primary);
    font-size: 12px;
}

/* ========== 配额进度 ========== */
.quota-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.quota-head .ov-card-title {
    margin-bottom: 0;
}

.quota-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--brand-primary-dark);
    font-variant-numeric: tabular-nums;
}

.quota-value.warning {
    color: var(--warning);
}

.quota-track {
    margin-top: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.1);
    overflow: hidden;
}

.quota-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--brand-primary-light), var(--brand-primary));
    transition: width 0.4s ease;
}

.quota-fill.warning {
    background: linear-gradient(90deg, var(--warning), #e08600);
}

.quota-fill.unlimited {
    background: linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.25), rgba(var(--brand-primary-rgb), 0.45));
}

/* ========== 信息行 ========== */
.info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    padding: 5px 0;
}

.info-row + .info-row {
    border-top: 1px dashed rgba(0, 0, 0, 0.05);
}

.info-label {
    color: var(--text-secondary);
    flex-shrink: 0;
}

.info-value {
    font-weight: 600;
    color: var(--text-primary);
    text-align: right;
}

.text-success {
    color: var(--brand-primary-dark);
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.online-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.18);
}

.break-text {
    max-width: 220px;
    word-break: break-word;
}

/* ========== 全站实时 ========== */
.realtime-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
}

.realtime-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 7px 2px;
    border-radius: 9px;
    background: var(--bg-secondary);
}

.realtime-num {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-brand-dark);
    font-variant-numeric: tabular-nums;
}

.realtime-name {
    font-size: 10.5px;
    color: var(--text-muted);
    white-space: nowrap;
}

/* 第三方口径行：字号与颜色都比主指标低一档，明确从属于上面的四宫格 */
.realtime-third {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
    margin: 10px 0 0;
    padding-top: 9px;
    border-top: 1px dashed var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
}

.realtime-third__tag {
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
}

.realtime-third b {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

/* 更新时间：整行末尾的次要信息，不加边框以免与指标抢注意力；
   等宽数字避免分钟位变化时行宽抖动 */
.realtime-third__stamp {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.contact-row {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed rgba(0, 0, 0, 0.06);
}

/* 卡片标题右侧徽章 */
.title-with-badge {
    justify-content: space-between;
    display: flex;
    align-items: center;
}

.days-badge {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.1);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    border-radius: 999px;
    padding: 1px 8px;
    white-space: nowrap;
}

/* 管理员联系一键复制 */
.contact-copy-btn {
    border: none;
    background: none;
    padding: 2px 4px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.15s;
    text-align: right;
}

.contact-copy-btn:hover {
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--brand-primary-dark);
}

.contact-copy-btn i {
    font-size: 11px;
    color: var(--brand-primary);
    flex-shrink: 0;
}

/* ========== 留言板 ========== */
.user-message-input {
    width: 100%;
    min-height: 70px;
    box-sizing: border-box;
    border: 1px solid var(--border-light);
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 12.5px;
    line-height: 1.55;
    font-family: inherit;
    resize: vertical;
    color: var(--text-primary);
    background: var(--bg-secondary);
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.user-message-input::placeholder {
    color: var(--text-muted);
}

.user-message-input:focus {
    outline: none;
    border-color: var(--brand-primary);
    background: var(--bg-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    border: none;
    height: 38px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 3px 10px rgba(var(--brand-primary-rgb), 0.28);
    transition: all 0.18s ease;
    margin-top: 8px;
}

.btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
    transform: translateY(-1px);
}

.btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.w-100 {
    width: 100%;
}

.message-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
}

.message-empty {
    font-size: 12px;
    color: var(--text-muted);
    text-align: center;
    border: 1px dashed var(--border-light);
    border-radius: 10px;
    padding: 12px;
}

.message-item {
    border: 1px solid rgba(0, 0, 0, 0.05);
    border-radius: 10px;
    background: var(--bg-secondary);
    padding: 8px 11px;
    transition: border-color 0.15s ease, background 0.15s ease;
}

.message-item:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.3);
    background: var(--bg-primary);
}

/* 字数计数 */
.compose-meta {
    display: flex;
    justify-content: flex-end;
    margin-top: 3px;
}

.char-count {
    font-size: 10.5px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

.char-count.nearly {
    color: var(--warning);
    font-weight: 600;
}

.message-item-meta {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    color: var(--text-muted);
}

/* 留言作者彩色首字头像 */
.author-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.message-item-meta .message-time {
    margin-left: auto;
}

.message-author {
    color: var(--brand-primary-dark);
    font-weight: 600;
}

.message-time {
    color: var(--text-muted);
    white-space: nowrap;
}

.message-item-content {
    margin-top: 4px;
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-primary);
    word-break: break-word;
}
</style>
