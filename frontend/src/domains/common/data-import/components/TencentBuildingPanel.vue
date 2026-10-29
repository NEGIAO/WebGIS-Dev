<template>
    <div class="txb-panel">
        <div
            v-if="complianceDialogOpen"
            class="txb-dialog-backdrop"
            role="presentation"
            @click.self="resolveComplianceDialog(false)"
        >
            <section
                class="txb-dialog"
                role="dialog"
                aria-modal="true"
                :aria-labelledby="complianceDialogTitleId"
            >
                <h3
                    :id="complianceDialogTitleId"
                    class="txb-dialog-title"
                >
                    {{ t('shell.buildings.complianceTitle') }}
                </h3>
                <p class="txb-dialog-message">
                    {{ t('shell.buildings.compliancePopup') }}
                </p>
                <div class="txb-dialog-actions">
                    <button
                        type="button"
                        class="txb-btn txb-btn-ghost"
                        @click="resolveComplianceDialog(false)"
                    >
                        {{ t('shell.buildings.complianceCancel') }}
                    </button>
                    <button
                        type="button"
                        class="txb-btn txb-btn-primary"
                        @click="resolveComplianceDialog(true)"
                    >
                        {{ t('shell.buildings.complianceContinue') }}
                    </button>
                </div>
            </section>
        </div>

        <div class="txb-header">
            <span class="txb-header-icon">
                <Building2 :size="16" />
            </span>
            <div class="txb-header-text">
                <div class="txb-title">{{ isTianditu ? t('shell.buildings.vectorTitle') : t('shell.buildings.title') }}</div>
                <div class="txb-subtitle">{{ isTianditu
                    ? t('shell.buildings.vectorSubtitle', { engine: engineLabel })
                    : t('shell.buildings.subtitle', { engine: engineLabel }) }}</div>
            </div>
            <button
                type="button"
                class="txb-close"
                :aria-label="t('shell.buildings.close')"
                :title="t('shell.buildings.close')"
                @click="$emit('close')"
            >
                <X :size="14" />
            </button>
        </div>

        <div class="txb-body">
            <div
                class="txb-source-tabs"
                role="tablist"
            >
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="tencent"
                    :class="{ active: source === 'tencent' }"
                    :disabled="isFetching"
                    @click="source = 'tencent'"
                >
                    <Building2 :size="13" />
                    {{ t('shell.buildings.sourceTencent') }}
                </button>
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="amap"
                    :class="{ active: source === 'amap' }"
                    :disabled="isFetching"
                    @click="source = 'amap'"
                >
                    <MapPin :size="13" />
                    {{ t('shell.buildings.sourceAmap') }}
                </button>
                <button
                    type="button"
                    class="txb-source-tab"
                    data-s="tianditu"
                    :class="{ active: source === 'tianditu' }"
                    :disabled="isFetching"
                    @click="source = 'tianditu'"
                >
                    <MapPin :size="13" />
                    {{ t('shell.buildings.sourceTianditu') }}
                </button>
            </div>
            <div class="txb-source-desc">
                {{ isAmap ? t('shell.buildings.sourceDescAmap') : (isTianditu ? t('shell.buildings.sourceDescTianditu') : t('shell.buildings.sourceDescTencent')) }}
            </div>
            <!-- 临时凭证（可选）：留空即用管理端 L2 配置。
                 刻意不用 type="password" —— Chrome 密码管理器对 password 字段忽略
                 autocomplete="off"，会把本 origin 保存的登录密码自动填入（凭据库按 origin
                 索引，与会话身份无关，游客态下同样会填管理员密码），该值曾以 ?key= / ?tk=
                 明文发往第三方。改用 text + CSS 遮蔽后，密码管理器不再将其识别为凭据框。 -->
            <label class="txb-field txb-token-field">
                <span>{{ isTianditu ? t('shell.buildings.tiandituTk') : (isAmap ? t('shell.buildings.amapKey') : t('shell.buildings.sourceCredential')) }}</span>
                <input
                    v-model="sourceCredential"
                    type="text"
                    class="txb-credential-input"
                    :name="`map-source-credential-${source}`"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    :placeholder="isTianditu
                        ? t('shell.buildings.tiandituTkPlaceholder')
                        : (isAmap ? t('shell.buildings.amapKeyPlaceholder') : t('shell.buildings.sourceCredentialTencentPlaceholder'))"
                />
            </label>
            <div class="txb-section-title">{{ t('shell.buildings.range') }}</div>
            <div class="txb-grid">
                <label class="txb-field">
                    <span>{{ t('shell.buildings.minLng') }}</span>
                    <input
                        v-model="form.minLng"
                        type="number"
                        step="0.0001"
                        placeholder="112.00"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.minLat') }}</span>
                    <input
                        v-model="form.minLat"
                        type="number"
                        step="0.0001"
                        placeholder="32.00"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.maxLng') }}</span>
                    <input
                        v-model="form.maxLng"
                        type="number"
                        step="0.0001"
                        placeholder="112.05"
                    />
                </label>
                <label class="txb-field">
                    <span>{{ t('shell.buildings.maxLat') }}</span>
                    <input
                        v-model="form.maxLat"
                        type="number"
                        step="0.0001"
                        placeholder="32.05"
                    />
                </label>
            </div>

            <div class="txb-row">
                <label class="txb-zoom">
                    <span>{{ t('shell.buildings.zoom') }}</span>
                    <select
                        v-if="!isAmap"
                        v-model.number="zoom"
                    >
                        <option
                            v-for="z in zoomOptions"
                            :key="z"
                            :value="z"
                        >
                            z{{ z }}
                        </option>
                    </select>
                    <span
                        v-else
                        class="txb-zoom-fixed"
                    >z14（{{ t('shell.buildings.zoomFixed') }}）</span>
                </label>
            </div>

            <!-- 天地图全量：多选勾选（含全选），腾讯/高德 tab 不渲染 -->
            <div
                v-if="isTianditu"
                class="txb-layers"
            >
                <div class="txb-section-title">{{ t('shell.buildings.vectorLayers') }}</div>
                <label class="txb-layer-all">
                    <input
                        type="checkbox"
                        :checked="allVectorLayersChecked"
                        :disabled="isFetching"
                        @change="toggleAllVectorLayers"
                    />
                    <span>{{ t('shell.buildings.vectorLayersAll') }}</span>
                </label>
                <div class="txb-layer-grid">
                    <label
                        v-for="opt in vectorLayerOptions"
                        :key="opt.value"
                        class="txb-layer-item"
                        :title="opt.desc"
                    >
                        <input
                            type="checkbox"
                            :value="opt.value"
                            :checked="selectedLayerList.includes(opt.value)"
                            :disabled="isFetching"
                            @change="toggleVectorLayer(opt.value)"
                        />
                        <span>{{ opt.label }}</span>
                    </label>
                </div>
                <div
                    v-if="!selectedLayerList.length"
                    class="txb-layer-hint"
                >
                    {{ t('shell.buildings.vectorLayersEmpty') }}
                </div>
            </div>

            <!-- 框选：OL 用 DragBox 自包含组件，Cesium 用三维拾取镜像版 -->
            <ExtentPicker
                v-if="props.activeEngine !== 'cesium'"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
                @extent-clear="clearFormBbox"
            />
            <CesiumExtentPicker
                v-else
                :get-viewer="props.getCesiumViewer"
                :get-cesium="props.getCesium"
                :disabled="isFetching"
                @extent-change="onExtentPicked"
                @extent-clear="clearFormBbox"
            />

            <div
                v-if="estimate"
                class="txb-estimate"
            >
                {{ t('shell.buildings.estimate', { tiles: estimate.tiles, batches: estimate.batches, seconds: estimate.seconds }) }}
            </div>

            <div class="txb-actions">
                <button
                    v-if="!isFetching"
                    type="button"
                    class="txb-btn txb-btn-primary"
                    :disabled="!canFetch"
                    @click="onFetch"
                >
                    <Building2 :size="14" />
                    {{ isTianditu ? t('shell.buildings.vectorFetch') : t('shell.buildings.fetch') }}
                </button>
                <button
                    v-else
                    type="button"
                    class="txb-btn txb-btn-danger"
                    @click="cancel"
                >
                    <X :size="14" />
                    {{ t('shell.buildings.cancel') }}
                </button>
            </div>

            <div
                v-if="isFetching"
                class="txb-progress"
            >
                <div class="txb-progress-track">
                    <div
                        class="txb-progress-fill"
                        :style="{ width: progressPercent + '%' }"
                    ></div>
                </div>
                <div class="txb-progress-text">
                    {{ t('shell.buildings.progress', { done: progress.done, total: progress.total, count: progress.count }) }}
                </div>
            </div>

            <div
                v-if="errorText"
                class="txb-error"
            >
                <TriangleAlert :size="14" />
                <span>{{ errorText }}</span>
            </div>

            <div
                v-if="status === 'done' && result"
                class="txb-result"
            >
                <div class="txb-result-text">
                    {{ isTiandituVectorResult
                        ? t('shell.buildings.vectorResult', { count: result.featureCount, seconds: (result.elapsedMs / 1000).toFixed(1), layers: vectorLayerCount })
                        : t('shell.buildings.result', { count: result.featureCount, seconds: (result.elapsedMs / 1000).toFixed(1) }) }}
                </div>
                <!-- 全量分层明细：每层要素数（供用户核对 12 层产出） -->
                <ul
                    v-if="isTiandituVectorResult"
                    class="txb-vector-stats"
                >
                    <li
                        v-for="(stat, code) in result.layerStats"
                        :key="code"
                    >
                        {{ code }} · {{ vectorLayerLabel(code) }}：{{ layerFeatureCount(code) }}
                    </li>
                </ul>
                <div
                    v-if="!result.featureCount"
                    class="txb-empty"
                >
                    {{ t('shell.buildings.empty') }}
                </div>
                <div class="txb-actions">
                    <button
                        type="button"
                        class="txb-btn txb-btn-ghost"
                        @click="downloadResult"
                    >
                        <Download :size="14" />
                        {{ t('shell.buildings.download') }}
                    </button>
                </div>
            </div>

            <div class="txb-compliance">
                <label class="txb-compliance-check">
                    <input
                        v-model="complianceAccepted"
                        type="checkbox"
                    />
                    <span>{{ t('shell.buildings.complianceAgree') }}</span>
                </label>
                <ul class="txb-compliance-list">
                    <li>{{ t('shell.buildings.complianceRuleAuth') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleBulk') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleNoBypass') }}</li>
                    <li>{{ t('shell.buildings.complianceRuleTerms') }}</li>
                </ul>
            </div>

            <div class="txb-note">
                {{ isAmap ? t('shell.buildings.disclaimerAmap') : (isTianditu ? t('shell.buildings.disclaimerTianditu') : t('shell.buildings.disclaimer')) }}
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
    Building2,
    Download,
    MapPin,
    TriangleAlert,
    X,
} from '@lucide/vue';
import ExtentPicker from '@common/components/ExtentPicker.vue';
import CesiumExtentPicker from '@common/components/CesiumExtentPicker.vue';
import { useLocale } from '@common/app/useLocale';
import { useMessage } from '@common/shell/useMessage';
import {
    AMAP_DEFAULT_ZOOM,
    estimateAmapTiles,
    useAmapBuildingFetch,
} from '../useAmapBuildingFetch';
import {
    estimateTdtVectorTiles,
    TDT_DEFAULT_ZOOM,
    TDT_ZOOM_OPTIONS,
    useTdtBuildingFetch,
} from '../useTdtBuildingFetch';
import {
    TXB_DEFAULT_ZOOM,
    TXB_ZOOM_OPTIONS,
    estimateTxbTiles,
    useTencentBuildingFetch,
} from '../useTencentBuildingFetch';
import { ALL_TDT_VECTOR_LAYERS, TDT_VECTOR_LAYER_META, tdtVectorLayerOptions } from '../parsers/tdtVectorLayers.js';

