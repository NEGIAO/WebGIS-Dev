<template>
  <div class="chat-container">
    <div class="chat-header">
      <span class="chat-title">
        <bot-icon :size="18" color="Green" :stroke-width="2" />
        AI 助手
      </span>
      <div class="header-controls">
        <button @click="toggleUserConfig" class="icon-btn" title="我的 Agent 配置">⚙️</button>
        <button @click="reloadAgentConfig(true)" class="icon-btn" title="刷新状态">🔄</button>
        <button @click="clearHistory" class="icon-btn" title="清除历史">🧹</button>
        <button @click="emit('close-chat')" class="icon-btn" title="退出AI">✖️</button>
      </div>
    </div>

    <div v-if="showUserConfig" class="user-config-panel">
      <div class="user-config-grid">
        <label class="user-config-item user-config-item-full">
          <span>我的 Agent API Key</span>
          <input v-model="userConfigDraft.api_key" type="password" placeholder="sk-...（仅存后端，不在前端明文持久化）" />
        </label>
        <label class="user-config-item">
          <span>Base URL</span>
          <input v-model="userConfigDraft.base_url" placeholder="https://api.xxx.com/v1" />
        </label>
        <label class="user-config-item">
          <span>Model</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select v-model="userConfigDraft.model" class="model-select">
              <option value="">-- 选择模型 --</option>
              <option v-if="!configuredModels.length && !upstreamModels.length" value="" disabled>未获取到可用模型</option>
              <optgroup v-if="configuredModels.length" label="当前配置模型">
                <option v-for="m in configuredModels" :key="m.id" :value="m.id" :disabled="m.chat_compatible === false">
                  {{ formatModelOptionLabel(m) }}
                </option>
              </optgroup>
              <optgroup v-if="upstreamModels.length" label="上游可用模型">
                <option v-for="m in upstreamModels" :key="m.id" :value="m.id" :disabled="m.chat_compatible === false">
                  {{ formatModelOptionLabel(m) }}
                </option>
              </optgroup>
            </select>
            <button @click="loadAvailableModels" class="refresh-models-btn" :disabled="isLoadingModels" title="刷新模型列表">
              {{ isLoadingModels ? '⏳' : '🔄' }}
            </button>
          </div>
          <small class="hint">{{ modelLoadHint }}</small>
        </label>
        <label class="user-config-item">
          <span>Timeout (秒)</span>
          <input v-model.number="userConfigDraft.timeout_seconds" type="number" min="5" max="180" />
        </label>
        <label class="user-config-item">
          <span>Max Tokens</span>
          <input v-model.number="userConfigDraft.max_tokens" type="number" min="1" max="8192" />
        </label>
        <label class="user-config-item">
          <span>Temperature</span>
          <input v-model.number="userConfigDraft.temperature" type="number" min="0" max="2" step="0.1" />
        </label>
        <label class="user-config-item user-config-item-full">
          <span>System Prompt</span>
          <textarea v-model="userConfigDraft.system_prompt" rows="3" placeholder="仅覆盖你自己的系统提示词（可选）"></textarea>
        </label>
      </div>

      <div class="user-config-actions">
        <button @click="saveUserConfig" :disabled="userConfigSaving">{{ userConfigSaving ? '保存中...' : '保存我的配置'
        }}</button>
        <button @click="clearPersonalKey" :disabled="userConfigSaving" class="secondary">清除我的 Key</button>
        <button @click="resetProviderOverrides" :disabled="userConfigSaving" class="secondary">恢复平台默认参数</button>
      </div>

      <small class="hint">提示：你可以使用自己申请的 Agent 账号，调用仍然由后端转发执行。</small>
    </div>

    <div class="service-status">
      <div class="status-line">
        <span class="status-label">服务状态:</span>
        <span :class="['status-value', serviceReady ? 'status-ready' : 'status-unready']">
          {{ serviceReady ? '已连接后端 Agent' : '未就绪（请联系管理员配置）' }}
        </span>
      </div>
      <div class="status-line">
        <span class="status-label">当前模型:</span>
        <span class="status-value">{{ modelName || '未配置' }}</span>
      </div>
      <div class="status-line">
        <span class="status-label">今日对话额度:</span>
        <span class="status-value">{{ quotaText }}</span>
      </div>
      <small class="hint">{{ statusHint }}</small>
    </div>

    <div class="chat-body" ref="chatBody">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <template v-if="msg.role === 'assistant'">
          <div class="message-content">{{ getAnswerContent(msg.content) }}</div>
          <details v-if="hasThinkContent(msg.content)" class="think-panel">
            <summary>展开思考过程</summary>
            <pre class="think-content">{{ getThinkContent(msg.content) }}</pre>
          </details>
        </template>
        <div v-else class="message-content">{{ msg.content }}</div>
      </div>
      <div v-if="isLoading" class="message assistant">
        <div class="message-content typing">正在思考...</div>
      </div>
    </div>

    <div class="chat-footer">
      <textarea v-model="inputMessage" @keydown.enter.prevent="sendMessage" :placeholder="inputPlaceholder"
        rows="1"></textarea>
      <button @click="sendMessage" :disabled="sendDisabled">发送</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, nextTick } from 'vue';
