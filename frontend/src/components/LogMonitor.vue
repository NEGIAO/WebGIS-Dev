<template>
    <div class="webgis-log-panel">
        <div class="panel-header">
            <div class="status-info">
                <Terminal :size="14" class="header-icon" />
                <!-- 仅在远程模式显示 RUN/BUILD 切换 -->
                <div v-if="displaySourceLabel === 'REMOTE'" class="log-type-switcher">
                    <button 
                        :class="['type-btn', { active: currentType === 'run' }]" 
                        @click="switchType('run')"
                    >RUN</button>
                    <button 
                        :class="['type-btn', { active: currentType === 'build' }]" 
                        @click="switchType('build')"
                    >BUILD</button>
                </div>
                <span class="title">TERMINAL</span>
                <div class="divider"></div>
                <span :class="['status-dot', { active: isConnected, pending: streamDesired && !isConnected }]"></span>
                <span class="env-hint">{{ displaySourceLabel }}</span>
            </div>
            <div class="header-actions">
                <!-- 新增：一键复制全部按钮 -->
                <button 
                    type="button" 
                    class="action-btn secondary" 
                    :disabled="logEntries.length === 0"
                    @click="copyAllLogs"
                >
                    <component :is="isCopiedAll ? Check : Copy" :size="14" />
                    {{ isCopiedAll ? '已复制' : '复制全部' }}
                </button>
                
                <button type="button" class="action-btn secondary" :disabled="logEntries.length === 0" @click="clearLogs">
                    <Trash2 :size="14" />
                    清空
                </button>
                
                <button type="button" @click="toggleConnection" :class="['action-btn', streamDesired ? 'danger' : 'success']">
                    <component :is="streamDesired ? Square : Play" :size="14" />
                    {{ streamDesired ? '停止' : '开启' }}
                </button>
            </div>
        </div>

        <div ref="scrollContainer" class="log-viewport">
            <!-- 修改：添加双击单行复制 -->
            <div 
                v-for="(log, index) in logEntries" 
                :key="index" 
                class="log-line"
                @dblclick="copySingleLine(log.message)"
                title="双击复制此行内容"
            >
                <span class="line-number">{{ index + 1 }}</span>
                <span class="timestamp">{{ log.time }}</span>
                <span :class="['content', getLogClass(log.message)]">{{ log.message }}</span>
            </div>
            <!-- ... -->
        </div>
    </div>
</template>

<script setup>
// 导入增加 Trash2 和 AlertCircle 图标
import { ref, onUnmounted, nextTick, computed, watch } from 'vue';
import { Terminal, Play, Square, Trash2, AlertCircle,Copy, Check } from 'lucide-vue-next';
import { BACKEND_BASE_URL } from '../api/backend';

const currentType = ref('run'); // 默认监控运行日志
const logsStreamUrl = computed(() => {
    const base = String(BACKEND_BASE_URL || '').replace(/\/$/, '');
    // 增加 type 参数[cite: 5]
    return `${base}/monitor/logs/stream?type=${currentType.value}`;
});

/** 切换逻辑：切换后若已连接则重连[cite: 5] */
function switchType(type) {
    if (currentType.value === type) return;
    currentType.value = type;
    
    if (streamDesired.value) {
        closeConnection();
        openConnection();
    }
}

const props = defineProps({
    visible: { type: Boolean, default: true },
    autoStart: { type: Boolean, default: import.meta.env.PROD },
    maxLines: { type: Number, default: 2500 },
});

const logEntries = ref([]);
const isConnected = ref(false);
const streamDesired = ref(false);
const scrollContainer = ref(null);
const statusHint = ref('');
let eventSource = null;

const isCopiedAll = ref(false);

/** 复制全部日志[cite: 2] */
async function copyAllLogs() {
    if (logEntries.value.length === 0) return;
    
    // 将数组对象转换为纯文本：[时间] 内容[cite: 2]
    const fullText = logEntries.value
        .map(log => `[${log.time}] ${log.message}`)
        .join('\n');

    try {
        await navigator.clipboard.writeText(fullText);
        isCopiedAll.value = true;
        // 2秒后恢复图标[cite: 2]
        setTimeout(() => isCopiedAll.value = false, 2000);
    } catch (err) {
        console.error('复制失败:', err);
    }
}

/** 双击复制单行内容[cite: 2] */
async function copySingleLine(text) {
    try {
        await navigator.clipboard.writeText(text);
        // 这里可以添加一个轻量级的 Toast 提示，或者改变背景色反馈[cite: 2]
    } catch (err) {
        console.error('单行复制失败:', err);
    }
}

// 简单逻辑：根据关键词返回样式类
function getLogClass(msg) {
    const text = msg.toUpperCase();
    if (text.includes('[BUILD]')) return 'log-build'; // 在 CSS 中定义紫色或蓝色
    if (text.includes('[RUN]')) return 'log-run';
    if (text.includes('ERROR') || text.includes('FAILED')) return 'log-error';
    if (text.includes('WARN')) return 'log-warning';
    if (text.includes('INFO')) return 'log-info';
    if (text.includes('SUCCESS') || text.includes('200 OK')) return 'log-success';
    return '';
}

