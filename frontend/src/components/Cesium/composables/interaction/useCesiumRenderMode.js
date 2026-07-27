/**
 * useCesiumRenderMode.js — Cesium 按需渲染（requestRenderMode）计数器管理器
 *
 * 背景：应用此前恒为连续渲染，静止且无逐帧特效时整条渲染管线仍每帧全速执行（GPU 满负荷）。
 * 本模块以「连续渲染引用计数」统一管理 scene.requestRenderMode：
 * - 逐帧消费者（体积云 / 风场 / 流体 / 人物漫游）开启时 acquireContinuous(viewer, tag) → 连续渲染；
 * - 全部释放（计数归零）→ requestRenderMode = true 进入按需渲染，并设 maximumRenderTimeChange
 *   （模拟时钟推进超过该秒数自动重渲一帧：太阳光照低频刷新、时间轴拖动/播放仍跟手）；
 * - 相机移动 / 瓦片加载 / 实体增删改由 Cesium 在按需模式下自动触发重渲，无需手工覆盖；
 *   全库既有的显式 scene.requestRender() 调用天然兼容。
 *
 * 保险机制：
 * 1. 总开关 ENABLE_REQUEST_RENDER_MODE —— P1 接入期以 false 上线观察，P2 起置 true 生效；
 *    出问题改回 false 即整体回退恒连续渲染（一行回退）；
 * 2. 应用模式过程中任何异常 fail-open 回退连续渲染；
 * 3. releaseContinuous 容忍未配对调用（失败清理路径常见），计数不为负；
 * 4. 状态以 WeakMap 按 viewer 隔离，viewer 销毁（重试重建/组件卸载）后状态随之失效，无跨实例残留。
 *
 * 方案文档：Docs/TODO/requestrendermode-plan.md（L3，P1 已批准实施）
 */

/**
 * 总开关：是否启用按需渲染管理。
 * true = 计数归零时切入 requestRenderMode 按需渲染（P2 起生效，用户授权开启）；
 * 出现「该动的不动 / 画面不刷新」类回归时，改回 false 即整体回退恒连续渲染。
 */
export const ENABLE_REQUEST_RENDER_MODE = true;

/**
 * 按需模式下允许的最大模拟时间跳变（秒）。
 * 时钟推进超过该值自动重渲一帧 → 太阳光照以约 0.2Hz 缓慢刷新，时间轴控件仍可用。
 */
const MAX_RENDER_TIME_CHANGE_SECONDS = 5;

/**
 * viewer → ( tag → 引用计数 ) 映射。
 * WeakMap 键随 viewer 销毁自动失效，天然避免「上一个 viewer 的计数泄漏到重建实例」。
 * @type {WeakMap<object, Map<string, number>>}
 */
const viewerTagCounts = new WeakMap();

/**
 * 取安全的 scene 引用（viewer 缺失或已销毁时返回 null）。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 * @returns {object|null} scene 或 null
 */
function getScene(viewer) {
    if (!viewer || (typeof viewer.isDestroyed === 'function' && viewer.isDestroyed())) {
        return null;
    }
    return viewer.scene ?? null;
}

/**
 * 汇总某 viewer 当前的连续渲染引用总数。
 * @param {object} viewer - Cesium Viewer 实例
 * @returns {number} 引用总数（无记录时为 0）
 */
function totalCount(viewer) {
    const tags = viewerTagCounts.get(viewer);
    if (!tags) return 0;
    let sum = 0;
    for (const count of tags.values()) sum += count;
    return sum;
}

/**
 * 按当前计数把渲染模式应用到 scene。
 * 核心逻辑：总开关关闭或计数 > 0 → 连续渲染；计数 == 0 → 按需渲染并补渲一帧。
 * 任何异常 fail-open 回退连续渲染，保证最坏情况等于历史行为。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 */
function applyRenderMode(viewer) {
    const scene = getScene(viewer);
    if (!scene) return;
    try {
        if (!ENABLE_REQUEST_RENDER_MODE || totalCount(viewer) > 0) {
            scene.requestRenderMode = false;
            return;
        }
        scene.maximumRenderTimeChange = MAX_RENDER_TIME_CHANGE_SECONDS;
        scene.requestRenderMode = true;
        // 切换瞬间补渲一帧：确保释放最后一个消费者后的场景终态上屏
        scene.requestRender?.();
    } catch (error) {
        try {
            scene.requestRenderMode = false;
        } catch {
            /* viewer 正在销毁等极端情况，忽略 */
        }
        console.warn('[RenderMode] 应用渲染模式失败，已回退连续渲染：', error);
    }
}

/**
 * 初始化某 viewer 的渲染模式（viewer 创建后调用一次）。
 * 总开关开启且无消费者时立即进入按需渲染；开关关闭时等价于 no-op（保持连续渲染）。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 */
export function initRequestRenderMode(viewer) {
    applyRenderMode(viewer);
}

/**
 * 声明一个逐帧消费者开启：引用计数 +1，强制连续渲染。
 * 与 releaseContinuous 成对调用；同一 tag 可重入（计数叠加）。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 * @param {string} tag - 消费者标识（如 'volumetric-cloud' / 'wind-field' / 'fluid-sim' / 'player-roam'）
 */
export function acquireContinuous(viewer, tag) {
    if (!getScene(viewer) || !tag) return;
    let tags = viewerTagCounts.get(viewer);
    if (!tags) {
        tags = new Map();
        viewerTagCounts.set(viewer, tags);
    }
    tags.set(tag, (tags.get(tag) ?? 0) + 1);
    applyRenderMode(viewer);
}

/**
 * 声明一个逐帧消费者关闭：引用计数 -1，归零后切入按需渲染。
 * 容忍未配对调用：对应 tag 计数已为 0 时静默忽略（失败/重复清理路径安全）。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 * @param {string} tag - 与 acquireContinuous 相同的消费者标识
 */
export function releaseContinuous(viewer, tag) {
    const tags = viewerTagCounts.get(viewer);
    const current = tags?.get(tag) ?? 0;
    if (!tags || current <= 0) return;
    if (current === 1) {
        tags.delete(tag);
    } else {
        tags.set(tag, current - 1);
    }
    applyRenderMode(viewer);
}

/**
 * 调试辅助：返回当前连续渲染消费者快照（P2 冒烟排查「画面不刷新」用）。
 * @param {object|null|undefined} viewer - Cesium Viewer 实例
 * @returns {{ total: number, tags: Record<string, number> }} 引用总数与各 tag 计数
 */
export function getContinuousRenderSnapshot(viewer) {
    const tags = viewerTagCounts.get(viewer);
    const snapshot = { total: 0, tags: {} };
    if (!tags) return snapshot;
    for (const [tag, count] of tags.entries()) {
        snapshot.tags[tag] = count;
        snapshot.total += count;
    }
    return snapshot;
}