import { apiAgentChatCompletions, apiAgentGetChatConfig, apiAgentGetUserConfig, apiAgentUpdateUserConfig, apiAgentListModels, apiAgentSaveModelPreference } from '../api/backend';
import { readUserPositionFromCache } from '../utils/userPositionCache';
import { getGlobalUserLocationContext } from '../utils/userLocationContext';
import { useMessage } from '../composables/useMessage';
import { Bot as BotIcon } from 'lucide-vue-next';

const emit = defineEmits(['close-chat']);
const message = useMessage();

const inputMessage = ref('');
const isLoading = ref(false);
const chatBody = ref(null);
const modelName = ref('');
const statusHint = ref('正在连接后端 Agent...');
const serviceReady = ref(false);
const showUserConfig = ref(false);
const userConfigSaving = ref(false);
const userConfigDraft = ref({
  api_key: '',
  base_url: '',
  model: '',
  system_prompt: '',
  timeout_seconds: 45,
  max_tokens: 512,
  temperature: 0.2,
});
const quota = ref({
  limit: null,
  used: 0,
  remaining: null,
  usage_date: '',
  quota_subject: '',
});

// 模型列表相关
const isLoadingModels = ref(false);
const modelLoadHint = ref('');
const configuredModels = ref([]);
const upstreamModels = ref([]);

const messages = ref([]);
const firstMessageLocationInjected = ref(false);
const clearConfirmArmed = ref(false);
let clearConfirmTimer = null;

const MAX_CONTEXT_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const AUTO_PRUNE_AFTER_TURNS = 12;

const initWelcomeMessage = () => ({
  role: 'assistant',
  content: serviceReady.value
    ? '您好！我是由后端代理的 AI 助手，您可以直接开始提问。'
    : '您好！AI 服务暂未就绪。请联系管理员在后台配置 Agent Key。'
});

messages.value = [initWelcomeMessage()];

const normalizeQuota = (raw) => {
  const limit = raw?.limit === null || typeof raw?.limit === 'undefined'
    ? null
    : Number(raw.limit);
  const used = Number(raw?.used || 0);
  const remaining = raw?.remaining === null || typeof raw?.remaining === 'undefined'
    ? null
    : Number(raw.remaining);

  return {
    limit: Number.isFinite(limit) ? limit : null,
    used: Number.isFinite(used) ? Math.max(0, used) : 0,
    remaining: Number.isFinite(remaining) ? Math.max(0, remaining) : null,
    usage_date: String(raw?.usage_date || ''),
    quota_subject: String(raw?.quota_subject || ''),
  };
};

const quotaText = computed(() => {
  const limit = quota.value.limit;
  const used = quota.value.used;
  const remaining = quota.value.remaining;

  if (limit === null) {
    return '管理员无限制';
  }

  return `${used}/${limit}（剩余 ${remaining ?? 0}）`;
});

const quotaExhausted = computed(() => {
  return Number.isFinite(quota.value.remaining) && Number(quota.value.remaining) <= 0;
});

const inputPlaceholder = computed(() => {
  if (!serviceReady.value) {
    return '服务未就绪，请联系管理员配置 Agent Key';
  }
  if (quotaExhausted.value) {
    return '今日额度已达上限，请明日再试';
  }
  return '请输入您的问题...';
});

const sendDisabled = computed(() => {
  return isLoading.value || !inputMessage.value.trim() || !serviceReady.value || quotaExhausted.value;
});

const updateWelcomeMessageIfNeeded = () => {
  if (!Array.isArray(messages.value) || messages.value.length === 0) {
    messages.value = [initWelcomeMessage()];
    return;
  }

  const first = messages.value[0];
  if (first?.role !== 'assistant') return;

  const text = String(first?.content || '');
  const shouldReplace = text.includes('AI 服务暂未就绪')
    || text.includes('由后端代理的 AI 助手')
    || text.includes('初始化中');

  if (shouldReplace) {
    messages.value[0] = initWelcomeMessage();
  }
};