/**
 * 腾讯建筑白模抓取面板：范围表单 + 抓取进度 + 入库/下载。
 * 入库经 upload-data 事件交上层按引擎路由（ OL / Cesium 自动进 TOC 对应分组）。
 */
const props = defineProps({
    /** 返回 Cesium Viewer（3D 框选，HomeView 经 SidePanel 注入） */
    getCesiumViewer: {
        type: Function,
        default: null,
    },
    /** 返回 Cesium 命名空间（3D 框选） */
    getCesium: {
        type: Function,
        default: null,
    },
    /** 当前引擎 'ol' | 'cesium'（决定用哪种框选） */
    activeEngine: {
        type: String,
        default: 'ol',
    },
});

const emit = defineEmits(['upload-data', 'close']);

const { t } = useLocale();
const message = useMessage();

/** 数据源：tencent（腾讯）| amap（高德）| tianditu（天地图，走管理端 L2 tk） */
const source = ref('tencent');
const isAmap = computed(() => source.value === 'amap');
const isTianditu = computed(() => source.value === 'tianditu');
const txb = useTencentBuildingFetch();
const amb = useAmapBuildingFetch();
const tdb = useTdtBuildingFetch();
/** 当前源实例；下述桥接把内层 ref 拍平，模板/逻辑写法与单源时一致 */
const cur = computed(() => (isAmap.value ? amb : (isTianditu.value ? tdb : txb)));
/** 桥接：在 getter 内取内层 .value（computed 不拍平返回的 ref，不能直接透传） */
const status = computed(() => cur.value.status.value);
const isFetching = computed(() => cur.value.isFetching.value);
const progress = computed(() => cur.value.progress.value);
const error = computed(() => cur.value.error.value);
const result = computed(() => cur.value.result.value);
const fileName = computed(() => cur.value.fileName.value);
const cancel = (...args) => cur.value.cancel(...args);
const buildImportFile = (...args) => cur.value.buildImportFile(...args);
const downloadResult = (...args) => {
    // 天地图全量走分层下载，其余走单文件下载。
    if (isTianditu.value && tdb.vectorResult.value) return tdb.downloadVectorResult(...args);
    return cur.value.downloadResult(...args);
};
const startFetch = (...args) => cur.value.startFetch(...args);
/** 天地图多选选项（码 + 中文含义，腾讯/高德扩展口同形状） */
const vectorLayerOptions = computed(() => tdtVectorLayerOptions().filter((o) => o.value !== 'all'));
/** 选中层码数组（模板直接消费，避免嵌套 ref 不解包） */
const selectedLayerList = computed(() => tdb.selectedLayers.value || []);
/** 是否全选（与 hook selectedLayers 双向） */
const allVectorLayersChecked = computed(() => tdb.selectedLayers.value.length === ALL_TDT_VECTOR_LAYERS.length);
/** 全量结果判定（result 带 vector 标记才走分层展示/入库） */
const isTiandituVectorResult = computed(() => isTianditu.value && !!result.value?.vector);
const vectorLayerCount = computed(() => (result.value?.layerStats ? Object.keys(result.value.layerStats).length : 0));

