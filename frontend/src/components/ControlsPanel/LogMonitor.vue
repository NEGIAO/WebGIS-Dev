<template>
    <div class="webgis-log-panel">
        <div class="panel-header">
            <div class="status-info">
                <Terminal
                    :size="14"
                    class="header-icon"
                />
                <div
                    v-if="displaySourceLabel === 'REMOTE'"
                    class="log-type-switcher"
                >
                    <button
                        :class="['type-btn', { active: currentType === 'run' }]"
                        @click="switchType('run')"
                    >
                        RUN
                    </button>
                    <button
                        :class="['type-btn', { active: currentType === 'build' }]"
                        @click="switchType('build')"
                    >
                        BUILD
                    </button>
                </div>
                <span class="title">TERMINAL</span>
                <div class="divider"></div>

                <div
                    class="lock-scroll-option"
                    @click="isLocked = !isLocked"
                >
                    <div :class="['custom-checkbox', { checked: isLocked }]">
                        <div
                            v-if="isLocked"
                            class="inner-check"
                        ></div>
                    </div>
                    <span class="lock-text">Lock scroll</span>
                </div>

                <div class="divider"></div>
                <span
                    :class="[
                        'status-dot',
                        { active: isConnected, pending: streamDesired && !isConnected },
                    ]"
                ></span>
                <span class="env-hint">{{ displaySourceLabel }}</span>
            </div>
            <div class="header-actions">
                <button
                    type="button"
                    class="action-btn secondary"
                    :disabled="logEntries.length === 0"
                    @click="copyAllLogs"
                >
                    <component
                        :is="isCopiedAll ? Check : Copy"
                        :size="14"
                    />
                    <span class="btn-label">{{ isCopiedAll ? '已复制' : '复制全部' }}</span>
                </button>

                <button
                    type="button"
                    class="action-btn secondary"
                    :disabled="logEntries.length === 0"
                    @click="clearLogs"
                >
                    <Trash2 :size="14" />
                    清空
                </button>

                <button
                    type="button"
                    :class="['action-btn', streamDesired ? 'danger' : 'success']"
                    @click="toggleConnection"
                >
                    <component
                        :is="streamDesired ? Square : Play"
                        :size="14"
                    />
                    {{ streamDesired ? '停止' : '开启' }}
                </button>
            </div>
        </div>

        <div
            ref="scrollContainer"
            class="log-viewport"
        >
            <div
                v-for="(log, index) in logEntries"
                :key="index"
                class="log-line"
                title="双击复制此行内容"
                @dblclick="copySingleLine(log.message)"
            >
                <span class="line-number">{{ index + 1 }}</span>
                <span class="timestamp">{{ log.time }}</span>
                <!-- 优化：改为直接从对象读取预计算好的类名 -->
                <span :class="['content', log.className]">{{ log.message }}</span>
            </div>
            <div
                v-if="logEntries.length === 0"
                class="empty-tip"
            >
                Waiting for logs...<span class="scan-line"></span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onUnmounted, computed } from 'vue';
import { Terminal, Play, Square, Trash2, Copy, Check } from 'lucide-vue-next';
import { BACKEND_BASE_URL } from '../../api/backend';

const props = defineProps({
    visible: { type: Boolean, default: true },
    maxLines: { type: Number, default: 2500 },
});

const logEntries = ref([]);
const isConnected = ref(false);
const streamDesired = ref(false);
const isLocked = ref(false); // 控制滚动锁定
const scrollContainer = ref(null);
const isCopiedAll = ref(false);
const currentType = ref('run');
let eventSource = null;

// 缓冲区优化逻辑
let logBuffer = [];
let renderPending = false;

const logsStreamUrl = computed(() => {
    const base = String(BACKEND_BASE_URL || '').replace(/\/$/, '');
    return `${base}/monitor/logs/stream?type=${currentType.value}`;
});

// 匹配 HTTP 状态码模式：如 " 503 ", " 404 ", "HTTP/1.1\" 500" 等
const HTTP_STATUS_RE = /\b([1-5]\d{2})\b/g;

