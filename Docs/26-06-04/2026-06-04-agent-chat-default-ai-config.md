# 2026-06-04 Agent Chat 默认 AI 专属配置功能

## 📅 日期和时间
2026-06-04 15:30

---

## 📋 修改内容

### 新增功能
1. **管理员默认 AI 专属配置**：管理员可在后台配置默认的 api_key / base_url / model，存储在后端数据库
2. **默认 AI 模式**：前端用户打开 AI 助手时自动使用管理员配置，无需手动输入 API Key
3. **三种路由模式**：默认 AI 模式 / 个人 Key 模式 / 后端代理模式

### 具体变更
#### 后端 (4 文件)
| 文件 | 变更 |
|------|------|
| `backend/api/agent_chat/constants.py` | +5 行：新增 `CONFIG_KEY_DEFAULT_AI_API_KEY` / `CONFIG_KEY_DEFAULT_AI_BASE_URL` / `CONFIG_KEY_DEFAULT_AI_MODEL` 常量 |
| `backend/api/agent_chat/db.py` | +78 行：新增 `_get_default_ai_config_sync()` 和 `_set_default_ai_config_sync()` 函数 |
| `backend/api/agent_chat/routes.py` | +177 行：新增 4 个端点（admin 读/写、公开读取、default-proxy 聊天） |
| `backend/api/agent_chat/schemas.py` | +7 行：新增 `DefaultAIConfigUpdateRequest` Pydantic 模型 |

#### 前端 (3 文件)
| 文件 | 变更 |
|------|------|
| `frontend/src/api/backend/agent.js` | +54 行：新增 4 个 API 函数（admin 读/写、公开读取、default-proxy 聊天） |
| `frontend/src/components/Chat/ChatPanelContent.vue` | +134/-26 行：新增默认 AI 模式逻辑、UI 状态展示、模式切换 |
| `frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` | +205 行：新增默认 AI 配置管理面板（查看/编辑/保存/取消） |

---

## 🔍 修改原因

### 痛点分析
1. **安全风险**：用户需在前端输入 API Key，存在泄露风险
2. **用户体验差**：每次使用 AI 助手都需要手动配置
3. **管理困难**：无法统一管理 API Key，难以追踪使用情况

### 解决方案
管理员在后台配置默认 AI 专属参数（api_key/base_url/model），存储在后端数据库。前端用户打开 AI 助手时自动使用该配置，通过 `/chat/default-proxy` 端点由后端代理转发请求，api_key 不暴露到前端。

---

## 🎯 影响范围

| 模块 | 影响 |
|------|------|
| agent_chat 后端 | 新增配置存储、读取、代理转发逻辑 |
| ChatPanelContent | 新增第三种路由模式（默认 AI） |
| ApiKeysManagementPanel | 新增管理面板 UI |
| 系统配置表 | 新增 3 个配置键 |

---

## 🛠️ 优化解决方案

### 架构设计
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   前端用户       │────▶│  /chat/default-  │────▶│   LLM 服务      │
│  (不持有 key)    │     │     proxy        │     │  (mimo/其他)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │  system_config   │
                        │  (存储 api_key)  │
                        └─────────────────┘
```

### 安全设计
- api_key 存储在后端数据库，前端不持有
- 管理员端点需要 `require_admin` 权限
- 公开端点只返回 base_url / model，不返回 api_key
- 聊天通过后端代理转发，api_key 不暴露

---

## ⚠️ Code Review 发现的问题

### 🔴 高优先级
| 问题 | 位置 | 建议 |
|------|------|------|
| admin 端点返回完整 api_key | `routes.py:admin_get_default_ai_config` | 考虑返回掩码值，需要时单独获取 |
| `_set_default_ai_config_sync` 二次查询 | `db.py:set` 函数返回时 | 直接计算 `is_configured` 而不二次查询 |

### 🟡 中优先级
| 问题 | 位置 | 建议 |
|------|------|------|
| api_key 明文存储 | `db.py:set` 函数 | 建议加密存储或标注后续优化计划 |
| `/chat/default-proxy` 无速率限制 | `routes.py` | 添加与 `/chat/proxy` 相同的速率限制 |
| `_loadDefaultAIConfig` 静默失败 | `ChatPanelContent.vue` | 添加 `console.warn` 或可选的 toast 提示 |

### 🟢 低优先级
| 问题 | 位置 | 建议 |
|------|------|------|
| 错误消息中文硬编码 | `routes.py` | 考虑使用常量或 i18n |
| `saveDefaultAIConfig` 直接更新本地状态 | `ApiKeysManagementPanel.vue` | 建议重新从后端加载 |
| placeholder 硬编码地址 | `ApiKeysManagementPanel.vue` | 使用更通用的占位符 |

---

## 🧪 测试方案

### 测试环境
- 后端：FastAPI + SQLite
- 前端：Vue 3 + Vite

### 测试步骤
1. **管理员配置测试**
   - 以管理员身份登录，进入用户中心
   - 配置默认 AI 专属参数（api_key/base_url/model）
   - 验证配置保存成功

2. **前端自动加载测试**
   - 以普通用户身份登录
   - 打开 AI 助手面板
   - 验证自动加载管理员配置，显示"默认 AI 模式"

3. **聊天代理转发测试**
   - 在默认 AI 模式下发送消息
   - 验证通过 `/chat/default-proxy` 端点转发
   - 验证返回正常回复

4. **模式切换测试**
   - 切换到"后端代理"模式
   - 切换回"默认 AI 模式"
   - 验证状态正确切换

---

## 📁 修改的文件路径

```
D:\Dev\GitHub\WebGIS_Dev\
├── backend\
│   └── api\
│       └── agent_chat\
│           ├── constants.py      # +5 行
│           ├── db.py             # +78 行
│           ├── routes.py         # +177 行
│           └── schemas.py        # +7 行
└── frontend\
    └── src\
        ├── api\
        │   └── backend\
        │       └── agent.js      # +54 行
        └── components\
            ├── Chat\
            │   └── ChatPanelContent.vue  # +134/-26 行
            └── UserCenter\
                └── ApiKeysManagementPanel.vue  # +205 行
```

---

## 📊 性能指标

- 新增 3 个数据库配置键（system_config 表）
- 前端启动时自动加载一次默认 AI 配置
- 聊天请求通过后端代理转发，增加约 50-100ms 延迟

---

## 📝 Commit Message

```
feat(agent-chat): 新增管理员默认 AI 专属配置模式

- 后端：新增 default-ai-config 端点（管理员读写 + 公开读取）
- 后端：新增 /chat/default-proxy 端点，使用管理员配置的 api_key 代理转发
- 前端：ChatPanelContent 支持三种路由模式（默认 AI / 个人 Key / 后端代理）
- 前端：ApiKeysManagementPanel 新增默认 AI 配置管理面板
- 安全：api_key 存储在后端数据库，前端通过代理转发不直接持有 key

影响范围：agent_chat 模块（constants/db/routes/schemas）+ 前端 Chat/UserCenter 组件
```

---

*"代码是写给机器看的，但文档是写给未来的自己看的。"*