function toggleVectorLayer(code) {
    // 允许清空到 0 层（抓取按钮禁用 + 提示，不再静默回退全量）
    const set = new Set(tdb.selectedLayers.value);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    tdb.selectedLayers.value = ALL_TDT_VECTOR_LAYERS.filter((c) => set.has(c));
}

function toggleAllVectorLayers() {
    // 全选 ⇄ 全不选：已全选则清空，否则全选
    tdb.selectedLayers.value = allVectorLayersChecked.value ? [] : ALL_TDT_VECTOR_LAYERS.slice();
}

function vectorLayerLabel(code) {
    return TDT_VECTOR_LAYER_META[code]?.label || code;
}

function layerFeatureCount(code) {
    return tdb.vectorResult.value?.layers?.[code]?.features?.length || 0;
}

const form = reactive({ minLng: '', minLat: '', maxLng: '', maxLat: '' });
/** 三个数据源各自的临时凭证草稿（留空 = 用管理端 L2）；分开存，避免切 tab 时把 A 源的凭证发给 B 源 */
const credentials = reactive({ tencent: '', amap: '', tianditu: '' });
/** 当前数据源对应的输入框绑定：显示各自的草稿，切换 tab 不串值 */
const sourceCredential = computed({
    get: () => credentials[source.value] || '',
    set: (value) => {
        credentials[source.value] = String(value ?? '');
    },
});
/** 临时凭证格式闸门：仅接受 24~64 位字母数字（高德 key / 天地图 tk 实测均为 32 位） */
const CREDENTIAL_PATTERN = /^[A-Za-z0-9]{24,64}$/;