function getLogClass(msg) {
    const text = msg.toUpperCase();

    // 1. 优先识别严重错误 (包含 FAILED, ERROR)
    if (text.includes('ERROR') || text.includes('FAILED')) return 'log-error';

    // 2. 识别 HTTP 错误状态码（4xx / 5xx）—— 优先于 INFO/WARN 关键字
    //    uvicorn 格式: INFO: 10.x.x.x:port - "GET /path HTTP/1.1" 503 Service Unavailable
    //    其中 503 不含 ERROR 字样，但属于明确的服务端错误
    const statusMatches = [...msg.matchAll(HTTP_STATUS_RE)];
    if (statusMatches.length > 0) {
        // 取最后一个匹配的状态码（通常在行尾，如 "200 OK" 或 "503 Service Unavailable"）
        const lastCode = Number(statusMatches[statusMatches.length - 1][1]);
        if (lastCode >= 500) return 'log-error';       // 5xx 服务端错误 → 红色
        if (lastCode >= 400) return 'log-warning';      // 4xx 客户端错误 → 黄色
        if (lastCode >= 200 && lastCode < 300) return 'log-success'; // 2xx 成功 → 绿色
    }

    // 3. 识别通用警告 (WARNING)
    if (text.includes('WARN')) return 'log-warning';

    // 4. 识别成功状态（非 HTTP 日志的 SUCCESS 关键字）
    if (text.includes('SUCCESS')) return 'log-success';

    // 5. 业务流程标签
    if (text.includes('[BUILD]')) return 'log-build';
    if (text.includes('[RUN]')) return 'log-run';
    if (text.includes('INFO')) return 'log-info';

    return '';
}

/**
 * 核心滚动逻辑：
 * 只要不是锁定状态，就强制滚动到底部
 */
const scrollToBottom = () => {
    if (scrollContainer.value) {
        // 直接赋值为当前总高度，确保滚动到底部
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
};

/**
 * 缓冲区冲刷逻辑
 */
function pushLine(message) {
    const timeString = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    logBuffer.push({
        message: String(message ?? ''),
        time: timeString,
        className: getLogClass(String(message ?? '')),
    });

    if (!renderPending) {
        renderPending = true;
        requestAnimationFrame(() => {
            logEntries.value.push(...logBuffer);
            logBuffer = [];

            if (logEntries.value.length > props.maxLines) {
                logEntries.value.splice(0, logEntries.value.length - props.maxLines);
            }

            // 只有在用户没有锁定滚动时，才执行强制滚动
            if (!isLocked.value) {
                scrollToBottom();
            }
            renderPending = false;
        });
    }
}

function switchType(type) {
    if (currentType.value === type) return;
    currentType.value = type;
    if (streamDesired.value) {
        closeConnection();
        openConnection();
    }
}

function clearLogs() {
    logEntries.value = [];
}

async function copyAllLogs() {
    if (logEntries.value.length === 0) return;
    const fullText = logEntries.value.map((log) => `[${log.time}] ${log.message}`).join('\n');
    try {
        await navigator.clipboard.writeText(fullText);
        isCopiedAll.value = true;
        setTimeout(() => (isCopiedAll.value = false), 2000);
    } catch (err) {
        console.error('复制失败:', err);
    }
}

async function copySingleLine(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error(err);
    }
}

const displaySourceLabel = computed(() => {
    try {
        const u = new URL(logsStreamUrl.value);
        return u.hostname === 'localhost' ? 'LOCAL' : 'REMOTE';
    } catch {
        return 'UNKNOWN';
    }
});

const toggleConnection = () => {
    if (streamDesired.value) closeConnection();
    else openConnection();
};

function closeConnection() {
    streamDesired.value = false;
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    isConnected.value = false;
}

function openConnection() {
    streamDesired.value = true;
    eventSource = new EventSource(logsStreamUrl.value);
    eventSource.onopen = () => (isConnected.value = true);
    eventSource.onmessage = (e) => pushLine(e.data);
    eventSource.onerror = () => closeConnection();
}

onUnmounted(() => closeConnection());
</script>

