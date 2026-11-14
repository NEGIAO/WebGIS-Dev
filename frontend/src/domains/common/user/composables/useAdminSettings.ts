/**
 * 功能名称：管理后台系统配置与概览逻辑
 * 日    期：2026/11/13
 * 说    明：从 AdminControlPanel.vue 抽出的配置项能力层（概览 / 公告 / 联系方式 /
 *          默认底图 / 下载 TTL / 模型限额 / 代理限流 / LLM 参数），不含组件生命周期。
 */
import { ref } from 'vue';
import { useAgentConfig } from '@common/chat/composables/useAgentConfig';
import { BASEMAP_OPTIONS, DEFAULT_BASEMAP_LAYER_INDEX } from '@common/basemap/basemapOptions';
import {
	apiAdminGetAgentTokensPerUnit,
	apiAdminGetDefaultBasemapIndex,
	apiAdminGetDownloadTTL,
	apiAdminGetProxyRateLimit,
	apiAdminOverview,
	apiAdminPublishAnnouncement,
	apiAdminUpdateAgentTokensPerUnit,
	apiAdminUpdateContact,
	apiAdminUpdateDefaultBasemapIndex,
	apiAdminUpdateDownloadTTL,
	apiAdminUpdateProxyRateLimit,
} from '@/api/backend';

export interface AdminSettingsDeps {
	message: {
		success: (msg: string) => void;
		error: (msg: string) => void;
		warning: (msg: string) => void;
	};
	t: (key: string, params?: Record<string, any>) => string;
}

