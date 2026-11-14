/* eslint-disable vue/no-reserved-component-names */
/**
 * 功能名称：图层树目录面板（LayerPanel）实例层
 * 日    期：2026/11/14
 * 说    明：负责图层树关键字过滤、叶子节点计数、分组展开/显隐切换及全局右键菜单关闭。
 */
import {
	computed,
	defineComponent,
	onBeforeUnmount,
	onMounted,
	ref,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import { FolderTree, Search, SearchX, Inbox, X } from '@lucide/vue';
import { useLayerStore } from '@/stores';
import TOCTreeItem from '@common/layer-tree/components/TOCTreeItem.vue';
import { RSVC_NODE_PREFIX, RSVC_GROUP_NODE_ID } from '@common/basemap/remoteServices';

type EmitsType = 'action'[];

const propDefine = {
	selectedLayerIds: { type: Array as PropType<any[]>, default: () => [] },
} as const;

export type LayerPanelProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'LayerPanel',
	components: { FolderTree, Search, SearchX, Inbox, X, TOCTreeItem },
	props: propDefine,
	emits: ['action'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public SearchX = SearchX;
	public Inbox = Inbox;
	private layerStore = useLayerStore();

	public activeLayerId = ref<string | null>(null);
	public searchQuery = ref('');
	public isSearchFocused = ref(false);

	get selectedLayerIds() {
		return this.props.selectedLayerIds;
	}

	public layerTree = computed(() => this.layerStore.layerTree);

	public filteredLayerTree = computed(() =>
		this.filterTree(this.layerTree.value, this.searchQuery.value.trim()),
	);

	public matchedCount = computed(() => this.countLeaves(this.filteredLayerTree.value));

	constructor(
		private props: LayerPanelProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	private init() {
		onMounted(() => {
			window.addEventListener('pointerdown', this.handleGlobalPointerDown);
		});
		onBeforeUnmount(() => {
			window.removeEventListener('pointerdown', this.handleGlobalPointerDown);
		});
	}

	private countLeaves(nodes: any[]): number {
		return nodes.reduce((sum: number, node: any) => {
			if (node.type === 'folder') return sum + this.countLeaves(node.children || []);
			return sum + 1;
		}, 0);
	}

	private matchesSearch(node: any, query: string): boolean {
		if (!query) return true;
		const q = query.toLowerCase();
		const name = String(node.displayName || node.name || '').toLowerCase();
		if (name.includes(q)) return true;
		if (node.type === 'folder' && node.children) {
			return node.children.some((child: any) => this.matchesSearch(child, query));
		}
		return false;
	}

	private filterTree(nodes: any[], query: string): any[] {
		if (!query) return nodes;
		const result: any[] = [];
		for (const node of nodes) {
			if (node.type === 'folder') {
				const filteredChildren: any[] = this.filterTree(node.children || [], query);
				const folderMatches = this.matchesSearch(node, query);
				if (folderMatches || filteredChildren.length > 0) {
					result.push({
						...node,
						children: folderMatches ? node.children || [] : filteredChildren,
						expanded: true,
					});
				}
			} else if (this.matchesSearch(node, query)) {
				result.push(node);
			}
		}
		return result;
	}

	public clearSearch = () => {
		this.searchQuery.value = '';
	};

	public handleTreeAction = (evt: any) => {
		if (!evt?.type) return;
		if (evt.type === 'layer-selected') {
			this.activeLayerId.value = evt.layerId;
			this.emit('action', evt);
			return;
		}
		if (evt.type === 'toggle-folder-expand') {
			this.layerStore.setLayerTreeFolderExpanded(evt.nodeId, !!evt.expanded);
			return;
		}
		if (evt.type === 'toggle-folder-visibility') {
			const nodeId = String(evt.nodeId || '');
			if (nodeId.startsWith(RSVC_NODE_PREFIX) || nodeId === RSVC_GROUP_NODE_ID) {
				this.emit('action', evt);
				return;
			}
			const leaves = this.layerStore.getLayerLeafNodesByFolder(evt.nodeId);
			leaves.forEach((leaf: any) => {
				this.emit('action', {
					type: 'toggle-layer-visibility',
					layerId: leaf.id,
					visible: !!evt.visible,
				});
			});
			return;
		}
		this.emit('action', evt);
	};

	private handleGlobalPointerDown = (event: PointerEvent) => {
		const menuElements = document.querySelectorAll<HTMLElement>('.toc-context-menu');
		for (const menuEl of menuElements) {
			if (event.target instanceof Node && menuEl.contains(event.target)) {
				return;
			}
		}
		menuElements.forEach((el) => {
			el.style.display = 'none';
		});
	};
}
