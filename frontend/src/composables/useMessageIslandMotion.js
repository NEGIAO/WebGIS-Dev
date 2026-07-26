import { onUnmounted, ref, watch } from 'vue';

const CLICK_COLLAPSE_MS = 280;
const MIN_TIMER_MS = 16;
/**
 * 错峰间隔：多条消息"同时到期"时依次错开的最小间隔。
 * V3.4.x 修复：旧逻辑把每条新消息的关闭时刻排到"最晚关闭时刻 + 自身完整 duration"之后
 * （严格串行），首屏 burst N 条时第 N 条要停留 N×duration（5 条 3s 消息 = 最后一条挂 15s）。
 * 现改为并行计时，仅用该间隔保持"先来先走"的顺序感。
 */
const CLOSE_STAGGER_MS = 250;

export function useMessageIslandMotion({ messagesRef, durationRef, onClose }) {
    const autoCloseTimers = new Map();
    const autoCloseMeta = new Map();
    const collapseTimers = new Map();
    const collapsingIds = ref(new Set());
    /** 每条消息最近一次观察到的 dedup 合并计数：变化时需重启计时器 */
    const dedupCounts = new Map();

    function prefersReducedMotion() {
        return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    }

    function resolveDuration(item) {
        const raw = item?.duration ?? durationRef?.value ?? 0;
        if (!Number.isFinite(raw)) return 0;
        return Math.max(0, raw);
    }

    function getLatestRunningCloseAt() {
        let latest = 0;

        for (const meta of autoCloseMeta.values()) {
            if (meta?.startedAt > 0 && Number.isFinite(meta?.closeAt) && meta.closeAt > latest) {
                latest = meta.closeAt;
            }
        }

        return latest;
    }

    function clearAutoCloseTimer(id) {
        const timer = autoCloseTimers.get(id);
        if (timer == null) return;

        globalThis.clearTimeout(timer);
        autoCloseTimers.delete(id);
    }

    function clearAutoCloseState(id) {
        clearAutoCloseTimer(id);
        autoCloseMeta.delete(id);
    }

    function clearCollapseTimer(id) {
        const timer = collapseTimers.get(id);
        if (timer == null) return;

        globalThis.clearTimeout(timer);
        collapseTimers.delete(id);
    }

    function clearAllTimers() {
        for (const timer of autoCloseTimers.values()) {
            globalThis.clearTimeout(timer);
        }
        for (const timer of collapseTimers.values()) {
            globalThis.clearTimeout(timer);
        }

        autoCloseTimers.clear();
        autoCloseMeta.clear();
        collapseTimers.clear();
    }

    function startAutoCloseTimer(item, customDelayMs) {
        const id = item?.id ?? null;
        if (id == null) return;
        if (collapsingIds.value.has(id)) return;

        const now = Date.now();
        const baseDuration = resolveDuration(item);

        let finalDelay = customDelayMs;

        if (finalDelay === undefined) {
            if (baseDuration <= 0) {
                clearAutoCloseState(id);
                return;
            }

            // 并行计时 + 错峰：每条按自身 duration 关闭，仅当与已有消息"同时到期"时
            // 顺延 CLOSE_STAGGER_MS，保持先来先走的顺序感而不串行叠加。
            const latestRunningCloseAt = getLatestRunningCloseAt();
            const earliestCloseAt = now + baseDuration;
            const scheduledCloseAt =
                latestRunningCloseAt > now
                    ? Math.max(earliestCloseAt, latestRunningCloseAt + CLOSE_STAGGER_MS)
                    : earliestCloseAt;

            finalDelay = scheduledCloseAt - now;
        }

        if (!Number.isFinite(finalDelay) || finalDelay <= 0) {
            clearAutoCloseState(id);
            requestClose(id, { animated: false });
            return;
        }

        finalDelay = Math.max(MIN_TIMER_MS, finalDelay);

        // 仅首次调度写回实际寿命（含错峰偏移），供进度条动画时长使用；
        // resume（customDelayMs=剩余时长）不改写，保证进度条与计时器同相位续走。
        if (customDelayMs === undefined && item && typeof item === 'object') {
            item._lifeMs = finalDelay;
        }

        clearAutoCloseTimer(id);

        autoCloseMeta.set(id, {
            remainingMs: finalDelay,
            startedAt: now,
            closeAt: now + finalDelay,
        });

        const timer = globalThis.setTimeout(() => {
            clearAutoCloseState(id);
            requestClose(id, { animated: false });
        }, finalDelay);

        autoCloseTimers.set(id, timer);
    }

    function pauseTimer(id) {
        if (id == null) return;

        const currentMeta = autoCloseMeta.get(id);
        if (currentMeta != null && currentMeta.startedAt > 0) {
            const elapsed = Date.now() - currentMeta.startedAt;
            const remainingMs = Math.max(0, currentMeta.remainingMs - elapsed);

            autoCloseMeta.set(id, {
                ...currentMeta,
                remainingMs,
                startedAt: 0,
                closeAt: 0,
            });
        }

        clearAutoCloseTimer(id);
    }

    function resumeTimer(item) {
        const id = item?.id ?? null;
        if (id == null) return;

        const currentMeta = autoCloseMeta.get(id);

        if (currentMeta == null) {
            startAutoCloseTimer(item);
            return;
        }

        const remainingMs = currentMeta.remainingMs ?? resolveDuration(item);

        if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
            clearAutoCloseState(id);
            requestClose(id, { animated: false });
            return;
        }

        startAutoCloseTimer(item, remainingMs);
    }

    function requestClose(id, { animated = true } = {}) {
        const targetId = id ?? null;
        if (targetId == null) return;

        const exists = messagesRef?.value?.some((msg) => msg?.id === targetId) ?? false;
        if (!exists) {
            clearAutoCloseState(targetId);
            clearCollapseTimer(targetId);
            collapsingIds.value.delete(targetId);
            return;
        }

        clearAutoCloseState(targetId);

        const shouldAnimate = animated && !prefersReducedMotion();

        if (!shouldAnimate) {
            clearCollapseTimer(targetId);
            collapsingIds.value.delete(targetId);
            onClose?.(targetId);
            return;
        }

        if (collapsingIds.value.has(targetId)) return;

        collapsingIds.value.add(targetId);
        clearCollapseTimer(targetId);

        const timer = globalThis.setTimeout(() => {
            collapsingIds.value.delete(targetId);
            collapseTimers.delete(targetId);
            onClose?.(targetId);
        }, CLICK_COLLAPSE_MS);

        collapseTimers.set(targetId, timer);
    }

    /**
     * 整岛悬停暂停：指针进入岛内暂停全部可见消息的计时，移出统一恢复。
     * 旧交互只暂停悬停的单条，阅读时邻条会在脚下消失、列表跳动。
     */
    function pauseAllTimers() {
        for (const msg of messagesRef?.value ?? []) {
            if (msg?.id != null) pauseTimer(msg.id);
        }
    }

    function resumeAllTimers() {
        for (const msg of messagesRef?.value ?? []) {
            if (msg?.id != null) resumeTimer(msg);
        }
    }

    function handleItemClick(item) {
        if (item?.closable === false) return;
        requestClose(item?.id, { animated: true });
    }

    function handleCloseButtonClick(id) {
        requestClose(id, { animated: true });
    }

    function isCollapsing(id) {
        return collapsingIds.value.has(id);
    }

    watch(
        messagesRef,
        (newMessages) => {
            const currentMessages = newMessages ?? [];
            const activeIds = new Set(
                currentMessages.map((msg) => msg?.id).filter((id) => id != null),
            );

            for (const id of autoCloseTimers.keys()) {
                if (!activeIds.has(id)) {
                    clearAutoCloseState(id);
                }
            }

            for (const id of collapseTimers.keys()) {
                if (!activeIds.has(id)) {
                    clearCollapseTimer(id);
                }
            }

            for (const id of Array.from(collapsingIds.value)) {
                if (!activeIds.has(id)) {
                    collapsingIds.value.delete(id);
                }
            }

            for (const id of dedupCounts.keys()) {
                if (!activeIds.has(id)) dedupCounts.delete(id);
            }

            currentMessages.forEach((msg) => {
                const msgId = msg?.id ?? null;
                if (msgId == null) return;
                if (collapsingIds.value.has(msgId)) return;

                // 防抖合并计数变化 → useMessage 已刷新 duration，
                // 这里必须清掉旧 meta 重启计时器（旧逻辑直接 return，合并后仍按首条时刻关闭）。
                const dedupCount = msg?._dedupCount ?? 0;
                if (dedupCounts.get(msgId) !== dedupCount) {
                    dedupCounts.set(msgId, dedupCount);
                    const meta = autoCloseMeta.get(msgId);
                    if (meta && meta.startedAt === 0) {
                        // hover 暂停中：仅刷新剩余时长，移出后按新时长恢复，不打断暂停
                        autoCloseMeta.set(msgId, { ...meta, remainingMs: resolveDuration(msg) });
                    } else if (autoCloseTimers.has(msgId) || autoCloseMeta.has(msgId)) {
                        clearAutoCloseState(msgId);
                    }
                }

                if (autoCloseTimers.has(msgId) || autoCloseMeta.has(msgId)) return;

                startAutoCloseTimer(msg);
            });
        },
        { immediate: true, deep: true },
    );

    onUnmounted(() => {
        clearAllTimers();
        collapsingIds.value.clear();
        dedupCounts.clear();
    });

    return {
        clickCollapseMs: CLICK_COLLAPSE_MS,
        handleCloseButtonClick,
        handleItemClick,
        isCollapsing,
        pauseAllTimers,
        pauseTimer,
        requestClose,
        resumeAllTimers,
        resumeTimer,
    };
}
