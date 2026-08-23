<template>
    <div
        class="route-planner-panel"
        :class="`is-${mode}`"
    >
        <!-- 头部 -->
        <div class="panel-head">
            <span class="panel-badge">
                <Bus
                    v-if="mode === 'bus'"
                    :size="16"
                    :stroke-width="1.9"
                />
                <Car
                    v-else
                    :size="16"
                    :stroke-width="1.9"
                />
            </span>
            <div class="heading">
                <div class="title">{{ mode === 'bus' ? t('routing.busTitle') : t('routing.driveTitle') }}</div>
                <div class="title-sub">
                    {{ mode === 'bus' ? 'Transit Route Planner' : 'Driving & Walking Routing' }}
                </div>
            </div>
            <button
                class="close-btn"
                :aria-label="t('routing.close')"
                @click="$emit('close')"
            >
                <X
                    :size="14"
                    :stroke-width="2.2"
                />
            </button>
        </div>

        <!-- 起终点选择 -->
        <MapPointPickerCard
            :pick-mode="pickMode"
            :start-point="startPoint"
            :end-point="endPoint"
            :start-address="startAddress"
            :end-address="endAddress"
            :tianditu-tk="token"
            :theme="mode"
            :start-label="t('routing.setStartShort')"
            :end-label="t('routing.setEndShort')"
            :start-picking-text="t('routing.startHint')"
            :end-picking-text="t('routing.endHint')"
            :start-title="t('routing.startPoint')"
            :end-title="t('routing.endPoint')"
            :search-placeholder="t('routing.searchPlaceholder')"
            @pick-start="enablePick('start')"
            @pick-end="enablePick('end')"
            @select-start-result="onSelectStartResult"
            @select-end-result="onSelectEndResult"
        />

        <!-- 策略 + 规划按钮 -->
        <div class="join-bar">
            <span class="join-lead">
                <Route
                    :size="13"
                    :stroke-width="2"
                />
            </span>
            <select
                v-model="strategy"
                class="join-select"
            >
                <option
                    v-for="opt in strategyOptions"
                    :key="opt.value"
                    :value="opt.value"
                >
                    {{ opt.label }}
                </option>
            </select>
            <button
                class="join-go"
                :disabled="planning"
                @click="mode === 'bus' ? startTransitPlan() : startDriveSearch()"
            >
                {{ planButtonText }}
            </button>
        </div>

        <!-- 状态行 -->
        <div
            v-if="errorMsg"
            class="status-line error"
        >
            <TriangleAlert
                :size="12"
                :stroke-width="2"
            />
            <span>{{ errorMsg }}</span>
        </div>
        <div
            v-else-if="pickMode === 'start'"
            class="status-line"
        >
            {{ t('routing.pickStartOnMap') }}
        </div>
        <div
            v-else-if="pickMode === 'end'"
            class="status-line"
        >
            {{ t('routing.pickEndOnMap') }}
        </div>

        <!-- 调试信息 -->
        <details class="debug-box">
            <summary>{{ t('routing.debugInfo') }}</summary>
            <template v-if="mode === 'bus'">
                <div class="debug-row">
                    <span>{{ t('routing.requestStatus') }}</span><span>{{ debug.status }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.resultCode') }}</span><span>{{ debug.resultCode || '-' }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.groupCount') }}</span><span>{{ debug.groupCount }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.lineCount') }}</span><span>{{ debug.lineCount }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.requestUrl') }}</span><span class="debug-text">{{ debug.requestUrl || t('routing.noRequestYet') }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.responseShape') }}</span><span class="debug-text">{{ debug.responseShape || '-' }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.candidateCount') }}</span><span>{{ debug.candidateCount }}</span>
                </div>
            </template>
            <template v-else>
                <div class="debug-row">
                    <span>{{ t('routing.requestStatus') }}</span><span>{{ debug.status }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.requestUrl') }}</span><span class="debug-text">{{ debug.requestUrl || '-' }}</span>
                </div>
                <div class="debug-row">
                    <span>distance</span><span>{{ debug.rawDistance || '-' }}</span>
                </div>
                <div class="debug-row">
                    <span>duration</span><span>{{ debug.rawDuration || '-' }}</span>
                </div>
                <div class="debug-row">
                    <span>{{ t('routing.stepCount') }}</span><span>{{ debug.stepCount }}</span>
                </div>
            </template>
            <div class="debug-row">
                <span>{{ t('routing.hint') }}</span><span class="debug-text">{{ debug.message || '-' }}</span>
            </div>
        </details>

        <!-- 结果区：公交 = 候选方案 + 分段步骤；驾车 = 概览 + 步骤 -->
        <div
            v-if="mode === 'bus'"
            class="planner-main"
        >
            <aside class="result-pane">
                <div class="pane-title">{{ t('routing.candidateRoutes') }}</div>

                <div
                    v-if="routes.length === 0"
                    class="empty-hint"
                >
                    {{ t('routing.busEmpty') }}
                </div>

                <button
                    v-for="(route, idx) in routes"
                    :key="route.id"
                    type="button"
                    class="result-card"
                    :class="{ active: selectedRouteIndex === idx }"
                    @click="handleSelectRoute(route, idx)"
                >
                    <div class="card-head">
                        <div class="card-name">{{ route.lineName }}</div>
                        <span class="card-tag">{{ t('routing.planIndex', { n: idx + 1 }) }}</span>
                    </div>
                    <div class="card-meta">
                        <span>{{ t('routing.durationLabel', { text: t('routing.durationMinutes', { n: route.time }) }) }}</span>
                        <span>{{ t('routing.mileage', { text: route.distanceText }) }}</span>
                    </div>
                </button>
            </aside>

            <aside class="result-pane">
                <div class="pane-title">{{ t('routing.navSteps') }}</div>

                <div
                    v-if="!selectedRoute"
                    class="empty-hint"
                >
                    {{ t('routing.busSelectPlanHint') }}
                </div>

                <button
                    v-for="(step, stepIndex) in selectedRoute?.steps || []"
                    :key="`${selectedRoute?.id || 'route'}_${stepIndex}`"
                    type="button"
                    class="result-card"
                    :class="{ active: selectedBusStepIndex === stepIndex }"
                    @mouseenter="handlePreviewStep(stepIndex)"
                    @mouseleave="clearStepPreview"
                    @click="handleSelectStep(stepIndex)"
                >
                    <div class="card-head">
                        <span class="card-tag">{{ t('routing.stepIndex', { n: stepIndex + 1 }) }}</span>
                        <span class="card-distance">{{ step.distanceText }}</span>
                    </div>
                    <div class="step-line">{{ step.segmentName }}</div>
                    <div class="step-stations">{{ step.startName }} -> {{ step.endName }}</div>
                    <div class="card-meta">
                        <span>{{ step.modeText }}</span>
                        <span>{{ t('routing.durationMinutes', { n: step.time }) }}</span>
                    </div>
                </button>

                <div
                    v-if="selectedRoute && (!selectedRoute.steps || selectedRoute.steps.length === 0)"
                    class="empty-hint"
                >
                    {{ t('routing.busNoSegmentSteps') }}
                </div>
            </aside>
        </div>

        <div
            v-else-if="routeResult"
            class="planner-main"
        >
            <aside class="result-pane">
                <div class="pane-title">{{ t('routing.navResult') }}</div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">{{ t('routing.totalDistance') }}</div>
                        <div class="summary-value">{{ routeResult.distanceText }}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">{{ t('routing.totalDuration') }}</div>
                        <div class="summary-value">{{ routeResult.durationText }}</div>
                    </div>
                </div>

                <div class="pane-title pane-title-steps">{{ t('routing.navSteps') }}</div>
                <button
                    v-for="(step, index) in routeResult.steps"
                    :key="`${index}_${step.text.slice(0, 20)}`"
                    type="button"
                    class="result-card step-bordered"
                    :class="{ active: selectedDriveStepIndex === index }"
                    :style="{ '--step-color': getStepColor(index) }"
                    @mouseenter="handlePreviewDriveStep(index)"
                    @mouseleave="clearDriveStepPreview"
                    @click="handleSelectDriveStep(index)"
                >
                    <div class="card-head">
                        <span
                            class="card-tag"
                            :style="{ color: getStepColor(index) }"
                            >{{ index + 1 }}</span
                        >
                        <div class="card-name">{{ step.text }}</div>
                    </div>
                </button>

                <div
                    v-if="routeResult.steps.length === 0"
                    class="empty-hint"
                >
                    {{ t('routing.driveEmpty') }}
                </div>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import MapPointPickerCard from './MapPointPickerCard.vue';
import { Bus, Car, Route, TriangleAlert, X } from '@lucide/vue';
import { parseDriveRouteXml } from '@ol/routing/utils/driveXmlParser';
import { locationToAddress } from '@/api';
import { showLoading, hideLoading } from '@common/ui/loading';
import { useLocale } from '@common/app/useLocale';
import { formatDistanceMeasure } from '@common/map-view/units';
import { useMessage } from '@common/shell/useMessage';

const message = useMessage();
const { t } = useLocale();

interface TransitStation {
    name: string;
    lonlat: string;
}

interface TransitSegmentLine {
    linePoint: string;
    lineName: string;
    segmentTime?: number | string;
    segmentDistance?: number | string;
}

interface TransitSegment {
    segmentType: 1 | 2 | number;
    stationStart: TransitStation;
    stationEnd: TransitStation;
    segmentLine: TransitSegmentLine[];
}

interface TransitLine {
    lineName?: string;
    segments: TransitSegment[];
}

interface TransitResultGroup {
    lineType?: string | number;
    lines?: TransitLine[];
}

interface TransitResponse {
    resultCode?: string | number;
    msg?: string;
    message?: string;
    results?: TransitResultGroup[];
}

interface StepInfo {
    index: number;
    segmentType: number;
    modeText: string;
    segmentName: string;
    startName: string;
    endName: string;
    time: number;
    /** 带单位的距离展示文本（跟随用户偏好单位制） */
    distanceText: string;
}

interface RouteCandidate {
    id: string;
    lineName: string;
    time: number;
    /** 带单位的距离展示文本（跟随用户偏好单位制） */
    distanceText: string;
    segments: TransitSegment[];
    steps: StepInfo[];
}

interface ParsedRouteResult {
    /** 带单位的距离展示文本（跟随用户偏好单位制） */
    distanceText: string;
    durationText: string;
    routelatlon: string;
    steps: Array<{ text: string; linePoint: string }>;
}

/** 天地图 Token 未配置或为空 */
class TokenMissingError extends Error {
    constructor() {
        super('TokenMissing');
        this.name = 'TokenMissingError';
    }
}

const props = defineProps<{
    /** 触发模式：公交 / 驾车 */
    mode: 'bus' | 'drive';
    token?: string;
    /** 地图取点（两个模式共用同一实现） */
    startPointPick?: (type: 'start' | 'end') => Promise<{ lng: number; lat: number } | null>;
    // ---- 公交模式回调 ----
    drawRouteOnMap?: (route: RouteCandidate) => Promise<void> | void;
    zoomToBusRouteStep?: (stepIndex: number) => Promise<void> | void;
    previewBusRouteStep?: (stepIndex: number) => Promise<void> | void;
    clearBusRouteStepPreview?: () => Promise<void> | void;
    // ---- 驾车模式回调 ----
    drawDriveRouteOnMap?: (payload: {
        routeLatLonStr: string;
        stepLinePoints: string[];
    }) => Promise<void> | void;
    zoomToDriveRouteStep?: (stepIndex: number) => Promise<void> | void;
    previewDriveRouteStep?: (stepIndex: number) => Promise<void> | void;
    clearDriveRouteStepPreview?: () => Promise<void> | void;
}>();

defineEmits(['close']);

/* ------------------------------------------------------------ */
/*  共享状态                                                      */
/* ------------------------------------------------------------ */
const pickMode = ref<'' | 'start' | 'end'>('');
const startPoint = ref<{ lng: number; lat: number } | undefined>(undefined);
const endPoint = ref<{ lng: number; lat: number } | undefined>(undefined);
const startAddress = ref('');
const endAddress = ref('');
const planning = ref(false);
const errorMsg = ref('');

const strategy = ref(props.mode === 'bus' ? '1' : '0');

const strategyOptions = computed(() =>
    props.mode === 'bus'
        ? [
              { value: '1', label: t('routing.strategy.fast') },
              { value: '2', label: t('routing.strategy.lessTransfer') },
              { value: '3', label: t('routing.strategy.lessWalk') },
              { value: '4', label: t('routing.strategy.noMetro') },
          ]
        : [
              { value: '0', label: t('routing.strategy.fastest') },
              { value: '1', label: t('routing.strategy.shortest') },
              { value: '2', label: t('routing.strategy.avoidHighway') },
              { value: '3', label: t('routing.strategy.walkMode') },
          ],
);

const planButtonText = computed(() => {
    if (planning.value) return props.mode === 'bus' ? t('routing.planning') : t('routing.navigating');
    return props.mode === 'bus' ? t('routing.startBusPlan') : t('routing.startNav');
});

/* ------------------------------------------------------------ */
/*  调试信息（两模式字段并集，按模式渲染子集）                          */
/* ------------------------------------------------------------ */
const debug = reactive({
    status: 'idle',
    requestUrl: '',
    responseShape: '',
    candidateCount: 0,
    message: '',
    resultCode: '',
    groupCount: 0,
    lineCount: 0,
    rawDistance: '',
    rawDuration: '',
    stepCount: 0,
});

function resetDebug() {
    debug.status = 'requesting';
    debug.requestUrl = '';
    debug.responseShape = '';
    debug.candidateCount = 0;
    debug.message = '';
    debug.resultCode = '';
    debug.groupCount = 0;
    debug.lineCount = 0;
    debug.rawDistance = '';
    debug.rawDuration = '';
    debug.stepCount = 0;
}

/* ------------------------------------------------------------ */
/*  公交状态                                                      */
/* ------------------------------------------------------------ */
const routes = ref<RouteCandidate[]>([]);
const selectedRouteIndex = ref(-1);
const selectedBusStepIndex = ref(-1);

const selectedRoute = computed<RouteCandidate | null>(() => {
    const idx = Number(selectedRouteIndex.value);
    if (idx < 0 || idx >= routes.value.length) return null;
    return routes.value[idx] || null;
});

function parseSegmentMetrics(segment: TransitSegment) {
    const firstLine = Array.isArray(segment?.segmentLine) ? segment.segmentLine[0] : undefined;
    const time = Number(firstLine?.segmentTime ?? 0);
    const distance = Number(firstLine?.segmentDistance ?? 0);
    return {
        time: Number.isFinite(time) ? time : 0,
        distance: Number.isFinite(distance) ? distance : 0,
    };
}

function resolveStationName(
    name: string | undefined,
    type: 'start' | 'end',
    index: number,
    total: number,
): string {
    const normalized = String(name || '').trim();
    if (normalized) return normalized;

    if (type === 'start' && index === 0) return t('routing.start');
    if (type === 'end' && index === total - 1) return t('routing.end');
    return t('routing.via');
}

function getSegmentDisplayName(segment: TransitSegment, stepIndex: number): string {
    const firstLine = Array.isArray(segment?.segmentLine) ? segment.segmentLine[0] : undefined;
    const lineName = String(firstLine?.lineName || '').trim();
    if (Number(segment?.segmentType ?? 0) === 1) {
        return lineName || t('routing.walk');
    }
    return lineName || t('routing.busSegment', { n: stepIndex + 1 });
}

function normalizeTransitResults(raw: TransitLine[]): RouteCandidate[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((item, idx) => {
        const segmentList = Array.isArray(item?.segments) ? item.segments : [];
        const total = segmentList.reduce(
            (acc, segment) => {
                const metrics = parseSegmentMetrics(segment);
                return {
                    time: acc.time + metrics.time,
                    distance: acc.distance + metrics.distance,
                };
            },
            { time: 0, distance: 0 },
        );

        const lineName =
            String(item?.lineName || '')
                .replace(/\s*\|\s*$/, '')
                .trim() || t('routing.planIndex', { n: idx + 1 });
        const steps: StepInfo[] = segmentList.map((segment, segmentIndex) => {
            const metrics = parseSegmentMetrics(segment);
            const segmentType = Number(segment?.segmentType ?? 0);
            const startName = resolveStationName(
                segment?.stationStart?.name,
                'start',
                segmentIndex,
                segmentList.length,
            );
            const endName = resolveStationName(
                segment?.stationEnd?.name,
                'end',
                segmentIndex,
                segmentList.length,
            );
            const segmentName = getSegmentDisplayName(segment, segmentIndex);

            return {
                index: segmentIndex,
                segmentType,
                modeText: segmentType === 1 ? t('routing.walk') : t('routing.transitMode'),
                segmentName,
                startName,
                endName,
                time: Math.round(metrics.time),
                distanceText: formatDistanceMeasure(metrics.distance),
            };
        });

        return {
            id: `${idx}_${lineName}`,
            lineName,
            time: Math.round(total.time),
            distanceText: formatDistanceMeasure(total.distance),
            segments: segmentList,
            steps,
        };
    });
}

function extractLinesFromTransitResponse(data: TransitResponse) {
    const groups = Array.isArray(data?.results) ? data.results : [];
    const allLines: TransitLine[] = [];

    groups.forEach((group) => {
        const lines = Array.isArray(group?.lines) ? group.lines : [];
        lines.forEach((line) => allLines.push(line));
    });

    return {
        groups,
        lines: allLines,
    };
}

async function startTransitPlan() {
    if (!startPoint.value || !endPoint.value) {
        errorMsg.value = t('routing.needStartEnd');
        return;
    }

    planning.value = true;
    showLoading(t('loading.busRoute'));
    errorMsg.value = '';
    resetDebug();

    try {
        const tk = String(props.token || '').trim();
        if (!tk) {
            throw new Error(t('routing.tokenMissing'));
        }

        const postObj = {
            startposition: `${startPoint.value.lng},${startPoint.value.lat}`,
            endposition: `${endPoint.value.lng},${endPoint.value.lat}`,
            linetype: String(strategy.value),
        };

        const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
        const requestUrl = `https://api.tianditu.gov.cn/transit?tk=${encodeURIComponent(tk)}&type=busplan&postStr=${encodedPostStr}`;
        // 不在 debug 中记录含 Token 的 URL，防止 Token 泄露
        debug.requestUrl = `https://api.tianditu.gov.cn/transit?type=busplan`;

        const res = await fetch(requestUrl, { method: 'GET' });
        debug.status = `http ${res.status}`;
        if (!res.ok) {
            throw new Error(t('routing.busRequestFailed', { status: res.status }));
        }

        const data = (await res.json()) as TransitResponse;
        const shapeKeys =
            data && typeof data === 'object'
                ? Object.keys(data).slice(0, 8).join(', ')
                : typeof data;
        const extracted = extractLinesFromTransitResponse(data);
        const normalized = normalizeTransitResults(extracted.lines);

        debug.responseShape = shapeKeys || '-';
        debug.candidateCount = normalized.length;
        debug.message = data?.msg || data?.message || '';
        debug.resultCode = String(data?.resultCode ?? '');
        debug.groupCount = extracted.groups.length;
        debug.lineCount = extracted.lines.length;

        routes.value = normalized;
        selectedRouteIndex.value = normalized.length ? 0 : -1;
        selectedBusStepIndex.value = -1;

        if (normalized.length && props.drawRouteOnMap) {
            await props.drawRouteOnMap(normalized[0]);
        }

        if (!normalized.length) {
            errorMsg.value = t('routing.busNoPlan');
            debug.status = 'empty';
            if (Number(data?.resultCode) !== 0) {
                debug.message = `resultCode=${data?.resultCode}`;
            }
        }
    } catch (err: any) {
        const rawMessage = err?.message || '';
        const isNetworkError = /failed\s+to\s+fetch/i.test(String(rawMessage));
        const hint = isNetworkError ? t('routing.networkBlocked') : '';
        const failText = hint || rawMessage || t('routing.busPlanFailed');
        errorMsg.value = failText;
        routes.value = [];
        selectedRouteIndex.value = -1;
        selectedBusStepIndex.value = -1;
        debug.status = 'error';
        debug.message = failText;
        message.error(failText);
    } finally {
        planning.value = false;
        hideLoading();
    }
}

async function handleSelectRoute(route: RouteCandidate, idx: number) {
    selectedRouteIndex.value = idx;
    selectedBusStepIndex.value = -1;

    if (!props.drawRouteOnMap) return;

    try {
        await props.drawRouteOnMap(route);
    } catch (err: any) {
        errorMsg.value = err?.message || t('routing.drawRouteFailed');
    }
}

async function handleSelectStep(stepIndex: number) {
    selectedBusStepIndex.value = stepIndex;

    try {
        if (props.drawRouteOnMap && selectedRoute.value) {
            await props.drawRouteOnMap(selectedRoute.value);
        }
        if (!props.zoomToBusRouteStep) return;
        await props.zoomToBusRouteStep(stepIndex);
    } catch (err: any) {
        errorMsg.value = err?.message || t('routing.stepLocateFailed');
    }
}

async function handlePreviewStep(stepIndex: number) {
    try {
        if (!props.previewBusRouteStep) return;
        await props.previewBusRouteStep(stepIndex);
    } catch {
        // 预览失败不影响主流程
    }
}

async function clearStepPreview() {
    try {
        if (!props.clearBusRouteStepPreview) return;
        await props.clearBusRouteStepPreview();
    } catch {
        // 预览失败不影响主流程
    }
}

/* ------------------------------------------------------------ */
/*  驾车状态                                                      */
/* ------------------------------------------------------------ */
const routeResult = ref<ParsedRouteResult | null>(null);
const selectedDriveStepIndex = ref(-1);

const DRIVE_STEP_COLOR_PALETTE = ['#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];

function getStepColor(stepIndex: number): string {
    const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
    return DRIVE_STEP_COLOR_PALETTE[idx];
}

function isValidLngLat(lng: number, lat: number): boolean {
    return (
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        lng >= -180 &&
        lng <= 180 &&
        lat >= -90 &&
        lat <= 90
    );
}

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return t('routing.duration.zeroMin');
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return t('routing.duration.minutes', { n: minutes });
    if (minutes <= 0) return t('routing.duration.hours', { n: hours });
    return t('routing.duration.hoursMinutes', { h: hours, m: minutes });
}

async function handleSelectDriveStep(stepIndex: number): Promise<void> {
    selectedDriveStepIndex.value = stepIndex;

    try {
        if (!routeResult.value) return;

        if (props.drawDriveRouteOnMap) {
            await props.drawDriveRouteOnMap({
                routeLatLonStr: routeResult.value.routelatlon,
                // 不过滤空项，保留步骤索引与分段索引的一一对应关系。
                stepLinePoints: routeResult.value.steps.map((step) => step.linePoint),
            });
        }

        if (!props.zoomToDriveRouteStep) return;
        await props.zoomToDriveRouteStep(stepIndex);
    } catch (e) {
        errorMsg.value = e instanceof Error ? e.message : t('routing.stepLocateFailed');
    }
}

async function handlePreviewDriveStep(stepIndex: number): Promise<void> {
    try {
        if (!props.previewDriveRouteStep) return;
        await props.previewDriveRouteStep(stepIndex);
    } catch {
        // 预览失败不影响主流程
    }
}

async function clearDriveStepPreview(): Promise<void> {
    try {
        if (!props.clearDriveRouteStepPreview) return;
        await props.clearDriveRouteStepPreview();
    } catch {
        // 预览失败不影响主流程
    }
}

async function startDriveSearch(): Promise<void> {
    errorMsg.value = '';
    routeResult.value = null;
    selectedDriveStepIndex.value = -1;

    const oLng = Number(startPoint.value?.lng);
    const oLat = Number(startPoint.value?.lat);
    const dLng = Number(endPoint.value?.lng);
    const dLat = Number(endPoint.value?.lat);

    if (!isValidLngLat(oLng, oLat) || !isValidLngLat(dLng, dLat)) {
        errorMsg.value = t('routing.needValidCoords');
        return;
    }

    planning.value = true;
    showLoading(t('loading.drivingRoute'));
    resetDebug();

    try {
        const token = String(props.token || '').trim();
        if (!token) {
            throw new TokenMissingError();
        }
        const postObj = {
            orig: `${oLng.toFixed(6)},${oLat.toFixed(6)}`,
            dest: `${dLng.toFixed(6)},${dLat.toFixed(6)}`,
            style: String(strategy.value),
        };

        const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
        const requestUrl = `https://api.tianditu.gov.cn/drive?tk=${encodeURIComponent(token)}&type=search&postStr=${encodedPostStr}`;
        // 不在 debug 中记录含 Token 的 URL，防止 Token 泄露
        debug.requestUrl = `https://api.tianditu.gov.cn/drive?type=search`;

        const response = await fetch(requestUrl, { method: 'GET' });
        debug.status = `http ${response.status}`;

        if (!response.ok) {
            throw new Error(t('routing.requestFailedStatus', { status: response.status }));
        }

        // 天地图 drive API 返回 XML，交给独立解析器处理。
        const xmlString = await response.text();
        const parsed = parseDriveRouteXml(xmlString);
        const steps = parsed.segments
            .map((seg) => ({
                text: seg.guide,
                linePoint: seg.streetLatLon,
            }))
            .filter((step) => step.text);

        routeResult.value = {
            distanceText: formatDistanceMeasure(Number.isFinite(parsed.distanceKm) ? parsed.distanceKm * 1000 : 0),
            durationText: parsed.durationText || formatDuration(parsed.durationSec),
            routelatlon: parsed.routeLatLon,
            steps,
        };

        debug.rawDistance = String(parsed.distanceKm || 0);
        debug.rawDuration = String(parsed.durationSec || 0);
        debug.stepCount = steps.length;
        debug.status = 'success';

        if (!steps.length) {
            debug.message = t('routing.noStepsParsed');
        }

        // 地图渲染（可能抛出错误，但不影响已解析的数据）
        if (parsed.routeLatLon && props.drawDriveRouteOnMap) {
            await props.drawDriveRouteOnMap({
                routeLatLonStr: parsed.routeLatLon,
                stepLinePoints: steps.map((step) => step.linePoint),
            });
        }
    } catch (e) {
        const rawMessage = e instanceof Error ? e.message : String(e || '');
        let text: string;

        if (e instanceof TokenMissingError) {
            text = t('routing.tokenMissing');
        } else if (/failed\s+to\s+fetch/i.test(rawMessage)) {
            text = t('routing.networkBlocked');
        } else {
            text = rawMessage || t('routing.navFailed');
        }

        errorMsg.value = text;
        debug.status = 'error';
        debug.message = text;
    } finally {
        planning.value = false;
        hideLoading();
    }
}

/* ------------------------------------------------------------ */
/*  共享动作：地图取点 / 搜索结果回填                                  */
/* ------------------------------------------------------------ */
async function enablePick(type: 'start' | 'end') {
    if (!props.startPointPick) {
        errorMsg.value = t('routing.mapNotReady');
        return;
    }

    pickMode.value = type;
    errorMsg.value = '';

    try {
        const point = await props.startPointPick(type);
        if (!point) return;

        const lng = Number(point.lng);
        const lat = Number(point.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            throw new Error(t('routing.invalidMapCoord'));
        }

        if (type === 'start') {
            startPoint.value = { lng, lat };
        } else {
            endPoint.value = { lng, lat };
        }

        try {
            const reverse = await locationToAddress(lng, lat, 'base');
            const label = String(reverse?.formattedAddress || '').trim();
            if (type === 'start') {
                startAddress.value = label;
            } else {
                endAddress.value = label;
            }
        } catch {
            if (type === 'start') {
                startAddress.value = '';
            } else {
                endAddress.value = '';
            }
        }
    } catch (err: any) {
        errorMsg.value = err?.message || t('routing.mapPickFailed');
    } finally {
        pickMode.value = '';
    }
}

function onSelectStartResult(result: { lng: number; lat: number; address: string }) {
    startPoint.value = { lng: result.lng, lat: result.lat };
    startAddress.value = result.address || '';
    errorMsg.value = '';
}

function onSelectEndResult(result: { lng: number; lat: number; address: string }) {
    endPoint.value = { lng: result.lng, lat: result.lat };
    endAddress.value = result.address || '';
    errorMsg.value = '';
}
</script>

<style scoped>
.route-planner-panel {
    --accent: var(--brand-primary-dark);
    --accent-soft: rgba(var(--brand-primary-rgb), 0.12);
    --accent-gradient: var(--brand-gradient);
    --accent-shadow: rgba(var(--brand-primary-dark-rgb), 0.28);
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 14px;
    gap: 12px;
    background:
        radial-gradient(140% 90% at 0% 0%, var(--accent-soft), transparent 58%),
        linear-gradient(160deg, #f7fcf8 0%, #f5fbf9 45%, #f3fafc 100%);
}

.route-planner-panel.is-drive {
    --accent: var(--info);
    --accent-soft: rgba(var(--info-rgb), 0.1);
    --accent-gradient: linear-gradient(135deg, color-mix(in srgb, var(--info) 68%, #ffffff) 0%, var(--info) 100%);
    --accent-shadow: rgba(var(--info-rgb), 0.3);
}

/* ===== 头部 ===== */
.panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 2px 0;
}

.panel-badge {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
    background: var(--accent-gradient);
    color: #ffffff;
    box-shadow:
        0 4px 10px var(--accent-shadow),
        inset 0 1px 0 rgba(255, 255, 255, 0.28);
}

.heading {
    min-width: 0;
    flex: 1;
}

.title {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.title-sub {
    margin-top: 1px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent-soft);
    filter: brightness(0.55);
}

.close-btn {
    flex-shrink: 0;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: var(--toc-primary);
    cursor: pointer;
    transition:
        background 0.12s ease,
        transform 0.12s ease;
}

.close-btn:hover {
    background: #ffffff;
    transform: translateY(-1px);
}

.close-btn:active {
    transform: scale(0.94);
}

/* ===== 策略条 ===== */
.join-bar {
    display: flex;
    align-items: stretch;
    min-height: 36px;
    background: rgba(255, 255, 255, 0.82);
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    border-radius: 11px;
    overflow: hidden;
    transition:
        border-color 0.2s ease-out,
        box-shadow 0.2s ease-out;
}

.join-bar:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.12);
}

.join-lead {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding-left: 11px;
    color: var(--toc-text-secondary);
}

.join-select {
    flex: 1;
    min-width: 0;
    appearance: none;
    border: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238faa9b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    padding: 8px 26px 8px 10px;
    font-size: 12px;
    color: var(--text-brand-dark);
    outline: none;
    cursor: pointer;
}

.join-go {
    flex-shrink: 0;
    border: none;
    background: var(--accent-gradient);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    padding: 0 16px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: -1px 0 0 rgba(var(--brand-primary-rgb), 0.14);
    transition:
        filter 0.12s ease,
        opacity 0.12s ease;
}

.join-go:hover:not(:disabled) {
    filter: brightness(1.06);
}

.join-go:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* ===== 状态行 ===== */
.status-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--brand-accent-muted);
    padding: 0 2px;
}

