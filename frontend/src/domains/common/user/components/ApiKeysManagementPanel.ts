/**
 * 功能名称：API 密钥管理面板
 * 日    期：2026/11/13
 * 说    明：视图层逻辑入口。密钥状态加载、掩码显隐、备份增删、默认 AI 配置编辑。
 */
import { computed, defineComponent, onMounted, ref, type ExtractPropTypes, type SetupContext } from 'vue';
import { AlertTriangle } from '@lucide/vue';
import { useMessage } from '@common/shell/useMessage';
import { useLocale } from '@common/app/useLocale';
import { formatDateTime } from '@common/utils/datetime';
import { useAgentConfig } from '@common/chat/composables/useAgentConfig';
import {
	apiAdminAppendApiKeyBackup,
	apiAdminDeleteApiKey,
	apiAdminDeleteApiKeyBackup,
	apiAdminGetApiKeysStatus,
	apiAdminGetDefaultAIConfig,
	apiAdminSetApiKey,
	apiAdminUpdateDefaultAIConfig,
} from '@/api/backend';
import { clearRuntimeMapTokensCache } from '@common/services/runtimeMapTokens';

// 一、Emits（本组件无对外事件）
type EmitsType = [];

// 二、Props（本组件无入参）
const propDefine = {} as const;

export type ApiKeysManagementPanelProps = ExtractPropTypes<typeof propDefine>;

/** 需即时失效前端运行时地图 token 缓存的密钥名单 */
const FRONTEND_RUNTIME_KEY_NAMES = new Set(['tianditu_tk', 'cesium_ion_token', 'amap_key', 'ovital_tdtkey']);

/** 空编辑值模板 */
function emptyKeyValues() {
	return {
		amap_key: '',
		agent_api_key: '',
		tianditu_tk: '',
		ovital_tdtkey: '',
		cesium_ion_token: '',
	};
}

// 三、组件注册入口
export default defineComponent({
	name: 'ApiKeysManagementPanel',
	components: { AlertTriangle },
	props: propDefine,
	emits: [],
	setup(props, ctx) {
		return new Instance(props, ctx);
	},
});

// 四、组件实例
export class Instance {


	public loading = ref(false);
	public copiedKey = ref('');
	public revealedKeys = ref<Record<string, boolean>>({});
	public keysStatus = ref<Record<string, any>>({
		amap_key: { is_set: false, updated_at: null },
		agent_api_key: { is_set: false, updated_at: null },
		tianditu_tk: { is_set: false, updated_at: null },
		ovital_tdtkey: { is_set: false, updated_at: null },
		cesium_ion_token: { is_set: false, updated_at: null },
	});
	public editingKey = ref<string | null>(null);
	public editValues = ref<Record<string, string>>(emptyKeyValues());
	public editingBackupKey = ref<string | null>(null);
	public backupEditValues = ref<Record<string, string>>(emptyKeyValues());

	// ── 默认 AI 配置 ──
	public defaultAILoading = ref(false);
	public editingDefaultAI = ref(false);
	public defaultAIConfig = ref({ api_key: '', base_url: '', model: '', is_configured: false });
	public defaultAIDraft = ref({ api_key: '', base_url: '', model: '' });

	// ── 复用 Agent 配置 composable ──
	private agentApi = useAgentConfig();
	public agentConfig = this.agentApi.agentConfig;
	public agentConfigDraft = this.agentApi.agentConfigDraft;
	public agentConfigLoading = this.agentApi.loading;
	public editingAgentConfig = this.agentApi.editingConfig;
	public saveAgentConfig = this.agentApi.save;
	public startEditAgentConfig = this.agentApi.startEdit;
	public cancelEditAgentConfig = this.agentApi.cancelEdit;

	public t!: (key: string, params?: Record<string, any>) => string;
	public language!: any;
	private message: ReturnType<typeof useMessage>;

	/** 受管密钥清单（label 随语言切换） */
	public managedApiKeys = computed(() => [
		{ key: 'amap_key', label: this.t('apiKeys.amapKey') },
		{ key: 'agent_api_key', label: this.t('apiKeys.agentKey') },
		{ key: 'tianditu_tk', label: this.t('apiKeys.tiandituKey') },
		{ key: 'ovital_tdtkey', label: this.t('apiKeys.ovitalKey') },
		{ key: 'cesium_ion_token', label: this.t('apiKeys.cesiumKey') },
	]);

	constructor(
		_props: ApiKeysManagementPanelProps,
		_ctx: SetupContext<EmitsType>
	) {
		this.message = useMessage();
		const { t, language } = useLocale();
		this.t = t;
		this.language = language;

		this.init();
	}

	/** 生命周期集中注册 */
	private init() {
		onMounted(async () => {
			await this.loadKeysStatus();
			await this.loadAgentConfigWrapped();
			await this.loadDefaultAIConfig();
		});
	}

	//#region 密钥展示

