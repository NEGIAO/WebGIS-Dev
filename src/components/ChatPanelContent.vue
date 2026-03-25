<template>
  <div class="chat-container">
    <div class="chat-header">
      <span class="chat-title">🤖 AI 助手</span>
      <div class="header-controls">
        <button @click="clearHistory" class="icon-btn" title="清除历史">🧹</button>
        <button @click="showSettings = !showSettings" class="icon-btn" title="设置">⚙️</button>
        <button @click="$emit('close-chat')" class="icon-btn" title="退出AI">✖️</button>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="settings-panel">
      <div class="form-group">
        <label>API Endpoint:</label>
        <input v-model="apiEndpoint" placeholder="https://api.qnaigc.com/v1" />
      </div>
      <div class="form-group">
        <label>API Key:</label>
        <input v-model="apiKey" type="password" placeholder="sk-..." />
      </div>
      <div class="form-group">
        <label>Model:
          <button @click="fetchModels" class="refresh-btn" :disabled="isFetchingModels" title="刷新模型列表">
            {{ isFetchingModels ? '⏳' : '🔄' }}
          </button>
        </label>
        <select v-model="modelName" class="model-select">
          <option v-for="model in availableModels" :key="model.id" :value="model.id">
            {{ model.name || model.id }}
          </option>
        </select>
        <small class="hint">{{ modelHint }}</small>
      </div>
      <button @click="showSettings = false" class="save-btn">保存并返回</button>
    </div>

    <!-- 聊天内容 -->
    <div v-else class="chat-body" ref="chatBody">
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

    <!-- 输入框 -->
    <div v-if="!showSettings" class="chat-footer">
      <textarea 
        v-model="inputMessage" 
        @keydown.enter.prevent="sendMessage"
        placeholder="请输入您的问题..."
        rows="1"
      ></textarea>
      <button @click="sendMessage" :disabled="isLoading || !inputMessage.trim()">发送</button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue';
import { reverseGeocodeTianditu } from '../api/map';
import { readUserPositionFromCache } from '../utils/userPositionCache';
import { useMessage } from '../composables/useMessage';

const emit = defineEmits(['close-chat']);
const message = useMessage();

const showSettings = ref(false);
const inputMessage = ref('');
const isLoading = ref(false);
const chatBody = ref(null);
const isFetchingModels = ref(false);
const availableModels = ref([
  { id: 'deepseek-V3-0324', name: 'DeepSeek V3-0324 (默认)' }
]);
const modelHint = ref('点击🔄可获取更多模型');

// API 配置：优先使用 localStorage，其次使用环境变量，最后使用默认值
// 注意：API Key 不应硬编码在代码中，请在 .env 文件中配置 VITE_LLM_API_KEY
const DEFAULT_ENDPOINT = import.meta.env.VITE_LLM_ENDPOINT || 'https://api.qnaigc.com/v1';
const DEFAULT_API_KEY = import.meta.env.VITE_LLM_API_KEY || 'sk-af0fdab305019a96c669b9fdf6038317e499d43be5f7946b251eac1e8fe04914';
const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL || 'deepseek-V3-0324';
const TIANDITU_TK = import.meta.env.VITE_TIANDITU_TK || '4267820f43926eaf808d61dc07269beb';

const apiEndpoint = ref(localStorage.getItem('llm_endpoint_v4') || DEFAULT_ENDPOINT);
const apiKey = ref(localStorage.getItem('llm_apikey_v4') || DEFAULT_API_KEY);
const modelName = ref(localStorage.getItem('llm_model_v4') || DEFAULT_MODEL);

const messages = ref([]);
const firstMessageLocationInjected = ref(false);
const clearConfirmArmed = ref(false);
let clearConfirmTimer = null;

// 经济模式：限制上下文和回答长度，尽量降低 token 消耗
const ECONOMY_SYSTEM_PROMPT = '你是 WebGIS 助手。默认用中文，回答控制在3-5句内，除非用户明确要求详细；优先给简短、可执行步骤；代码只给最小可运行片段。';
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CHARS_PER_MESSAGE = 600;
const MAX_OUTPUT_TOKENS = 280;
const LOW_TEMPERATURE = 0.2;
const AUTO_PRUNE_AFTER_TURNS = 12;

// 初始化欢迎消息，根据 API Key 是否配置显示不同内容
const initWelcomeMessage = () => {
  if (!apiKey.value) {
    return { 
      role: 'assistant', 
      content: '您好！我是 AI 助手。\n\n⚠️ 注意：尚未配置 API Key。\n请点击右上角 ⚙️ 设置您的 API Key 后开始使用。' 
    };
  }
  return { role: 'assistant', content: '您好！我是您的 AI 助手，有什么可以帮您？' };
};

