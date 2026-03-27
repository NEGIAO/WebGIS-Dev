<template>
    <div class="map-ui-card map-search-box">
        <div class="row">
            <input
                v-model.trim="keyword"
                class="keyword-input"
                placeholder="输入地名并回车"
                @keydown.enter.prevent="handleSearch"
            />
            <button class="search-btn" :disabled="isSearching" @click="handleSearch">
                {{ isSearching ? '搜索中' : '搜索' }}
            </button>
        </div>
        <div class="service-row">
            <label for="service-select">服务</label>
            <select id="service-select" v-model="service">
                <option value="tianditu">天地图</option>
                <option value="nominatim">Nominatim</option>
                <option value="amap">高德</option>
            </select>
        </div>
        <div class="status" v-if="statusText">{{ statusText }}</div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { fetchLocationResultsByService } from '../../api/locationSearch';
import { useMapStateStore } from '../../stores/mapStateStore';

const mapStateStore = useMapStateStore();

const keyword = ref('');
const service = ref('tianditu');
const isSearching = ref(false);
const statusText = ref('');

async function handleSearch() {
    const text = String(keyword.value || '').trim();
    if (!text || isSearching.value) return;

    isSearching.value = true;
    statusText.value = '';

    try {
        const result = await fetchLocationResultsByService({
            service: service.value,
            keywords: text,
            page: 1,
            pageSize: 1,
            tiandituTk: import.meta.env.VITE_TIANDITU_TK || '' ,
            amapKey: '3e6d96476b807126acbc59384aa13e51'
        });

        const first = Array.isArray(result?.items) ? result.items[0] : null;
        if (!first || !Number.isFinite(Number(first.lon)) || !Number.isFinite(Number(first.lat))) {
            statusText.value = '未找到结果';
            return;
        }

        mapStateStore.setCenter([Number(first.lon), Number(first.lat)]);
        mapStateStore.setZoom(16);
        statusText.value = `已定位: ${first.display_name || first.name || '目标地点'}`;
    } catch (error) {
        console.error('地名搜索失败', error);
        statusText.value = '搜索失败，请稍后重试';
    } finally {
        isSearching.value = false;
    }
}
</script>

<style scoped>
.map-ui-card {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(31, 41, 55, 0.12);
    border-radius: 12px;
    padding: 10px;
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
    backdrop-filter: blur(8px);
}

.row {
    display: flex;
    gap: 8px;
}

.keyword-input {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(55, 65, 81, 0.22);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
}

.search-btn {
    border: 0;
    border-radius: 8px;
    padding: 8px 12px;
    background: #2563eb;
    color: #fff;
    font-size: 13px;
    cursor: pointer;
}

.search-btn:disabled {
    background: #93c5fd;
    cursor: not-allowed;
}

.service-row {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #374151;
}

.service-row select {
    border: 1px solid rgba(55, 65, 81, 0.22);
    border-radius: 8px;
    padding: 6px 8px;
    font-size: 12px;
}

.status {
    margin-top: 8px;
    font-size: 12px;
    color: #065f46;
    line-height: 1.4;
}
</style>
