<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { apiDismissAnnouncement, apiGetCurrentAnnouncement } from '../api/backend'
import { useMessage } from '../composables/useMessage'

const message = useMessage()

const loading = ref(false)
const announcement = ref(null)
let msgId = null

let pollTimer = null

function normalizeAnnouncement(payload) {
  if (!payload || typeof payload !== 'object') return null

  const id = Number(payload.id)
  const text = String(payload.message || '').trim()

  if (!Number.isFinite(id) || id <= 0 || !text) {
    return null
  }

  return {
    id,
    message: text,
    created_by: String(payload.created_by || ''),
    updated_at: String(payload.updated_at || payload.created_at || '')
  }
}

function formatTimeLabel(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''

  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function refreshAnnouncement({ silent = false } = {}) {
  if (loading.value) return

  loading.value = true
  try {
    const result = await apiGetCurrentAnnouncement()
    const raw = normalizeAnnouncement(result?.data)
    
    // 如果没有公告 或者 当前显示的公告就是它，就不做处理
    if (!raw) {
      if (announcement.value) {
        announcement.value = null
      }
      return
    }
    
    // 新公告 or 公告更新了
    if (!announcement.value || announcement.value.id !== raw.id || announcement.value.message !== raw.message) {
      announcement.value = raw
    }
  } catch (error) {
    if (!silent) {
      message.warning(String(error?.message || '公告获取失败'))
    }
  } finally {
    loading.value = false
  }
}

async function dismissCurrentAnnouncement(idToDismiss) {
  if (!idToDismiss) return

  try {
    await apiDismissAnnouncement(idToDismiss)
    if (announcement.value && announcement.value.id === idToDismiss) {
      announcement.value = null
    }
  } catch (error) {
    message.error(String(error?.message || '公告隐藏失败'))
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
    message.remove(msgId)
    msgId = null
  }
  
  if (newVal) {
    const currentId = newVal.id;
    msgId = message.info(getAnnouncementText(newVal), {
      duration: 0,
      showTitle: false,
      closable: true,
      onClose: () => {
        dismissCurrentAnnouncement(currentId)
      }
    })
  }
})

onMounted(async () => {
  await refreshAnnouncement({ silent: true })

  if (typeof window !== 'undefined') {
    pollTimer = window.setInterval(() => {
      refreshAnnouncement({ silent: true })
    }, 20000)
  }
})

onBeforeUnmount(() => {
  if (pollTimer && typeof window !== 'undefined') {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  if (msgId) {
    message.remove(msgId)
    msgId = null
  }
})
</script>

<template>
  <div style="display: none;"></div>
</template>
