/**
 * 功能名称：账户中心安全设置分页（SecurityTab）实例层
 * 日    期：2026/11/14
 * 说    明：负责显示名称修改、OAuth 账号二段式解绑/绑定、密码强度评估与密码修改表单校验。
 */
import {
	computed,
	defineComponent,
	onBeforeUnmount,
	ref,
	watch,
	type ExtractPropTypes,
	type PropType,
	type SetupContext,
} from 'vue';
import { getUserDisplayName, validateDisplayName } from '@common/user/composables/useAuthIdentity';
import { useLocale } from '@common/app/useLocale';
import { ASSET_BASE_URL } from '@/config/publicRuntime';

type EmitsType = (
	| 'change-display-name'
	| 'change-password'
	| 'bind-oauth'
	| 'unlink-oauth'
)[];

const propDefine = {
	user: {
		type: Object as PropType<Record<string, any> | null>,
		default: null,
	},
	isSubmitting: {
		type: Boolean,
		default: false,
	},
	oauthAccounts: {
		type: Array as PropType<any[]>,
		default: () => [],
	},
	oauthLoading: {
		type: Boolean,
		default: false,
	},
} as const;

export type SecurityTabProps = ExtractPropTypes<typeof propDefine>;

const PROVIDER_LABELS: Record<string, string> = Object.freeze({
	google: 'Google',
	github: 'GitHub',
	huggingface: 'Hugging Face',
});

export default defineComponent({
	name: 'SecurityTab',
	props: propDefine,
	emits: ['change-display-name', 'change-password', 'bind-oauth', 'unlink-oauth'],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	public emit!: SetupContext<EmitsType>['emit'];
	public t: ReturnType<typeof useLocale>['t'];
	public hfLogoUrl = `${ASSET_BASE_URL.replace(/\/+$/, '')}/images/hf-logo.svg`;
	public PROVIDER_LABELS = PROVIDER_LABELS;

	public displayName = ref('');
	public currentPassword = ref('');
	public nextPassword = ref('');
	public confirmPassword = ref('');
	public showPwd = ref<Record<string, boolean>>({ current: false, next: false, confirm: false });
	public pendingUnlink = ref('');
	private pendingUnlinkTimer: ReturnType<typeof setTimeout> | null = null;

	get user() {
		return this.props.user;
	}
	get isSubmitting() {
		return this.props.isSubmitting;
	}
	get oauthAccounts() {
		return this.props.oauthAccounts;
	}
	get oauthLoading() {
		return this.props.oauthLoading;
	}

	public pwdStrength = computed(() => {
		const value = String(this.nextPassword.value || '');
		if (!value) return 0;
		let score = 0;
		if (value.length >= 6) score += 1;
		if (value.length >= 10) score += 1;
		const classCount = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
		if (classCount >= 2) score += 1;
		if (classCount >= 3) score += 1;
		if (score >= 4) return 3;
		if (score >= 2) return 2;
		return 1;
	});

	public pwdStrengthText = computed(() => {
		const levels = [
			'',
			this.t('security.strengthLevels.weak'),
			this.t('security.strengthLevels.medium'),
			this.t('security.strengthLevels.strong'),
		];
		return levels[this.pwdStrength.value] || '';
	});

	constructor(
		private props: SecurityTabProps,
		private ctx: SetupContext<EmitsType>,
	) {
		this.emit = this.ctx.emit;
		const { t } = useLocale();
		this.t = t;
		this.displayName.value = getUserDisplayName(this.props.user) || '';

		this.init();
	}

	private init() {
		watch(
			() => getUserDisplayName(this.props.user),
			(next, prev) => {
				if (!this.displayName.value || this.displayName.value === prev) {
					this.displayName.value = next || '';
				}
			},
		);

		onBeforeUnmount(() => {
			this.clearPendingUnlink();
		});
	}

	public togglePwd = (key: string) => {
		this.showPwd.value[key] = !this.showPwd.value[key];
	};

	public clearPendingUnlink = () => {
		this.pendingUnlink.value = '';
		if (this.pendingUnlinkTimer) {
			clearTimeout(this.pendingUnlinkTimer);
			this.pendingUnlinkTimer = null;
		}
	};

	public resetForm = () => {
		this.displayName.value = getUserDisplayName(this.props.user) || '';
		this.currentPassword.value = '';
		this.nextPassword.value = '';
		this.confirmPassword.value = '';
		this.clearPendingUnlink();
	};

	public handleDisplayNameSubmit = () => {
		const validation = validateDisplayName(this.displayName.value);
		if (!validation.valid) {
			this.emit('change-display-name', { error: this.t(validation.code) });
			return;
		}
		this.emit('change-display-name', { displayName: validation.value });
	};

	public handlePasswordSubmit = () => {
		const oldPass = String(this.currentPassword.value || '').trim();
		const newPass = String(this.nextPassword.value || '').trim();
		const confirmPass = String(this.confirmPassword.value || '').trim();

		if (!oldPass || !newPass || !confirmPass) {
			this.emit('change-password', { error: this.t('security.errors.required') });
			return;
		}
		if (newPass !== confirmPass) {
			this.emit('change-password', { error: this.t('security.errors.mismatch') });
			return;
		}
		if (newPass.length < 6) {
			this.emit('change-password', { error: this.t('security.errors.minLength') });
			return;
		}
		this.emit('change-password', { oldPassword: oldPass, newPassword: newPass });
	};

	public getBoundAccount = (provider: string) => {
		return (
			this.props.oauthAccounts.find(
				(account: any) => String(account?.provider || '') === provider,
			) || null
		);
	};

	public handleOAuthAction = (provider: string) => {
		const account = this.getBoundAccount(provider);
		if (!account) {
			this.clearPendingUnlink();
			this.emit('bind-oauth', provider);
			return;
		}
		if (this.pendingUnlink.value !== provider) {
			this.clearPendingUnlink();
			this.pendingUnlink.value = provider;
			this.pendingUnlinkTimer = setTimeout(this.clearPendingUnlink, 3000);
			return;
		}
		this.clearPendingUnlink();
		this.emit('unlink-oauth', provider);
	};
}
