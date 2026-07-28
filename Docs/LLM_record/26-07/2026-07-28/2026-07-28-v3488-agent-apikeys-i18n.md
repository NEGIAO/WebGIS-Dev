# V3.4.88 — useAgentConfig + ApiKeysManagementPanel i18n

> 日期：2026-07-28 22:20  
> 任务等级：L2  
> 版本号：V3.4.88  
> 顺延说明：接 V3.4.85 遗留「ApiKeys / useAgentConfig 扫尾」；V3.4.86 Cesium、V3.4.87 AttributeTable 已占用，本批顺延为 .88

---

## 问题分析

### 核心症状
- 英文 UI 下 API 密钥管理页标题/卡片/CRUD toast 仍中文
- Admin / API Keys 共用的 `useAgentConfig` 校验与保存 toast 仍中文

### 根本原因
- `apiKeys.*` 语言包仅覆盖部分密钥卡片；Cesium/备用池/默认 AI/安全提示未键化，组件未 `useLocale`
- `useAgentConfig` 为非 setup 模块，校验与 message 字面量中文

### 受影响模块
- `composables/useAgentConfig.js`
- `components/UserCenter/ApiKeysManagementPanel.vue`
- `locales/zh-CN.js` / `en-US.js`

---

## 修改内容

1. **admin.agent* 校验/toast 键**：extraBody / 必填 / 超时 / tokens / model 列表 / guest·registered 额度 / 加载保存失败 / 重置确认
2. **apiKeys.* 扩展**：Cesium、备用池、Agent 参数区、默认 AI、安全提示、各 CRUD toast
3. **useAgentConfig**：`import { translate as t }`，校验与 message/confirm 全量 `t()`
4. **ApiKeysManagementPanel**：`useLocale`；模板 + 脚本全量 `t('apiKeys.*')` / 复用 `admin.*` 额度标签
5. **不改**：Base URL / Model / Extra Body 等行业通称字段名；技术 key 名（amap_key 等）可出现在 toast 插值

---

## 修改原因

V3.4.85 交接明确下一步；Admin 面板 LLM 区已接线，但共享 composable 与 API Keys 页仍漏。

---

## 影响范围

- 管理员 API 密钥页 UI/toast；Agent 配置校验 toast（Admin + API Keys 两处）
- 无配置 key / 结构树文件增删；无 Git 写操作

---

## 解决方案

| 方案 | 说明 | 选择 |
|---|---|---|
| A. 仅 toast | 英文页仍半中文 | 否 |
| B. apiKeys 扩展 + useAgentConfig translate | 与 Admin 一致 | ✓ |
| C. 拆 ApiKeys 子组件 | 扩大面 | 否 |

---

## 性能指标

未实测（字符串替换）

---

## 测试方案

### Agent 已执行
- [x] useAgentConfig 运行时 CJK 用户文案清零（注释除外）
- [x] ApiKeys 模板/脚本用户文案 t()
- [x] zh/en 叶节点 1691/1691 对齐
- [x] CheckStructureTree 398=398 / CheckConfigRegistry 全绿

### 待用户实机
- [ ] 英文 API 密钥页：标题/卡片/CRUD/备用池/默认 AI 为英文
- [ ] 英文保存 Agent 参数：校验与成功 toast 英文
- [ ] 中文无回归

---

## 变更文件清单

| 文件 | 说明 |
|---|---|
| `frontend/src/locales/zh-CN.js` | admin agent 校验键 + apiKeys 扩展 |
| `frontend/src/locales/en-US.js` | 同上 en |
| `frontend/src/composables/useAgentConfig.js` | t() |
| `frontend/src/components/UserCenter/ApiKeysManagementPanel.vue` | 全量 t() |
| 本日志 + CHANGELOG + README | V3.4.88 |

---

## 遗留与风险

- API 管理页签（用户统计/日志/配额 UI）若不在本组件则另批
- 未跑浏览器实机

---

## 下一步建议

- API 管理统计子页 i18n（若仍有硬编码）
- 或其它 i18n 残留扫尾
