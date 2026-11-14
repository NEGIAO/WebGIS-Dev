/**
 * NotFoundView.vue 实例逻辑（404 页面）
 */
import { computed, defineComponent, onMounted, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLocale } from '@common/app/useLocale';

const TOTAL_COUNTDOWN = 5;
const CIRCUMFERENCE = 2 * Math.PI * 52;

export class Instance {
    public t: any;
    public router: any;
    public route: any;
    public countdown: Ref<number>;
    public currentPath: ComputedRef<string>;
    public strokeDashoffset: ComputedRef<number>;
    private timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        const { t } = useLocale();
        this.t = t;
        this.router = useRouter();
        this.route = useRoute();
        this.countdown = ref(TOTAL_COUNTDOWN);

        this.currentPath = computed(() => this.route.fullPath || '/unknown');

        this.strokeDashoffset = computed(() => {
            const ratio = this.countdown.value / TOTAL_COUNTDOWN;
            return CIRCUMFERENCE * (1 - ratio);
        });

        onMounted(() => {
            this.timer = setInterval(() => {
                this.countdown.value--;
                if (this.countdown.value <= 0) {
                    const activeTimer = this.timer;
                    if (activeTimer !== null) {
                        clearInterval(activeTimer);
                    }
                    this.timer = null;
                    this.router.push('/');
                }
            }, 1000);
        });

        onUnmounted(() => {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        });
    }

    public goHome = () => {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.router.push('/');
    };
}

export default defineComponent({
    name: 'NotFoundView',
    setup() {
        return new Instance();
    },
});
