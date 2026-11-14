/**
 * AdministrativeDivisionTreeNode.vue 实例逻辑（行政区划树节点）
 */
import { computed, defineComponent, ref, watch, type ComputedRef, type Ref } from 'vue';
import { ChevronRight, Folder, FolderOpen, MapPin } from '@lucide/vue';

export class Instance {
    public props: any;
    public emit: any;
    public expanded: Ref<boolean>;
    public hasChildren: ComputedRef<boolean>;
    public isSelected: ComputedRef<boolean>;

    constructor(props: any, emit: any) {
        this.props = props;
        this.emit = emit;
        this.expanded = ref(false);

        this.hasChildren = computed(() => {
            return Array.isArray(props.node?.children) && props.node.children.length > 0;
        });

        this.isSelected = computed(() => {
            const activeAdcode = String(props.selectedAdcode || '').trim();
            const currentAdcode = String(props.node?.value || '').trim();
            return !!activeAdcode && !!currentAdcode && activeAdcode === currentAdcode;
        });

        watch(
            () => props.autoExpand,
            (nextAutoExpand) => {
                if (nextAutoExpand) {
                    this.expanded.value = true;
                    return;
                }

                if (props.level >= 1) {
                    this.expanded.value = false;
                }
            },
            { immediate: true },
        );
    }

    public toggleExpand = () => {
        if (!this.hasChildren.value) return;
        this.expanded.value = !this.expanded.value;
    };

    public selectNode = () => {
        const label = String(this.props.node?.label || '').trim();
        const value = String(this.props.node?.value || '').trim();
        if (!value) return;

        this.emit('select', {
            label,
            value,
            level: Number(this.props.level) || 0,
        });
    };

    public emitSelect = (payload: any) => {
        this.emit('select', payload);
    };
}

export default defineComponent({
    name: 'AdministrativeDivisionTreeNode',
    components: {
        ChevronRight,
        Folder,
        FolderOpen,
        MapPin,
    },
    props: {
        node: {
            type: Object,
            required: true,
        },
        level: {
            type: Number,
            default: 0,
        },
        autoExpand: {
            type: Boolean,
            default: false,
        },
        selectedAdcode: {
            type: String,
            default: '',
        },
    },
    emits: ['select'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