.status-line.error {
    color: var(--danger, #b83d3d);
    font-weight: 500;
}

/* ===== 调试框 ===== */
.debug-box {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.14);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.72);
    padding: 7px 9px;
    font-size: 11px;
}

.debug-box summary {
    cursor: pointer;
    color: var(--toc-text-secondary);
    font-weight: 600;
    user-select: none;
}

.debug-row {
    margin-top: 5px;
    color: var(--toc-text-secondary);
    display: grid;
    grid-template-columns: 76px 1fr;
    gap: 8px;
}

.debug-text {
    word-break: break-all;
}

/* ===== 结果区 ===== */
.planner-main {
    flex: 1;
    min-height: 220px;
    display: flex;
    gap: 8px;
}

.result-pane {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.18);
    background: rgba(255, 255, 255, 0.78);
    backdrop-filter: blur(6px);
    border-radius: 12px;
    padding: 9px;
    overflow-y: auto;
}

.pane-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    margin: 2px 2px 9px;
    display: flex;
    align-items: center;
    gap: 6px;
}

.pane-title::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    opacity: 0.85;
}

.pane-title-steps {
    margin-top: 12px;
}

.empty-hint {
    font-size: 12px;
    color: var(--toc-text-muted);
    line-height: 20px;
    padding: 6px 2px;
}

