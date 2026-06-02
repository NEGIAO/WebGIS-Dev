<!--
  OverviewTab.vue
  Purpose: Displays the user overview tab of the floating account panel.
  Shows personal statistics (registration date, login count, API calls, etc.),
  site-wide realtime stats, admin contact info, and a user message board.
  Parent passes data via props; user interactions bubble up via emits.
-->
<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    /** Personal statistics object (registered_at, login_count, etc.) */
    selfStats: {
        type: Object,
        default: () => ({}),
    },
    /** Quota information object (used, limit, remaining) */
    quotaInfo: {
        type: Object,
        default: () => ({}),
    },
    /** Site-wide realtime statistics (online_users, total_visit_count, etc.) */
    realtimeStats: {
        type: Object,
        default: () => ({}),
    },
    /** Admin contact string */
    adminContact: {
        type: String,
        default: '',
    },
    /** Array of recent message objects */
    recentMessages: {
        type: Array,
        default: () => [],
    },
    /** Pre-computed quota display text */
    quotaText: {
        type: String,
        default: '',
    },
    /** Pre-computed session duration display text */
    sessionDurationText: {
        type: String,
        default: '',
    },
    /** Whether a message post request is in flight */
    isPostingMessage: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** Request parent to submit the message content */
    'submit-message',
]);

const newMessageText = ref('');

function formatDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    return parsed.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function handleSubmit() {
    const content = String(newMessageText.value || '').trim();
    if (!content) return;
    emit('submit-message', content);
    newMessageText.value = '';
}
</script>

