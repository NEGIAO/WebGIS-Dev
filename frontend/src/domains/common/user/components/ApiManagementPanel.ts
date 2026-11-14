/**
 * 功能名称：API 配额与调用日志管理面板逻辑层
 * 说    明：采用视图层（ApiManagementPanel.vue）与逻辑层（ApiManagementPanel.ts）分离范式；
 *           承载按用户配额消耗、模型调用统计、调用日志分页排序、统一 API 额度池编辑与密钥管理页签。
 */
import { computed, defineComponent, markRaw, onMounted, ref, type Ref } from 'vue';
import { BarChart3, Info, KeyRound, Link2, ScrollText, Settings } from '@lucide/vue';
import {
    apiAdminApiLogs,
    apiAdminApiUsageByModel,
    apiAdminGetApiQuota,
    apiAdminQuotaUsageByUser,
    apiAdminUpdateApiQuota,
} from '@/api/backend';
import { useMessage } from '@common/shell/useMessage';
import { formatDateTime } from '@common/utils/datetime';
import ApiKeysManagementPanel from './ApiKeysManagementPanel.vue';

function createSortedComputed(
    source: Ref<any[]>,
    sortKeyRef: Ref<string>,
    sortDirRef: Ref<string>,
) {
    return computed(() => {
        const list = [...source.value];
        const key = sortKeyRef.value;
        const multiplier = sortDirRef.value === 'asc' ? 1 : -1;

        return list.sort((a, b) => {
            let va = a[key];
            let vb = b[key];

            if (typeof va === 'string' && typeof vb === 'string') {
                return multiplier * (va < vb ? -1 : va > vb ? 1 : 0);
            }

            if (key === 'last_used_at' || key === 'timestamp') {
                va = new Date(va).getTime() || 0;
                vb = new Date(vb).getTime() || 0;
            } else {
                va = Number(va) || 0;
                vb = Number(vb) || 0;
            }

            return multiplier * (va - vb);
        });
    });
}

function toggleSortField(key: string, keyRef: Ref<string>, dirRef: Ref<string>): void {
    if (keyRef.value === key) {
        dirRef.value = dirRef.value === 'asc' ? 'desc' : 'asc';
    } else {
        keyRef.value = key;
        dirRef.value = 'desc';
    }
}

export default defineComponent({
    name: 'ApiManagementPanel',
    components: {
        Info,
        ApiKeysManagementPanel,
    },
    setup() {
        return new Instance();
    },
});

export class Instance {
    public activeTab = ref('by-user');
    public tabs = [
        { id: 'by-user', icon: markRaw(BarChart3), label: '配额消耗', desc: '统一配额池用量' },
        { id: 'by-endpoint', icon: markRaw(Link2), label: '模型调用统计', desc: 'Base URL / 模型维度' },
        { id: 'logs', icon: markRaw(ScrollText), label: '调用日志', desc: '请求明细追踪' },
        { id: 'quota', icon: markRaw(Settings), label: 'API 额度设置', desc: '统一 API 额度池' },
        { id: 'api-keys', icon: markRaw(KeyRound), label: '密钥管理', desc: '第三方密钥池' },
    ];

    // 用户统计
    public userStats = ref<any[]>([]);
    public loadingUserStats = ref(false);
    public userStatsFilter = ref({ days: 7 });
    public userStatsSearch = ref('');
    public sortKey = ref('total_cost');
    public sortDir = ref('desc');
    public userStatsColumns = [
        { key: 'username', label: '用户名' },
        { key: 'role', label: '角色' },
        { key: 'total_cost', label: '总消耗配额' },
        { key: 'today_cost', label: '今日消耗' },
        { key: 'active_days', label: '活跃天数' },
        { key: 'last_used_at', label: '最后使用' },
    ];

