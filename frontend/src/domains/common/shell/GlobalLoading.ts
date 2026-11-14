/**
 * GlobalLoading.vue 实例逻辑（全局 HUD 加载蒙层）
 */
import { computed, defineComponent, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import { storeToRefs } from 'pinia';
// 深导入：GlobalLoading 随 App.vue 常驻首屏，禁止经 '@/stores' 聚合桶取 store
import { useAppStore } from '@common/app/stores/useAppStore';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public loading: Ref<boolean>;
    public loadingText: Ref<string>;
    public t: any;
    public dotFrame: Ref<number>;
    public resolvedLoadingText: ComputedRef<string>;
    public loadingHint: ComputedRef<string>;
    private dotTimer: number | null = null;

    constructor() {
        const appStore = useAppStore();
        const { loading, loadingText } = storeToRefs(appStore);
        const { t } = useLocale();

        this.loading = loading;
        this.loadingText = loadingText;
        this.t = t;
        this.dotFrame = ref(0);

        this.resolvedLoadingText = computed(() => {
            const text = String(this.loadingText.value || '').trim();
            return text || this.t('common.loadingPleaseWait');
        });

        this.loadingHint = computed(() => {
            return this.t('common.loadingHard');
        });

        watch(
            this.loading,
            (visible) => {
                if (visible) {
                    this.startHintAnimation();
                } else {
                    this.stopHintAnimation();
                }
            },
            { immediate: true },
        );

        onBeforeUnmount(() => {
            this.stopHintAnimation();
        });
    }

    public startHintAnimation = () => {
        if (this.dotTimer !== null) return;
        this.dotTimer = window.setInterval(() => {
            this.dotFrame.value = (this.dotFrame.value + 1) % 4;
        }, 360);
    };

    public stopHintAnimation = () => {
        if (this.dotTimer === null) return;
        window.clearInterval(this.dotTimer);
        this.dotTimer = null;
        this.dotFrame.value = 0;
    };
}

export default defineComponent({
    name: 'GlobalLoading',
    setup() {
        return new Instance();
    },
});
