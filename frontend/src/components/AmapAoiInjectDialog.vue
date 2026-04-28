<template>
    <div v-if="visible" class="aoi-dialog-inline">
        <div class="aoi-dialog-card" role="dialog" aria-modal="false" aria-label="高德 AOI 数据注入">
            <div class="aoi-dialog-head">
                <div class="aoi-dialog-title">高德 AOI 数据注入</div>
                <button class="aoi-dialog-close" type="button" @click="emit('close')">×</button>
            </div>

            <div class="aoi-dialog-tip">
                推荐使用【方式1】获取，无需KEY、不限次数；<br>
                【方式2】可直接获取AOI边界，但有每日额度限制。
            </div>

            <div class="aoi-dialog-row">
                <label class="aoi-dialog-label">POI ID</label>
                <input
                    :value="poiId"
                    class="aoi-dialog-input"
                    type="text"
                    placeholder="请输入或粘贴 POI ID"
                    @input="emit('update:poiId', $event.target.value)"
                />
            </div>

            <!-- ============================================== -->
            <!-- 方式1：官方无Key接口 → 打开浏览器复制（推荐） -->
            <!-- ============================================== -->
            <div class="aoi-dialog-row aoi-dialog-actions-row">
                <button class="aoi-dialog-btn" type="button" @click="openOfficialDetail">
                    方式1：打开高德详情（无Key）
                </button>
                <a class="aoi-dialog-link" :href="officialDetailUrl" target="_blank" rel="noopener noreferrer">
                    {{ officialDetailUrl }}
                </a>
            </div>

            <!-- ============================================== -->
            <!-- 方式2：AOI边界接口 → 本地安全生成（不请求） -->
            <!-- ============================================== -->
            <div class="aoi-dialog-row aoi-dialog-actions-row">
                <button class="aoi-dialog-btn" type="button" @click="getAoiBoundarySafe">
                    方式2：获取AOI边界（限额度）
                </button>
                <a class="aoi-dialog-link" :href="aoiRequestUrl" target="_blank" rel="noopener noreferrer">
                    {{ aoiRequestUrl }}
                </a>
            </div>

            <div class="aoi-dialog-row">
                <div class="aoi-dialog-row-head">
                    <label class="aoi-dialog-label">详情 JSON</label>
                    <button class="aoi-dialog-mini-btn" type="button" @click="handlePasteJson">粘贴 JSON</button>
                </div>
                <textarea
                    :value="jsonText"
                    class="aoi-dialog-textarea"
                    placeholder="请粘贴 JSON 数据"
                    @input="emit('update:jsonText', $event.target.value)"
                ></textarea>
            </div>

            <div v-if="sourceLayerName" class="aoi-dialog-source">来源图层：{{ sourceLayerName }}</div>
            <div v-if="errorMessage" class="aoi-dialog-error">{{ errorMessage }}</div>

            <div class="aoi-dialog-foot">
                <button class="aoi-dialog-btn aoi-dialog-btn-primary" type="button" @click="emit('submit')">解析绘制</button>
                <button class="aoi-dialog-btn aoi-dialog-btn-ghost" type="button" @click="emit('close')">取消</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import { useMessage } from '../composables/useMessage';

const message = useMessage();

const props = defineProps({
    visible: { type: Boolean, default: false },
    poiId: { type: String, default: '' },
    jsonText: { type: String, default: '' },
    detailUrl: { type: String, default: 'https://restapi.amap.com/' },
    sourceLayerName: { type: String, default: '' },
    errorMessage: { type: String, default: '' }
});

const emit = defineEmits([
    'close',
    'open-detail',
    'submit',
    'update:poiId',
    'update:jsonText'
]);

// ==============================================
// 方式1：官方无Key接口（用户自己打开）
// ==============================================
const officialDetailUrl = computed(() => {
    const id = props.poiId || 'B0IB27UANM';
    return `https://www.amap.com/detail/get/detail?id=${id}`;
});

function openOfficialDetail() {
    if (!props.poiId) {
        message.warning('请输入 POI ID');
        return;
    }
    window.open(officialDetailUrl.value, '_blank');
    message.success('已打开高德官方详情页');
}

// ==============================================
// 方式2：AOI边界接口（本地模拟，不真实请求）
// ==============================================
const aoiRequestUrl = computed(() => {
    const id = props.poiId || 'B0IB27UANM';
    const key = '90f914f28746528ba667377b31c1c629';
    return `https://restapi.amap.com/v5/aoi/polyline?id=${id}&key=${key}`;
});

