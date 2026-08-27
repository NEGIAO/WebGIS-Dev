<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { apiDismissAnnouncement, apiGetCurrentAnnouncement } from '@/api/backend';
import { useMessage } from '@common/shell/useMessage';
import { formatDateTime } from '@common/utils/datetime';

const message = useMessage();

const loading = ref(false);
const announcement = ref(null);
let msgId = null;

let pollTimer = null;

/** 启动/停止公告 20s 轮询：仅页面可见时轮询，后台挂起即停（避免积压拖垮后端） */
function startPolling() {
    if (pollTimer || typeof window === 'undefined') return;
    pollTimer = window.setInterval(() => {
        refreshAnnouncement({ silent: true });
    }, 20000);
}

function stopPolling() {
    if (pollTimer && typeof window !== 'undefined') {
        window.clearInterval(pollTimer);
        pollTimer = null;
    }
}

/** 页面可见性变化：切回前台立即刷新一次并恢复轮询；后台挂起停止轮询 */
function handleVisibilityChange() {
    if (document.hidden) {
        stopPolling();
    } else {
        refreshAnnouncement({ silent: true });
        startPolling();
    }
}

function normalizeAnnouncement(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const id = Number(payload.id);
    const text = String(payload.message || '').trim();

    if (!Number.isFinite(id) || id <= 0 || !text) {
        return null;
    }

    return {
        id,
        message: text,
        created_by: String(payload.created_by || ''),
        updated_at: String(payload.updated_at || payload.created_at || ''),
    };
}

function formatTimeLabel(raw) {
    // 公告面向中文用户，固定 zh-CN；非法输入原样展示
    return formatDateTime(String(raw || '').trim(), { locale: 'zh-CN', invalidText: null });
}

async function refreshAnnouncement({ silent = false } = {}) {
    if (loading.value) return;

    loading.value = true;
    try {
        const result = await apiGetCurrentAnnouncement();
        const raw = normalizeAnnouncement(result?.data);

        // 如果没有公告 或者 当前显示的公告就是它，就不做处理
        if (!raw) {
            if (announcement.value) {
                announcement.value = null;
            }
            return;
        }

        // 新公告 or 公告更新了
        if (
            !announcement.value ||
            announcement.value.id !== raw.id ||
            announcement.value.message !== raw.message
        ) {
            announcement.value = raw;
        }
    } catch (error) {
        if (!silent) {
            message.warning(String(error?.message || '公告获取失败'));
        }
    } finally {
        loading.value = false;
    }
}

async function dismissCurrentAnnouncement(idToDismiss) {
    if (!idToDismiss) return;

    try {
        await apiDismissAnnouncement(idToDismiss);
        if (announcement.value && announcement.value.id === idToDismiss) {
            announcement.value = null;
        }
    } catch (error) {
        message.error(String(error?.message || '公告隐藏失败'));
    }
}

function getAnnouncementText(ann) {
    const time = formatTimeLabel(ann.updated_at);
    const by = ann.created_by ? `发布者: ${ann.created_by}` : '';
    const meta = [by, time ? `更新时间: ${time}` : ''].filter(Boolean).join(' | ');

    return `【系统公告】\n\n${ann.message}\n\n${meta}`;
}

watch(announcement, (newVal) => {
    if (msgId) {
        message.remove(msgId);
        msgId = null;
    }

    if (newVal) {
        const currentId = newVal.id;
        msgId = message.info(getAnnouncementText(newVal), {
            duration: 0,
            showTitle: false,
            closable: true,
            onClose: () => {
                dismissCurrentAnnouncement(currentId);
            },
        });
    }
});

onMounted(async () => {
    await refreshAnnouncement({ silent: true });

    if (typeof window !== 'undefined') {
        startPolling();
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }
});

onBeforeUnmount(() => {
    stopPolling();
    if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
    if (msgId) {
        message.remove(msgId);
        msgId = null;
    }
});
</script>

<template>
    <div style="display: none"></div>
</template>