const reloadAgentConfig = async (showToast = false) => {
  try {
    const result = await apiAgentGetChatConfig();
    const data = result?.data || result || {};

    serviceReady.value = !!data?.service_ready;
    modelName.value = String(data?.model || '');
    quota.value = normalizeQuota(data?.quota || {});

    if (serviceReady.value) {
      statusHint.value = quotaExhausted.value
        ? '今日对话额度已达上限，请明日再试。'
        : '后端 Agent 已连接，前端不会暴露任何对话密钥。';
    } else {
      statusHint.value = '后端 Agent 未完成配置，请管理员在用户中心设置 Agent Key。';
    }

    updateWelcomeMessageIfNeeded();

    if (showToast) {
      message.success('已刷新 AI 服务状态');
    }
  } catch (error) {
    serviceReady.value = false;
    statusHint.value = `状态获取失败：${error.message}`;
    if (showToast) {
      message.error(`刷新失败：${error.message}`);
    }
  }
};

const loadUserConfig = async (showToast = false) => {
  try {
    const result = await apiAgentGetUserConfig();
    const data = result?.data || result || {};
    const personal = data?.personal || {};
    const effective = data?.effective || {};

    userConfigDraft.value = {
      api_key: '',
      base_url: String(personal?.base_url || effective?.base_url || ''),
      model: String(personal?.model || ''),
      system_prompt: String(personal?.system_prompt || ''),
      timeout_seconds: Number(personal?.timeout_seconds ?? effective?.timeout_seconds ?? 45),
      max_tokens: Number(personal?.max_tokens ?? effective?.max_tokens ?? 512),
      temperature: Number(personal?.temperature ?? effective?.temperature ?? 0.2),
    };

    if (showToast) {
      message.success('已加载你的 Agent 配置');
    }
  } catch (error) {
    if (showToast) {
      message.error(`加载个人配置失败：${error.message}`);
    }
  }
};

const toggleUserConfig = async () => {
  showUserConfig.value = !showUserConfig.value;
  if (showUserConfig.value) {
    await loadUserConfig(false);
    await loadAvailableModels();
  }
};

const loadAvailableModels = async () => {
  isLoadingModels.value = true;
  modelLoadHint.value = '正在加载模型列表...';

  try {
    // 调用后端 API 获取可用的模型列表
    const response = await apiAgentListModels();
    const data = response?.data || response || {};
    const models = Array.isArray(data?.models) ? data.models : [];

    configuredModels.value = models.filter((m) => m?.source !== 'upstream');
    upstreamModels.value = models.filter((m) => m?.source === 'upstream');

    const currentModel = String(data?.current_model || '').trim();

    // 零配置即刻响应：如果用户未选择模型，自动从可用列表中随机选择一个
    // 这样确保首条消息请求能够成功转发
    if (!String(userConfigDraft.value.model || '').trim()) {
      if (currentModel) {
        // 若后端已推荐（通常是管理员配置的默认模型或用户偏好），使用它
        userConfigDraft.value.model = currentModel;
      } else if (models.length > 0) {
        // 否则从可用列表中随机选择一个
        const chatModels = models.filter((m) => m?.chat_compatible !== false);
        if (chatModels.length > 0) {
          const randomModel = chatModels[Math.floor(Math.random() * chatModels.length)];
          userConfigDraft.value.model = String(randomModel?.id || '');
          // 异步保存为用户偏好（后台保存，不阻塞）
          if (userConfigDraft.value.model) {
            apiAgentSaveModelPreference(userConfigDraft.value.model).catch((e) => {
              logger.debug(`Auto-save model preference failed: ${e.message}`);
            });
          }
        }
      }
    }

    if (!models.length) {
      modelLoadHint.value = '未从上游返回可用模型，请检查 Base URL / API Key。';
      if (data?.fallback_reason) {
        modelLoadHint.value += `（${data.fallback_reason}）`;
      }
    } else {
      modelLoadHint.value = `✅ 已加载 ${models.length} 个模型（上游 ${upstreamModels.value.length}）`;
    }
  } catch (error) {
    modelLoadHint.value = `❌ 加载模型列表失败: ${error.message}`;
    message.error(`加载模型列表失败: ${error.message}`);
    configuredModels.value = [];
    upstreamModels.value = [];

    const fallbackModel = String(userConfigDraft.value.model || modelName.value || '').trim();
    if (fallbackModel) {
      configuredModels.value = [{
        id: fallbackModel,
        name: `当前模型：${fallbackModel}`,
        source: 'configured',
      }];
    }
  } finally {
    isLoadingModels.value = false;
  }
};

