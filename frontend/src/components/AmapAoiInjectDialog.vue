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
// 用的接口是高德地图的公开详情页接口，理论上不需要API Key，但可能会有访问频率限制或其他反爬措施。
// 先尝试后台请求解析，如果失败再引导用户手动打开链接获取数据。
// ==============================================
const officialDetailUrl = computed(() => {
    const id = props.poiId || 'B0IB27UANM';
    return `https://www.amap.com/detail/get/detail?id=${id}`;
});
async function openOfficialDetail() {
    if (!props.poiId) {
        message.warning('请输入 POI ID');
        return;
    }

    const url = officialDetailUrl.value;

    try {
        // 1. 尝试静默请求（隐藏 Referrer）
        const response = await fetch(url, {
            method: 'GET',
            referrerPolicy: 'no-referrer', // 隐藏来源，尝试规避部分校验
        });

        if (!response.ok) throw new Error('网络响应异常');

        const res = await response.json();

        // 2. 解析高德官方接口的返回逻辑
        // 注意：官方接口的成功标志通常是 status: "1" 或 data.status: "1"
        if (res.status === '1' || (res.data && res.data.status === '1')) {
            const jsonStr = JSON.stringify(res, null, 2);
            emit('update:jsonText', jsonStr);
            message.success('成功从官方接口解析 AOI 详情');
        } else {
            // 3. 业务逻辑失败（比如接口改版、频繁访问被封、参数失效）
            throw new Error(res.info || '接口返回异常');
        }

    } catch (e) {
        console.warn('后台解析官方接口失败:', e);
        
        // 4. 容错处理：提醒用户并执行原始的跳转逻辑
        message.info('后台解析受阻，正在为你打开官方详情页进行手动获取...');
        
        // 延迟一小会儿跳转，让用户看清提示
        setTimeout(() => {
            window.open(url, '_blank');
        }, 2000);
    }
}


// ==============================================
// 方式2：AOI边界接口（真实请求）
// 使用的高级接口，直接返回AOI边界数据，但需要API Key且有访问限制。
// 这里直接请求并处理结果，用户无需手动操作。
// ==============================================
const aoiRequestUrl = computed(() => {
    const id = props.poiId || 'B0IB27UANM';
    const key = '90f914f28746528ba667377b31c1c629';
    //key为奥维的，免费额度较大，且不绑定域名，适合测试使用
    return `https://restapi.amap.com/v5/aoi/polyline?id=${id}&key=${key}`;
});
async function getAoiBoundarySafe() {
    if (!props.poiId) {
        message.warning('请输入 POI ID');
        return;
    }

    try {
        // 1. 使用 fetch 发起真实请求
        const response = await fetch(aoiRequestUrl.value,{
            // 关键配置：隐藏来源信息
            referrer: "", // 清空 Referer
            referrerPolicy: "no-referrer", // 完全不发送 Referer
            mode: "cors", // 保持跨域模式
            credentials: "omit" // 不发送 Cookie、Origin 信息
        });
        
        // 2. 检查网络状态
        if (!response.ok) throw new Error('网络请求失败');
        
        // 3. 解析返回的 JSON 数据
        const realData = await response.json();

        // 4. 判断高德 API 的业务状态码码 (status 为 "1" 代表成功)
        if (realData.status === "1" && realData.aois && realData.aois.length > 0) {
            const jsonStr = JSON.stringify(realData, null, 2);
            emit('update:jsonText', jsonStr);
            message.success('AOI数据抓取成功');
        } else {
            // 如果 API 返回错误（比如 key 无效或 ID 找不到）
            message.error(`抓取失败: ${realData.info || '未知错误'}`);
            // 失败时也可以把原始错误数据传出去方便调试
            emit('update:jsonText', JSON.stringify(realData, null, 2));
        }

    } catch (e) {
        console.error('请求AOI接口出错', e);
        message.error('请求失败，请检查网络或 API Key');
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