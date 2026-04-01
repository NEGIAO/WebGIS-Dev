import { onUnmounted, ref, watch } from 'vue';

const CLICK_COLLAPSE_MS = 280;
const MIN_TIMER_MS = 16;

export function useMessageIslandMotion({ messagesRef, durationRef, onClose }) {
  const autoCloseTimers = new Map();
  const autoCloseMeta = new Map();
  const collapseTimers = new Map();
  const collapsingIds = ref(new Set());

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

      const latestRunningCloseAt = getLatestRunningCloseAt();
      const earliestCloseAt = now + baseDuration;
      const scheduledCloseAt = latestRunningCloseAt > now
        ? Math.max(earliestCloseAt, latestRunningCloseAt + baseDuration)
        : earliestCloseAt;

      finalDelay = scheduledCloseAt - now;
    }

    if (!Number.isFinite(finalDelay) || finalDelay <= 0) {
      clearAutoCloseState(id);
      requestClose(id, { animated: false });
      return;
    }

    finalDelay = Math.max(MIN_TIMER_MS, finalDelay);

    clearAutoCloseTimer(id);

    autoCloseMeta.set(id, {
      remainingMs: finalDelay,
      startedAt: now,
      closeAt: now + finalDelay
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
        closeAt: 0
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
        currentMessages
          .map((msg) => msg?.id)
          .filter((id) => id != null)
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

      currentMessages.forEach((msg) => {
        const msgId = msg?.id ?? null;
        if (msgId == null) return;
        if (collapsingIds.value.has(msgId)) return;
        if (autoCloseTimers.has(msgId) || autoCloseMeta.has(msgId)) return;

        startAutoCloseTimer(msg);
      });
    },
    { immediate: true, deep: true }
  );

  onUnmounted(() => {
    clearAllTimers();
    collapsingIds.value.clear();
  });

  return {
    clickCollapseMs: CLICK_COLLAPSE_MS,
    handleCloseButtonClick,
    handleItemClick,
    isCollapsing,
    pauseTimer,
    requestClose,
    resumeTimer
  };
}