/**
 * 校验临时凭证格式。
 * @param {string} input 用户输入
 * @returns {string} 空串表示通过（含留空走 L2 的情况），否则返回提示文案
 */
function credentialFormatError(input) {
    const value = String(input || '').trim();
    if (!value) return '';
    return CREDENTIAL_PATTERN.test(value) ? '' : t('shell.buildings.err_credential_format');
}
const zoom = ref(TXB_DEFAULT_ZOOM);
const complianceAccepted = ref(false);
const complianceConfirmed = ref(false);
const complianceDialogOpen = ref(false);
const complianceDialogResolve = ref(null);
const complianceDialogTitleId = 'building-compliance-dialog-title';
const COMPLIANCE_CONFIRM_STORAGE_KEY = 'webgis_building_fetch_compliance_confirmed_v1';
/** 静态级别数组，无需 computed 包裹 */
const zoomOptions = computed(() => (isTianditu.value ? TDT_ZOOM_OPTIONS : TXB_ZOOM_OPTIONS));
watch(source, (s) => {
    zoom.value = s === 'amap'
        ? AMAP_DEFAULT_ZOOM
        : (s === 'tianditu' ? TDT_DEFAULT_ZOOM : TXB_DEFAULT_ZOOM);
});

onMounted(() => {
    try {
        complianceConfirmed.value = sessionStorage.getItem(COMPLIANCE_CONFIRM_STORAGE_KEY) === '1';
    } catch {
        complianceConfirmed.value = false;
    }
});