    // 模型调用统计
    public endpointStats = ref<any[]>([]);
    public loadingEndpointStats = ref(false);
    public endpointStatsFilter = ref({ days: 7 });
    public endpointSortKey = ref('call_count');
    public endpointSortDir = ref('desc');
    public endpointStatsColumns = [
        { key: 'base_url', label: 'Base URL' },
        { key: 'model', label: '模型' },
        { key: 'call_count', label: '调用次数' },
        { key: 'success_count', label: '成功' },
        { key: 'error_count', label: '错误' },
        { key: 'avg_response_time_ms', label: '平均响应时间' },
        { key: 'max_response_time_ms', label: '最大/最小响应时间' },
        { key: 'last_used_at', label: '最后使用' },
    ];

    // API 日志
    public apiLogs = ref<any[]>([]);
    public loadingLogs = ref(false);
    public logsFilter = ref({
        username: '',
        endpoint: '',
        days: 7,
        limit: 50,
        offset: 0,
    });
    public logsSortKey = ref('timestamp');
    public logsSortDir = ref('desc');
    public logsColumns = [
        { key: 'timestamp', label: '时间' },
        { key: 'username', label: '用户' },
        { key: 'role', label: '角色' },
        { key: 'api_endpoint', label: 'API 端点' },
        { key: 'status_code', label: '状态码' },
        { key: 'response_time_ms', label: '响应时间' },
    ];

    // 统一 API 额度池
    public apiQuota = ref({ guest: 100, registered: 1000 });
    public loadingQuota = ref(false);
    public editingQuota = ref(false);
    public savingQuota = ref(false);
    public quotaDraft = ref({ guest_limit: 100, registered_limit: 1000 });

    public sortedUserStats: ReturnType<typeof createSortedComputed>;
    public sortedEndpointStats: ReturnType<typeof createSortedComputed>;
    public sortedLogs: ReturnType<typeof createSortedComputed>;

    private message = useMessage();

    constructor() {
        const filteredUserStats = computed(() => {
            const keyword = this.userStatsSearch.value.trim().toLowerCase();
            return keyword
                ? this.userStats.value.filter((s: any) =>
                      String(s.username || '').toLowerCase().includes(keyword),
                  )
                : this.userStats.value;
        });

        this.sortedUserStats = createSortedComputed(filteredUserStats, this.sortKey, this.sortDir);
        this.sortedEndpointStats = createSortedComputed(
            this.endpointStats,
            this.endpointSortKey,
            this.endpointSortDir,
        );
        this.sortedLogs = createSortedComputed(this.apiLogs, this.logsSortKey, this.logsSortDir);

        onMounted(async () => {
            await this.loadUserStats();
            await this.loadEndpointStats();
            await this.loadLogs();
            await this.loadQuotaConfig();
        });
    }

    public selectTab = (tabId: string) => {
        if (!this.tabs.some((tab) => tab.id === tabId)) return;
        this.activeTab.value = tabId;
    };

    public toggleSort = (key: string) => {
        toggleSortField(key, this.sortKey, this.sortDir);
    };

    public toggleEndpointSort = (key: string) => {
        toggleSortField(key, this.endpointSortKey, this.endpointSortDir);
    };

    public toggleLogsSort = (key: string) => {
        toggleSortField(key, this.logsSortKey, this.logsSortDir);
    };

    public formatTime = (isoString: any) => {
        return formatDateTime(isoString, {
            locale: 'zh-CN',
            withSeconds: true,
            invalidText: null,
        });
    };

    public formatEndpoint = (endpoint: string) => {
        if (!endpoint) return 'N/A';
        const parts = endpoint.split('/');
        return parts.slice(-2).join('/') || endpoint;
    };

    public calcSuccessRate = (successCount: number, totalCount: number) => {
        if (totalCount === 0) return '0';
        return ((successCount / totalCount) * 100).toFixed(1);
    };

    public getStatusClass = (statusCode: number) => {
        if (statusCode >= 200 && statusCode < 300) return 'success';
        if (statusCode >= 400 && statusCode < 500) return 'client-error';
        if (statusCode >= 500) return 'server-error';
        return 'info';
    };

