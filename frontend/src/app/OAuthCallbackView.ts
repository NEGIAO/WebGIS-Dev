/**
 * 功能名称：第三方 OAuth 授权回调页（OAuthCallbackView）实例层
 * 日    期：2026/11/14
 * 说    明：处理 Google / GitHub / Hugging Face OAuth 登录 ticket 兑换与已登录账号绑定回调。
 */
import {
	computed,
	defineComponent,
	onMounted,
	ref,
	type ExtractPropTypes,
	type SetupContext,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import {
	consumePersistedPositionCode,
	injectPositionCodeToPath,
	peekPersistedPositionCode,
	setAuthSession,
	syncUserRoleToUrl,
} from '@common/user/services/auth';
import { apiAuthCompleteOAuthBind, apiAuthExchangeOAuthLoginTicket } from '../api/backend';

type EmitsType = [];
const propDefine = {} as const;
export type OAuthCallbackViewProps = ExtractPropTypes<typeof propDefine>;

export default defineComponent({
	name: 'OAuthCallbackView',
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

export class Instance {
	private route = useRoute();
	private router = useRouter();
	private message = useMessage();
	public t: ReturnType<typeof useLocale>['t'];

	public currentState = ref('loading');
	public statusText = ref('正在完成第三方账号授权，请稍候...');

	public cardTitle = computed(() => {
		switch (this.currentState.value) {
			case 'success':
				return this.t('oauth.success');
			case 'error':
				return this.t('oauth.error');
			case 'loading':
			default:
				return this.t('oauth.processing');
		}
	});

	constructor(
		_props: OAuthCallbackViewProps,
		_ctx: SetupContext<EmitsType>,
	) {
		const { t } = useLocale();
		this.t = t;
		this.init();
	}

	private init() {
		onMounted(async () => {
			const status = String(this.route.query?.status || '').trim().toLowerCase();
			const provider = String(this.route.query?.provider || '').trim();
			const ticket = String(this.route.query?.ticket || '').trim();
			const errorMessage = String(this.route.query?.message || '第三方登录失败').trim();
			this.clearCallbackQuery();

			if (status === 'bind_pending' && ticket) {
				try {
					await apiAuthCompleteOAuthBind(provider, ticket);
					this.currentState.value = 'success';
					const bindSuccess = this.t('oauth.bindSuccess', {
						provider: provider || this.t('oauth.thirdParty'),
					});
					this.statusText.value = bindSuccess;
					this.message.success(bindSuccess);

					setTimeout(async () => {
						await this.router.replace({ name: 'home' });
					}, 1000);
				} catch (error: any) {
					this.currentState.value = 'error';
					this.statusText.value = String(error?.message || '第三方账号绑定失败');
					this.message.error(this.statusText.value);
				}
				return;
			}

			if (status === 'success' && ticket) {
				try {
					const result = await apiAuthExchangeOAuthLoginTicket(ticket);
					const token = String(result?.token || '').trim();
					const user = result?.user || null;
					if (!token || !user) throw new Error('OAuth 登录兑换响应异常');

					setAuthSession({ token, user });
					syncUserRoleToUrl(user);
					this.currentState.value = 'success';
					const loginSuccess = this.t('oauth.loginSuccess', {
						provider: provider || this.t('oauth.thirdParty'),
					});
					this.statusText.value = loginSuccess;
					this.message.success(loginSuccess);

					setTimeout(async () => {
						await this.router.replace(this.resolveRedirectTarget());
						consumePersistedPositionCode();
					}, 1000);
				} catch (error: any) {
					this.currentState.value = 'error';
					this.statusText.value = String(error?.message || this.t('oauth.exchangeFailed'));
					this.message.error(this.statusText.value);
				}
				return;
			}

			this.currentState.value = 'error';
			this.statusText.value = errorMessage;
			this.message.error(errorMessage);
		});
	}

	private resolveRedirectTarget() {
		const redirect = String(this.route.query?.redirect || '/home').trim();
		const safeRedirect = redirect.startsWith('/') ? redirect : '/home';
		const persistedPositionCode = peekPersistedPositionCode();
		return injectPositionCodeToPath(safeRedirect, persistedPositionCode);
	}

	public goRegister = () => {
		void this.router.replace({ name: 'register' });
	};

	private clearCallbackQuery() {
		if (typeof window === 'undefined') return;
		const cleanHash = '#/oauth/callback';
		window.history.replaceState(
			null,
			document.title,
			`${window.location.pathname}${window.location.search}${cleanHash}`,
		);
	}
}
