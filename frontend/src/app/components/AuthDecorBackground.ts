/**
 * AuthDecorBackground.vue 实例逻辑（认证页装饰层）
 */
import { defineComponent, ref, watch, type Ref } from 'vue';
import { useRingPatternStyle } from '../composables/useRingPatternStyle';
import { useSpinBoost } from '../composables/useSpinBoost';

export class Instance {
    public motionEnabled: boolean;
    public rootEl: Ref<HTMLElement | null>;
    private orbitSpin: any;

    constructor(props: any) {
        useRingPatternStyle({
            styleId: 'auth-decor-ring-pattern-style',
            scope: '.auth-decor__orbits',
            ringClass: 'auth-decor__ring',
        });

        this.motionEnabled =
            typeof window === 'undefined' ||
            !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.rootEl = ref<HTMLElement | null>(null);
        this.orbitSpin = useSpinBoost(() => this.rootEl.value, { match: 'auth-orbit' });

        watch(
            () => props.boost === true,
            (on) => {
                if (on) {
                    this.orbitSpin.start();
                } else {
                    this.orbitSpin.stop();
                }
            },
        );
    }
}

export default defineComponent({
    name: 'AuthDecorBackground',
    props: {
        boost: {
            type: Boolean,
            default: false,
        },
    },
    setup(props) {
        return new Instance(props);
    },
});