const formatModelOptionLabel = (model = {}) => {
  const name = String(model?.name || model?.id || '').trim() || 'unknown-model';
  if (model?.chat_compatible === false) {
    return `${name}（不支持 chat/completions）`;
  }
  return name;
};

const saveUserConfig = async () => {
  userConfigSaving.value = true;
  try {
    const payload = {
      api_key: String(userConfigDraft.value.api_key || '').trim(),
      base_url: String(userConfigDraft.value.base_url || '').trim(),
      model: String(userConfigDraft.value.model || '').trim(),
      system_prompt: String(userConfigDraft.value.system_prompt || '').trim(),
      timeout_seconds: Number(userConfigDraft.value.timeout_seconds || 45),
      max_tokens: Number(userConfigDraft.value.max_tokens || 512),
      temperature: Number(userConfigDraft.value.temperature ?? 0.2),
    };

    await apiAgentUpdateUserConfig(payload);

    // 若用户在个人配置中选择了特定模型，保存为偏好设置（用于跨设备同步）
    if (payload.model) {
      try {
        await apiAgentSaveModelPreference(payload.model);
      } catch (e) {
        logger.debug(`Failed to save model preference: ${e.message}`);
        // 不中断主流程，模型偏好是可选的
      }
    }

    userConfigDraft.value.api_key = '';
    await reloadAgentConfig(false);
    message.success('你的 Agent 配置已保存');
  } catch (error) {
    message.error(`保存个人配置失败：${error.message}`);
  } finally {
    userConfigSaving.value = false;
  }
};

const clearPersonalKey = async () => {
  userConfigSaving.value = true;
  try {
    await apiAgentUpdateUserConfig({ clear_personal_key: true, api_key: '' });
    userConfigDraft.value.api_key = '';
    await reloadAgentConfig(false);
    message.success('已清除你的个人 Agent Key');
  } catch (error) {
    message.error(`清除失败：${error.message}`);
  } finally {
    userConfigSaving.value = false;
  }
};

const resetProviderOverrides = async () => {
  userConfigSaving.value = true;
  try {
    await apiAgentUpdateUserConfig({ reset_provider_overrides: true });
    await loadUserConfig(false);
    await reloadAgentConfig(false);
    message.success('已恢复平台默认参数');
  } catch (error) {
    message.error(`恢复失败：${error.message}`);
  } finally {
    userConfigSaving.value = false;
  }
};

const getCachedMapPosition = () => readUserPositionFromCache();

const readUrlBinaryFlag = (key, fallback = '0') => {
  if (typeof window === 'undefined') return fallback === '1';

  const hash = String(window.location.hash || '');
  const queryStart = hash.indexOf('?');
  const hashParams = queryStart >= 0
    ? new URLSearchParams(hash.slice(queryStart + 1))
    : new URLSearchParams();
  const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''));

  const raw = String(hashParams.get(key) ?? searchParams.get(key) ?? fallback).trim().toLowerCase();
  return raw === '1' || raw === 'true';
};

const buildFirstMessageLocationContext = async () => {
  // 只在首次消息时注入位置信息（防止重复）
  if (firstMessageLocationInjected.value) return '';

  // 优先使用全局用户位置上下文（通常由IP定位或GPS获得）
  const globalLocation = getGlobalUserLocationContext();
  if (globalLocation && Number.isFinite(globalLocation.lon) && Number.isFinite(globalLocation.lat)) {
    const encoded = globalLocation.encodedLocation || {};
    const source = String(globalLocation.source || '未知').trim();
    const province = String(encoded.province || '未知').trim();
    const city = String(encoded.city || '未知').trim();
    const district = String(encoded.district || '未知').trim();
    const adcode = String(encoded.adcode || '未知').trim();
    const address = String(encoded.formattedAddress || '').trim();

    firstMessageLocationInjected.value = true;
    return `用户位置上下文（首条消息附带）：来源=${source}，经度=${globalLocation.lon.toFixed(6)}，纬度=${globalLocation.lat.toFixed(6)}，省=${province}，市=${city}，区县=${district}，编码=${adcode}，地址=${address || '待完善'}。`;
  }

  // 其次使用地图缓存的用户位置
  const baseLocation = getCachedMapPosition();
  if (baseLocation) {
    firstMessageLocationInjected.value = true;
    return `用户位置上下文（首条消息附带）：经度=${baseLocation.lon.toFixed(6)}，纬度=${baseLocation.lat.toFixed(6)}。`;
  }

  // 如果都没有，则不附带位置信息但标记已处理
  firstMessageLocationInjected.value = true;
  return '';
};

