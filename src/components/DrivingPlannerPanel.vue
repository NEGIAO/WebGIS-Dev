<template>
    <div class="drive-planner-panel">
        <div class="panel-head">
            <div>
                <div class="title">驾车规划</div>
                <div class="title-sub">Driving & Walking Routing</div>
            </div>
            <button class="ghost-btn" @click="$emit('close')">关闭</button>
        </div>

        <MapPointPickerCard
            :pick-mode="pickMode"
            :start-point="origPoint"
            :end-point="destPoint"
            theme="drive"
            start-label="设置起点"
            end-label="设置终点"
            start-picking-text="请在地图单击起点..."
            end-picking-text="请在地图单击终点..."
            start-title="起点坐标"
            end-title="终点坐标"
            @pick-start="pickPointOnMap('start')"
            @pick-end="pickPointOnMap('end')"
        />

        <div class="plan-row">
            <label class="plan-label" for="driveStyleSelect">路线策略</label>
            <select id="driveStyleSelect" v-model="routeStyle" class="plan-select">
                <option value="0">0 - 最快路线</option>
                <option value="1">1 - 最短路线</option>
                <option value="2">2 - 避开高速</option>
                <option value="3">3 - 步行</option>
            </select>
            <button class="plan-btn" :disabled="isLoading" @click="startDriveSearch">
                {{ isLoading ? '导航中...' : '开始导航' }}
            </button>
        </div>

        <div class="status-line error" v-if="error">{{ error }}</div>
        <div class="status-line" v-else-if="pickMode === 'start'">请在主地图上单击一个位置设置起点</div>
        <div class="status-line" v-else-if="pickMode === 'end'">请在主地图上单击一个位置设置终点</div>

        <details class="debug-box">
            <summary>调试信息</summary>
            <div class="debug-row"><span>请求状态：</span><span>{{ debug.status }}</span></div>
            <div class="debug-row"><span>请求URL：</span><span class="debug-text">{{ debug.requestUrl || '-' }}</span></div>
            <div class="debug-row"><span>distance：</span><span>{{ debug.rawDistance || '-' }}</span></div>
            <div class="debug-row"><span>duration：</span><span>{{ debug.rawDuration || '-' }}</span></div>
            <div class="debug-row"><span>steps数量：</span><span>{{ debug.stepCount }}</span></div>
            <div class="debug-row"><span>提示：</span><span class="debug-text">{{ debug.message || '-' }}</span></div>
        </details>

        <div class="planner-main" v-if="routeResult">
            <aside class="w-full rounded-[10px] border border-black/10 bg-white p-2 overflow-y-auto">
                <div class="route-title">导航结果</div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">总距离</div>
                        <div class="summary-value">{{ routeResult.distanceKm }} km</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">总耗时</div>
                        <div class="summary-value">{{ routeResult.durationText }}</div>
                    </div>
                </div>

                <!-- <div class="route-line-raw">routelatlon: {{ routeResult.routelatlon || '无' }}</div> -->

                <div class="route-title route-title-steps">导航步骤</div>
                <div
                    v-for="(step, index) in routeResult.steps"
                    :key="`${index}_${step.text.slice(0, 20)}`"
                    class="route-card"
                    :class="selectedStepIndex === index ? 'route-card-active' : ''"
                    :style="{ borderLeftColor: getStepColor(index), borderLeftWidth: '4px', borderLeftStyle: 'solid' }"
                    @mouseenter="handlePreviewDriveStep(index)"
                    @mouseleave="clearDriveStepPreview"
                    @click="handleSelectDriveStep(index)"
                >
                    <div class="route-head">
                        <span class="route-tag">{{ index + 1 }}</span>
                        <div class="route-name">{{ step.text }}</div>
                    </div>
                </div>

                <div v-if="routeResult.steps.length === 0" class="route-empty">
                    暂无路线引导信息
                </div>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import MapPointPickerCard from './MapPointPickerCard.vue';
import { parseDriveRouteXml } from '../utils/driveXmlParser';
import { useRouteStore, type LngLat, type RouteRecord } from '../stores/routeStore';
import { useToolStore } from '../stores/toolStore';

