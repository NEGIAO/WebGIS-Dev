/**
 * AdministrativeDivisionPanel.vue 实例逻辑（行政区划面板）
 */
import { computed, defineComponent, ref, watch, type ComputedRef, type Ref } from 'vue';
import { Globe, Search, X } from '@lucide/vue';
import { useTOCStore } from '@/stores';
import { ASSET_BASE_URL } from '@/config/publicRuntime';
import AdministrativeDivisionTreeNode from './AdministrativeDivisionTreeNode.vue';

export class Instance {
    public emit: any;
    public tocStore: any;
    public ASSET_BASE_URL = ASSET_BASE_URL;
    public searchKeyword: Ref<string>;
    public selectedAdcode: Ref<string>;
    public keywordLower: ComputedRef<string>;
    public filteredTreeData: ComputedRef<any[]>;
    public matchedNodeCount: ComputedRef<number>;
    public autoExpand: ComputedRef<boolean>;

    constructor(props: any, emit: any) {
        this.emit = emit;
        this.tocStore = useTOCStore();

        this.searchKeyword = ref('');
        this.selectedAdcode = ref('');

        this.keywordLower = computed(() =>
            String(this.searchKeyword.value || '')
                .trim()
                .toLowerCase(),
        );
        this.filteredTreeData = computed(() => this.filterTreeNodes(this.tocStore.districtTree, this.keywordLower.value));
        this.matchedNodeCount = computed(() => this.countTreeNodes(this.filteredTreeData.value));
        this.autoExpand = computed(() => this.keywordLower.value.length > 0);

        watch(
            () => props.visible,
            (nextVisible) => {
                if (!nextVisible) return;
                void this.tocStore.loadDistrictTree(ASSET_BASE_URL);
            },
            { immediate: true },
        );
    }

    public filterTreeNodes = (nodes: any[] = [], keyword = ''): any[] => {
        const query = String(keyword || '')
            .trim()
            .toLowerCase();
        if (!query) return nodes;

        const result: any[] = [];
        nodes.forEach((node: any) => {
            const label = String(node.label || '').toLowerCase();
            const value = String(node.value || '').toLowerCase();
            const childMatches = this.filterTreeNodes(node.children || [], query);
            const currentMatch = label.includes(query) || value.includes(query);

            if (currentMatch || childMatches.length > 0) {
                result.push({
                    ...node,
                    children: childMatches,
                });
            }
        });

        return result;
    };

    public countTreeNodes = (nodes: any[] = []): number => {
        let total = 0;
        for (const node of nodes) {
            total += 1;
            if (Array.isArray(node.children) && node.children.length) {
                total += this.countTreeNodes(node.children);
            }
        }
        return total;
    };

    public handleNodeSelect = (payload: any) => {
        const adcode = String(payload?.value || '').trim();
        if (!adcode) return;

        this.selectedAdcode.value = adcode;
        this.emit('select', {
            label: String(payload?.label || '').trim(),
            value: adcode,
        });
    };
}

export default defineComponent({
    name: 'AdministrativeDivisionPanel',
    components: {
        Globe,
        // eslint-disable-next-line vue/no-reserved-component-names
        Search,
        X,
        AdministrativeDivisionTreeNode,
    },
    props: {
        visible: {
            type: Boolean,
            default: false,
        },
    },
    emits: ['close', 'select'],
    setup(props, { emit }) {
        return new Instance(props, emit);
    },
});
