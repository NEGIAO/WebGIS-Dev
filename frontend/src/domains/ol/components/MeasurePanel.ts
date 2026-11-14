/**
 * MeasurePanel.vue 实例逻辑（二维地图测量工具面板）
 */
import { computed, defineComponent, ref, type ComputedRef, type Ref } from 'vue';
import { Info, Ruler, SquareDashedBottom, Trash2, X } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public emit: any;
    public t: any;
    public activeType: Ref<string>;
    public measureTools: ComputedRef<any[]>;
    public hint: ComputedRef<string>;

    constructor(emit: any) {
        this.emit = emit;
        const { t } = useLocale();
        this.t = t;

        this.activeType = ref('');

        this.measureTools = computed(() => [
            { type: 'MeasureDistance', label: this.t('measure.tools.MeasureDistance'), icon: Ruler },
            { type: 'MeasureArea', label: this.t('measure.tools.MeasureArea'), icon: SquareDashedBottom },
        ]);

        this.hint = computed(() => {
            switch (this.activeType.value) {
                case 'MeasureDistance':
                    return this.t('measure.hints.MeasureDistance');
                case 'MeasureArea':
                    return this.t('measure.hints.MeasureArea');
                default:
                    return this.t('measure.hints.default');
            }
        });
    }

    public selectTool = (type: string) => {
        this.activeType.value = type;
        this.emit('measure-type', type);
    };

    public handleClear = () => {
        this.activeType.value = '';
        this.emit('clear');
    };
}

export default defineComponent({
    name: 'MeasurePanel',
    components: {
        X,
        Info,
        Trash2,
        Ruler,
        SquareDashedBottom,
    },
    emits: ['measure-type', 'clear', 'close'],
    setup(_props, { emit }) {
        return new Instance(emit);
    },
});
