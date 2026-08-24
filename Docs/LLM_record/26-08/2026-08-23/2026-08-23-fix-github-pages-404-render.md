# 2026-08-23 修复 NEGIAO.github.io 站点 404 页面渲染失败

## 📅 日期和时间

2026-08-23 (本次会话)

## 🔧 修改内容

修复 GitHub Pages 自定义 404 页面在访问**深层不存在路径**时无法正常渲染的问题:

1. 将 `404.html` 中的样式表引用由相对路径改为根相对绝对路径(`/Pages/css/base.css`、`/Pages/css/404.css`);
2. 修复 `<head>` 内主题防闪烁脚本的空引用错误(`document.body` 为 null),改用 `document.documentElement` 并增加空值保护;
3. 优化错误路径显示逻辑:剥离查询串与末尾斜杠,避免展示冗余参数。

## ❓ 修改原因

**事件逻辑链条分析**:

- **核心症状**: 用户反馈"别的页面找不到的时候,404 渲染不出来"。实际表现为:访问站内任意不存在路径时页面无样式/内容错乱。
- **根本原因**(共三处,按严重程度排序):
  1. **CSS 相对路径失效(渲染失败主因)**: GitHub Pages 的自定义 404 机制是"内容替换、URL 不变"——服务器将根目录 `/404.html` 的内容返回给任意不存在的 URL,但浏览器地址栏仍保持原路径(如 `/aaa/bbb/missing`),相对路径资源的解析基准随之变为该深层目录:`Pages/css/base.css` 被解析为 `/aaa/bbb/Pages/css/base.css` → 二次 404 → 样式全部加载失败 → 页面裸奔;
  2. **主题脚本为死代码且抛错**: `<head>` 中脚本读取的存储键为 `localStorage.getItem('theme')`,而全站主题切换组件(`Pages/navbar-widgets/theme-toggle.js`)实际使用的键是 **`site-theme`**、载体是 **`document.body.dataset.theme`**——原脚本键名错误,永远读不到值;即便读到,head 阶段 `document.body` 为 null,`setAttribute` 也会抛 TypeError;
  3. **路径展示未净化**: `?path=` 参数或 pathname 会连同查询串一起展示给用户。

## 🎯 影响范围

- NEGIAO.github.io 静态站点的全局 404 页面(所有不存在路径的兜底渲染);
- 不影响其他正常页面的功能与路由;
- 不涉及 WebGIS_Dev 前后端代码,文件树结构无增删变化(三个 README 与 project-structure.md 无需同步调整)。

## ✅ 优化解决方案

1. **样式表绝对路径化**: 相对路径 `Pages/css/*.css` → 根相对 `/Pages/css/*.css`。站点部署于域名根路径(negiao.github.io / negiao.cloud-ip.cc),绝对路径在任意深度的 404 URL 下均可正确解析;
2. **主题脚本对齐全站机制**: 
   - 存储键由错误的 `theme` 修正为全站统一的 `site-theme`(与 `Pages/navbar-widgets/theme-toggle.js` 一致);
   - head 内仅预读主题值暂存到 `window.__INIT_THEME__`(不触碰未解析的 DOM);
   - 在 `<body>` 起始处新增同步内联脚本,立即执行 `document.body.dataset.theme = t` 并同步更新 `meta[name="theme-color"]`,既保证生效又防止浅色用户看到深色闪烁;
   - 全部包裹 try/catch,localStorage 被禁用时静默降级为默认深色;
3. **路径显示净化**: `requestedPath` 剥离 search/hash 部分及尾部斜杠后再展示。

## 📊 性能指标

- 非性能类修复,无量化指标;修复后深层路径 404 页面的样式资源请求成功率由 0% 恢复至 100%。

## 🧪 测试方案

- 本地验证: 在 NEGIAO.github.io 目录启动静态服务(如 `python -m http.server`),分别访问:
  1. `/ Pages/css 不存在的根级路径`(如 `/not-exist-page`)→ 404 正常带样式渲染;
  2. 深层路径(如 `/aaa/bbb/missing?foo=bar`)→ 样式正常、显示的请求路径不含查询串、无控制台报错;
  3. 推荐链接匹配(输入含 webgis 关键词的路径)→ 出现智能推荐列表;
  4. 倒计时自动跳转首页、Escape/Enter 快捷键正常;
- 线上验证: 部署后在 negiao.github.io 上访问任意不存在路径复测上述场景。

## 📁 修改的文件路径

- `D:\Dev\GitHub\NEGIAO.github.io\404.html`
