/**
 * 功能名称：后端日志实时监控（SSE）
 * 日    期：2026/11/13（范式化改造）
 * 说    明：SSE 流式接收后端日志，rAF 批量冲刷 + 超限批量裁剪；
 *          断线 3s 自动重连（仅用户意图为「连接」时），支持按日志级别着色。
 */
import { computed, defineComponent, markRaw, onUnmounted, ref, type ExtractPropTypes } from 'vue';
import { Check, CircleHelp, Copy, Play, Square, Terminal, Trash2 } from '@lucide/vue';
import { BACKEND_BASE_URL } from '@/api/backend';
import { useMessage } from '@common/shell/useMessage';

/** 断线自动重连延迟 */
const RECONNECT_DELAY_MS = 3000;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

// 匹配 HTTP 响应状态码，仅识别 uvicorn/httpx 等标准 HTTP 日志格式：
//   uvicorn:  INFO: 10.x.x.x:port - "GET /path HTTP/1.1" 400 Bad Request
//   httpx:    HTTP Request: GET https://... "HTTP/1.1 400 "
// 用 (?<="\s) 限定状态码紧跟在引号+空格之后，避免误匹配时间戳中的数字（如 10:46:19.444）
const HTTP_STATUS_RE = /(?<="\s)([1-5]\d{2})\b/g;

// 一、Emits（本组件无对外事件）

// 二、Props
const propDefine = {
	maxLines: { type: Number, default: 2500 },
} as const;

export type LogMonitorProps = ExtractPropTypes<typeof propDefine>;

// 三、组件注册入口
export default defineComponent({
	name: 'LogMonitor',
	components: { Check, CircleHelp, Copy, Play, Square, Terminal, Trash2 },
	props: propDefine,
	emits: [],
	setup(props) {
		return new Instance(props);
	},
});

// 四、组件实例
export class Instance {
	public Check = markRaw(Check);
	public Copy = markRaw(Copy);
	public Square = markRaw(Square);
	public Play = markRaw(Play);

	public logEntries = ref<any[]>([]);
	public isConnected = ref(false);
	public streamDesired = ref(false);
	/** 滚动锁定 */
	public isLocked = ref(false);
	public scrollContainer = ref<HTMLElement | null>(null);
	public isCopiedAll = ref(false);
	public currentType = ref('run');

	private message: ReturnType<typeof useMessage>;

	private eventSource: EventSource | null = null;
	/** 断线自动重连定时器（仅 streamDesired=true 时调度） */
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	// 缓冲区优化
	private logBuffer: any[] = [];
	private renderPending = false;
	/** 稳定自增 id：v-for key 用，避免头部裁剪后 index key 全列表重 patch */
	private logSeq = 0;

	constructor(
		private props: LogMonitorProps
	) {
		this.message = useMessage();
		onUnmounted(() => {
			this.closeConnection();
			this.logBuffer = [];
			this.renderPending = false;
		});
	}

	get maxLines() {
		return this.props.maxLines;
	}

	//#region 派生

	public logsStreamUrl = computed(() => {
		const base = String(BACKEND_BASE_URL || '').replace(/\/$/, '');
		const params = new URLSearchParams({ type: this.currentType.value });
		return `${base}/monitor/logs/stream?${params.toString()}`;
	});

	public displaySourceLabel = computed(() => {
		try {
			const u = new URL(this.logsStreamUrl.value);
			return LOCAL_HOSTNAMES.has(u.hostname) ? 'LOCAL' : 'REMOTE';
		} catch {
			return 'UNKNOWN';
		}
	});

	//#endregion

	//#region 日志着色

	public getLogClass = (msg: string) => {
		const text = msg.toUpperCase();

		// 1. 优先识别严重错误
		if (text.includes('ERROR') || text.includes('FAILED')) return 'log-error';

		// 2. HTTP 错误状态码（4xx/5xx）—— 优先于 INFO/WARN 关键字
		const statusMatches = [...msg.matchAll(HTTP_STATUS_RE)];
		if (statusMatches.length > 0) {
			const lastCode = Number(statusMatches[statusMatches.length - 1][1]);
			if (lastCode >= 500) return 'log-error'; // 5xx 服务端错误
			if (lastCode >= 400) return 'log-warning'; // 4xx 客户端错误
			if (lastCode >= 200 && lastCode < 300) return 'log-success'; // 2xx 成功
		}

		// 3. 通用警告
		if (text.includes('WARN')) return 'log-warning';
		// 4. 非 HTTP 日志的成功关键字
		if (text.includes('SUCCESS')) return 'log-success';
		// 5. 业务流程标签
		if (text.includes('[BUILD]')) return 'log-build';
		if (text.includes('[RUN]')) return 'log-run';
		if (text.includes('INFO')) return 'log-info';

		return '';
	};

	//#endregion

	//#region 滚动与冲刷

	/** 只要不是锁定状态，就强制滚动到底部 */
	public scrollToBottom = () => {
		if (this.scrollContainer.value) {
			this.scrollContainer.value.scrollTop = this.scrollContainer.value.scrollHeight;
		}
	};

	/** 缓冲一行日志，rAF 批量冲刷到响应式列表 */
	private pushLine(rawMessage: any) {
		const timeString = new Date().toLocaleTimeString('zh-CN', {
			hour12: false,
			timeZone: 'Asia/Shanghai',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});

		const text = String(rawMessage ?? '');
		// Object.freeze：Vue 对冻结对象跳过深响应式转换，2500 行日志渲染读取零 proxy 开销
		// （数组 push 仍触发列表更新；日志条目本身不可变，冻结安全）
		this.logBuffer.push(
			Object.freeze({ id: ++this.logSeq, message: text, time: timeString, className: this.getLogClass(text) })
		);

		if (this.renderPending) return;
		this.renderPending = true;
		requestAnimationFrame(() => {
			this.logEntries.value.push(...this.logBuffer);
			this.logBuffer = [];

			// 超限 10% 才批量裁剪：避免高频日志时每帧一次 O(n) 头部搬移
			const overflow = this.logEntries.value.length - this.props.maxLines;
			if (overflow > this.props.maxLines * 0.1) this.logEntries.value.splice(0, overflow);

			// 仅在用户未锁定滚动时才强制滚动
			if (!this.isLocked.value) this.scrollToBottom();
			this.renderPending = false;
		});
	}

	//#endregion

	//#region 交互

	public switchType = (type: string) => {
		if (this.currentType.value === type) return;
		this.currentType.value = type;
		if (this.streamDesired.value) {
			this.closeConnection();
			this.openConnection();
		}
	};

	public clearLogs = () => {
		this.logEntries.value = [];
	};

	public copyAllLogs = async () => {
		if (this.logEntries.value.length === 0) return;
		const fullText = this.logEntries.value.map((log: any) => `[${log.time}] ${log.message}`).join('\n');
		try {
			await navigator.clipboard.writeText(fullText);
			this.isCopiedAll.value = true;
			setTimeout(() => (this.isCopiedAll.value = false), 2000);
		} catch {
			// 剪贴板写入失败（常见于非安全上下文）
			this.message.error('复制全部日志失败，请重试');
		}
	};

	public copySingleLine = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			this.message.error('复制日志失败，请重试');
		}
	};

	public toggleConnection = () => {
		if (this.streamDesired.value) this.closeConnection();
		else this.openConnection();
	};

	//#endregion

	//#region SSE 连接

	private clearReconnectTimer() {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/** 仅断开传输，不改变用户意图（streamDesired），供出错重连复用 */
	private teardownEventSource() {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = null;
		}
		this.isConnected.value = false;
	}

	public closeConnection = () => {
		this.streamDesired.value = false;
		this.clearReconnectTimer();
		this.teardownEventSource();
	};

	public openConnection = () => {
		this.streamDesired.value = true;
		this.clearReconnectTimer();
		this.teardownEventSource();

		this.eventSource = new EventSource(this.logsStreamUrl.value);
		this.eventSource.onopen = () => (this.isConnected.value = true);
		this.eventSource.onmessage = (e: MessageEvent) => {
			// 后端 SSE data 为 JSON: {"data":"<日志文本>","timestamp":"ISO8601"}，需解析后取 data
			try {
				const obj = JSON.parse(e.data);
				this.pushLine(obj.data ?? e.data);
			} catch {
				// 非 JSON（如本地模式的 "[monitor] source=local" 纯文本）保持原样
				this.pushLine(e.data);
			}
		};
		this.eventSource.onerror = () => {
			if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
				this.pushLine('[ERROR] SSE 连接已关闭（网络异常或后端不可用），将自动重连。');
			}
			this.teardownEventSource();
			if (!this.streamDesired.value) return;
			this.clearReconnectTimer();
			this.reconnectTimer = setTimeout(() => {
				this.reconnectTimer = null;
				if (this.streamDesired.value) this.openConnection();
			}, RECONNECT_DELAY_MS);
		};
	};

	//#endregion
}
