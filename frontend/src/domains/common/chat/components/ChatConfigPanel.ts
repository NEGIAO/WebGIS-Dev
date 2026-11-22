/**
 * ChatConfigPanel.vue 实例逻辑（个人 Agent 配置面板）
 */
import { computed, defineComponent, inject, reactive, ref, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import {
    Boxes,
    ChevronDown,
    Eye,
    EyeOff,
    Globe,
    KeyRound,
    MessageSquareText,
    RefreshCw,
    RotateCcw,
    Save,
    SlidersHorizontal,
    Trash2,
} from '@lucide/vue';
import { useLocale } from '@common/app/useLocale';

export class Instance {
    public config: Record<string, any>;
    public t: any;
    public modelInputRef: Ref<HTMLInputElement | null>;
    public showModelDropdown: Ref<boolean>;
    public showKey: Ref<boolean>;
    public openSections: Record<string, boolean>;
    public modelQuery: Ref<string>;
    public filteredModels: ComputedRef<any[]>;
    /** V3.7.8：Extra Body 文本 ↔ draft 对象的双向适配（对象 → 美化 JSON；输入 → 原样保留，保存时校验） */
    public extraBodyText: WritableComputedRef<string>;

    constructor() {
        this.config = inject<Record<string, any>>('chatAgentConfig', reactive({}));
        const { t } = useLocale();
        this.t = t;

        this.modelInputRef = ref<HTMLInputElement | null>(null);
        this.showModelDropdown = ref(false);
        this.showKey = ref(false);

        this.openSections = reactive<Record<string, boolean>>({
            credentials: false,
            model: true,
            params: false,
            prompt: false,
        });

        this.modelQuery = ref('');

        this.filteredModels = computed<any[]>(() => {
            const q = this.modelQuery.value.trim().toLowerCase();
            const list: any[] = this.config.selectModels || [];
            if (!q) return list;
            return list.filter(
                (m: any) => m.id.toLowerCase().includes(q) || String(m.name || '').toLowerCase().includes(q),
            );
        });

        this.extraBodyText = computed<string>({
            get: () => {
                const v = this.config.userConfigDraft?.extra_body;
                if (typeof v === 'string') return v; // 用户正在编辑的原始文本原样回显
                return JSON.stringify(v ?? {}, null, 2);
            },
            set: (raw: string) => {
                // 输入过程仅暂存原始文本（非法 JSON 不打断打字），保存时统一校验转换
                this.config.userConfigDraft.extra_body = raw;
            },
        });
    }

    public toggleSection = (key: string) => {
        this.openSections[key] = !this.openSections[key];
    };

    /** V3.7.8：Extra Body 输入回写（TS 断言必须放在 .ts 实例层——外部 src 脚本的模板表达式按纯 JS 编译，`as` 会直接语法错误） */
    public onExtraBodyInput = (event: Event) => {
        this.extraBodyText.value = (event.target as HTMLTextAreaElement).value;
    };

    public onModelQueryInput = (event: Event) => {
        this.modelQuery.value = (event.target as HTMLInputElement | null)?.value || '';
    };

    public pickModel = (id: string) => {
        this.config.userConfigDraft.model = id;
        this.modelQuery.value = '';
        this.showModelDropdown.value = false;
    };

    public openModelDropdown = () => {
        this.modelQuery.value = '';
        this.showModelDropdown.value = true;
    };

    public toggleModelDropdown = () => {
        this.showModelDropdown.value = !this.showModelDropdown.value;
        if (this.showModelDropdown.value) {
            this.modelQuery.value = '';
            this.modelInputRef.value?.focus();
        }
    };

    public onModelInputBlur = () => {
        setTimeout(() => {
            this.showModelDropdown.value = false;
        }, 150);
    };
}

export default defineComponent({
    name: 'ChatConfigPanel',
    components: {
        Boxes,
        ChevronDown,
        Eye,
        EyeOff,
        Globe,
        KeyRound,
        MessageSquareText,
        RefreshCw,
        RotateCcw,
        Save,
        SlidersHorizontal,
        Trash2,
    },
    setup() {
        return new Instance();
    },
});