export function useAdminSettings(deps: AdminSettingsDeps) {
	const { message, t } = deps;

	// ── 概览 ──
	const overview = ref({
		table_count: 0,
		total_users: 0,
		total_sessions: 0,
		total_messages: 0,
		active_announcement: 0,
		l3_env_status: {} as Record<string, any>,
	});
	const loadingOverview = ref(false);

	// ── 公告与联系方式 ──
	const adminContactText = ref('');
	const announcementText = ref('');

	// ── 公共提交态（配置类操作共享） ──
	const submittingConfig = ref(false);

	// ── 默认底图 ──
	const defaultBasemapIndex = ref(DEFAULT_BASEMAP_LAYER_INDEX);
	const loadingBasemap = ref(false);
	const submittingBasemap = ref(false);
	const basemapOptions = BASEMAP_OPTIONS.map((opt: any, i: number) => ({ index: i, label: opt.label }));

	// ── 下载 TTL ──
	const downloadTtlMinutes = ref(30);
	const loadingDownloadTtl = ref(false);

	// ── 模型限额与代理限流 ──
	const agentTokensPerUnit = ref(1000);
	const loadingAgentTokensPerUnit = ref(false);
	const proxyRateLimit = ref(600);
	const loadingProxyRateLimit = ref(false);

	// ── LLM 参数（复用既有 composable） ──
	const agentApi = useAgentConfig();
	const agentConfigDraft = agentApi.agentConfigDraft;
	const loadingAgentConfig = agentApi.loading;
	const submittingAgentConfig = agentApi.submitting;
	const loadAgentConfig = agentApi.load;
	const saveAgentConfig = agentApi.save;

	/** 取后端错误详情，统一回落文案 */
	function errorDetail(err: any) {
		return err?.response?.data?.detail || err?.message || t('admin.unknownError');
	}

	/** 加载概览指标 */
	async function loadOverview() {
		loadingOverview.value = true;
		try {
			const result: any = await apiAdminOverview();
			overview.value = { ...overview.value, ...(result?.data || {}) };
		} catch (error: any) {
			message.error(String(error?.message || t('admin.overviewLoadFailed')));
		} finally {
			loadingOverview.value = false;
		}
	}

	/** 发布公告 */
	async function handlePublishAnnouncement() {
		if (submittingConfig.value) return;
		const content = String(announcementText.value || '').trim();
		if (!content) {
			message.warning(t('admin.announcementEmpty'));
			return;
		}

		submittingConfig.value = true;
		try {
			await apiAdminPublishAnnouncement(content);
			message.success(t('admin.announcementSuccess'));
			announcementText.value = '';
			await loadOverview();
		} catch (error: any) {
			message.error(String(error?.message || t('admin.announcementFailed')));
		} finally {
			submittingConfig.value = false;
		}
	}

	/** 保存联系方式 */
	async function handleSaveContact() {
		if (submittingConfig.value) return;
		const contact = String(adminContactText.value || '').trim();
		if (!contact) {
			message.warning(t('admin.contactEmpty'));
			return;
		}

		submittingConfig.value = true;
		try {
			await apiAdminUpdateContact(contact);
			message.success(t('admin.contactUpdateSuccess'));
		} catch (error: any) {
			message.error(String(error?.message || t('admin.contactUpdateFailed')));
		} finally {
			submittingConfig.value = false;
		}
	}

	/** 加载默认底图索引（失败回落内置默认值） */
	async function loadDefaultBasemapIndex() {
		loadingBasemap.value = true;
		try {
			const result: any = await apiAdminGetDefaultBasemapIndex();
			const idx = result?.data?.index;
			defaultBasemapIndex.value = idx != null ? idx : DEFAULT_BASEMAP_LAYER_INDEX;
		} catch {
			defaultBasemapIndex.value = DEFAULT_BASEMAP_LAYER_INDEX;
		} finally {
			loadingBasemap.value = false;
		}
	}

	/** 保存默认底图索引 */
	async function saveDefaultBasemapIndex() {
		submittingBasemap.value = true;
		try {
			await apiAdminUpdateDefaultBasemapIndex(defaultBasemapIndex.value);
			message.success(t('admin.basemapSaveSuccess'));
		} catch (err: any) {
			message.error(t('admin.basemapSaveFailed', { error: errorDetail(err) }));
		} finally {
			submittingBasemap.value = false;
		}
	}

	/** 还原默认底图索引为内置值 */
	function resetDefaultBasemapIndex() {
		defaultBasemapIndex.value = DEFAULT_BASEMAP_LAYER_INDEX;
	}

	/** 加载下载 TTL */
	async function loadDownloadTtl() {
		loadingDownloadTtl.value = true;
		try {
			const result: any = await apiAdminGetDownloadTTL();
			const ttl = result?.data?.ttl_minutes;
			downloadTtlMinutes.value = ttl != null ? ttl : 30;
		} catch {
			downloadTtlMinutes.value = 30;
		} finally {
			loadingDownloadTtl.value = false;
		}
	}

	/** 保存下载 TTL（钳制 1–1440 分钟） */
	async function handleSaveDownloadTtl() {
		submittingConfig.value = true;
		try {
			const ttl = Math.max(1, Math.min(1440, Number(downloadTtlMinutes.value) || 30));
			await apiAdminUpdateDownloadTTL(ttl);
			downloadTtlMinutes.value = ttl;
			message.success(t('admin.downloadTtlSaveSuccess'));
		} catch (err: any) {
			message.error(t('admin.downloadTtlSaveFailed', { error: errorDetail(err) }));
		} finally {
			submittingConfig.value = false;
		}
	}

	/** 加载代理限流值 */
	async function loadProxyRateLimit() {
		loadingProxyRateLimit.value = true;
		try {
			const result: any = await apiAdminGetProxyRateLimit();
			const val = result?.data?.rate_limit;
			proxyRateLimit.value = val != null ? val : 300;
		} catch {
			proxyRateLimit.value = 300;
		} finally {
			loadingProxyRateLimit.value = false;
		}
	}

	/** 保存代理限流值（钳制 0–100000） */
	async function handleSaveProxyRateLimit() {
		submittingConfig.value = true;
		try {
			const val = Math.max(0, Math.min(100000, Number(proxyRateLimit.value)));
			const normalized = Number.isFinite(val) ? val : 300;
			await apiAdminUpdateProxyRateLimit(normalized);
			proxyRateLimit.value = normalized;
			message.success(t('admin.proxyRateLimitSaveSuccess'));
		} catch (err: any) {
			message.error(t('admin.proxyRateLimitSaveFailed', { error: errorDetail(err) }));
		} finally {
			submittingConfig.value = false;
		}
	}

	/** 加载模型 token 折算率 */
	async function loadAgentTokensPerUnit() {
		loadingAgentTokensPerUnit.value = true;
		try {
			const result: any = await apiAdminGetAgentTokensPerUnit();
			const val = result?.data?.tokens_per_unit;
			agentTokensPerUnit.value = val != null ? val : 1000;
		} catch {
			agentTokensPerUnit.value = 1000;
		} finally {
			loadingAgentTokensPerUnit.value = false;
		}
	}

	/** 保存模型 token 折算率（钳制 100–100000） */
	async function handleSaveAgentTokensPerUnit() {
		if (loadingAgentTokensPerUnit.value) return;
		submittingConfig.value = true;
		try {
			const val = Math.max(100, Math.min(100000, Number(agentTokensPerUnit.value) || 1000));
			await apiAdminUpdateAgentTokensPerUnit(val);
			agentTokensPerUnit.value = val;
			message.success(t('admin.agentTokensPerUnitSaveSuccess'));
		} catch (err: any) {
			message.error(t('admin.agentTokensPerUnitSaveFailed', { error: errorDetail(err) }));
		} finally {
			submittingConfig.value = false;
		}
	}

	return {
		overview,
		loadingOverview,
		adminContactText,
		announcementText,
		submittingConfig,
		defaultBasemapIndex,
		loadingBasemap,
		submittingBasemap,
		basemapOptions,
		downloadTtlMinutes,
		loadingDownloadTtl,
		agentTokensPerUnit,
		loadingAgentTokensPerUnit,
		proxyRateLimit,
		loadingProxyRateLimit,
		agentConfigDraft,
		loadingAgentConfig,
		submittingAgentConfig,
		loadAgentConfig,
		saveAgentConfig,
		loadOverview,
		handlePublishAnnouncement,
		handleSaveContact,
		loadDefaultBasemapIndex,
		saveDefaultBasemapIndex,
		resetDefaultBasemapIndex,
		loadDownloadTtl,
		handleSaveDownloadTtl,
		loadProxyRateLimit,
		handleSaveProxyRateLimit,
		loadAgentTokensPerUnit,
		handleSaveAgentTokensPerUnit,
	};
}
