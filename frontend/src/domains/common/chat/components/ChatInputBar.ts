/**
 * ChatInputBar.vue 实例逻辑（对话输入栏）
 */
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import { Layers3, SendHorizontal, Square } from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';
import { BASEMAP_QUICK_GROUPS, type BasemapQuickCommand } from '@common/chat/constants/basemapQuickCommands';

export class Instance {
    public props: any;
    public emit: any;
    public t: any;
    public textareaRef: Ref<HTMLTextAreaElement | null>;
    public text: WritableComputedRef<string>;
    public sendDisabled: ComputedRef<boolean>;
    public quickOpen: Ref<boolean>;
    public quickGroups = BASEMAP_QUICK_GROUPS;
    private onDocClick = (event: MouseEvent) => {
        if (!this.quickOpen.value) return;
        const target = event.target as HTMLElement | null;
        if (!target?.closest?.('.chat-footer')) this.quickOpen.value = false;
    };

    constructor(props: any, emit: any) {
        this.props = props;
        this.emit = emit;
        const { t } = useLocale();
        this.t = t;

        this.textareaRef = ref<HTMLTextAreaElement | null>(null);
        this.quickOpen = ref(false);
        if (typeof document !== 'undefined') document.addEventListener('click', this.onDocClick);
        onBeforeUnmount(() => {
            if (typeof document !== 'undefined') document.removeEventListener('click', this.onDocClick);
        });

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

    /** 打开/关闭底图切片预设面板 */
    public toggleQuick = () => {
        this.quickOpen.value = !this.quickOpen.value;
    };

    /** 选中预设命令：关闭面板并交给上层本地解析执行（不经 LLM） */
    public pickQuick = (cmd: BasemapQuickCommand) => {
        if (this.props.isLoading) return;
        this.quickOpen.value = false;
        this.emit('quick-command', cmd);
    };
}

export default defineComponent({
    name: 'ChatInputBar',
    components: {
        Layers3,
        SendHorizontal,
        Square,
    },
    props: {
        modelValue: { type: String, default: '' },
        placeholder: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
        isLoading: { type: Boolean, default: false },
    },
    emits: ['update:modelValue', 'send', 'stop', 'quick-command'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