<template>
    <div class="view-content overview-view">
        <div class="info-card">
            <div class="info-row">
                <span class="info-label">注册时间</span>
                <span class="info-value">{{ formatDateTime(selfStats.registered_at) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">上次登录</span>
                <span class="info-value">{{ formatDateTime(selfStats.last_login_at) }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">本次在线时长</span>
                <span class="info-value">{{ sessionDurationText }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">当前 API 配额</span>
                <span class="info-value">{{ quotaText }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">当前状态</span>
                <span class="info-value text-success">
                    <i class="fas fa-circle active-dot"></i> 在线
                </span>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-box">
                <i class="fas fa-sign-in-alt stat-icon"></i>
                <span class="stat-num">{{ selfStats.login_count || 0 }}</span>
                <span class="stat-name">登录次数</span>
            </div>
            <div class="stat-box">
                <i class="fas fa-chart-line stat-icon"></i>
                <span class="stat-num">{{ selfStats.total_visit_count || 0 }}</span>
                <span class="stat-name">访问次数</span>
            </div>
            <div class="stat-box">
                <i class="fas fa-bolt stat-icon"></i>
                <span class="stat-num">{{ selfStats.total_api_calls || 0 }}</span>
                <span class="stat-name">API 调用</span>
            </div>
        </div>

        <div class="info-card account-extra-card">
            <div class="info-row">
                <span class="info-label">全站在线用户</span>
                <span class="info-value">{{ realtimeStats.online_users || 0 }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">全站总浏览量</span>
                <span class="info-value">{{ realtimeStats.total_visit_count || 0 }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">全站总 API 调用</span>
                <span class="info-value">{{ realtimeStats.total_api_calls || 0 }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">注册用户总数</span>
                <span class="info-value">{{ realtimeStats.total_registered_users || 0 }}</span>
            </div>
        </div>

        <div class="info-card account-extra-card">
            <div class="info-row">
                <span class="info-label">管理员联系方式</span>
                <span class="info-value break-text">{{ adminContact || '未配置' }}</span>
            </div>
        </div>

        <div class="info-card account-extra-card">
            <div class="compose-title">用户留言</div>
            <textarea
                v-model="newMessageText"
                class="user-message-input"
                placeholder="请输入你的建议或反馈，发布后所有用户都能看到"
            ></textarea>
            <button
                class="btn-primary w-100"
                type="button"
                :disabled="isPostingMessage"
                @click="handleSubmit"
            >
                <i
                    class="fas"
                    :class="isPostingMessage ? 'fa-spinner fa-spin' : 'fa-paper-plane'"
                ></i>
                {{ isPostingMessage ? '发布中...' : '发布留言' }}
            </button>

            <div class="message-list">
                <div v-if="recentMessages.length === 0" class="message-empty">
                    暂无留言
                </div>
                <div
                    v-for="item in recentMessages"
                    :key="item.id"
                    class="message-item"
                >
                    <div class="message-item-meta">
                        <span class="message-author">{{ item.username || '匿名' }}</span>
                        <span class="message-time">{{ formatDateTime(item.created_at) }}</span>
                    </div>
                    <div class="message-item-content">{{ item.content }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* View: Overview */
.info-card {
    background: rgba(16, 32, 22, 0.6);
    border-radius: 10px;
    padding: 16px;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.2);
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.4);
}

.info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
}

.info-label {
    color: #8fbc9f;
}

.info-value {
    font-weight: 600;
    color: #ffffff;
}

.text-success {
    color: var(--brand-accent-light);
    text-shadow: 0 0 6px rgba(var(--brand-accent-light-rgb), 0.5);
}

.active-dot {
    font-size: 10px;
    margin-right: 6px;
    vertical-align: middle;
    box-shadow: 0 0 8px var(--brand-accent-light);
    border-radius: 50%;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
}

.stat-box {
    background: rgba(16, 32, 22, 0.6);
    border-radius: 10px;
    padding: 16px 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.2);
    transition:
        transform 0.3s ease,
        border-color 0.3s ease,
        background 0.3s ease;
    box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.3);
}

.stat-box:hover {
    transform: translateY(-3px);
    border-color: var(--brand-accent-light);
    background: rgba(22, 44, 30, 0.8);
    box-shadow:
        inset 0 0 12px rgba(0, 0, 0, 0.3),
        0 6px 16px rgba(var(--brand-accent-light-rgb), 0.15);
}

.stat-icon {
    font-size: 20px;
    color: var(--brand-accent-light);
    filter: drop-shadow(0 0 6px rgba(var(--brand-accent-light-rgb), 0.5));
}

.stat-num {
    font-size: 18px;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 0 6px rgba(255, 255, 255, 0.3);
}

.stat-name {
    font-size: 12px;
    color: #8fbc9f;
}

.account-extra-card {
    margin-top: 12px;
}

.break-text {
    max-width: 200px;
    text-align: right;
    word-break: break-word;
}

.compose-title {
    font-size: 15px;
    font-weight: 700;
    color: #b9f7d8;
    margin-bottom: 4px;
}

.user-message-input {
    width: 100%;
    min-height: 86px;
    box-sizing: border-box;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 14px;
    resize: vertical;
    color: #fff;
    background: rgba(8, 20, 14, 0.6);
    transition: all 0.3s ease;
}

.user-message-input:focus {
    outline: none;
    border-color: var(--brand-accent-light);
    box-shadow: 0 0 10px rgba(var(--brand-accent-light-rgb), 0.3);
    background: rgba(12, 28, 18, 0.9);
}

.message-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
}

.message-empty {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    border: 1px dashed rgba(var(--brand-accent-light-rgb), 0.3);
    border-radius: 8px;
    padding: 12px;
}

.message-item {
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.25);
    border-radius: 8px;
    background: rgba(4, 12, 8, 0.4);
    padding: 10px 12px;
    transition: border-color 0.2s ease;
}

.message-item:hover {
    border-color: rgba(var(--brand-accent-light-rgb), 0.4);
}

.message-item-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
}

.message-author {
    color: #8df3b9;
    font-weight: 700;
}

.message-item-content {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.5;
    color: #f2fff8;
    word-break: break-word;
}

/* Shared button styles needed by this tab */
.btn-primary {
    background: linear-gradient(135deg, rgba(var(--brand-accent-light-rgb), 0.85) 0%, var(--brand-primary-dark) 100%);
    color: white;
    border: 1px solid rgba(var(--brand-accent-light-rgb), 0.6);
    height: 48px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
    margin-top: 8px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.btn-primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(var(--brand-accent-light-rgb), 0.35);
    border-color: var(--brand-accent-light);
    background: linear-gradient(135deg, var(--brand-accent-light) 0%, var(--brand-primary) 100%);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(0.5);
}

.w-100 {
    width: 100%;
}

/* Light Mint Theme Override */
.info-card,
.stat-box,
.message-item {
    background: rgba(255, 255, 255, 0.72);
    border-color: rgba(var(--brand-primary-rgb), 0.2);
    box-shadow: 0 4px 12px rgba(76, 130, 88, 0.08);
}

.stat-box:hover,
.message-item:hover {
    background: rgba(252, 255, 253, 0.95);
    border-color: rgba(var(--brand-primary-rgb), 0.35);
}

.info-label,
.stat-name,
.message-item-meta,
.message-empty {
    color: var(--acc-text-soft, #5d7f6a);
}

.info-value,
.stat-num,
.message-item-content,
.message-author,
.compose-title {
    color: var(--acc-text-strong, #214a31);
    text-shadow: none;
}

.text-success {
    color: var(--acc-mint-700, var(--brand-primary-dark));
    text-shadow: none;
}

.active-dot {
    color: var(--acc-mint-600, var(--brand-primary));
    box-shadow: none;
}

.stat-icon {
    color: var(--acc-mint-700, var(--brand-primary-dark));
}

.user-message-input {
    color: var(--acc-text-strong, #214a31);
    background: rgba(255, 255, 255, 0.92);
    border-color: rgba(var(--brand-primary-rgb), 0.3);
}

.user-message-input::placeholder {
    color: #88a797;
}

.user-message-input:focus {
    border-color: rgba(var(--brand-primary-rgb), 0.52);
    box-shadow: 0 0 0 3px rgba(var(--brand-accent-light-rgb), 0.18);
    background: #ffffff;
}

.btn-primary {
    background: linear-gradient(135deg, var(--brand-primary-light) 0%, var(--brand-primary) 100%);
    border-color: rgba(63, 148, 75, 0.55);
    color: #f8fff9;
    box-shadow: 0 6px 16px rgba(58, 129, 76, 0.24);
    text-shadow: none;
}

.btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, var(--brand-primary-lighter) 0%, var(--brand-accent) 100%);
    box-shadow: 0 8px 18px rgba(58, 129, 76, 0.3);
}
</style>
