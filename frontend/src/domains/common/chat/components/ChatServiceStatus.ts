/**
 * ChatServiceStatus.vue 实例逻辑（路由模式/服务状态/额度状态条）
 */
import { computed, defineComponent, watch, type ComputedRef } from 'vue';
import { ArrowLeftRight, Coins, Cpu, Gauge } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';

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

        watch(
            () => props.config.quotaExhausted,
            (exhausted) => {
                if (exhausted) this.message.warning(this.t('chat.quotaExhaustedHint'));
            },
        );
    }
}

export default defineComponent({
    name: 'ChatServiceStatus',
    components: {
        ArrowLeftRight,
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
