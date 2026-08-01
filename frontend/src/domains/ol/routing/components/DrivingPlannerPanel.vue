<template>
    <div class="drive-planner-panel">
        <div class="panel-head">
            <div>
                <div class="title">{{ t('routing.driveTitle') }}</div>
                <div class="title-sub">Driving & Walking Routing</div>
            </div>
            <button
                class="ghost-btn"
                @click="$emit('close')"
            >
                {{ t('routing.close') }}
            </button>
        </div>

        <MapPointPickerCard
            :pick-mode="pickMode"
            :start-point="origPoint"
            :end-point="destPoint"
            :start-address="origAddress"
            :end-address="destAddress"
            :tianditu-tk="token"
            theme="drive"
            :start-label="t('routing.setStartShort')"
            :end-label="t('routing.setEndShort')"
            :start-picking-text="t('routing.startHint')"
            :end-picking-text="t('routing.endHint')"
            :start-title="t('routing.startPoint')"
            :end-title="t('routing.endPoint')"
            :search-placeholder="t('routing.searchPlaceholder')"
            @pick-start="pickPointOnMap('start')"
            @pick-end="pickPointOnMap('end')"
            @select-start-result="onSelectStartResult"
            @select-end-result="onSelectEndResult"
        />

        <div class="plan-row">
            <label
                class="plan-label"
                for="driveStyleSelect"
                >{{ t('routing.driveStrategy') }}</label
            >
            <select
                id="driveStyleSelect"
                v-model="routeStyle"
                class="plan-select"
            >
                <option value="0">{{ t('routing.strategy.fastest') }}</option>
                <option value="1">{{ t('routing.strategy.shortest') }}</option>
                <option value="2">{{ t('routing.strategy.avoidHighway') }}</option>
                <option value="3">{{ t('routing.strategy.walkMode') }}</option>
            </select>
            <button
                class="plan-btn"
                :disabled="isLoading"
                @click="startDriveSearch"
            >
                {{ isLoading ? t('routing.navigating') : t('routing.startNav') }}
            </button>
        </div>

        <div
            v-if="error"
            class="status-line error"
        >
            {{ error }}
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

        <details class="debug-box">
            <summary>{{ t('routing.debugInfo') }}</summary>
            <div class="debug-row">
                <span>{{ t('routing.requestStatus') }}</span><span>{{ debug.status }}</span>
            </div>
            <div class="debug-row">
                <span>{{ t('routing.requestUrl') }}</span><span class="debug-text">{{ debug.requestUrl || '-' }}</span>
            </div>
            <div class="debug-row">
                <span>distance：</span><span>{{ debug.rawDistance || '-' }}</span>
            </div>
            <div class="debug-row">
                <span>duration：</span><span>{{ debug.rawDuration || '-' }}</span>
            </div>
            <div class="debug-row">
                <span>{{ t('routing.stepCount') }}</span><span>{{ debug.stepCount }}</span>
            </div>
            <div class="debug-row">
                <span>{{ t('routing.hint') }}</span><span class="debug-text">{{ debug.message || '-' }}</span>
            </div>
        </details>

        <div
            v-if="routeResult"
            class="planner-main"
        >
            <aside
                class="w-full rounded-[10px] border border-black/10 bg-white p-2 overflow-y-auto"
            >
                <div class="route-title">{{ t('routing.navResult') }}</div>

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

                <!-- <div class="route-line-raw">routelatlon: {{ routeResult.routelatlon || '无' }}</div> -->

                <div class="route-title route-title-steps">{{ t('routing.navSteps') }}</div>
                <div
                    v-for="(step, index) in routeResult.steps"
                    :key="`${index}_${step.text.slice(0, 20)}`"
                    class="route-card"
                    :class="selectedStepIndex === index ? 'route-card-active' : ''"
                    :style="{
                        borderLeftColor: getStepColor(index),
                        borderLeftWidth: '4px',
                        borderLeftStyle: 'solid',
                    }"
                    @mouseenter="handlePreviewDriveStep(index)"
                    @mouseleave="clearDriveStepPreview"
                    @click="handleSelectDriveStep(index)"
                >
                    <div class="route-head">
                        <span class="route-tag">{{ index + 1 }}</span>
                        <div class="route-name">{{ step.text }}</div>
                    </div>
                </div>

                <div
                    v-if="routeResult.steps.length === 0"
                    class="route-empty"
                >
                    {{ t('routing.driveEmpty') }}
                </div>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import MapPointPickerCard from './MapPointPickerCard.vue';
import { parseDriveRouteXml } from '@ol/routing/utils/driveXmlParser';
import { locationToAddress } from '@/api';
import { showLoading, hideLoading } from '@common/ui/loading';
import { useLocale } from '@common/app/useLocale';
import { formatDistanceMeasure } from '@common/map-view/units';

