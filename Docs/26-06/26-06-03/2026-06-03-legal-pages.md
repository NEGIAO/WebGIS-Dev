# 更新日志 2026-06-03

## 修改内容
实现登录页"服务条款"和"隐私政策"两个法律页面的实际内容。

## 修改原因
RegisterView.vue 第 414 行的"服务条款"和"隐私政策"链接原为空链接（`href="#"`），用户要求实现完整的页面内容。

## 影响范围
- **路由系统**：新增 `/terms` 和 `/privacy` 两个公开路由
- **登录页面**：footer 链接指向新页面
- **视图层**：新增两个 Vue 视图组件

## 优化解决方案
1. 创建 `TermsOfService.vue`：九条服务条款（总则、账号管理、行为规范、服务内容、知识产权、免责声明、条款变更、争议解决、联系方式）
2. 创建 `PrivacyPolicy.vue`：十一条隐私政策（引言、信息收集、使用目的、存储安全、共享披露、第三方服务、用户权利、Cookie、未成年人保护、政策变更、联系方式）
3. 路由采用懒加载（`requiresAuth: false`），无需登录即可访问
4. 链接使用 `target="_blank"` 新标签页打开，避免打断登录流程
5. 视觉风格与 RegisterView 保持一致（品牌渐变 header、CSS 变量、响应式布局）

## 测试方案
- 点击"服务条款"链接在新标签页打开 `/terms` 页面
- 点击"隐私政策"链接在新标签页打开 `/privacy` 页面
- 两个页面无需登录即可访问
- 移动端响应式正常
- "返回登录页面"链接可正常跳转

## 修改的文件路径
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\TermsOfService.vue`（新建）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\PrivacyPolicy.vue`（新建）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\router\index.js`（修改：添加路由）
- `d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\RegisterView.vue`（修改：更新链接）
