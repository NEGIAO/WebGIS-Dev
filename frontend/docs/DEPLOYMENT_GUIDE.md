# 🌐 WebGIS 多部署环境配置指南

本文档说明如何为不同的部署环境配置和构建 WebGIS 项目。

## 📍 部署环境一览

| 环境 | URL | BASE_URL |
|------|-----|----------|
| 本地开发 | http://localhost:5173 | `./` |
| GitHub Pages (WebGIS-Dev) | https://negiao.github.io/WebGIS-Dev/ | `/WebGIS-Dev/` |
| GitHub Pages (WebGIS/io) | https://negiao.github.io/WebGIS/ | `/WebGIS/` |
| Posit Connect Cloud | https://negiao-pages.share.connect.posit.cloud/WebGIS/ | `/WebGIS/` |

## 🔧 路径处理标准

### ✅ 正确做法

所有静态资源（图片、SVG、CSS、JS 等）必须使用相对路径或 `resolvePublicAssetPath` 函数。

**推荐方式 1：使用 resolvePublicAssetPath 函数**
```javascript
import { resolvePublicAssetPath } from '@/utils'

// 在 script 中
const avatarUrl = resolvePublicAssetPath('avatars/avatar-0.svg')

// 在模板中
<img :src="resolvePublicAssetPath('avatars/avatar-0.svg')" />
```

**推荐方式 2：相对路径导入**
```javascript
import logo from './assets/logo.svg'
```

### ❌ 错误做法

**不要使用绝对路径**：
```javascript
// ❌ 错误！不同部署环境会失败
<img src="/avatars/avatar-0.svg" />
```

## 🚀 快速构建

### 方式 1：使用 npm 脚本（推荐）

```bash
# 本地开发
npm run dev

# 为 WebGIS-Dev 部署
npm run build:webgis-dev

# 为 WebGIS (io) 部署
npm run build:webgis

# 为 Posit Cloud 部署
npm run build:posit

# 生成体积分析报告
npm run build:analyze
```

### 方式 2：交互式脚本

```bash
# Linux/Mac
bash scripts/build-for-deployments.sh

# Windows
scripts\build-for-deployments.bat
```

脚本会引导你选择部署环境，自动设置 `BASE_URL` 并构建到对应的输出目录。

### 方式 3：手动指定 BASE_URL

```bash
# WebGIS-Dev
VITE_BASE_URL=/WebGIS-Dev/ npm run build

# WebGIS
VITE_BASE_URL=/WebGIS/ npm run build

# 本地开发
VITE_BASE_URL=./ npm run build
```

## 📋 环境变量配置

创建 `.env.local` 或 `.env.production` 文件：

```env
# 本地开发
VITE_BASE_URL=./

# GitHub Pages
# VITE_BASE_URL=/WebGIS-Dev/
# VITE_BASE_URL=/WebGIS/

# 地图 API
VITE_TIANDITU_TK=your_token
VITE_AMAP_WEB_SERVICE_KEY=your_key
```

## 📦 构建输出

按环境构建的输出目录：

```
frontend/
├── dist/               # npm run build（默认）
├── dist-webgis-dev/    # npm run build:webgis-dev
├── dist-webgis/        # npm run build:webgis
└── dist-posit/         # npm run build:posit
```

## 🔄 resolvePublicAssetPath 原理

该函数自动拼接 `BASE_URL` 和资源相对路径：

```javascript
// 源码
function resolvePublicAssetPath(relativePath) {
  const base = String(import.meta.env.BASE_URL || '/').trim()
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
  return `${normalizedBase}${normalizedPath}`
}

// 示例输出
BASE_URL='./'              → './avatars/avatar-0.svg'
BASE_URL='/WebGIS-Dev/'    → '/WebGIS-Dev/avatars/avatar-0.svg'
BASE_URL='/WebGIS/'        → '/WebGIS/avatars/avatar-0.svg'
```

## 🌍 部署步骤

### GitHub Pages (WebGIS-Dev)

```bash
# 1. 构建
npm run build:webgis-dev

# 2. 复制文件到 WebGIS-Dev 仓库
cp -r dist-webgis-dev/* /path/to/WebGIS-Dev/

# 3. 提交并推送
cd /path/to/WebGIS-Dev
git add .
git commit -m "Update WebGIS"
git push
```

### GitHub Pages (WebGIS/io)

```bash
# 1. 构建
npm run build:webgis

# 2. 复制文件到 io 仓库的 WebGIS 文件夹
cp -r dist-webgis/* /path/to/negiao.github.io/WebGIS/

# 3. 提交并推送
cd /path/to/negiao.github.io
git add .
git commit -m "Update WebGIS"
git push
```

### Posit Connect Cloud

```bash
# 1. 构建
npm run build:posit

# 2. 复制文件到 Posit Cloud 部署目录
cp -r dist-posit/* /path/to/posit/WebGIS/

# 3. 部署更新
# 通过 Posit 管理面板或 rsconnect 部署
```

## ⚙️ vite.config.js 配置

```javascript
export default defineConfig(({ command, mode }) => {
  // 从环境变量读取 BASE_URL
  const baseUrl = process.env.VITE_BASE_URL || './';

  return {
    base: baseUrl,
    // ... 其他配置
  }
})
```

## 🧪 本地验证

```bash
# 开发环境验证
npm run dev

# 构建后预览
npm run build
npm run preview
```

## ❓ 常见问题

### Q: avatar 图片无法加载？
**A:** 检查是否正确使用了 `resolvePublicAssetPath` 函数或正确的相对路径。确保 `VITE_BASE_URL` 已正确设置。

### Q: 如何在脚本中动态使用 BASE_URL？
**A:** 使用 `import.meta.env.BASE_URL`：
```javascript
const baseUrl = import.meta.env.BASE_URL
const resourceUrl = `${baseUrl}path/to/resource`
```

### Q: 可以混合使用不同的路径形式吗？
**A:** 不推荐。应统一使用 `resolvePublicAssetPath` 函数或 `import.meta.env.BASE_URL`。

### Q: 如何为新的静态资源添加路径？
**A:** 始终遵循相对路径原则：
```javascript
// ✅ 正确
<img :src="resolvePublicAssetPath('icons/icon.svg')" />

// ❌ 错误
<img src="/icons/icon.svg" />
```

## 📚 相关文件

- `vite.config.js` - Vite 构建配置
- `.env.example` - 环境变量示例
- `scripts/build-for-deployments.sh` - Linux/Mac 构建脚本
- `scripts/build-for-deployments.bat` - Windows 构建脚本

## 🔗 更新说明

**最后更新**：2026-04-18

### 主要改动
- ✅ 添加 `VITE_BASE_URL` 环境变量支持
- ✅ 统一使用 `resolvePublicAssetPath` 函数处理资源路径
- ✅ 添加 npm 快速构建命令
- ✅ 创建交互式构建脚本
- ✅ 完善多环境部署文档
