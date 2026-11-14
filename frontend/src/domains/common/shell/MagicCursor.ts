/**
 * 功能名称：全局鼠标物理特效画布（MagicCursor）实例层
 * 日    期：2026/11/14
 * 说    明：按需动态加载并切换流体/引力/虚空三角网/水波/奇点/环爆等 Canvas 粒子物理特效。
 */
import {
	defineComponent,
	onMounted,
	onUnmounted,
	ref,
	watch,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { useMessage } from '@common/shell/useMessage';

type EmitsType = 'toggle-active'[];

const propDefine = {
	active: { type: Boolean, default: false },
	effectName: { type: String, default: 'gravity' },
} as const;

export type MagicCursorProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'MagicCursor',
	props: propDefine,
	emits: ['toggle-active'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public canvasRef = ref<HTMLCanvasElement | null>(null);
	public isLoading = ref(false);
	private message = useMessage();
	private activeEngine: any = null;
	private importedModules: Record<string, any> = {};

	get active() {
		return this.props.active;
	}
	get effectName() {
		return this.props.effectName;
	}

	constructor(
		private props: MagicCursorProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		this.init();
	}

	private init() {
		watch(
			() => [this.props.active, this.props.effectName],
			async ([newActive, newEffectName], [_oldActive, oldEffectName]) => {
				if (newActive) {
					if (!this.activeEngine || newEffectName !== oldEffectName) {
						await this.switchEffect(newEffectName);
					}
				} else if (!newActive && this.activeEngine) {
					this.activeEngine.destroy?.();
					this.activeEngine = null;
				}
			},
		);

		onMounted(() => {
			if (this.props.active) {
				void this.switchEffect(this.props.effectName);
			}
		});

		onUnmounted(() => {
			if (this.activeEngine) {
				this.activeEngine.destroy?.();
				this.activeEngine = null;
			}
		});
	}

	private async dynamicImportEffect(effectName: string) {
		if (this.importedModules[effectName]) {
			return this.importedModules[effectName];
		}
		try {
			this.isLoading.value = true;
			let moduleLoader: () => Promise<Record<string, any>>;
			switch (effectName) {
				case 'fluid':
					moduleLoader = () => import('@common/components/Magic/useFluid');
					break;
				case 'gravity':
					moduleLoader = () => import('@common/components/Magic/useGravity');
					break;
				case 'void':
					moduleLoader = () => import('@common/components/Magic/useDelaunay');
					break;
				case 'wave':
					moduleLoader = () => import('@common/components/Magic/useWave');
					break;
				case 'singularity':
					moduleLoader = () => import('@common/components/Magic/useSingularity');
					break;
				case 'ring-explosion':
					moduleLoader = () => import('@common/components/Magic/useRingExplosion');
					break;
				default:
					moduleLoader = () => import('@common/components/Magic/useGravity');
			}

			const module: Record<string, any> = await moduleLoader();
			const composableName =
				effectName === 'fluid'
					? 'useFluid'
					: effectName === 'gravity'
						? 'useGravity'
						: effectName === 'void'
							? 'useDelaunay'
							: effectName === 'wave'
								? 'useWave'
								: effectName === 'singularity'
									? 'useSingularity'
									: effectName === 'ring-explosion'
										? 'useRingExplosion'
										: 'useGravity';

			this.importedModules[effectName] = module[composableName];
			return this.importedModules[effectName];
		} finally {
			this.isLoading.value = false;
		}
	}

	public switchEffect = async (effectName: any) => {
		if (this.isLoading.value) return;
		try {
			if (this.activeEngine) {
				this.activeEngine.destroy?.();
				this.activeEngine = null;
			}
			if (this.canvasRef.value) {
				const ctx = this.canvasRef.value.getContext('2d');
				ctx?.clearRect(0, 0, this.canvasRef.value.width, this.canvasRef.value.height);
			}
			const useEffectComposable = await this.dynamicImportEffect(String(effectName));
			if (!useEffectComposable) return;
			this.activeEngine = useEffectComposable(this.canvasRef, { active: this.props.active });
			if (this.activeEngine?.init) {
				this.activeEngine.init();
			}
		} catch {
			this.message.error('特效加载失败，已跳过');
		}
	};
}