	/** 密钥明文（后端仅对管理员下发） */
	private keyValue(name: string) {
		return String(this.keysStatus.value[name]?.key_value || '');
	}

	public isRevealed = (name: string) => Boolean(this.revealedKeys.value[name]);

	public toggleReveal = (name: string) => {
		this.revealedKeys.value = { ...this.revealedKeys.value, [name]: !this.revealedKeys.value[name] };
	};

	/** 展示值：未配置提示 / 掩码(前4+****+后4) / 明文 */
	public displayKeyValue = (name: string) => {
		const raw = this.keyValue(name);
		if (!raw) return this.t('apiKeys.notConfigured');
		if (!this.isRevealed(name)) {
			return raw.length > 8 ? raw.slice(0, 4) + '****' + raw.slice(-4) : '****';
		}
		return raw;
	};

	/** 复制到剪贴板，1.5s 后恢复按钮文案 */
	public copyKey = async (name: string) => {
		const value = this.keyValue(name);
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			this.copiedKey.value = name;
			setTimeout(() => {
				if (this.copiedKey.value === name) this.copiedKey.value = '';
			}, 1500);
		} catch (e) {
			console.warn('[ApiKeys] copy failed', e);
		}
	};

	/** 时间格式化：未设置走 emptyText，非法值不显示 invalidText */
	public formatTime = (isoString: string) =>
		formatDateTime(isoString, {
			locale: this.language?.value || undefined,
			withSeconds: true,
			emptyText: this.t('apiKeys.neverSet'),
			invalidText: null,
		} as any);

	private normalizeKeyStatus(raw: any = {}) {
		const backups = Array.isArray(raw?.backups) ? raw.backups : [];
		return {
			is_set: Boolean(raw?.is_set),
			key_value: String(raw?.key_value || ''),
			updated_at: raw?.updated_at || null,
			backup_count: Number(raw?.backup_count ?? backups.length ?? 0),
			backups,
		};
	}

	public getBackups = (keyName: string) =>
		Array.isArray(this.keysStatus.value[keyName]?.backups) ? this.keysStatus.value[keyName].backups : [];

	public getBackupCount = (keyName: string) =>
		Number(this.keysStatus.value[keyName]?.backup_count ?? this.getBackups(keyName).length ?? 0);

	//#endregion

	//#region 密钥读写

	public loadKeysStatus = async () => {
		this.loading.value = true;
		try {
			const result: any = await apiAdminGetApiKeysStatus();
			const data = result?.data || {};
			this.keysStatus.value = {
				amap_key: this.normalizeKeyStatus(data.amap_key),
				agent_api_key: this.normalizeKeyStatus(data.agent_api_key),
				tianditu_tk: this.normalizeKeyStatus(data.tianditu_tk),
				ovital_tdtkey: this.normalizeKeyStatus(data.ovital_tdtkey),
				cesium_ion_token: this.normalizeKeyStatus(data.cesium_ion_token),
			};
		} catch (error: any) {
			this.message.error(this.t('apiKeys.loadStatusFailed', { error: error.message }));
		} finally {
			this.loading.value = false;
		}
	};

	public startEdit = (keyName: string) => {
		this.editingKey.value = keyName;
		this.editValues.value[keyName] = '';
	};

	public cancelEdit = () => {
		this.editingKey.value = null;
		this.editValues.value = emptyKeyValues();
	};

	public saveKey = async (keyName: string) => {
		const keyValue = this.editValues.value[keyName]?.trim();
		if (!keyValue) {
			this.message.error(this.t('apiKeys.keyValueRequired'));
			return;
		}

		try {
			await apiAdminSetApiKey(keyName, keyValue);
			if (FRONTEND_RUNTIME_KEY_NAMES.has(keyName)) clearRuntimeMapTokensCache();
			this.message.success(this.t('apiKeys.keySaved', { name: keyName }));
			this.cancelEdit();
			await this.loadKeysStatus();
		} catch (error: any) {
			this.message.error(this.t('apiKeys.keySaveFailed', { error: error.message }));
		}
	};

	public startBackupEdit = (keyName: string) => {
		this.editingBackupKey.value = keyName;
		this.backupEditValues.value[keyName] = '';
	};

	public cancelBackupEdit = () => {
		this.editingBackupKey.value = null;
		this.backupEditValues.value = emptyKeyValues();
	};

	public saveBackupKey = async (keyName: string) => {
		const keyValue = String(this.backupEditValues.value[keyName] || '').trim();
		if (!keyValue) {
			this.message.error(this.t('apiKeys.backupValueRequired'));
			return;
		}

		try {
			await apiAdminAppendApiKeyBackup(keyName, keyValue);
			if (FRONTEND_RUNTIME_KEY_NAMES.has(keyName)) clearRuntimeMapTokensCache();
			this.message.success(this.t('apiKeys.backupAdded', { name: keyName }));
			this.cancelBackupEdit();
			await this.loadKeysStatus();
		} catch (error: any) {
			this.message.error(this.t('apiKeys.backupAddFailed', { error: error.message }));
		}
	};

	public deleteBackupKey = async (keyName: string, backupId: any) => {
		if (!confirm(this.t('apiKeys.backupDeleteConfirm', { name: keyName }))) return;
		try {
			await apiAdminDeleteApiKeyBackup(keyName, backupId);
			if (FRONTEND_RUNTIME_KEY_NAMES.has(keyName)) clearRuntimeMapTokensCache();
			this.message.success(this.t('apiKeys.backupDeleted', { name: keyName }));
			await this.loadKeysStatus();
		} catch (error: any) {
			this.message.error(this.t('apiKeys.backupDeleteFailed', { error: error.message }));
		}
	};

	public deleteKey = async (keyName: string) => {
		if (!confirm(this.t('apiKeys.keyDeleteConfirm', { name: keyName }))) return;
		try {
			await apiAdminDeleteApiKey(keyName);
			if (FRONTEND_RUNTIME_KEY_NAMES.has(keyName)) clearRuntimeMapTokensCache();
			this.message.success(this.t('apiKeys.keyDeleted', { name: keyName }));
			await this.loadKeysStatus();
		} catch (error: any) {
			this.message.error(this.t('apiKeys.keyDeleteFailed', { error: error.message }));
		}
	};

	//#endregion

	//#region Agent 配置

	/** 后端把 provider 嵌在 agentConfig 里，这里拍平到顶层供模板直读 */
	private flattenProviderToTop() {
		const provider = (this.agentConfig as any).value?.provider || {};
		if (provider.base_url || provider.model || Object.keys(provider).length > 0) {
			(this.agentConfig as any).value = { ...(this.agentConfig as any).value, ...provider };
		}
	}

	private loadAgentConfigWrapped = async () => {
		await (this.agentApi.load as any)();
		this.flattenProviderToTop();
		this.agentApi.hydrate();
	};

	public loadAgentConfigWrapper = async () => {
		await this.loadAgentConfigWrapped();
	};

	public saveAgentConfigWrapper = async () => {
		const ok = await (this.saveAgentConfig as any)();
		if (ok) {
			this.flattenProviderToTop();
			this.cancelEditAgentConfig();
			this.agentApi.hydrate();
		}
	};

	//#endregion

	//#region 默认 AI 配置

	public loadDefaultAIConfig = async () => {
		this.defaultAILoading.value = true;
		try {
			const result: any = await apiAdminGetDefaultAIConfig();
			const data = result?.data || {};
			this.defaultAIConfig.value = {
				api_key: String(data.api_key || ''),
				base_url: String(data.base_url || ''),
				model: String(data.model || ''),
				is_configured: !!data.is_configured,
			};
			this.defaultAIDraft.value = {
				api_key: String(data.api_key || ''),
				base_url: String(data.base_url || ''),
				model: String(data.model || ''),
			};
		} catch (error: any) {
			this.message.error(this.t('apiKeys.loadDefaultAIFailed', { error: error.message }));
		} finally {
			this.defaultAILoading.value = false;
		}
	};

	public startEditDefaultAI = () => {
		this.editingDefaultAI.value = true;
		this.defaultAIDraft.value = {
			api_key: String(this.defaultAIConfig.value.api_key || ''),
			base_url: String(this.defaultAIConfig.value.base_url || ''),
			model: String(this.defaultAIConfig.value.model || ''),
		};
	};

	public cancelEditDefaultAI = () => {
		this.editingDefaultAI.value = false;
		this.defaultAIDraft.value = {
			api_key: String(this.defaultAIConfig.value.api_key || ''),
			base_url: String(this.defaultAIConfig.value.base_url || ''),
			model: String(this.defaultAIConfig.value.model || ''),
		};
	};

	public saveDefaultAIConfig = async () => {
		const apiKey = String(this.defaultAIDraft.value.api_key || '').trim();
		const baseUrl = String(this.defaultAIDraft.value.base_url || '').trim();
		const model = String(this.defaultAIDraft.value.model || '').trim();

		if (!apiKey || !baseUrl || !model) {
			this.message.error(this.t('apiKeys.defaultAIFieldsRequired'));
			return;
		}

		try {
			const result: any = await apiAdminUpdateDefaultAIConfig({ api_key: apiKey, base_url: baseUrl, model });
			const data = result?.data || {};
			this.defaultAIConfig.value = {
				api_key: apiKey,
				base_url: String(data.base_url || baseUrl),
				model: String(data.model || model),
				is_configured: !!data.is_configured,
			};
			this.editingDefaultAI.value = false;
			this.message.success(this.t('apiKeys.defaultAISaved'));
		} catch (error: any) {
			this.message.error(this.t('apiKeys.defaultAISaveFailed', { error: error.message }));
		}
	};

	//#endregion
}