<style scoped>
/* 保持原本的所有样式 */
.log-type-switcher {
    display: flex;
    background: #27272a;
    padding: 2px;
    border-radius: 4px;
}

.type-btn {
    padding: 2px 10px;
    font-size: 10px;
    border: none;
    background: transparent;
    color: #71717a;
    cursor: pointer;
    border-radius: 2px;
    font-weight: 700;
    transition: all 0.2s;
}

.type-btn.active {
    background: #3f3f46;
    color: #f4f4f5;
}

.webgis-log-panel {
    width: 40%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #09090b;
    color: #e4e4e7;
    border: 1px solid #27272a;
    border-radius: 6px;
    font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.panel-header {
    background: #18181b;
    padding: 6px 12px;
    min-height: 36px;
    height: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #27272a;
    flex-wrap: wrap;
    gap: 6px;
}

.status-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #a1a1aa;
}

.divider {
    width: 1px;
    height: 14px;
    background: #3f3f46;
}

.env-hint {
    font-size: 10px;
    background: #27272a;
    padding: 1px 6px;
    border-radius: 4px;
    color: #71717a;
}

.header-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    border: 1px solid transparent;
    white-space: nowrap;
    /* 防止按钮文字换行 */
    flex-shrink: 0;
    /* 防止按钮被压缩 */
}

.action-btn.secondary {
    background: transparent;
    color: #a1a1aa;
}

.action-btn.secondary:hover {
    color: #f4f4f5;
    background: #27272a;
}

.action-btn.success {
    background: #166534;
    color: #bbf7d0;
}

.action-btn.danger {
    background: #7f1d1d;
    color: #fecaca;
}

.log-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    scrollbar-width: thin;
    scrollbar-color: #3f3f46 transparent;
}

.log-line {
    display: flex;
    padding: 1px 12px;
    gap: 12px;
    line-height: 1.6;
    font-size: 12px;
    transition: background 0.1s;
}

.log-line:hover {
    background: #18181b;
}

.line-number {
    color: #0bb867;
    width: 24px;
    text-align: right;
    user-select: none;
}

.timestamp {
    color: #52525b;
    flex-shrink: 0;
    font-size: 11px;
}

.content {
    word-break: break-all;
    white-space: pre-wrap;
    color: #d4d4d8;
}

.log-error {
    color: #f87171 !important;
    font-weight: 500;
}

.log-warning {
    color: #fbbf24 !important;
}

.log-info {
    color: #109942 !important;
}

.log-success {
    color: #4ade80 !important;
}

.log-build {
    color: #0e13a3 !important;
    font-weight: 500;
}

.log-run {
    color: #1ab142 !important;
    font-weight: 500;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3f3f46;
    transition: all 0.3s;
}

.status-dot.active {
    background: #22c55e;
    box-shadow: 0 0 8px #22c55e;
}

.status-dot.pending {
    background: #eab308;
}

/* --- 按照图片新增的 Lock scroll 样式 --- */
.lock-scroll-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 2px 4px;
    user-select: none;
    white-space: nowrap;
    /* 防止文字换行 */
}

.custom-checkbox {
    width: 14px;
    height: 14px;
    border: 1px solid #3f3f46;
    border-radius: 3px;
    background: #18181b;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.custom-checkbox.checked {
    border-color: #52525b;
    background: #27272a;
}

.inner-check {
    width: 6px;
    height: 6px;
    background: #5dce3a;
    border-radius: 1px;
}

.lock-text {
    font-size: 11px;
    color: #d4d8d6;
    /* 稍微亮一点，符合图片感观 */
    font-weight: 500;
}

.lock-scroll-option:hover .lock-text {
    color: #ffffff;
}

.empty-tip {
    padding: 20px;
    color: #3f3f46;
    font-style: italic;
}

