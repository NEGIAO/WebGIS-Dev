<template>
    <div v-if="visible" class="aoi-dialog-inline">
        <div class="aoi-dialog-card" role="dialog" aria-modal="false" aria-label="高德 AOI 数据注入">
            <div class="aoi-dialog-head">
                <div class="aoi-dialog-title">高德 AOI 数据注入</div>
                <button class="aoi-dialog-close" type="button" @click="emit('close')">×</button>
            </div>

            <div class="aoi-dialog-tip">
                1. 点击“打开高德详情”并完成验证；2. 复制返回 JSON；3. 点击“粘贴 JSON”后一键填充。
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

            <div class="aoi-dialog-row aoi-dialog-actions-row">
                <button class="aoi-dialog-btn" type="button" @click="emit('open-detail')">打开高德详情</button>
                <a class="aoi-dialog-link" :href="detailUrl" target="_blank" rel="noopener noreferrer">{{ detailUrl }}</a>
            </div>

            <div class="aoi-dialog-row">
                <div class="aoi-dialog-row-head">
                    <label class="aoi-dialog-label">详情 JSON</label>
                    <button class="aoi-dialog-mini-btn" type="button" @click="handlePasteJson">粘贴 JSON</button>
                </div>
                <textarea
                    :value="jsonText"
                    class="aoi-dialog-textarea"
                    placeholder="请粘贴包含 data.spec.mining_shape.shape 的详情 JSON"
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
const props = defineProps({
    visible: { type: Boolean, default: false },
    poiId: { type: String, default: '' },
    jsonText: { type: String, default: '' },
    detailUrl: { type: String, default: 'https://www.amap.com/' },
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

async function handlePasteJson() {
    try {
        if (navigator?.clipboard?.readText) {
            const text = await navigator.clipboard.readText();
            emit('update:jsonText', String(text || ''));
            return;
        }
    } catch {
        // fallback below
    }

    if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const fallbackText = window.prompt('浏览器不支持自动读取剪贴板，请手动粘贴 JSON：', props.jsonText || '');
        if (fallbackText !== null) {
            emit('update:jsonText', String(fallbackText));
        }
    }
}
</script>

<style scoped>
.aoi-dialog-inline {
    margin: 10px 0 12px;
}

.aoi-dialog-card {
    /* width: 100%; */
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