// 初始化消息列表
messages.value = [initWelcomeMessage()];

watch([apiEndpoint, apiKey, modelName], () => {
  localStorage.setItem('llm_endpoint_v4', apiEndpoint.value);
  localStorage.setItem('llm_apikey_v4', apiKey.value);
  localStorage.setItem('llm_model_v4', modelName.value);
});

const getChatCompletionsUrl = () => {
  const endpoint = apiEndpoint.value.trim().replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(endpoint)) return endpoint;
  return `${endpoint}/chat/completions`;
};

const getCachedMapPosition = () => readUserPositionFromCache();

const buildFirstMessageLocationContext = async () => {
  if (firstMessageLocationInjected.value) return '';

  const baseLocation = getCachedMapPosition();

  if (baseLocation) {
    try {
      const geocode = await reverseGeocodeTianditu({
        lon: baseLocation.lon,
        lat: baseLocation.lat,
        tk: TIANDITU_TK
      });

      const ac = geocode.addressComponent || {};
      const province = ac.province || ac.address || '';
      const city = ac.city || ac.citycode || '';
      const county = ac.county || ac.county_code || '';

      firstMessageLocationInjected.value = true;
      return `用户位置上下文（首次附带）：省=${province || '未知'}，市=${city || '未知'}，区县=${county || '未知'}，地址=${geocode.formattedAddress || '未知'}。`;
    } catch (e) {
      firstMessageLocationInjected.value = true;
      return `用户位置上下文（首次附带）：经度=${baseLocation.lon.toFixed(4)}，纬度=${baseLocation.lat.toFixed(4)}。`;
    }
  }

  return '';
};

const compactText = (text, maxChars = MAX_CHARS_PER_MESSAGE) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
};

const buildEconomyContext = () => {
  return messages.value
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
  modelHint.value = '🧹 已自动精简历史，仅保留最近一轮对话以节省 token';
};

const pickEconomyModel = (models) => {
  if (!Array.isArray(models) || models.length === 0) return null;

  const isLikelyChatModel = (id) => {
    const name = String(id || '').toLowerCase();
    if (!name) return false;

    const blockedKeywords = ['embedding', 'rerank', 'tts', 'asr', 'whisper', 'vision', 'image', 'moderation'];
    if (blockedKeywords.some(k => name.includes(k))) return false;

    return true;
  };

  const scoreModel = (id) => {
    const name = String(id || '').toLowerCase();
    let score = 100;

    if (name.includes('free')) score -= 40;
    if (name.includes('mini') || name.includes('lite') || name.includes('small')) score -= 25;
    if (name.includes('chat')) score -= 10;
    if (name.includes('7b') || name.includes('8b') || name.includes('1.5b') || name.includes('3b')) score -= 20;

    if (name.includes('reasoner') || name.includes('r1')) score += 25;
    if (name.includes('32b') || name.includes('70b') || name.includes('671b')) score += 30;
    if (name.includes('v3')) score += 15;

    return score;
  };

  const candidates = models.filter(m => isLikelyChatModel(m.id));
  const target = candidates.length ? candidates : models;
  return [...target].sort((a, b) => scoreModel(a.id) - scoreModel(b.id))[0] || null;
};