function requestComplianceConfirmation() {
    complianceDialogOpen.value = true;
    return new Promise((resolve) => {
        complianceDialogResolve.value = resolve;
    });
}

function resolveComplianceDialog(confirmed) {
    complianceDialogOpen.value = false;
    const resolve = complianceDialogResolve.value;
    complianceDialogResolve.value = null;
    if (resolve) resolve(confirmed);
}

/** 框选器点“清除”时同步清空表单（表单是抓取的事实来源） */
function clearFormBbox() {
    form.minLng = '';
    form.minLat = '';
    form.maxLng = '';
    form.maxLat = '';
}

/** 解析表单为数值 bbox，非法返回 null */
function parsedBbox() {
    const bbox = {
        minLng: Number.parseFloat(form.minLng),
        minLat: Number.parseFloat(form.minLat),
        maxLng: Number.parseFloat(form.maxLng),
        maxLat: Number.parseFloat(form.maxLat),
    };
    if (Object.values(bbox).some((v) => !Number.isFinite(v))) return null;
    return bbox;
}

const engineLabel = computed(() => (props.activeEngine === 'cesium' ? '3D' : '2D'));

/** 抓取量估算（输入合法时显示，防手滑拉全城；按源走各自瓦片格网） */
const estimate = computed(() => {
    const bbox = parsedBbox();
    if (!bbox) return null;
    try {
        if (isAmap.value) return estimateAmapTiles(bbox, zoom.value);
        if (isTianditu.value) return estimateTdtVectorTiles(bbox, zoom.value);
        return estimateTxbTiles(bbox, zoom.value);
    } catch {
        return null;
    }
});

const canFetch = computed(() => !!parsedBbox() && !isFetching.value
    && (!isTianditu.value || selectedLayerList.value.length > 0));

const progressPercent = computed(() => {
    if (!progress.value.total) return 0;
    return Math.round((progress.value.done / progress.value.total) * 100);
});

/** 错误码转文案（composable 只抛短码，文案归 i18n） */
const errorText = computed(() => {
    if (!error.value) return '';
    const known = ['empty', 'nan', 'order', 'range', 'oversize', 'key_required', 'tdt_key_required', 'tdt_permission', 'layers_required'];
    if (known.includes(error.value)) return t(`shell.buildings.err_${error.value}`);
    return t('shell.buildings.fetchFailed', { error: error.value });
});

/** 框选完成：ExtentPicker / CesiumExtentPicker 同形 payload，直接填表 */
function onExtentPicked({ extent } = {}) {
    if (!Array.isArray(extent) || extent.length !== 4) return;
    const [minLng, minLat, maxLng, maxLat] = extent;
    if ([minLng, minLat, maxLng, maxLat].some((v) => !Number.isFinite(Number(v)))) return;
    form.minLng = String(Number(minLng).toFixed(4));
    form.minLat = String(Number(minLat).toFixed(4));
    form.maxLng = String(Number(maxLng).toFixed(4));
    form.maxLat = String(Number(maxLat).toFixed(4));
}