.scan-line {
    width: 2px;
    height: 14px;
    background: #4ade80;
    display: inline-block;
    animation: blink 1s infinite;
    vertical-align: middle;
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

/* 平板横屏适配 (iPad 横屏: 1024px ~ 1366px) */
@media (min-width: 1024px) and (max-width: 1366px) {
    .webgis-log-panel {
        width: 50%;
        /* iPad 横屏适中宽度 */
        min-width: 400px;
        /* 增加最小宽度，确保按钮有足够空间 */
    }

    .panel-header {
        padding: 8px 12px;
        gap: 8px;
        min-height: 44px;
        /* 增加最小高度 */
    }

    .status-info {
        gap: 10px;
    }

    .header-actions {
        gap: 10px;
        flex-wrap: nowrap;
        /* 防止按钮换行 */
    }

    .action-btn {
        padding: 6px 14px;
        font-size: 12px;
        min-height: 34px;
        /* 增加触摸区域 */
        white-space: nowrap;
        /* 防止文字换行 */
        flex-shrink: 0;
        /* 防止按钮被压缩 */
    }

    /* 隐藏 Lock scroll 节省空间 */
    .lock-scroll-option {
        display: none;
    }

    /* 隐藏分隔线节省空间 */
    .divider {
        display: none;
    }

    .log-line {
        font-size: 12px;
        gap: 10px;
        padding: 2px 12px;
    }
}

/* 平板竖屏适配 (Pad: 769px ~ 1023px) */
@media (min-width: 769px) and (max-width: 1023px) {
    .webgis-log-panel {
        width: 60%;
        /* Pad 上比 PC 端更宽，保证日志可读 */
        min-width: 280px;
        /* 最小宽度保证 */
    }

    .panel-header {
        padding: 6px 8px;
        gap: 6px;
        min-height: 36px;
    }

    .status-info {
        gap: 6px;
    }

    .header-actions {
        gap: 6px;
    }

    .action-btn {
        padding: 5px 10px;
        font-size: 11px;
        min-height: 30px;
        /* 保证触摸区域 */
        white-space: nowrap;
        /* 防止文字换行 */
    }

    /* Pad 上隐藏分隔线和 Lock scroll 节省空间 */
    .divider {
        display: none;
    }

    .lock-scroll-option {
        display: none;
    }

    .log-line {
        font-size: 11px;
        gap: 8px;
        padding: 1px 8px;
    }

    .lock-text {
        font-size: 10px;
    }
}

/* 移动端适配 */
@media (max-width: 768px) {
    .webgis-log-panel {
        width: 100%;
        /* 移动端占满宽度 */
        height: 35vh;
        /* 移动端更紧凑，避免与其他面板冲突 */
        min-height: 200px;
        /* 最小高度保证基本可用 */
        border-radius: 0;
        /* 移动端边缘通常不需要圆角 */
    }

    .panel-header {
        height: auto;
        /* 高度自适应 */
        flex-direction: column;
        /* 纵向排列，解决遮挡 */
        align-items: flex-start;
        padding: 8px 12px;
        gap: 10px;
    }

    .status-info {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
        /* 如果状态信息太多，允许换行 */
        gap: 8px;
    }

    .header-actions {
        width: 100%;
        justify-content: space-between;
        /* 按钮横向平铺 */
        gap: 8px;
    }

    /* 移动端按钮优化：更大的触摸区域 */
    .action-btn {
        padding: 8px 12px;
        flex: 1;
        /* 让按钮平分宽度 */
        justify-content: center;
        font-size: 12px;
        min-height: 36px;
        /* 保证触摸区域足够大 */
    }

    /* 隐藏一些次要的装饰元素，节省空间 */
    .divider {
        display: none;
    }

    .lock-scroll-option {
        padding: 4px;
    }

    .lock-text {
        font-size: 11px;
    }

    .custom-checkbox {
        width: 16px;
        height: 16px;
    }
}

/* 针对极窄屏幕（如 iPhone SE）进一步优化 */
@media (max-width: 380px) {
    .webgis-log-panel .title {
        display: none;
        /* 隐藏 TERMINAL 字样，保留图标 */
    }

    .webgis-log-panel .action-btn .btn-label {
        display: none;
        /* 只显示图标，隐藏按钮文字 */
    }

    .webgis-log-panel .action-btn {
        padding: 8px;
        min-width: 36px;
    }
}
</style>
