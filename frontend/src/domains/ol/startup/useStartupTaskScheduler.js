/**
 * 启动任务调度功能库
 * 负责首屏优先策略与非关键任务的延后执行
 *
 * 导出：
 * - scheduleLowPriorityTask(task)
 * - waitForCriticalTileReady(timeoutMs)
 */
import { unByKey } from 'ol/Observable';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';

/**
 * 工厂函数 - 返回启动任务调度相关的导出函数
 * @param {Object} options 配置选项
 * @param {Ref} options.componentUnmountedRef - 组件卸载标志的 ref
 * @param {number} options.criticalTileReadyTimeoutMs - 关键瓦片加载超时时间
 * @returns {Object} 包含 scheduleLowPriorityTask 和 waitForCriticalTileReady 的对象
 */
export function createStartupTaskSchedulerFeature({
    componentUnmountedRef,
    // 与 MapContainer 的 CRITICAL_TILE_READY_TIMEOUT_MS（15s）保持一致，避免双处数值漂移。
    criticalTileReadyTimeoutMs = 15000,
    mapInstanceRef = null,
}) {
    // [C10] 追踪所有待执行的调度任务句柄
    const pendingHandles = [];
    const isIdleCallback =
        typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function';

    /**
     * 在首屏关键瓦片加载后调度非关键任务
     * 避免阻塞首次渲染，提升首屏加载体验
     * 优先使用 requestIdleCallback，回退到 setTimeout
     * @param {Function} task - 待调度的任务函数
     */
    function scheduleLowPriorityTask(task) {
        if (isIdleCallback) {
            const handle = window.requestIdleCallback(
                () => {
                    // 任务执行后移除追踪
                    const idx = pendingHandles.indexOf(handle);
                    if (idx !== -1) pendingHandles.splice(idx, 1);
                    if (!componentUnmountedRef.value) task();
                },
                { timeout: 1500 },
            );
            pendingHandles.push(handle);
            return;
        }
        const handle = setTimeout(() => {
            const idx = pendingHandles.indexOf(handle);
            if (idx !== -1) pendingHandles.splice(idx, 1);
            if (!componentUnmountedRef.value) task();
        }, 0);
        pendingHandles.push(handle);
    }

    /**
     * [C10] 取消所有待执行的调度任务
     * 组件卸载时调用，防止回调在卸载后执行
     */
    function cancelScheduledTasks() {
        pendingHandles.forEach((handle) => {
            if (isIdleCallback) {
                window.cancelIdleCallback(handle);
            } else {
                clearTimeout(handle);
            }
        });
        pendingHandles.length = 0;
    }

    /**
     * 等待关键底图真正完成首屏渲染
     *
     * 就绪条件：
     *
     * 1. 找到主底图 TileLayer / VectorTileLayer
     * 2. 至少有一张底图瓦片触发 tileloadend
     * 3. tileloadend 之后再次触发 rendercomplete
     * 4. rendercomplete 后连续等待两帧 requestAnimationFrame
     *
     * 注意：
     * tileloaderror 不参与成功判定。
     *
     * @param {number} timeoutMs - 超时时间（毫秒）
     * @returns {Promise<void>}
     */
    function waitForCriticalTileReady(timeoutMs = criticalTileReadyTimeoutMs) {
        return new Promise((resolve) => {
            const map = mapInstanceRef?.value;

            if (!map) {
                resolve();
                return;
            }

            let settled = false;

            // 是否至少有一张真实底图瓦片加载完成
            let tileLoaded = false;

            // tileloadend 发生后，是否又完成了一次 OL rendercomplete
            let renderedAfterTileLoad = false;

            // 是否已经进入最终 Paint 确认阶段
            let paintConfirmPending = false;

            let timer = null;
            let rafId1 = null;
            let rafId2 = null;

            const tileKeys = [];
            let renderCompleteKey = null;

            /**
             * 统一结束
             */
            const finish = () => {
                if (settled) return;

                settled = true;

                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }

                if (rafId1 !== null) {
                    cancelAnimationFrame(rafId1);
                    rafId1 = null;
                }

                if (rafId2 !== null) {
                    cancelAnimationFrame(rafId2);
                    rafId2 = null;
                }

                if (renderCompleteKey) {
                    unByKey(renderCompleteKey);
                    renderCompleteKey = null;
                }

                tileKeys.forEach((key) => {
                    unByKey(key);
                });
                tileKeys.length = 0;

                resolve();
            };

            /**
             * 最终浏览器帧确认
             *
             * rendercomplete 只是 OpenLayers 内部完成一次渲染。
             * 再跨两帧，确保 hideLoading 执行时已经进入真正的浏览器绘制窗口。
             */
            const confirmPaint = () => {
                if (settled) return;

                if (componentUnmountedRef.value) {
                    finish();
                    return;
                }

                rafId2 = window.requestAnimationFrame(() => {
                    if (settled) return;

                    rafId2 = null;
                    finish();
                });
            };

            /**
             * 判断是否已经满足真正的首屏 Ready 条件
             */
            const maybeFinish = () => {
                if (settled) return;

                // 还没有任何成功加载完成的底图瓦片
                if (!tileLoaded) {
                    return;
                }

                // tileloadend 之后还没有 rendercomplete
                if (!renderedAfterTileLoad) {
                    return;
                }

                // 防止重复启动 rAF
                if (paintConfirmPending) {
                    return;
                }

                paintConfirmPending = true;

                // 第一帧
                rafId1 = window.requestAnimationFrame(() => {
                    if (settled) return;

                    rafId1 = null;

                    // 第二帧
                    confirmPaint();
                });
            };

            /**
             * 找到当前地图最底部的底图层。
             *
             * 你的 initMap() 会先 initializeBasemapLayers()，
             * 这里取实际地图中的最底层 Tile / VectorTile 图层。
             */
            const tileLayers = map
                .getLayers()
                .getArray()
                .filter((layer) => layer instanceof TileLayer || layer instanceof VectorTileLayer);

            let primaryLayer = null;
            let minZIndex = Infinity;

            tileLayers.forEach((layer) => {
                // 不考虑不可见底图
                if (typeof layer.getVisible === 'function' && !layer.getVisible()) {
                    return;
                }

                const zIndex = typeof layer.getZIndex === 'function' ? layer.getZIndex() : 0;

                if (zIndex < minZIndex) {
                    minZIndex = zIndex;
                    primaryLayer = layer;
                }
            });

            /**
             * 如果没有任何底图图层，
             * 那么没有瓦片需要等待。
             *
             * 此时退化为 rendercomplete + 双 rAF。
             */
            if (!primaryLayer) {
                tileLoaded = true;

                renderCompleteKey = map.on('rendercomplete', () => {
                    if (settled) return;

                    renderedAfterTileLoad = true;
                    maybeFinish();
                });
            } else {
                const source = primaryLayer.getSource?.();

                /**
                 * 图层存在但没有 source：
                 * 同样不能阻塞整个启动流程。
                 */
                if (!source) {
                    tileLoaded = true;

                    renderCompleteKey = map.on('rendercomplete', () => {
                        if (settled) return;

                        renderedAfterTileLoad = true;
                        maybeFinish();
                    });
                } else {
                    /**
                     * 关键监听：
                     *
                     * tileloadend 表示真实底图瓦片加载完成。
                     *
                     * 注意：
                     * tileloadend 本身不能 finish。
                     * 它只负责将 tileLoaded 置为 true。
                     */
                    tileKeys.push(
                        source.on('tileloadend', () => {
                            if (settled) return;

                            tileLoaded = true;

                            // 不在这里 finish。
                            // 必须等 tileloadend 后的 rendercomplete。
                            maybeFinish();
                        }),
                    );

                    /**
                     * tileloaderror 故意不处理。
                     *
                     * 失败瓦片不能被当作“首屏成功”。
                     * 最终依赖 timeout 兜底。
                     */

                    /**
                     * rendercomplete：
                     *
                     * 第一次 rendercomplete 如果发生在 tileloadend
                     * 之前，直接忽略。
                     *
                     * 只有真正的：
                     *
                     * tileloadend
                     *      ↓
                     * rendercomplete
                     *
                     * 才允许进入最终 Paint 确认。
                     */
                    renderCompleteKey = map.on('rendercomplete', () => {
                        if (settled) return;

                        if (!tileLoaded) {
                            return;
                        }

                        renderedAfterTileLoad = true;

                        maybeFinish();
                    });
                }
            }

            /**
             * 最终安全兜底。
             *
             * MapContainer 已经把这里配置成 15000ms。
             */
            timer = setTimeout(() => {
                finish();
            }, timeoutMs);
        });
    }

    return {
        scheduleLowPriorityTask,
        waitForCriticalTileReady,
        cancelScheduledTasks,
    };
}
