/**
 * 高清瓦片渲染开关（全局单例）
 *
 * 作用：开启后，底图 raster source 进入"偏上层取瓦"模式——
 * 当视图处于 fractional zoom（如 z=14.5）时，改为请求上一瓦片层级（z+1）
 * 的瓦片并缩小渲染，牺牲约 4× 瓦片数/流量换取清晰度。
 *
 * 设计要点：
 * - 单一职责：仅持有开关状态，不关心 source/layer 如何实现取上层
 * - 持久化到 localStorage，键名 webgis:tileHDRendering
 * - 全局单例 ref，跨组件共享同一份状态
 * - 默认 true（开启，以高清渲染为默认行为）
 */
import { ref } from 'vue';

const STORAGE_KEY = 'webgis:tileHDRendering';

/** 读取持久化值，非法/缺失时回退到 true（默认开启高清渲染） */
function readPersisted() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === 'true') return true;
        if (raw === 'false') return false;
    } catch {
        // localStorage 不可用（隐私模式/SSR）→ 静默回退默认
    }
    return true;
}

/** 写入持久化值，失败时静默（不影响运行时开关） */
function persist(value) {
    try {
        localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch {
        // best-effort
    }
}

/** 全局单例：高清渲染开关状态 */
export const tileHDRendering = ref(readPersisted());

/**
 * 切换高清渲染开关
 * @param {boolean} [value] 可选显式目标值；不传则取反当前状态
 * @returns {boolean} 切换后的状态
 */
export function toggleTileHDRendering(value) {
    const next = typeof value === 'boolean' ? value : !tileHDRendering.value;
    tileHDRendering.value = next;
    persist(next);
    return next;
}