const compactText = (text, maxChars = MAX_CHARS_PER_MESSAGE) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
};

const buildEconomyContext = () => {
  return messages.value
    .filter((_, idx) => idx !== 0)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .filter(m => m.content && m.content.trim())
    .slice(-MAX_CONTEXT_MESSAGES)
    .map(m => ({ role: m.role, content: compactText(m.content) }));
};

const parseThinkAndAnswer = (rawContent) => {
  const text = String(rawContent || '');
  const startTag = '<think>';
  const endTag = '</think>';
  const start = text.indexOf(startTag);

  if (start === -1) {
    return {
      answer: text,
      think: ''
    };
  }

  const end = text.indexOf(endTag, start + startTag.length);

  if (end === -1) {
    return {
      answer: text.slice(0, start).trim(),
      think: text.slice(start + startTag.length).trim()
    };
  }

  return {
    answer: `${text.slice(0, start)}${text.slice(end + endTag.length)}`.trim(),
    think: text.slice(start + startTag.length, end).trim()
  };
};

const getAnswerContent = (rawContent) => {
  const answer = parseThinkAndAnswer(rawContent).answer;
  return answer || '（正在组织回答...）';
};

const getThinkContent = (rawContent) => parseThinkAndAnswer(rawContent).think;

const hasThinkContent = (rawContent) => !!getThinkContent(rawContent);

const getUserTurnsCount = () => messages.value.filter(m => m.role === 'user').length;

const pruneHistoryIfNeeded = () => {
  if (getUserTurnsCount() < AUTO_PRUNE_AFTER_TURNS) return;

  const welcome = messages.value[0]?.role === 'assistant'
    ? messages.value[0]
    : initWelcomeMessage();

  const recentDialogue = messages.value
    .filter((m, idx) => idx !== 0)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim())
    .slice(-2);

  messages.value = [welcome, ...recentDialogue];
  statusHint.value = '🧹 已自动精简历史，仅保留最近一轮对话以节省上下文开销';
};

const scrollToBottom = () => {
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTop = chatBody.value.scrollHeight;
    }
  });
};

const clearHistory = () => {
  if (!clearConfirmArmed.value) {
    clearConfirmArmed.value = true;
    message.warning('再次点击清除按钮可删除聊天历史', { duration: 3000 });
    if (clearConfirmTimer) {
      clearTimeout(clearConfirmTimer);
    }
    clearConfirmTimer = setTimeout(() => {
      clearConfirmArmed.value = false;
      clearConfirmTimer = null;
    }, 3000);
    return;
  }

  if (clearConfirmTimer) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
  clearConfirmArmed.value = false;
  messages.value = [initWelcomeMessage()];
  message.success('聊天历史已清除');
};

const sendMessage = async () => {
  if (sendDisabled.value) return;

  pruneHistoryIfNeeded();

  const userMsg = inputMessage.value.trim();
  const requestHistory = buildEconomyContext();
  const locationContextText = await buildFirstMessageLocationContext();

  messages.value.push({ role: 'user', content: userMsg });
  inputMessage.value = '';
  isLoading.value = true;
  scrollToBottom();

  const assistantMsgIndex = messages.value.push({ role: 'assistant', content: '' }) - 1;

  try {
    const result = await apiAgentChatCompletions({
      message: userMsg,
      history: requestHistory,
      location_context: locationContextText,
    });

    const data = result?.data || result || {};
    const reply = String(data?.reply || '').trim();

    messages.value[assistantMsgIndex].content = reply || '（未返回有效内容）';

    if (data?.model) {
      modelName.value = String(data.model);
    }

    if (data?.quota) {
      quota.value = normalizeQuota(data.quota);
    }

    if (quotaExhausted.value) {
      statusHint.value = '今日对话额度已用完，请明日再试或切换更高权限账号。';
    }

  } catch (error) {
    messages.value[assistantMsgIndex].content = `出错啦: ${error.message}`;
    if (error?.isQuotaExceeded) {
      statusHint.value = '今日额度已达上限，请明日再试。';
      await reloadAgentConfig(false);
    }
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};

onMounted(async () => {
  // 零配置即刻响应：启动时自动预加载模型列表（背景加载，不阻塞）
  // 这样即使用户未主动选择模型，系统也会有可用的随机降级模型
  loadAvailableModels();

  await reloadAgentConfig(false);
});
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: 'Segoe UI', sans-serif;
}