/** 开始抓取；成功后按当前引擎自动入库（上层 upload-data 按引擎路由） */
async function onFetch() {
    if (!complianceAccepted.value) {
        message.warning(t('shell.buildings.err_compliance_required'));
        return;
    }
    if (!complianceConfirmed.value) {
        const ok = await requestComplianceConfirmation();
        if (!ok) {
            return;
        }
        complianceConfirmed.value = true;
        try {
            sessionStorage.setItem(COMPLIANCE_CONFIRM_STORAGE_KEY, '1');
        } catch {
            // ignore storage failures
        }
    }

    const bbox = parsedBbox();
    if (!bbox) {
        message.warning(t('shell.buildings.err_nan'));
        return;
    }
    // 临时凭证只做「本次使用」，留空则回落到管理端 L2；格式不符时中止，绝不把可疑串发往第三方。
    const credential = credentials[source.value].trim();
    const credentialError = credentialFormatError(credential);
    if (credentialError) {
        message.warning(credentialError);
        return;
    }
    // 天地图走全量分层抓取（多选层码），腾讯/高德走各自单源抓取。
    if (isTianditu.value) {
        const out = await tdb.startVectorFetch(bbox, zoom.value, credential, tdb.selectedLayers.value);
        if (!out) return;
        const files = tdb.buildVectorImportFiles();
        if (!files.length) {
            message.warning(t('shell.buildings.empty'));
            return;
        }
        emit('upload-data', { resources: files });
        message.success(t('shell.buildings.vectorImported', { layers: files.length, count: result.value?.featureCount || 0 }));
        return;
    }
    // 高德可带临时 key，留空由 composable 回落到管理端 L2；腾讯白模当前无需凭证，不传第三参。
    const fc = isAmap.value
        ? await amb.startFetch(bbox, zoom.value, credential)
        : await startFetch(bbox, zoom.value);
    if (!fc) return;
    if (!fc.features.length) {
        message.warning(t('shell.buildings.empty'));
        return;
    }
    const file = buildImportFile();
    if (file) {
        emit('upload-data', { resources: [file] });
        message.success(t('shell.buildings.imported', { name: fileName.value }));
    } else {
        message.success(t('shell.buildings.result', { count: fc.features.length, seconds: ((result.value?.elapsedMs || 0) / 1000).toFixed(1) }));
    }
}
</script>

<style scoped>
/* 主题语言：白卡片 + 浅绿边框 + 品牌渐变头（与 DrawPanel/TopBar 一致） */
.txb-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    color: var(--toc-text-primary);
    font-size: 12px;
}

.txb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--brand-gradient);
    color: #ffffff;
}

.txb-header-icon {
    display: inline-flex;
    flex-shrink: 0;
}

.txb-header-text {
    flex: 1;
    min-width: 0;
}

.txb-title {
    font-size: 13px;
    font-weight: 700;
}

.txb-subtitle {
    font-size: 11px;
    opacity: 0.85;
}

.txb-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.16);
    color: #ffffff;
    cursor: pointer;
}

.txb-close:hover {
    background: rgba(255, 255, 255, 0.32);
}

.txb-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    border-radius: 10px;
    background: #ffffff;
}

.txb-section-title {
    color: var(--brand-accent-dark);
    font-size: 12px;
    font-weight: 700;
}

.txb-source-tabs {
    display: flex;
    gap: 4px;
    padding: 3px;
    border-radius: 9px;
    background: rgba(var(--brand-primary-rgb), 0.08);
}

.txb-source-tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 6px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--toc-text-secondary);
    font-size: 12px;
    cursor: pointer;
}

.txb-source-tab.active {
    background: #ffffff;
    color: var(--brand-accent-dark);
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(var(--brand-primary-dark-rgb), 0.18);
}

/* 高德 tab 用绿色系区分（腾讯保持品牌蓝） */
.txb-source-tab.active[data-s="amap"] {
    background: #f0fdf4;
    color: #15803d;
}

.txb-source-desc {
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--toc-primary-bg);
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.5;
}