/* 结果卡片 */
.result-card {
    width: 100%;
    text-align: left;
    border-radius: 10px;
    border: 1px solid rgba(17, 24, 39, 0.08);
    background: rgba(255, 255, 255, 0.85);
    padding: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        background 0.15s ease,
        transform 0.15s ease,
        box-shadow 0.15s ease;
}

.result-card:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.45);
    background: #ffffff;
    transform: translateY(-1px);
    box-shadow: 0 5px 12px rgba(var(--brand-primary-rgb), 0.12);
}

.result-card.active {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
}

.step-bordered {
    border-left: 4px solid var(--step-color, var(--accent));
}

.card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}

.card-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-brand-dark);
    line-height: 1.35;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.card-tag {
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.22);
    background: #ffffff;
    color: var(--accent);
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.card-distance {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-brand-dark);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.card-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--toc-text-secondary);
    margin-top: 7px;
}

.step-line {
    margin-top: 7px;
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.35;
}

.step-stations {
    margin-top: 4px;
    font-size: 12px;
    color: var(--toc-text-secondary);
}

/* 驾车概览卡片 */
.summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.summary-card {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.16);
    border-radius: 10px;
    padding: 9px 10px;
    background: var(--accent-soft);
}

.summary-label {
    font-size: 11px;
    color: var(--toc-text-secondary);
}

.summary-value {
    margin-top: 2px;
    font-size: 14px;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
}

@media (max-width: 860px) {
    .planner-main {
        flex-direction: column;
    }

    .summary-grid {
        grid-template-columns: 1fr;
    }
}
</style>