const { t } = useLocale();

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
    token?: string;
    drawDriveRouteOnMap?: (payload: {
        routeLatLonStr: string;
        stepLinePoints: string[];
    }) => Promise<void> | void;
    zoomToDriveRouteStep?: (stepIndex: number) => Promise<void> | void;
    previewDriveRouteStep?: (stepIndex: number) => Promise<void> | void;
    clearDriveRouteStepPreview?: () => Promise<void> | void;
    startMapPointPick?: (type: 'start' | 'end') => Promise<{ lng: number; lat: number }>;
}>();

defineEmits<{
    (e: 'close'): void;
}>();

const origPoint = reactive({ lng: '', lat: '' });
const destPoint = reactive({ lng: '', lat: '' });
const origAddress = ref('');
const destAddress = ref('');
const routeStyle = ref('0');
const pickMode = ref<'' | 'start' | 'end'>('');

const isLoading = ref(false);
const error = ref('');
const routeResult = ref<ParsedRouteResult | null>(null);
const selectedStepIndex = ref(-1);

const debug = reactive({
    status: 'idle',
    requestUrl: '',
    rawDistance: '',
    rawDuration: '',
    stepCount: 0,
    message: '',
});

const DRIVE_STEP_COLOR_PALETTE = ['#10B981', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];

function getStepColor(stepIndex: number): string {
    const idx = Math.abs(Number(stepIndex || 0)) % DRIVE_STEP_COLOR_PALETTE.length;
    return DRIVE_STEP_COLOR_PALETTE[idx];
}

function parseCoord(value: string): number {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : NaN;
}

async function pickPointOnMap(type: 'start' | 'end'): Promise<void> {
    if (!props.startMapPointPick) {
        error.value = t('routing.mapNotReady');
        return;
    }

    error.value = '';
    pickMode.value = type;
    try {
        const point = await props.startMapPointPick(type);
        const lng = Number(point?.lng);
        const lat = Number(point?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            throw new Error(t('routing.invalidMapCoord'));
        }

        if (type === 'start') {
            origPoint.lng = lng.toFixed(6);
            origPoint.lat = lat.toFixed(6);
        } else {
            destPoint.lng = lng.toFixed(6);
            destPoint.lat = lat.toFixed(6);
        }

        try {
            const reverse = await locationToAddress(lng, lat, 'base');
            const label = String(reverse?.formattedAddress || '').trim();
            if (type === 'start') {
                origAddress.value = label;
            } else {
                destAddress.value = label;
            }
        } catch {
            if (type === 'start') {
                origAddress.value = '';
            } else {
                destAddress.value = '';
            }
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : t('routing.mapPickFailed');
    } finally {
        pickMode.value = '';
    }
}

function onSelectStartResult(result: { lng: number; lat: number; address: string }) {
    origPoint.lng = result.lng.toFixed(6);
    origPoint.lat = result.lat.toFixed(6);
    origAddress.value = result.address || '';
    error.value = '';
}

function onSelectEndResult(result: { lng: number; lat: number; address: string }) {
    destPoint.lng = result.lng.toFixed(6);
    destPoint.lat = result.lat.toFixed(6);
    destAddress.value = result.address || '';
    error.value = '';
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
    selectedStepIndex.value = stepIndex;

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
        error.value = e instanceof Error ? e.message : t('routing.stepLocateFailed');
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
    error.value = '';
    routeResult.value = null;
    selectedStepIndex.value = -1;

    const oLng = parseCoord(origPoint.lng);
    const oLat = parseCoord(origPoint.lat);
    const dLng = parseCoord(destPoint.lng);
    const dLat = parseCoord(destPoint.lat);

    if (!isValidLngLat(oLng, oLat) || !isValidLngLat(dLng, dLat)) {
        error.value = t('routing.needValidCoords');
        return;
    }

    isLoading.value = true;
    showLoading(t('loading.drivingRoute'));
    debug.status = 'requesting';
    debug.requestUrl = '';
    debug.rawDistance = '';
    debug.rawDuration = '';
    debug.stepCount = 0;
    debug.message = '';

    try {
        const token = String(props.token || '').trim();
        if (!token) {
            throw new TokenMissingError();
        }
        const postObj = {
            orig: `${oLng},${oLat}`,
            dest: `${dLng},${dLat}`,
            style: String(routeStyle.value),
        };

        const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
        const requestUrl = `https://api.tianditu.gov.cn/drive?tk=${encodeURIComponent(token)}&type=search&postStr=${encodedPostStr}`;
        // 不在 debugInfo 中记录含 Token 的 URL，防止 Token 泄露
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

        // 若 XML 返回了参数里的起终点，回填到输入框，便于核对。
        const parseInputCoord = (text: string) => {
            const [lngText, latText] = String(text || '').split(',');
            const lng = Number(lngText);
            const lat = Number(latText);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return { lng, lat };
        };
        const xmlOrig = parseInputCoord(parsed.origText);
        const xmlDest = parseInputCoord(parsed.destText);
        if (xmlOrig) {
            origPoint.lng = xmlOrig.lng.toFixed(6);
            origPoint.lat = xmlOrig.lat.toFixed(6);
        }
        if (xmlDest) {
            destPoint.lng = xmlDest.lng.toFixed(6);
            destPoint.lat = xmlDest.lat.toFixed(6);
        }

        // 先更新调试信息，确保即使地图渲染失败也能看到解析结果
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
        let message: string;

        if (e instanceof TokenMissingError) {
            message = t('routing.tokenMissing');
        } else if (/failed\s+to\s+fetch/i.test(rawMessage)) {
            message = t('routing.networkBlocked');
        } else {
            console.error('[DrivePlanner] error:', e);
            message = rawMessage || t('routing.navFailed');
        }

        error.value = message;
        debug.status = 'error';
        debug.message = message;
    } finally {
        isLoading.value = false;
        hideLoading();
    }
}
</script>

<style scoped>
.drive-planner-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 14px;
    background:
        radial-gradient(140% 90% at 0% 0%, rgba(37, 99, 235, 0.14), rgba(37, 99, 235, 0) 58%),
        linear-gradient(160deg, #f4f9ff 0%, #f2f7ff 45%, #eef8ff 100%);
    gap: 12px;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 0;
}

.title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--info);
}