.chat-header {
  background: white;
  color: #333;
  padding: 10px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
}

.service-status {
  border-bottom: 1px solid #e9ecef;
  background: #fdfefe;
  padding: 10px 14px;
}

.user-config-panel {
  border-bottom: 1px solid #e9ecef;
  background: #fcfffd;
  padding: 10px 14px 12px;
}

.user-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(140px, 1fr));
  gap: 8px;
}

.user-config-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #315142;
}

.user-config-item-full {
  grid-column: 1 / -1;
}

.user-config-item input,
.user-config-item textarea,
.user-config-item select {
  width: 100%;
  border: 1px solid #d7e5dc;
  border-radius: 6px;
  padding: 6px 8px;
  box-sizing: border-box;
  font-family: inherit;
}

.model-select {
  flex: 1;
  border: 1px solid #d7e5dc;
  border-radius: 6px;
  padding: 6px 8px;
  box-sizing: border-box;
  font-family: inherit;
  background-color: white;
  cursor: pointer;
}

.model-select:hover {
  border-color: #4caf50;
}

.model-select:focus {
  outline: none;
  border-color: #4caf50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
}

.refresh-models-btn {
  padding: 6px 10px;
  border: 1px solid #d7e5dc;
  border-radius: 6px;
  background-color: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.refresh-models-btn:hover:not(:disabled) {
  border-color: #4caf50;
  background-color: #f0f7f2;
}

.refresh-models-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-config-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.user-config-actions button {
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  background: #4caf50;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
}

.user-config-actions button.secondary {
  background: #8aa39a;
}

.user-config-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  margin-bottom: 4px;
}

.status-line:last-of-type {
  margin-bottom: 0;
}

.status-label {
  color: #5f6d66;
}

.status-value {
  color: #2a3a32;
  font-weight: 600;
}

.status-ready {
  color: #2e7d32;
}

.status-unready {
  color: #c62828;
}

.chat-title {
  font-weight: bold;
  font-size: 1em;
  color: #4CAF50;
}

.header-controls .icon-btn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  margin-left: 15px;
  font-size: 1.1em;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.header-controls .icon-btn:hover {
  opacity: 1;
  color: #333;
}

.chat-body {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  background: #f8f9fa;
}

.message {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
}

.message.user {
  align-items: flex-end;
}

.message.assistant {
  align-items: flex-start;
}

.message-content {
  max-width: 90%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.95em;
  line-height: 1.5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  word-wrap: break-word;
  white-space: pre-wrap;
  /* 保留换行和空格 */
}

.message.user .message-content {
  background: #4CAF50;
  color: white;
  border-bottom-right-radius: 2px;
}

.message.assistant .message-content {
  background: white;
  color: #333;
  border-bottom-left-radius: 2px;
  border: 1px solid #e0e0e0;
}

.think-panel {
  max-width: 90%;
  margin-top: 6px;
  border: 1px dashed #c7d7cc;
  border-radius: 10px;
  padding: 6px 10px;
  background: #f7fbf8;
  color: #4f5b53;
  font-size: 0.85em;
}

.think-panel summary {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}

.think-content {
  margin: 8px 0 2px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  font-family: inherit;
}

.chat-footer {
  padding: 10px;
  border-top: 1px solid #eee;
  background: white;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

textarea {
  flex: 1;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
  min-height: 40px;
}

textarea:focus {
  border-color: #4CAF50;
}

.chat-footer button {
  padding: 0 16px;
  height: 40px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.chat-footer button:hover {
  background: #43A047;
}

.chat-footer button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.settings-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: white;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-group label {
  font-size: 0.9em;
  font-weight: 600;
  color: #444;
}

.form-group input,
.form-group select {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4CAF50;
}

.model-select {
  width: 100%;
  cursor: pointer;
}

.refresh-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1em;
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: #f0f0f0;
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.hint {
  color: #666;
  font-size: 0.85em;
  margin-top: 4px;
  display: block;
}

.save-btn {
  margin-top: auto;
  padding: 10px;
  background: #107341;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}
</style>