interface ParsedRouteResult {
    distanceKm: string;
    durationText: string;
    routelatlon: string;
    steps: Array<{ text: string; linePoint: string; coordinates: LngLat[] }>;
}

const YOUR_TIANDITU_TK = 'YOUR_TIANDITU_TK';

const props = defineProps<{
    token?: string;
}>();

defineEmits<{
    (e: 'close'): void;
}>();

const origPoint = reactive({ lng: '', lat: '' });
const destPoint = reactive({ lng: '', lat: '' });
const routeStyle = ref('0');
const pickMode = ref<'' | 'start' | 'end'>('');
const committedStepIndex = ref(-1);

const isLoading = ref(false);
const error = ref('');
const routeResult = ref<ParsedRouteResult | null>(null);
const selectedStepIndex = ref(-1);

const routeStore = useRouteStore();
const toolStore = useToolStore();

const debug = reactive({
    status: 'idle',
    requestUrl: '',
    rawDistance: '',
    rawDuration: '',
    stepCount: 0,
    message: ''
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

function parseLinePointToCoords(value: string): LngLat[] {
    return String(value || '')
        .split(';')
        .filter(Boolean)
        .map((pair) => {
            const [lngText, latText] = pair.split(',');
            const lng = Number(lngText);
            const lat = Number(latText);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
            return [lng, lat] as LngLat;
        })
        .filter(Boolean) as LngLat[];
}

function mergePaths(paths: LngLat[][]): LngLat[] {
    const merged: LngLat[] = [];
    for (const path of paths) {
        for (const point of path) {
            const prev = merged[merged.length - 1];
            if (prev && prev[0] === point[0] && prev[1] === point[1]) continue;
            merged.push(point);
        }
    }
    return merged;
}

async function pickPointOnMap(type: 'start' | 'end'): Promise<void> {
    error.value = '';
    pickMode.value = type;
    try {
        const point = await toolStore.requestPickPoint(type);
        const lng = Number(point?.lng);
        const lat = Number(point?.lat);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            throw new Error('地图返回的坐标无效');
        }

        if (type === 'start') {
            origPoint.lng = lng.toFixed(6);
            origPoint.lat = lat.toFixed(6);
            routeStore.setStartPoint([lng, lat]);
        } else {
            destPoint.lng = lng.toFixed(6);
            destPoint.lat = lat.toFixed(6);
            routeStore.setEndPoint([lng, lat]);
        }
    } catch (e) {
        error.value = e instanceof Error ? e.message : '地图选点失败';
    } finally {
        pickMode.value = '';
    }
}

function isValidLngLat(lng: number, lat: number): boolean {
    return Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0分钟';
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}分钟`;
    if (minutes <= 0) return `${hours}小时`;
    return `${hours}小时${minutes}分钟`;
}

async function handleSelectDriveStep(stepIndex: number): Promise<void> {
    committedStepIndex.value = stepIndex;
    selectedStepIndex.value = stepIndex;
    routeStore.setActiveStepIndex(stepIndex);
}

async function handlePreviewDriveStep(stepIndex: number): Promise<void> {
    routeStore.setActiveStepIndex(stepIndex);
}

async function clearDriveStepPreview(): Promise<void> {
    routeStore.setActiveStepIndex(committedStepIndex.value);
}

async function startDriveSearch(): Promise<void> {
    error.value = '';
    routeResult.value = null;
    selectedStepIndex.value = -1;
    committedStepIndex.value = -1;

    const oLng = parseCoord(origPoint.lng);
    const oLat = parseCoord(origPoint.lat);
    const dLng = parseCoord(destPoint.lng);
    const dLat = parseCoord(destPoint.lat);

    if (!isValidLngLat(oLng, oLat) || !isValidLngLat(dLng, dLat)) {
        error.value = '请完整输入合法的起点和终点经纬度';
        return;
    }

    isLoading.value = true;
    debug.status = 'requesting';
    debug.requestUrl = '';
    debug.rawDistance = '';
    debug.rawDuration = '';
    debug.stepCount = 0;
    debug.message = '';

    try {
        const token = String(props.token || YOUR_TIANDITU_TK).trim();
        const postObj = {
            orig: `${oLng},${oLat}`,
            dest: `${dLng},${dLat}`,
            style: String(routeStyle.value)
        };

        const encodedPostStr = encodeURIComponent(JSON.stringify(postObj));
        const requestUrl = `https://api.tianditu.gov.cn/drive?tk=${encodeURIComponent(token)}&type=search&postStr=${encodedPostStr}`;
        debug.requestUrl = requestUrl;

        const response = await fetch(requestUrl, { method: 'GET' });
        debug.status = `http ${response.status}`;

        if (!response.ok) {
            throw new Error(`请求失败(${response.status})`);
        }

        // 天地图 drive API 返回 XML，交给独立解析器处理。
        const xmlString = await response.text();
        const parsed = parseDriveRouteXml(xmlString);
        const steps = parsed.segments.map((seg) => ({
            text: seg.guide,
            linePoint: seg.streetLatLon,
            coordinates: parseLinePointToCoords(seg.streetLatLon)
        })).filter((step) => step.text);

        routeResult.value = {
            distanceKm: Number.isFinite(parsed.distanceKm) ? parsed.distanceKm.toFixed(2) : '0.00',
            durationText: parsed.durationText || formatDuration(parsed.durationSec),
            routelatlon: parsed.routeLatLon,
            steps
        };

        const fullRoutePath = parseLinePointToCoords(parsed.routeLatLon);
        const routeRecord: RouteRecord = {
            id: `drive_route_${Date.now()}`,
            name: '驾车路线',
            mode: 'drive',
            start: [oLng, oLat],
            end: [dLng, dLat],
            coordinates: fullRoutePath.length ? fullRoutePath : mergePaths(steps.map((step) => step.coordinates)),
            steps: steps.map((step, index) => ({
                id: `drive_step_${index}`,
                name: step.text,
                modeText: routeStyle.value === '3' ? '步行' : '驾车',
                coordinates: step.coordinates,
                meta: {
                    linePoint: step.linePoint,
                    order: index + 1
                }
            })),
            summary: {
                distanceKm: Number.isFinite(parsed.distanceKm) ? parsed.distanceKm.toFixed(2) : '0.00',
                durationText: parsed.durationText || formatDuration(parsed.durationSec)
            }
        };

        routeStore.setMode('drive');
        routeStore.setStartPoint([oLng, oLat]);
        routeStore.setEndPoint([dLng, dLat]);
        routeStore.setRoutes([routeRecord], 'drive');

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

        debug.rawDistance = String(parsed.distanceKm || 0);
        debug.rawDuration = String(parsed.durationSec || 0);
        debug.stepCount = steps.length;
        debug.status = 'success';

        if (!steps.length) {
            debug.message = '未解析到 steps，可检查 routes/item/strguide 是否存在';
        }
    } catch (e) {
        const rawMessage = e instanceof Error ? e.message : String(e || '');
        const likelyNetworkBlocked = e instanceof TypeError || /failed\s+to\s+fetch/i.test(rawMessage);
        const message = likelyNetworkBlocked
            ? '网络请求被浏览器拦截或跨域失败。请确认：1) 部署站点使用 https；2) 天地图 token 已绑定当前域名；3) 浏览器控制台无 Mixed Content/CORS 报错。'
            : (rawMessage || '导航失败');
        error.value = message;
        debug.status = 'error';
        debug.message = message;
        routeStore.clearRoutes();
    } finally {
        isLoading.value = false;
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
    color: #1e3a8a;
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
    background: linear-gradient(145deg, #2563eb, #1d4ed8);
    color: #fff;
    padding: 8px 12px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 6px 14px rgba(29, 78, 216, 0.25);
    transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.plan-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(29, 78, 216, 0.3);
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
    color: #c62828;
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
    color: #1d4ed8;
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
    color: #1e3a8a;
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
    color: #1e3a8a;
    line-height: 1.35;
}

.route-tag {
    flex-shrink: 0;
    border-radius: 999px;
    border: 1px solid rgba(59, 130, 246, 0.22);
    background: rgba(255, 255, 255, 0.85);
    color: #1d4ed8;
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
