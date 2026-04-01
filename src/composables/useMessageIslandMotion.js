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
    return item?.duration ?? durationRef?.value ?? 0;
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

    const cachedRemaining = autoCloseMeta.get(id)?.remainingMs;
    const duration = customDelayMs ?? cachedRemaining ?? resolveDuration(item);
    if (!Number.isFinite(duration) || duration <= 0) {
      clearAutoCloseState(id);
      return;
    }

    const finalDelay = Math.max(MIN_TIMER_MS, duration);

    clearAutoCloseTimer(id);

    autoCloseMeta.set(id, {
      remainingMs: finalDelay,
      startedAt: Date.now()
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
    if (currentMeta != null) {
      const elapsed = Date.now() - (currentMeta.startedAt ?? Date.now());
      const remainingMs = Math.max(0, (currentMeta.remainingMs ?? 0) - elapsed);
      autoCloseMeta.set(id, {
        remainingMs,
        startedAt: 0
      });
    }

    clearAutoCloseTimer(id);
  }

  function resumeTimer(item) {
    const id = item?.id ?? null;
    if (id == null) return;

    const duration = resolveDuration(item);
    if (!Number.isFinite(duration) || duration <= 0) return;

    const remainingMs = autoCloseMeta.get(id)?.remainingMs ?? duration;

    if (remainingMs <= 0) {
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
    (newMessages, oldMessages) => {
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

      const oldIds = new Set(
        (oldMessages ?? [])
          .map((msg) => msg?.id)
          .filter((id) => id != null)
      );

      currentMessages.forEach((msg) => {
        const msgId = msg?.id ?? null;
        if (msgId == null || oldIds.has(msgId)) return;

        clearAutoCloseState(msgId);
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