// ... 保持原有 logic 函数 (pushLine, openConnection 等) ...
//[cite: 2]

function pushLine(message) {
    // 强制使用中国标准时间 (UTC+8) 格式化
    const timeString = new Date().toLocaleTimeString('zh-CN', {
        hour12: false,
        timeZone: 'Asia/Shanghai', // 强制指定上海时区
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    logEntries.value.push({
        message: String(message ?? ''),
        time: timeString,
    });

    // 保持最大行数限制
    if (logEntries.value.length > props.maxLines) {
        logEntries.value.shift();
    }
    scrollToBottom();
}

function clearLogs() {
    logEntries.value = [];
}

const scrollToBottom = async () => {
    await nextTick();
    if (scrollContainer.value) {
        scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
};


const displaySourceLabel = computed(() => {
    try {
        const u = new URL(logsStreamUrl.value);
        return u.hostname === 'localhost' ? 'LOCAL' : 'REMOTE';
    } catch { return 'UNKNOWN'; }
});

const toggleConnection = () => {
    if (streamDesired.value) closeConnection();
    else openConnection();
};

function closeConnection() {
    streamDesired.value = false;
    if (eventSource) eventSource.close();
    isConnected.value = false;
}

function openConnection() {
    streamDesired.value = true;
    eventSource = new EventSource(logsStreamUrl.value); // 这里会使用带参数的 URL
    eventSource.onopen = () => isConnected.value = true;
    eventSource.onmessage = (e) => pushLine(e.data);
    eventSource.onerror = () => closeConnection();
}

onUnmounted(() => closeConnection());
</script>

<style scoped>
/* 切换器样式 */
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
/* 核心容器优化 */
.webgis-log-panel {
    width: 40%; 
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #09090b; /* 更深的黑 */
    color: #e4e4e7;
    border: 1px solid #27272a;
    border-radius: 6px;
    font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

/* 头部：VS Code 风格 */
.panel-header {
    background: #18181b;
    padding: 6px 12px;
    height: 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #27272a;
}

.status-info {
    display: flex;
    align-items: center;
    gap: 10px;
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

/* 按钮组 */
.header-actions {
    display: flex;
    gap: 6px;
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid transparent;
}

.action-btn.secondary {
    background: transparent;
    color: #a1a1aa;
}

.action-btn.secondary:hover {
    color: #f4f4f5;
    background: #27272a;
}

.action-btn.success { background: #166534; color: #bbf7d0; }
.action-btn.danger { background: #7f1d1d; color: #fecaca; }
.action-btn:hover { filter: brightness(1.2); transform: translateY(-1px); }

/* 日志内容区域 */
.log-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
    scrollbar-width: thin;
    scrollbar-color: #3f3f46 transparent;
}

/* 滚动条美化 */
.log-viewport::-webkit-scrollbar { width: 8px; }
.log-viewport::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; border: 2px solid #09090b; }

.log-line {
    display: flex;
    padding: 1px 12px;
    gap: 12px;
    line-height: 1.6;
    font-size: 12px;
    transition: background 0.1s;
}

.log-line:hover { background: #18181b; }

.line-number {
    color: #0bb867;
    width: 24px;
    text-align: right;
    user-select: none;
}

.timestamp {
    color: #52525b; /* 调暗时间戳颜色，类似 VS Code 风格 */
    font-variant-numeric: tabular-nums; /* 使用等宽数字，避免时间跳动 */
    flex-shrink: 0;
    font-size: 11px;
}

.log-line:hover .timestamp {
    color: #71717a; /* 悬浮时稍微亮一点点 */
}

.content {
    word-break: break-all;
    white-space: pre-wrap;
    color: #d4d4d8;
}

/* 语义化颜色 */
.log-error { color: #f87171 !important; font-weight: 500; }
.log-warning { color: #fbbf24 !important; }
.log-info { color: #109942 !important; }
.log-success { color: #4ade80 !important; }
.log-build { color: #0e13a3 !important; font-weight: 500; }
.log-run { color: #1ab142 !important; font-weight: 500; }

/* 空状态动画 */
.empty-tip {
    padding: 20px;
    color: #3f3f46;
    font-style: italic;
    position: relative;
}

.scan-line {
    width: 2px;
    height: 14px;
    background: #4ade80;
    display: inline-block;
    animation: blink 1s infinite;
    vertical-align: middle;
}

@keyframes blink { 50% { opacity: 0; } }

.status-hint {
    background: rgba(127, 29, 29, 0.2);
    color: #fca5a5;
    padding: 4px 12px;
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #450a0a;
}
@media (max-width: 768px) {
    .webgis-log-panel { width: 100%; }
}
</style>