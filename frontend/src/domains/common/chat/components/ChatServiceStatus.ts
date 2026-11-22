/**
 * ChatServiceStatus.vue 实例逻辑（路由模式/服务状态/额度状态条）
 * V3.7.8：移动端信息栏瘦身——默认简洁模式（仅就绪/模式徽章一行），
 * 点击展开按钮查看模型/消耗/额度/说明详情；偏好持久化到 localStorage。
 */
import { computed, defineComponent, ref, watch, type ComputedRef, type Ref } from 'vue';
import { ArrowLeftRight, ChevronDown, ChevronUp, Coins, Cpu, Gauge } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';

/** 状态详情展开偏好的 localStorage 键（默认收起 = 简洁模式） */
const STATUS_DETAIL_PREF_KEY = 'webgis.chat.statusDetailExpanded';

/** 读取持久化的展开偏好；缺省/解析失败一律回退「收起」。 */
function readDetailExpandedPref(): boolean {
    try {
        return window.localStorage.getItem(STATUS_DETAIL_PREF_KEY) === 'true';
    } catch {
        return false;
    }
}

export class Instance {
    public message: any;
    public t: any;
    public isProxyMode: ComputedRef<boolean>;
    public modeTone: ComputedRef<string>;
    public modeLabel: ComputedRef<string>;
    public modelText: ComputedRef<string>;
    public sourceLabel: ComputedRef<string>;
    public modelTitle: ComputedRef<string>;
    public readyFullText: ComputedRef<string>;
    public quotaLabel: ComputedRef<string>;
    public costText: ComputedRef<string>;
    /** 状态详情展开态（简洁模式 = false，默认） */
    public detailExpanded: Ref<boolean>;
    /** 展开按钮的可访问文案 */
    public detailToggleLabel: ComputedRef<string>;

    constructor(props: any) {
        this.message = useMessage();
        const { t } = useLocale();
        this.t = t;

        this.isProxyMode = computed(() => !props.config.isDefaultAIMode && !props.config.isPersonalMode);

        this.modeTone = computed(() => {
            if (props.config.isDefaultAIMode) return 'tone-default-ai';
            return props.config.isPersonalMode ? 'tone-direct' : 'tone-proxy';
        });

        this.modeLabel = computed(() => {
            if (props.config.isDefaultAIMode) return this.t('chat.defaultAIMode');
            return props.config.isPersonalMode ? this.t('chat.personalKeyMode') : this.t('chat.backendProxy');
        });

        this.modelText = computed(() => props.config.modelName || this.t('chat.notConfigured'));

        this.sourceLabel = computed(() => {
            if (props.config.isDefaultAIMode) return this.t('chat.adminConfigured');
            if (props.config.directConfig.model && props.config.isPersonalMode) return this.t('chat.personalKey');
            if (props.config.modelName) return this.t('chat.proxy');
            return '';
        });

        this.modelTitle = computed(() => {
            const base = `${this.t('chat.currentModel')} ${this.modelText.value}`;
            return this.sourceLabel.value ? `${base} · ${this.sourceLabel.value}` : base;
        });

        this.readyFullText = computed(() => {
            if (!props.config.serviceReady) return this.t('chat.serviceNotReady');
            if (props.config.isDefaultAIMode) return this.t('chat.defaultAIReady');
            if (props.config.isPersonalMode) return this.t('chat.personalAPIReady');
            return this.t('chat.serviceReady');
        });

        this.quotaLabel = computed(() => {
            if (props.config.isDefaultAIMode) return this.t('chat.freeQuota');
            if (props.config.isPersonalMode) return this.t('chat.unlimitedQuota');
            return props.config.quotaText;
        });

        this.costText = computed(() => (
            props.config.lastCallCost > 0 ? `-${props.config.lastCallCost}` : this.t('chat.noCostYet')
        ));

        // V3.7.8：状态详情折叠态（默认简洁模式），偏好持久化到 localStorage
        this.detailExpanded = ref(readDetailExpandedPref());
        this.detailToggleLabel = computed(() => (
            this.detailExpanded.value ? this.t('chat.statusDetailHide') : this.t('chat.statusDetailShow')
        ));

        watch(
            () => props.config.quotaExhausted,
            (exhausted) => {
                if (exhausted) this.message.warning(this.t('chat.quotaExhaustedHint'));
            },
        );
    }

    /** 切换详情展开态并持久化偏好（存储不可用时静默，仅影响下次默认态） */
    public toggleDetail = () => {
        this.detailExpanded.value = !this.detailExpanded.value;
        try {
            window.localStorage.setItem(STATUS_DETAIL_PREF_KEY, String(this.detailExpanded.value));
        } catch {
            /* 隐私模式等存储不可用时静默 */
        }
    };
}

export default defineComponent({
    name: 'ChatServiceStatus',
    components: {
        ArrowLeftRight,
        ChevronDown,
        ChevronUp,
        Coins,
        Cpu,
        Gauge,
    },
    props: {
        config: { type: Object, required: true },
    },
    setup(props) {
        return new Instance(props);
    },
});
