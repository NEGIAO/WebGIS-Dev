/**
 * SharedResourceTreeItem.vue 实例逻辑（共享资源树节点）
 */
import { computed, defineComponent, ref, watch, type ComputedRef, type Ref } from 'vue';
import { ChevronRight, Folder, FolderOpen } from '@lucide/vue';

export class Instance {
    public props: any;
    public emit: any;
    public isFolder: ComputedRef<boolean>;
    public expanded: Ref<boolean>;
    public fileTypeLabel: ComputedRef<string>;
    public displayName: ComputedRef<string>;

    constructor(props: any, emit: any) {
        this.props = props;
        this.emit = emit;

        this.isFolder = computed(() => props.node?.type === 'folder');
        this.expanded = ref(true);

        this.fileTypeLabel = computed(() => {
            const type = String(props.node?.resource?.type || '').toUpperCase();
            return type || 'FILE';
        });

        this.displayName = computed(() => {
            const raw = String(props.node?.name || '').trim();
            if (!raw) return '';
            try {
                return decodeURIComponent(raw.replace(/\+/g, '%20'));
            } catch {
                return raw;
            }
        });

        watch(
            () => props.node,
            (nextNode) => {
                if (!nextNode || nextNode.type !== 'folder') {
                    this.expanded.value = false;
                    return;
                }
                this.expanded.value = true;
            },
            { immediate: true },
        );
    }

    public toggleFolder = () => {
        if (!this.isFolder.value) return;
        this.expanded.value = !this.expanded.value;
    };

    public handleFileClick = () => {
        if (!this.props.node?.resource) return;
        this.emit('load-resource', this.props.node.resource);
    };

    public forwardLoad = (resource: any) => {
        this.emit('load-resource', resource);
    };
}

export default defineComponent({
    name: 'SharedResourceTreeItem',
    components: {
        ChevronRight,
        Folder,
        FolderOpen,
    },
    props: {
        node: { type: Object, required: true },
        level: { type: Number, default: 0 },
    },
    emits: ['load-resource'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