.txb-source-tab:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

/* 全量多选：全选行 + 12 层两列勾选（与范围表单同语言） */
.txb-layers {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.3);
    border-radius: 8px;
    background: rgba(var(--brand-primary-rgb), 0.04);
}

.txb-layer-all {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--toc-text-primary);
    font-size: 12px;
    font-weight: 700;
}

.txb-layer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 8px;
}

.txb-layer-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.4;
}

.txb-layer-hint {
    color: var(--danger);
    font-size: 11px;
    line-height: 1.4;
}

.txb-vector-stats {
    margin: 6px 0 0;
    padding-left: 16px;
    color: var(--toc-text-secondary);
    font-size: 11px;
    line-height: 1.6;
}

.txb-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.txb-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-field input,
.txb-zoom select {
    height: 28px;
    padding: 0 8px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    border-radius: 8px;
    background: #fff;
    color: var(--toc-text-primary, #333);
    font-size: 12px;
    outline: none;
}

.txb-field input:focus,
.txb-zoom select:focus {
    border-color: var(--brand-primary);
}

/* 凭证框遮蔽：用 text + CSS 文本遮蔽替代 type="password"。
   password 类型会被浏览器密码管理器强行填充（autocomplete="off" 对其无效），
   改为 text 后不再被识别为登录凭据框；Firefox 不支持该属性，退化为明文显示。 */
.txb-credential-input {
    -webkit-text-security: disc;
    letter-spacing: 1px;
}

.txb-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
}

.txb-zoom {
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-zoom-fixed {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 8px;
    color: var(--toc-text-secondary);
    font-size: 12px;
}

.txb-estimate {
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-actions {
    display: flex;
    gap: 8px;
}

.txb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
}

.txb-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.txb-btn-primary {
    background: var(--brand-gradient);
    color: #ffffff;
}

.txb-btn-primary:hover:not(:disabled) {
    filter: brightness(1.06);
}

.txb-btn-ghost {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.25);
    background: #ffffff;
    color: var(--brand-accent-dark);
}

.txb-btn-ghost:hover:not(:disabled) {
    background: var(--toc-primary-bg-hover);
}

.txb-btn-danger {
    background: rgba(var(--danger-rgb), 0.12);
    color: var(--danger);
}

.txb-progress-track {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: rgba(var(--brand-primary-rgb), 0.12);
}

.txb-progress-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--brand-gradient);
    transition: width 0.2s ease;
}

.txb-progress-text {
    margin-top: 4px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(var(--danger-rgb), 0.08);
    color: var(--danger);
    font-size: 11px;
}

.txb-result-text {
    color: var(--brand-accent-dark);
    font-weight: 600;
}

.txb-empty {
    margin-top: 2px;
    color: var(--toc-text-secondary);
    font-size: 11px;
}

.txb-note {
    color: var(--toc-text-light);
    font-size: 11px;
    line-height: 1.5;
}

.txb-dialog-backdrop {
    position: fixed;
    z-index: var(--z-modal-high);
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.46);
}

.txb-dialog {
    width: min(440px, 100%);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 12px;
    background: var(--toc-bg-dialog, #ffffff);
    box-shadow: var(--toc-shadow-dialog, 0 16px 48px rgba(15, 23, 42, 0.24));
    padding: 18px;
}

.txb-dialog-title {
    margin: 0 0 10px;
    color: var(--toc-text-primary);
    font-size: 16px;
}

.txb-dialog-message {
    margin: 0;
    color: var(--toc-text-secondary);
    font-size: 12px;
    line-height: 1.7;
    white-space: pre-line;
}

.txb-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
}

.txb-compliance {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 8px;
    background: rgba(var(--brand-primary-rgb), 0.06);
    padding: 8px 10px;
}

.txb-compliance-check {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--toc-text-primary);
    line-height: 1.5;
}

.txb-compliance-check input {
    margin-top: 2px;
}

.txb-compliance-list {
    margin: 0;
    padding-left: 16px;
    color: var(--toc-text-secondary);
    line-height: 1.5;
}

@media (max-width: 768px) {
    .txb-panel {
        padding: 10px;
    }

    .txb-btn {
        min-height: 36px;
        font-size: 13px;
    }
}
</style>
