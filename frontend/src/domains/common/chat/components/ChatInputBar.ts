/**
 * ChatInputBar.vue 实例逻辑（对话输入栏）
 */
import { computed, defineComponent, nextTick, ref, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import { SendHorizontal, Square } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public props: any;
    public emit: any;
    public t: any;
    public textareaRef: Ref<HTMLTextAreaElement | null>;
    public text: WritableComputedRef<string>;
    public sendDisabled: ComputedRef<boolean>;

    constructor(props: any, emit: any) {
        this.props = props;
        this.emit = emit;
        const { t } = useLocale();
        this.t = t;

        this.textareaRef = ref<HTMLTextAreaElement | null>(null);

        this.text = computed({
            get: () => props.modelValue,
            set: (v) => emit('update:modelValue', v),
        });

        this.sendDisabled = computed(() => props.disabled || !String(props.modelValue || '').trim());
    }

    public autoResize = () => {
        const el = this.textareaRef.value;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
    };

    public onKeydown = (event: KeyboardEvent) => {
        if (event.key !== 'Enter') return;
        if (event.shiftKey) return;
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        this.submit();
    };

    public submit = () => {
        if (this.sendDisabled.value || this.props.isLoading) return;
        this.emit('send');
        nextTick(this.autoResize);
    };
}

export default defineComponent({
    name: 'ChatInputBar',
    components: {
        SendHorizontal,
        Square,
    },
    props: {
        modelValue: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        isLoading: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'send', 'stop'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
