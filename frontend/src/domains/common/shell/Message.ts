/**
 * Message.vue 实例逻辑（吐司岛消息组件）
 */
import { defineComponent, toRef, type PropType } from 'vue';
import { AlertTriangle, CheckCircle, Info, Soup } from '@lucide/vue';
import { useMessageIslandMotion } from '@common/shell/useMessageIslandMotion';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public t: any;
    public clickCollapseMs: any;
    public handleCloseButtonClick: any;
    public handleItemClick: any;
    public isCollapsing: any;
    public pauseAllTimers: any;
    public resumeAllTimers: any;
    public cssVars: Record<string, string>;

    constructor(props: any, emit: any) {
        const { t } = useLocale();
        this.t = t;

        const messagesRef = toRef(props, 'messages');
        const durationRef = toRef(props, 'duration');

        const {
            clickCollapseMs,
            handleCloseButtonClick,
            handleItemClick,
            isCollapsing,
            pauseAllTimers,
            resumeAllTimers,
        } = useMessageIslandMotion({
            messagesRef,
            durationRef,
            onClose: (id) => emit('close', id),
        });

        this.clickCollapseMs = clickCollapseMs;
        this.handleCloseButtonClick = handleCloseButtonClick;
        this.handleItemClick = handleItemClick;
        this.isCollapsing = isCollapsing;
        this.pauseAllTimers = pauseAllTimers;
        this.resumeAllTimers = resumeAllTimers;

        this.cssVars = {
            '--toast-collapse-duration': `${clickCollapseMs}ms`,
        };
    }

    public resolveVisualType = (type: any) => {
        if (type === 'soup') return 'info';
        return type;
    };

    public shouldShowTitle = (item: any) => {
        return item?.showTitle !== false && item?.type !== 'soup';
    };

    public getTypeTitle = (type: any) => {
        if (type === 'success') return this.t('message.types.success');
        if (type === 'error') return this.t('message.types.error');
        if (type === 'warning') return this.t('message.types.warning');
        if (type === 'soup') return this.t('message.types.soup');
        return this.t('message.types.info');
    };

    public escapeHtml = (input: any) => {
        return String(input)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    public formatTextWithFonts = (text: any) => {
        const safeText = String(text ?? '');
        return safeText.replace(/([a-zA-Z]+)|([\u4E00-\u9FFF]+)|(.)/g, (match, en, zh) => {
            if (en) {
                return `<span class="toast-text-en">${this.escapeHtml(en)}</span>`;
            }
            if (zh) {
                return `<span class="toast-text-zh">${this.escapeHtml(zh)}</span>`;
            }
            return this.escapeHtml(match);
        });
    };
}

export default defineComponent({
    name: 'Message',
    components: {
        AlertTriangle,
        CheckCircle,
        Info,
        Soup,
    },
    props: {
        messages: {
            type: Array as PropType<any[]>,
            default: () => [],
        },
        queued: {
            type: Array as PropType<any[]>,
            default: () => [],
        },
        position: {
            type: String,
            default: 'top-right',
        },
        duration: {
            type: Number,
            default: 3000,
        },
    },
    emits: ['close'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