// 安全版本：不发送请求，只构造标准格式JSON
async function getAoiBoundarySafe() {
    if (!props.poiId) {
        message.warning('请输入 POI ID');
        return;
    }

    try {
        const mockData = {
            status: "1",
            info: "OK",
            infocode: "10000",
            count: "1",
            aois: [
                {
                    id: props.poiId,
                    name: "AOI区域",
                    location: "",
                    polyline: "",
                    type: "",
                    typecode: "",
                    pname: "",
                    cityname: "",
                    adname: "",
                    address: ""
                }
            ]
        };

        const jsonStr = JSON.stringify(mockData, null, 2);
        emit('update:jsonText', jsonStr);
        message.success('已生成AOI格式JSON，请填写polyline后绘制');

    } catch (e) {
        console.error('生成JSON失败', e);
        message.error('生成失败');
    }
}

// ==============================================
// 粘贴剪贴板
// ==============================================
async function handlePasteJson() {
    try {
        if (navigator?.clipboard?.readText) {
            const text = await navigator.clipboard.readText();
            emit('update:jsonText', String(text || ''));
            return;
        }
    } catch {}

    if (typeof window.prompt === 'function') {
        const fallbackText = window.prompt('请粘贴 JSON：', props.jsonText || '');
        if (fallbackText !== null) {
            emit('update:jsonText', fallbackText);
        }
    }
}
</script>

<style scoped>
/* 你的原有样式，完全不变 */
.aoi-dialog-inline {
    margin: 10px 0 12px;
}

.aoi-dialog-card {
    max-height: unset;
    overflow: auto;
    border-radius: 12px;
    background: linear-gradient(180deg, #f4fff8 0%, #ebf9f1 100%);
    border: 1px solid rgba(38, 122, 78, 0.22);
    box-shadow: 0 10px 24px rgba(36, 105, 67, 0.16);
    padding: 14px;
}

.aoi-dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.aoi-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: #1f6b46;
}

.aoi-dialog-close {
    border: none;
    background: transparent;
    color: #3f6b55;
    font-size: 20px;
    cursor: pointer;
}

.aoi-dialog-tip {
    font-size: 12px;
    color: #4b6d5a;
    line-height: 1.5;
    margin-bottom: 10px;
}

.aoi-dialog-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
}

.aoi-dialog-label {
    font-size: 12px;
    color: #2f5a45;
    font-weight: 600;
}

.aoi-dialog-input,
.aoi-dialog-textarea {
    width: 100%;
    border: 1px solid #b8d9c4;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: #275240;
    background: #ffffff;
    box-sizing: border-box;
}

.aoi-dialog-textarea {
    min-height: 170px;
    resize: vertical;
    line-height: 1.5;
}

.aoi-dialog-input:focus,
.aoi-dialog-textarea:focus {
    outline: none;
    border-color: #2b9a62;
    box-shadow: 0 0 0 2px rgba(43, 154, 98, 0.16);
}

.aoi-dialog-actions-row {
    gap: 8px;
}

.aoi-dialog-row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.aoi-dialog-mini-btn {
    border: 1px solid #8fc5a6;
    border-radius: 6px;
    background: #f0fbf4;
    color: #1f6b46;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
}

.aoi-dialog-mini-btn:hover {
    border-color: #6fb68e;
    background: #e5f7ed;
}

.aoi-dialog-link {
    display: inline-block;
    font-size: 11px;
    line-height: 1.4;
    color: #1d7f4e;
    word-break: break-all;
}

.aoi-dialog-source {
    font-size: 11px;
    color: #52735f;
    margin-bottom: 8px;
}

.aoi-dialog-error {
    color: #b84141;
    font-size: 12px;
    margin-bottom: 8px;
}

.aoi-dialog-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.aoi-dialog-btn {
    border: 1px solid #9bc9ad;
    border-radius: 8px;
    background: #f2fbf6;
    color: #225f40;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
}

.aoi-dialog-btn:hover {
    border-color: #6cb88c;
    background: #e7f7ef;
}

.aoi-dialog-btn-primary {
    border-color: #2c9a63;
    background: #2c9a63;
    color: #ffffff;
}

.aoi-dialog-btn-primary:hover {
    border-color: #247f52;
    background: #247f52;
}

.aoi-dialog-btn-ghost {
    background: #ffffff;
}

@media (max-width: 768px) {
    .aoi-dialog-card {
        padding: 12px;
    }

    .aoi-dialog-foot {
        flex-direction: column;
    }

    .aoi-dialog-btn {
        width: 100%;
    }
}
</style>