.title-sub {
    margin-top: 2px;
    font-size: 11px;
    color: rgba(30, 58, 138, 0.62);
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.ghost-btn {
    border: 1px solid rgba(30, 58, 138, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    color: #334f98;
    padding: 6px 12px;
    font-size: 12px;
    transition: all 0.2s ease;
    cursor: pointer;
}

.ghost-btn:hover {
    background: #fff;
    border-color: rgba(30, 58, 138, 0.35);
    transform: translateY(-1px);
}

.plan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(30, 58, 138, 0.12);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.8);
}

.plan-label {
    font-size: 12px;
    color: #4b5d8d;
    white-space: nowrap;
}

.plan-select {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(30, 58, 138, 0.2);
    border-radius: 8px;
    padding: 7px 8px;
    background: #ffffff;
    color: #2f3d63;
}

.plan-btn {
    border: 1px solid rgba(59, 130, 246, 0.46);
    border-radius: 8px;
    background: linear-gradient(145deg, #2563eb, var(--info));
    color: #fff;
    padding: 8px 12px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 6px 14px rgba(var(--info-rgb), 0.25);
    transition:
        transform 0.15s ease,
        box-shadow 0.2s ease;
}

.plan-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(var(--info-rgb), 0.3);
}

.plan-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.status-line {
    font-size: 12px;
    color: #51638f;
}

.status-line.error {
    color: var(--danger);
}

.debug-box {
    border: 1px solid rgba(30, 58, 138, 0.12);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.85);
    padding: 6px 8px;
    font-size: 12px;
}

.debug-box summary {
    cursor: pointer;
    color: #3d4f7f;
    font-weight: 600;
}

.debug-row {
    margin-top: 4px;
    color: #4c5f8d;
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 6px;
}

.debug-text {
    word-break: break-all;
}

.planner-main {
    flex: 1;
    min-height: 220px;
    display: flex;
    gap: 8px;
}

.route-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--info);
    margin: 2px 2px 8px;
}

.route-title-steps {
    margin-top: 10px;
}

.summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
}

.summary-card {
    border: 1px solid rgba(30, 58, 138, 0.12);
    border-radius: 10px;
    padding: 9px;
    background: linear-gradient(160deg, rgba(219, 234, 254, 0.7), rgba(239, 246, 255, 0.9));
}

.summary-label {
    font-size: 12px;
    color: #4f628f;
}

.summary-value {
    margin-top: 2px;
    font-size: 13px;
    font-weight: 700;
    color: var(--info);
}

.route-line-raw {
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.9);
    padding: 8px;
    font-size: 11px;
    color: #64748b;
    word-break: break-all;
}

.route-card {
    width: 100%;
    text-align: left;
    border-radius: 10px;
    border: 1px solid rgba(17, 24, 39, 0.08);
    background: linear-gradient(160deg, rgba(219, 234, 254, 0.78), rgba(239, 246, 255, 0.92));
    padding: 10px;
    margin-bottom: 8px;
    transition: all 0.2s ease;
}

.route-card:hover {
    border-color: rgba(37, 99, 235, 0.35);
    background: linear-gradient(160deg, rgba(191, 219, 254, 0.82), rgba(224, 242, 254, 0.95));
    transform: translateY(-1px);
}

.route-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.route-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--info);
    line-height: 1.35;
}

.route-tag {
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(59, 130, 246, 0.22);
    background: rgba(255, 255, 255, 0.85);
    color: var(--info);
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
}

.route-empty {
    margin-top: 4px;
    font-size: 12px;
    color: #94a3b8;
}

@media (max-width: 860px) {
    .plan-row {
        flex-wrap: wrap;
    }

    .plan-select {
        min-width: 100%;
    }

    .plan-btn {
        width: 100%;
    }

    .summary-grid {
        grid-template-columns: 1fr;
    }

    .planner-main {
        flex-direction: column;
    }
}
</style>