    public loadUserStats = async () => {
        this.loadingUserStats.value = true;
        try {
            const result = await apiAdminQuotaUsageByUser(this.userStatsFilter.value.days, 100);
            this.userStats.value = result?.data || [];
        } catch (error: any) {
            this.message.error(`加载配额统计失败: ${error.message}`);
        } finally {
            this.loadingUserStats.value = false;
        }
    };

    public loadEndpointStats = async () => {
        this.loadingEndpointStats.value = true;
        try {
            const result = await apiAdminApiUsageByModel(this.endpointStatsFilter.value.days, 50);
            this.endpointStats.value = result?.data || [];
        } catch (error: any) {
            this.message.error(`加载模型统计失败: ${error.message}`);
        } finally {
            this.loadingEndpointStats.value = false;
        }
    };

    public loadLogs = async () => {
        this.loadingLogs.value = true;
        try {
            const result = await apiAdminApiLogs(
                this.logsFilter.value.limit,
                this.logsFilter.value.offset,
                this.logsFilter.value.username || undefined,
                this.logsFilter.value.endpoint || undefined,
                this.logsFilter.value.days,
            );
            this.apiLogs.value = result?.data || [];
        } catch (error: any) {
            this.message.error(`加载日志失败: ${error.message}`);
        } finally {
            this.loadingLogs.value = false;
        }
    };

    public prevLogsPage = async () => {
        if (this.loadingLogs.value || this.logsFilter.value.offset === 0) return;
        this.logsFilter.value.offset = Math.max(
            0,
            this.logsFilter.value.offset - this.logsFilter.value.limit,
        );
        await this.loadLogs();
    };

    public nextLogsPage = async () => {
        if (this.loadingLogs.value || this.apiLogs.value.length < this.logsFilter.value.limit) return;
        this.logsFilter.value.offset += this.logsFilter.value.limit;
        await this.loadLogs();
    };

    public loadQuotaConfig = async () => {
        this.loadingQuota.value = true;
        try {
            const result = await apiAdminGetApiQuota();
            const src = result?.data;
            if (
                src &&
                typeof src.guest_daily_quota === 'number' &&
                typeof src.registered_daily_quota === 'number'
            ) {
                this.apiQuota.value = {
                    guest: src.guest_daily_quota,
                    registered: src.registered_daily_quota,
                };
            } else {
                this.apiQuota.value = { guest: 100, registered: 1000 };
            }
        } catch (error: any) {
            console.warn('[ApiManagementPanel] 读取 API 额度失败:', error);
            this.message.error(`加载额度失败: ${error.message}`);
        } finally {
            this.loadingQuota.value = false;
        }
    };

    public startEditQuota = () => {
        this.quotaDraft.value = {
            guest_limit: this.apiQuota.value.guest,
            registered_limit: this.apiQuota.value.registered,
        };
        this.editingQuota.value = true;
    };

    public cancelEditQuota = () => {
        this.editingQuota.value = false;
    };

    public saveQuotaConfig = async () => {
        const guestLimit = Number(this.quotaDraft.value.guest_limit);
        const registeredLimit = Number(this.quotaDraft.value.registered_limit);

        if (!Number.isFinite(guestLimit) || guestLimit < 1) {
            this.message.error('游客每日限额必须 ≥ 1');
            return;
        }
        if (!Number.isFinite(registeredLimit) || registeredLimit < 1) {
            this.message.error('注册用户每日限额必须 ≥ 1');
            return;
        }

        this.savingQuota.value = true;
        try {
            await apiAdminUpdateApiQuota(guestLimit, registeredLimit);
            this.message.success('API 额度已保存');
            this.editingQuota.value = false;
            await this.loadQuotaConfig();
        } catch (error: any) {
            this.message.error(`保存额度失败: ${error.message}`);
        } finally {
            this.savingQuota.value = false;
        }
    };
}
