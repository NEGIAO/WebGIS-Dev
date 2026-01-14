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
        <input v-model="apiEndpoint" placeholder="https://api.deepseek.com/chat/completions" />
      </div>
      <div class="form-group">
        <label>API Key:</label>
        <input v-model="apiKey" type="password" placeholder="sk-..." />
      </div>
      <div class="form-group">
        <label>Model:</label>
        <input v-model="modelName" placeholder="deepseek-chat" />
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

// 默认配置，实际使用中可以使用 localStorage 持久化
const apiEndpoint = ref(localStorage.getItem('llm_endpoint_v3') || 'https://api.siliconflow.cn/v1/chat/completions');
const apiKey = ref(localStorage.getItem('llm_apikey_v3') || 'sk-rjdyktuhvtwoirqjzgwxfxbbwykymtgyloqduqkuotakdaxb');
const modelName = ref(localStorage.getItem('llm_model_v3') || 'deepseek-ai/DeepSeek-V2.5');

const messages = ref([
  { role: 'assistant', content: '您好！我是您的 AI 助手，有什么可以帮您？' }
]);

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
    messages.value = [{ role: 'assistant', content: '您好！我是您的 AI 助手，有什么可以帮您？' }];
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
            content: "你是一个专业的WebGIS开发助手，精通Vue3, OpenLayers, Cesium等技术。请用简洁明了的语言回答用户问题。如果涉及代码，请尽量提供完整的代码片段。" 
          },
          ...messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
        ],
        stream: true // 开启流式传输
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

.form-group input {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus {
  outline: none;
  border-color: #4CAF50;
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
