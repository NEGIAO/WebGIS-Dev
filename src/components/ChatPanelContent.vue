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
        <div class="message-content">{{ msg.content }}</div>
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

const emit = defineEmits(['close-chat']);

const showSettings = ref(false);
const inputMessage = ref('');
const isLoading = ref(false);
const chatBody = ref(null);
const isFetchingModels = ref(false);
const availableModels = ref([
  { id: 'deepseek-ai/DeepSeek-V2.5', name: 'DeepSeek V2.5 (默认)' }
]);
const modelHint = ref('点击🔄可获取更多模型');

// API 配置：优先使用 localStorage，其次使用环境变量，最后使用默认值
// 注意：API Key 不应硬编码在代码中，请在 .env 文件中配置 VITE_LLM_API_KEY
const DEFAULT_ENDPOINT = import.meta.env.VITE_LLM_ENDPOINT || 'https://api.qnaigc.com/v1';
const DEFAULT_API_KEY = import.meta.env.VITE_LLM_API_KEY || 'sk-af0fdab305019a96c669b9fdf6038317e499d43be5f7946b251eac1e8fe04914';
const DEFAULT_MODEL = import.meta.env.VITE_LLM_MODEL || 'deepseek-ai/DeepSeek-V2.5';

const apiEndpoint = ref(localStorage.getItem('llm_endpoint_v3') || DEFAULT_ENDPOINT);
const apiKey = ref(localStorage.getItem('llm_apikey_v3') || DEFAULT_API_KEY);
const modelName = ref(localStorage.getItem('llm_model_v3') || DEFAULT_MODEL);

const messages = ref([]);

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
  localStorage.setItem('llm_endpoint_v3', apiEndpoint.value);
  localStorage.setItem('llm_apikey_v3', apiKey.value);
  localStorage.setItem('llm_model_v3', modelName.value);
});

const scrollToBottom = () => {
  nextTick(() => {
    if (chatBody.value) {
      chatBody.value.scrollTop = chatBody.value.scrollHeight;
    }
  });
};

const clearHistory = () => {
  if (confirm('确定要清除聊天历史吗？')) {
    messages.value = [initWelcomeMessage()];
  }
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
    const baseUrl = apiEndpoint.value.replace(/\/chat\/completions$/, '');
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

    const response = await fetch(apiEndpoint.value, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.value}`
      },
      body: JSON.stringify({
        model: modelName.value,
        messages: [
          { 
            role: "system", 
            content: "你是一个专业的WebGIS开发助手，精通Vue3, OpenLayers, Cesium等技术，将被我嵌入到网页中，请你给我的网页使用者提供帮助。请用简洁明了的语言回答用户问题。你将被我在WebGIS的部署中调用，我（开发者）的信息如下：NEGIAO,GIS专业；我的联系方式是：1482918576@qq.com；请基于这些信息提供对用户有针对性的帮助。注意，接下来的对话都是用户发起的：" 
          },
          ...messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
        ],
        stream: true
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || '请求失败');
    }

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
