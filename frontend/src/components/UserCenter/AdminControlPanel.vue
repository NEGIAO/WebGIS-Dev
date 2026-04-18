<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMessage } from '../../composables/useMessage'
import {
  apiAdminDeleteRows,
  apiAdminGetTableRows,
  apiAdminInsertRow,
  apiAdminListTables,
  apiAdminOverview,
  apiAdminPublishAnnouncement,
  apiAdminUpdateContact,
  apiAdminUpdateRows
} from '../../api/backend'

const message = useMessage()

const overview = ref({
  table_count: 0,
  total_users: 0,
  total_sessions: 0,
  total_messages: 0,
  active_announcement: 0
})

const tables = ref([])
const selectedTable = ref('')
const tableRows = ref([])

const tableLimit = ref(30)
const tableOffset = ref(0)
const insertJsonText = ref('{\n  \n}')

const adminContactText = ref('')
const announcementText = ref('')

const loadingOverview = ref(false)
const loadingTables = ref(false)
const loadingRows = ref(false)
const submittingConfig = ref(false)
const submittingTable = ref(false)

const selectedTableMeta = computed(() => {
  return tables.value.find((item) => item.name === selectedTable.value) || null
})

const rowCountText = computed(() => `共加载 ${tableRows.value.length} 行`)

function parseJsonObject(text, hint = 'JSON 格式错误') {
  try {
    const parsed = JSON.parse(String(text || '{}'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON 必须是对象')
    }
    return parsed
  } catch (error) {
    const detail = String(error?.message || '').trim()
    throw new Error(`${hint}${detail ? `：${detail}` : ''}`)
  }
}

function resolveWhere(row) {
  if (row && row.__rowid != null) {
    return { __rowid: row.__rowid }
  }
  if (row && row.id != null) {
    return { id: row.id }
  }
  if (row && row.token != null) {
    return { token: row.token }
  }
  if (row && row.username != null && selectedTable.value === 'user_metrics') {
    return { username: row.username }
  }
  return null
}

function toEditablePayload(row) {
  const payload = { ...(row || {}) }
  delete payload.__rowid
  return payload
}

async function loadOverview() {
  loadingOverview.value = true
  try {
    const result = await apiAdminOverview()
    overview.value = {
      ...overview.value,
      ...(result?.data || {})
    }
  } catch (error) {
    message.error(String(error?.message || '管理员概览加载失败'))
  } finally {
    loadingOverview.value = false
  }
}

async function loadTables() {
  loadingTables.value = true
  try {
    const result = await apiAdminListTables()
    const list = Array.isArray(result?.data) ? result.data : []
    tables.value = list

    if (!selectedTable.value && list.length > 0) {
      selectedTable.value = String(list[0].name || '')
    }

    if (selectedTable.value && !list.some((item) => item.name === selectedTable.value)) {
      selectedTable.value = String(list[0]?.name || '')
    }
  } catch (error) {
    message.error(String(error?.message || '数据库表列表加载失败'))
  } finally {
    loadingTables.value = false
  }
}

async function loadRows() {
  const tableName = String(selectedTable.value || '').trim()
  if (!tableName) {
    tableRows.value = []
    return
  }

  loadingRows.value = true
  try {
    const result = await apiAdminGetTableRows(tableName, tableLimit.value, tableOffset.value)
    tableRows.value = Array.isArray(result?.data) ? result.data : []
  } catch (error) {
    tableRows.value = []
    message.error(String(error?.message || '表数据加载失败'))
  } finally {
    loadingRows.value = false
  }
}

async function handleInsertRow() {
  if (submittingTable.value) return

  const tableName = String(selectedTable.value || '').trim()
  if (!tableName) {
    message.warning('请先选择数据表')
    return
  }

  let rowPayload = null
  try {
    rowPayload = parseJsonObject(insertJsonText.value, '新增数据解析失败')
  } catch (error) {
    message.error(String(error?.message || '新增数据解析失败'))
    return
  }

  submittingTable.value = true
  try {
    await apiAdminInsertRow(tableName, rowPayload)
    message.success('新增成功')
    await loadRows()
    await loadOverview()
  } catch (error) {
    message.error(String(error?.message || '新增失败'))
  } finally {
    submittingTable.value = false
  }
}

async function handleEditRow(row) {
  if (submittingTable.value) return

  const tableName = String(selectedTable.value || '').trim()
  const where = resolveWhere(row)

  if (!tableName || !where) {
    message.warning('当前行缺少可定位键，无法编辑')
    return
  }

  const editable = toEditablePayload(row)
  const defaultText = JSON.stringify(editable, null, 2)
  const nextText = window.prompt('请输入更新后的 JSON 对象（整行替换）', defaultText)

  if (nextText === null) return

  let nextValues = null
  try {
    nextValues = parseJsonObject(nextText, '编辑数据解析失败')
  } catch (error) {
    message.error(String(error?.message || '编辑数据解析失败'))
    return
  }

  submittingTable.value = true
  try {
    await apiAdminUpdateRows(tableName, where, nextValues)
    message.success('更新成功')
    await loadRows()
  } catch (error) {
    message.error(String(error?.message || '更新失败'))
  } finally {
    submittingTable.value = false
  }
}

async function handleDeleteRow(row) {
  if (submittingTable.value) return

  const tableName = String(selectedTable.value || '').trim()
  const where = resolveWhere(row)

  if (!tableName || !where) {
    message.warning('当前行缺少可定位键，无法删除')
    return
  }

  const ok = window.confirm('确认删除该行数据？此操作不可撤销。')
  if (!ok) return

  submittingTable.value = true
  try {
    await apiAdminDeleteRows(tableName, where)
    message.success('删除成功')
    await loadRows()
    await loadOverview()
  } catch (error) {
    message.error(String(error?.message || '删除失败'))
  } finally {
    submittingTable.value = false
  }
}

async function handlePublishAnnouncement() {
  if (submittingConfig.value) return

  const content = String(announcementText.value || '').trim()
  if (!content) {
    message.warning('请输入公告内容')
    return
  }

  submittingConfig.value = true
  try {
    await apiAdminPublishAnnouncement(content)
    message.success('公告发布成功')
    announcementText.value = ''
    await loadOverview()
  } catch (error) {
    message.error(String(error?.message || '公告发布失败'))
  } finally {
    submittingConfig.value = false
  }
}

async function handleSaveContact() {
  if (submittingConfig.value) return

  const contact = String(adminContactText.value || '').trim()
  if (!contact) {
    message.warning('管理员联系方式不能为空')
    return
  }

  submittingConfig.value = true
  try {
    await apiAdminUpdateContact(contact)
    message.success('管理员联系方式已更新')
  } catch (error) {
    message.error(String(error?.message || '联系方式更新失败'))
  } finally {
    submittingConfig.value = false
  }
}

watch(selectedTable, async () => {
  tableOffset.value = 0
  await loadRows()
})

onMounted(async () => {
  await loadOverview()
  await loadTables()
  await loadRows()
})
</script>

<template>
  <div class="admin-console">
    <div class="admin-card">
      <div class="admin-title-row">
        <h4 class="admin-title">管理员控制台</h4>
        <button class="admin-mini-btn" type="button" :disabled="loadingOverview" @click="loadOverview">
          刷新概览
        </button>
      </div>

      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-label">数据表</span>
          <strong class="overview-value">{{ overview.table_count }}</strong>
        </div>
        <div class="overview-item">
          <span class="overview-label">用户</span>
          <strong class="overview-value">{{ overview.total_users }}</strong>
        </div>
        <div class="overview-item">
          <span class="overview-label">在线会话</span>
          <strong class="overview-value">{{ overview.total_sessions }}</strong>
        </div>
        <div class="overview-item">
          <span class="overview-label">留言</span>
          <strong class="overview-value">{{ overview.total_messages }}</strong>
        </div>
      </div>
    </div>

    <div class="admin-card">
      <h5 class="admin-subtitle">系统配置</h5>

      <label class="admin-field-label">管理员联系方式</label>
      <input v-model="adminContactText" class="admin-input" type="text" placeholder="例如：邮箱 / 微信 / QQ" />

      <button class="admin-action-btn" type="button" :disabled="submittingConfig" @click="handleSaveContact">
        保存联系方式
      </button>

      <label class="admin-field-label">常驻顶部公告</label>
      <textarea
        v-model="announcementText"
        class="admin-textarea"
        placeholder="发布后会同步给所有用户，用户点击后才会消失"
      ></textarea>

      <button class="admin-action-btn" type="button" :disabled="submittingConfig" @click="handlePublishAnnouncement">
        发布公告
      </button>
    </div>

    <div class="admin-card">
      <div class="admin-title-row">
        <h5 class="admin-subtitle">数据库管理</h5>
        <button class="admin-mini-btn" type="button" :disabled="loadingTables" @click="loadTables">
          刷新表
        </button>
      </div>

      <div class="admin-select-row">
        <select v-model="selectedTable" class="admin-select">
          <option value="" disabled>请选择数据表</option>
          <option v-for="item in tables" :key="item.name" :value="item.name">
            {{ item.name }}
          </option>
        </select>
        <button class="admin-mini-btn" type="button" :disabled="loadingRows" @click="loadRows">刷新行</button>
      </div>

      <div class="admin-meta-row">
        <span>{{ rowCountText }}</span>
        <span v-if="selectedTableMeta">字段数：{{ selectedTableMeta.columns?.length || 0 }}</span>
      </div>

      <div class="rows-wrap" v-if="tableRows.length > 0">
        <div v-for="row in tableRows" :key="String(row.__rowid || row.id || row.token || Math.random())" class="row-item">
          <pre class="row-json">{{ JSON.stringify(row, null, 2) }}</pre>
          <div class="row-actions">
            <button class="admin-mini-btn" type="button" :disabled="submittingTable" @click="handleEditRow(row)">编辑</button>
            <button class="admin-mini-btn danger" type="button" :disabled="submittingTable" @click="handleDeleteRow(row)">删除</button>
          </div>
        </div>
      </div>
      <div v-else class="rows-empty">当前表暂无可展示数据</div>

      <label class="admin-field-label">新增一行（JSON 对象）</label>
      <textarea
        v-model="insertJsonText"
        class="admin-textarea"
        placeholder='例如：{"username":"demo","content":"hello"}'
      ></textarea>

      <button class="admin-action-btn" type="button" :disabled="submittingTable" @click="handleInsertRow">
        新增到当前表
      </button>
    </div>
  </div>
</template>

<style scoped>
.admin-console {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.admin-card {
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
  padding: 12px;
  box-shadow: 0 4px 12px rgba(49, 111, 69, 0.05);
}

.admin-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.admin-title {
  margin: 0;
  font-size: 15px;
  color: var(--acc-text-strong, #214a31);
  font-weight: 600;
}

.admin-subtitle {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--acc-text-main, #2c5f3e);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.overview-item {
  border: 1px solid rgba(76, 175, 80, 0.15);
  border-radius: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-label {
  font-size: 12px;
  color: var(--acc-text-soft, #5d7f6a);
}

.overview-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--acc-text-strong, #214a31);
}

.admin-field-label {
  display: block;
  margin: 10px 0 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--acc-text-strong, #214a31);
}

.admin-input,
.admin-select,
.admin-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 8px;
  background: #ffffff;
  color: #333333;
  padding: 10px;
  font-size: 13px;
  transition: border-color 0.2s;
}

.admin-input:focus,
.admin-select:focus,
.admin-textarea:focus {
  outline: none;
  border-color: #59b66a;
  box-shadow: 0 0 0 3px rgba(89, 182, 106, 0.15);
}

.admin-textarea {
  min-height: 88px;
  resize: vertical;
  font-family: Consolas, Monaco, 'Courier New', monospace;
}

.admin-action-btn,
.admin-mini-btn {
  background: linear-gradient(135deg, #6fca7a 0%, #4caf50 100%);
  color: #ffffff;
  border: 1px solid rgba(63, 148, 75, 0.55);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 500;
}

.admin-action-btn {
  margin-top: 8px;
  padding: 10px 14px;
  font-size: 13px;
  width: 100%;
  box-shadow: 0 4px 10px rgba(58, 129, 76, 0.15);
}

.admin-mini-btn {
  padding: 6px 12px;
  font-size: 12px;
}

.admin-mini-btn:hover:not(:disabled),
.admin-action-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #7fd489 0%, #57b862 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(58, 129, 76, 0.25);
}

.admin-mini-btn:disabled,
.admin-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  background: #a9d9b4;
  border-color: transparent;
}

.admin-mini-btn.danger {
  background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
  border-color: rgba(220, 38, 38, 0.5);
}

.admin-mini-btn.danger:hover:not(:disabled) {
  background: linear-gradient(135deg, #fca5a5 0%, #f87171 100%);
  box-shadow: 0 4px 10px rgba(220, 38, 38, 0.2);
}

.admin-select-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.admin-meta-row {
  margin-top: 8px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--acc-text-soft, #5d7f6a);
}

.rows-wrap {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.rows-wrap::-webkit-scrollbar {
  width: 6px;
}
.rows-wrap::-webkit-scrollbar-thumb {
  background: rgba(76, 175, 80, 0.3);
  border-radius: 4px;
}

.row-item {
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  padding: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
}

.row-json {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #1d4027;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(243, 255, 247, 0.8);
  padding: 8px;
  border-radius: 6px;
  border: 1px dashed rgba(76, 175, 80, 0.2);
}

.row-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.rows-empty {
  margin-top: 10px;
  border: 1px dashed rgba(76, 175, 80, 0.4);
  border-radius: 10px;
  padding: 16px;
  font-size: 13px;
  color: var(--acc-text-soft, #5d7f6a);
  text-align: center;
  background: rgba(255, 255, 255, 0.4);
}
</style>
