/**
 * 功能名称：管理后台控制面板
 * 日    期：2026/11/13
 * 说    明：视图层逻辑入口。表格数据、系统配置分别由 useAdminTable / useAdminSettings
 *          承担，本类只保留页签导航、横向拖拽滚动与生命周期编排。
 */
import { defineComponent, onMounted, ref, type ExtractPropTypes, type SetupContext } from 'vue';
import { Bot, Check, Database, Globe, LayoutDashboard, Megaphone, MonitorDot, NotebookPen, Plus, Settings, X } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { useAdminTable } from '../composables/useAdminTable';
import { useAdminSettings } from '../composables/useAdminSettings';
import { getRowKey } from '../composables/adminTableFormat';

// 一、Emits（本组件无对外事件）
type EmitsType = [];

// 二、Props（本组件无入参）
const propDefine = {} as const;

export type AdminControlPanelProps = ExtractPropTypes<typeof propDefine>;

/**
 * 能力层经 Object.assign 注入的成员静态类型。
 * 功能：补齐 Instance 在构造期运行时挂载、静态类型不可见的成员，供 Vue 模板类型检查解析；
 * 核心逻辑：类型直接派生自两个 composable 的 ReturnType，能力层增删成员时自动同步，
 *           避免逐条 declare 产生漂移（同 LayerControlPanel.ts 的「仅声明类型」惯例）；
 *           typescript-eslint 禁止 class/interface 声明合并，故改用 setup 返回类型交集。
 */
type AdminPanelBindings = Instance
    & ReturnType<typeof useAdminTable>
    & ReturnType<typeof useAdminSettings>;

// 三、组件注册入口
export default defineComponent({
	name: 'AdminControlPanel',
	// 模板中直接以标签形式使用的图标组件，必须在此注册（<script src> 下无编译期自动注入）
	components: { Bot, Check, Database, Globe, LayoutDashboard, Megaphone, MonitorDot, NotebookPen, Plus, Settings, X },
	props: propDefine,
	emits: [],
	setup(props, ctx): AdminPanelBindings {
		// 注入成员由构造函数中的 Object.assign 挂载；断言仅补齐静态类型，运行时对象不变
		return new Instance(props, ctx) as AdminPanelBindings;
	},
});

// 四、组件实例
export class Instance {


	/** 模板用于 v-for key 与单元格编辑键，直接复用表格纯函数 */
	public getRowKey = getRowKey;

	// ── 页签导航 ──
	public activeTab = ref('overview');
	public tabs = [
		{ id: 'overview', icon: LayoutDashboard, label: '概览与环境', desc: '系统指标 / 密钥状态' },
		{ id: 'system', icon: Settings, label: '系统配置', desc: '公告 / 联系方式 / 限额' },
		{ id: 'agent', icon: Bot, label: '模型与地图', desc: 'LLM 参数 / 默认底图' },
		{ id: 'database', icon: Database, label: '数据管理', desc: '表浏览 / 行编辑 / 插入' },
	];
	public tabsNavRef = ref<HTMLElement | null>(null);

	// ── 横向拖拽滚动内部态（非响应式，无需模板访问） ──
	private isDragging = false;
	private dragMoved = false;
	private dragStartX = 0;
	private scrollStartLeft = 0;
	private readonly DRAG_MOVE_THRESHOLD = 10;

	// ── 由 composable 注入 ──
	private message: ReturnType<typeof useMessage>;
	public t!: (key: string, params?: Record<string, any>) => string;

	constructor(
		_props: AdminControlPanelProps,
		_ctx: SetupContext<EmitsType>
	) {
		this.message = useMessage();
		const { t } = useLocale();
		this.t = t;

		// settings 与 table 存在回调依赖（新增/删除后刷新概览），用可变持有者打破循环
		const holder: { settings?: ReturnType<typeof useAdminSettings> } = {};
		const table = useAdminTable({
			message: this.message as any,
			t,
			onMutated: () => holder.settings?.loadOverview(),
		});
		const settings = useAdminSettings({ message: this.message as any, t });
		holder.settings = settings;

		// 把两个能力层的公开成员平铺到实例，保证模板变量名与重构前完全一致
		Object.assign(this, table, settings);

		this.init();
	}

	/** 生命周期集中注册 */
	private init() {
		onMounted(async () => {
			const self = this as any;
			await self.loadOverview();
			await self.loadTables();
			await self.loadRows();
			await self.loadAgentConfig();
			await self.loadDefaultBasemapIndex();
			await self.loadDownloadTtl();
			await self.loadAgentTokensPerUnit();
			await self.loadProxyRateLimit();
		});
	}

	//#region 页签

	/** 切换页签（非法 id 静默忽略） */
	public selectTab = (tabId: string) => {
		if (!this.tabs.some((tab) => tab.id === tabId)) return;
		this.activeTab.value = tabId;
	};

	/**
	 * 横向拖拽滚动 tabs-nav
	 * 注意：touchstart 上不能无条件 preventDefault——那会吞掉移动端浏览器派发的合成
	 * click，导致点按 tab 完全失效（桌面端 mousedown 不吞 click，所以只有移动端中招）。
	 * 正确做法：仅当位移超过阈值、确认是拖拽后才 preventDefault 阻止页面滚动。
	 */
	public onTabsNavDragStart = (e: MouseEvent | TouchEvent) => {
		const el = this.tabsNavRef.value;
		if (!el) return;
		this.isDragging = true;
		this.dragMoved = false;
		this.dragStartX = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
		this.scrollStartLeft = el.scrollLeft;
		el.style.scrollBehavior = 'auto';
		// 仅桌面端 preventDefault：防止拖拽时选中文本；移动端 touchstart 不能阻止
		if (e.type === 'mousedown') e.preventDefault();
	};

	public onTabsNavDragMove = (e: MouseEvent | TouchEvent) => {
		if (!this.isDragging) return;
		const el = this.tabsNavRef.value;
		if (!el) return;
		const x = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
		if (!this.dragMoved && Math.abs(x - this.dragStartX) > this.DRAG_MOVE_THRESHOLD) {
			this.dragMoved = true;
			e.preventDefault(); // 确认是拖拽：阻止页面随手指纵向滚动
		}
		if (this.dragMoved) el.scrollLeft = this.scrollStartLeft - (x - this.dragStartX);
	};

	public onTabsNavDragEnd = () => {
		this.isDragging = false;
		const el = this.tabsNavRef.value;
		if (el) el.style.scrollBehavior = '';
		if (this.dragMoved) {
			// 拖拽后的合成 click 会在同帧派发，由捕获阶段 click 吞掉；宏任务后再复位
			setTimeout(() => {
				this.dragMoved = false;
			}, 0);
		}
	};

	/** 拖拽结束后吞掉浏览器补发的合成 click，避免误切 tab */
	public onTabsNavClickCapture = (e: MouseEvent) => {
		if (this.dragMoved) {
			e.preventDefault();
			e.stopPropagation();
		}
	};

	/** 点击 tab 时自动滚动使该 tab 居中可见 */
	public scrollTabIntoView = (tabId: string) => {
		const el = this.tabsNavRef.value;
		if (!el) return;
		const btn = el.querySelector(`#admin-tab-${tabId}`) as HTMLElement | null;
		if (btn) {
			const offset = btn.offsetLeft - el.offsetWidth / 2 + btn.offsetWidth / 2;
			el.scrollTo({ left: offset, behavior: 'smooth' });
		}
	};

	//#endregion
}
