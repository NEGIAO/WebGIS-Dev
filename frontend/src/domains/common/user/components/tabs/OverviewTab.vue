<!--
  OverviewTab.vue
  账号中心「总览」页（重设计版）：
  - 顶部三张大数字统计卡（登录/访问/API 调用）
  - API 配额可视化进度条（用量>80% 转警示色）
  - 紧凑个人信息行 + 全站实时统计双列
  - 留言板（发布 + 列表卡片）
  数据由父组件经 props 注入，交互经 emits 上抛。
-->
<script setup>
import { computed, ref } from 'vue';

import { useLocale } from '@common/app/useLocale';

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
    /** 首次统计加载中（骨架屏；30s 轮询刷新不触发） */
    initialLoading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits([
    /** Request parent to submit the message content */
    'submit-message',
]);

const newMessageText = ref('');
const contactCopied = ref(false);
let contactCopiedTimer = null;
const { language, t } = useLocale();

const intlLocale = computed(() => (language.value === 'en-US' ? 'en-US' : 'zh-CN'));

/** 留言最大长度 */
const MESSAGE_MAX_LEN = 200;

/** 数字千分位格式化 */
function formatNumber(value) {
    const num = Number(value || 0);
    return Number.isFinite(num) ? num.toLocaleString(intlLocale.value) : '0';
}

/** 注册陪伴天数（注册时间无效时返回 null） */
const daysSinceRegister = computed(() => {
    const raw = String(props.selfStats?.registered_at || '').trim();
    if (!raw) return null;
    const registered = new Date(raw);
    if (Number.isNaN(registered.getTime())) return null;
    return Math.max(1, Math.ceil((Date.now() - registered.getTime()) / 86400000));
});

/** 相对时间：刚刚/x 分钟前/x 小时前/昨天/日期 */
function formatRelativeTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;

    const diff = Date.now() - parsed.getTime();
    if (diff < 60000) return t('overview.justNow');
    if (diff < 3600000) return t('overview.minutesAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000 && new Date().toDateString() === parsed.toDateString()) {
        return t('overview.hoursAgo', { count: Math.floor(diff / 3600000) });
    }
    const yesterday = new Date(Date.now() - 86400000);
    if (parsed.toDateString() === yesterday.toDateString()) return t('overview.yesterday');
    return parsed.toLocaleDateString(intlLocale.value, { month: '2-digit', day: '2-digit' });
}

/** 留言作者彩色首字头像：按用户名哈希取色 */
const AUTHOR_COLORS = ['#4caf50', '#2980b9', '#9b59b6', '#e67e22', '#1abc9c', '#e74c3c'];
function authorColor(name) {
    const text = String(name || t('overview.anonymousInitial'));
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
        hash = (hash * 31 + text.charCodeAt(i)) % 997;
    }
    return AUTHOR_COLORS[hash % AUTHOR_COLORS.length];
}

function authorInitial(name) {
    const text = String(name || '').trim();
    return text ? text.slice(0, 1).toUpperCase() : t('overview.anonymousInitial');
}

/** 复制成功后的按钮态切换（1.5s 还原） */
function markContactCopied() {
    contactCopied.value = true;
    if (contactCopiedTimer) clearTimeout(contactCopiedTimer);
    contactCopiedTimer = setTimeout(() => {
        contactCopied.value = false;
        contactCopiedTimer = null;
    }, 1500);
}

/** 一键复制管理员联系方式（clipboard API 不可用时降级 execCommand） */
async function copyAdminContact() {
    const text = String(props.adminContact || '').trim();
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        markContactCopied();
    } catch {
        // 非安全上下文（http 局域网访问）等场景 clipboard API 不可用，降级隐藏 textarea + execCommand
        try {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.setAttribute('readonly', '');
            helper.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
            document.body.appendChild(helper);
            helper.select();
            document.execCommand('copy');
            document.body.removeChild(helper);
            markContactCopied();
        } catch {
            /* 双通道均不可用则静默（联系方式仍可手动选中复制） */
        }
    }
}

/** 配额使用百分比（不限额时返回 null） */
const quotaPercent = computed(() => {
    const limit = Number(props.quotaInfo?.limit);
    if (!Number.isFinite(limit) || limit <= 0) return null;
    const used = Math.max(0, Number(props.quotaInfo?.used || 0));
    return Math.min(100, Math.round((used / limit) * 100));
});

/** 配额是否接近耗尽（>80% 转警示色） */
const quotaWarning = computed(() => quotaPercent.value !== null && quotaPercent.value >= 80);

function formatDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    return parsed.toLocaleString(intlLocale.value, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function handleSubmit() {
    const content = String(newMessageText.value || '').trim();
    if (!content) return;
    // 第二参为成功回调：父组件 API 成功后才清空输入框，发布失败时保留草稿（V3.4.62 A1）
    emit('submit-message', content, () => {
        newMessageText.value = '';
    });
}
</script>

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
                    <span class="realtime-num">{{ formatNumber(realtimeStats.online_users) }}</span>
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
                :maxlength="MESSAGE_MAX_LEN"
                :placeholder="t('overview.messagePlaceholder')"
            ></textarea>
            <div class="compose-meta">
                <span
                    class="char-count"
                    :class="{ nearly: newMessageText.length >= MESSAGE_MAX_LEN - 20 }"
                >{{ newMessageText.length }}/{{ MESSAGE_MAX_LEN }}</span>
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