const refreshAndChooseEconomyModel = async () => {
  await fetchModels();

  if (!availableModels.value.length) return;

  const selected = pickEconomyModel(availableModels.value);
  if (selected && selected.id !== modelName.value) {
    modelName.value = selected.id;
    modelHint.value = `💡 已切换到更省 token 的可用模型：${selected.name || selected.id}`;
  }
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

const fetchModels = async () => {
  if (!apiKey.value) {
    modelHint.value = '❌ 请先填写 API Key';
    return;
  }

  isFetchingModels.value = true;
  modelHint.value = '正在获取模型列表...';

  try {
    // 构建 models 端点 URL
    const baseUrl = apiEndpoint.value.trim().replace(/\/$/, '').replace(/\/chat\/completions$/i, '');
    const modelsUrl = `${baseUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey.value}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.data && Array.isArray(data.data)) {
      availableModels.value = data.data
        .filter(m => m.id) // 过滤掉没有 id 的
        .map(m => ({
          id: m.id,
          name: m.name || m.id
        }));
      
      modelHint.value = `✅ 已加载 ${availableModels.value.length} 个模型`;
      
      // 如果当前选中的模型不在列表中，自动选择第一个
      if (!availableModels.value.some(m => m.id === modelName.value) && availableModels.value.length > 0) {
        modelName.value = availableModels.value[0].id;
      }
    } else {
      throw new Error('返回数据格式异常');
    }
  } catch (error) {
    modelHint.value = `❌ 获取失败: ${error.message}`;
    console.error('获取模型列表失败:', error);
  } finally {
    isFetchingModels.value = false;
  }
};

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return;

  pruneHistoryIfNeeded();

  const userMsg = inputMessage.value.trim();
  messages.value.push({ role: 'user', content: userMsg });
  inputMessage.value = '';
  isLoading.value = true;
  scrollToBottom();

  // 创建一个新的 assistant 消息占位
  const assistantMsgIndex = messages.value.push({ role: 'assistant', content: '' }) - 1;

  try {
    if (!apiKey.value) {
      throw new Error('请先在设置中配置 API Key');
    }

    // 每次发送前先刷新模型并优先选择可用且更经济的模型
    await refreshAndChooseEconomyModel();

    const locationContextText = await buildFirstMessageLocationContext();

    const chatCompletionsUrl = getChatCompletionsUrl();

    const systemPrompt = locationContextText
      ? `${ECONOMY_SYSTEM_PROMPT} ${locationContextText}`
      : ECONOMY_SYSTEM_PROMPT;

    const requestMessages = [
      { role: 'system', content: systemPrompt },
      ...buildEconomyContext()
    ];

    const requestHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.value}`
    };

    const fullPayload = {
      model: modelName.value,
      messages: requestMessages,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: LOW_TEMPERATURE,
      stream: true
    };

    let response = await fetch(chatCompletionsUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(fullPayload)
    });
    let useStream = true;

    if (!response.ok) {
      let errData = {};
      try {
        errData = await response.json();
      } catch (e) {
        errData = {};
      }

      const message = errData.error?.message || '请求失败';
      const isInvalidChatSetting = message.includes('invalid chat setting') || message.includes('(2013)');

      // 某些渠道不支持 max_tokens/temperature 等设置时，自动降级为最小参数重试
      if (isInvalidChatSetting) {
        modelHint.value = '⚠️ 当前渠道不支持部分参数，已自动降级重试';
        response = await fetch(chatCompletionsUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify({
            model: modelName.value,
            messages: requestMessages,
            stream: true
          })
        });

        // 若仍是 2013，则进一步降级为非流式，兼容只接受最小 chat 设置的渠道
        if (!response.ok) {
          let retryErr = {};
          try {
            retryErr = await response.json();
          } catch (e) {
            retryErr = {};
          }
          const retryMessage = retryErr.error?.message || '请求失败';
          const stillInvalid = retryMessage.includes('invalid chat setting') || retryMessage.includes('(2013)');
          if (stillInvalid) {
            modelHint.value = '⚠️ 已切换兼容模式（非流式）';
            response = await fetch(chatCompletionsUrl, {
              method: 'POST',
              headers: requestHeaders,
              body: JSON.stringify({
                model: modelName.value,
                messages: requestMessages,
                stream: false
              })
            });
            useStream = false;
          }
        }
      }
    }

    if (!response.ok) {
      const errData = await response.json();
      const message = errData.error?.message || '请求失败';
      if (message.includes('no available channels for model')) {
        throw new Error(`当前模型不可用：${modelName.value}。请点击设置中的🔄刷新模型列表并切换到可用模型。`);
      }
      throw new Error(message);
    }

    if (useStream) {
      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let fullContent = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim().startsWith('data: ')) {
              const jsonStr = line.trim().substring(6);
              if (jsonStr === '[DONE]') break;

              try {
                const json = JSON.parse(jsonStr);
                const content = json.choices[0]?.delta?.content || "";
                fullContent += content;
                messages.value[assistantMsgIndex].content = fullContent;
                scrollToBottom();
              } catch (e) {
                console.warn("Parse error", e);
              }
            }
          }
        }
      }
    } else {
      // 处理非流式响应
      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content || '';
      messages.value[assistantMsgIndex].content = content || '（未返回有效内容）';
      scrollToBottom();
    }

  } catch (error) {
    messages.value[assistantMsgIndex].content = `出错啦: ${error.message}`;
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
};
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
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  word-wrap: break-word;
  white-space: pre-wrap; /* 保留换行和空格 */
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
