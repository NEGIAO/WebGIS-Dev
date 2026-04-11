# Boundary Index 使用指南

## 🎯 概述

`generate-boundary-index.mjs` 是一个**自动化文档索引生成脚本**，用于维护项目的三个"边界目录"的最新文件列表。

## 📂 监控的三个边界目录

| 目录 | 用途 | 示例文件 |
|-----|------|--------|
| `src/stores/` | Pinia 状态管理 | `useLayerStore.ts`, `useAttrStore.ts` |
| `src/constants/` | 常量定义与配置 | `mapStyles.js`, `useBasemapManager.ts` |
| `src/composables/map/features/` | 地图功能库（按功能拆分） | `useMapEventHandlers.js`, `useDrawMeasure.js` 等 25+ 个 |

## 💻 如何使用

### 基本命令

```bash
npm run docs:index
```

### 执行效果

```
> vue_third_5_19@2.0.0 docs:index
> node scripts/generate-boundary-index.mjs

Boundary index generated: docs\BOUNDARY_INDEX.md
```

生成后自动创建/更新 `docs/BOUNDARY_INDEX.md` 文件。

## 📋 生成的文件格式

生成的 `docs/BOUNDARY_INDEX.md` 包含：

```markdown
# Boundary Index
Generated at: 2026-04-11T03:49:01.127Z

## Stores
- src/stores/index.ts
- src/stores/useAttrStore.ts
- src/stores/useLayerStore.ts

## Constants
- src/constants/index.js
- src/constants/mapStyles.js
...

## Map Features
- src/composables/map/features/useMapEventHandlers.js
...

## Usage
- Run `npm run docs:index` to refresh this index.
```

## 🔄 工作流程

### 日常开发流程

```bash
# 1. 开发时完全不需要关心
npm run dev

# 2. 构建时也不需要特别处理
npm run build

# 3. 添加/删除文件后，提交前运行一次
npm run docs:index

# 4. 查看生成的索引
cat docs/BOUNDARY_INDEX.md
```

### 何时需要运行？

✅ **以下情况需要运行 `npm run docs:index`**：

1. **添加新的 composable 到 `src/composables/map/features/`**
   ```
   新增 useNewFeature.js → 运行 npm run docs:index
   ```

2. **新增 store 文件到 `src/stores/`**
   ```
   新增 useNewStore.ts → 运行 npm run docs:index
   ```

3. **新增常量文件到 `src/constants/`**
   ```
   新增 newConfig.js → 运行 npm run docs:index
   ```

4. **删除任何边界目录内的文件后**
   ```
   删除文件 → 运行 npm run docs:index
   ```

5. **提交 Git 前**
   ```
   确保 docs/BOUNDARY_INDEX.md 是最新的
   ```

## 🔍 生成脚本的工作原理

### `scripts/generate-boundary-index.mjs` 做了什么？

| 步骤 | 说明 |
|-----|------|
| 1️⃣ 递归扫描 | 扫描三个边界目录下的所有 `.ts` 和 `.js` 文件 |
| 2️⃣ 排序 | 按文件路径字母顺序排序 |
| 3️⃣ 生成 Markdown | 生成结构化的 Markdown 文档 |
| 4️⃣ 添加时间戳 | 自动记录生成时间 |
| 5️⃣ 保存 | 将文档写入 `docs/BOUNDARY_INDEX.md` |

### 脚本配置（可扩展）

如果需要监控其他目录，编辑 `scripts/generate-boundary-index.mjs` 中的 `TARGETS` 数组：

```javascript
const TARGETS = [
    {
        title: 'Stores',
        dir: 'src/stores',
        exts: new Set(['.ts', '.js'])
    },
    {
        title: 'Constants',
        dir: 'src/constants',
        exts: new Set(['.ts', '.js'])
    },
    {
        title: 'Map Features',
        dir: 'src/composables/map/features',
        exts: new Set(['.ts', '.js'])
    }
    // 可以继续添加更多目录...
];
```

## 📊 当前索引统计

运行 `npm run docs:index` 后的最新统计：

- **Stores**: 3 个文件
- **Constants**: 6 个文件
- **Map Features**: 25+ 个文件

**总计**: 34+ 个文件纳入索引

## 🎨 最佳实践

### ✅ DO - 应该做

```bash
# ✅ 添加新文件后运行
npm run docs:index

# ✅ 提交前确保索引最新
npm run docs:index && git add docs/BOUNDARY_INDEX.md

# ✅ 定期检查索引的准确性
cat docs/BOUNDARY_INDEX.md
```

### ❌ DON'T - 不应该做

```bash
# ❌ 不要手动编辑 docs/BOUNDARY_INDEX.md
# 文件顶部有警告：This file is auto-generated. Do not edit manually.

# ❌ 不要每次都运行，只在文件有变化时运行
# 这样会导致 Git 差异频繁变动

# ❌ 不要忘记提交 docs/BOUNDARY_INDEX.md
# 保持 Git 仓库中的版本最新
```

## 🆘 常见问题

### Q: 生成失败了怎么办？

**A**: 检查以下几点：

```bash
# 1. 确认脚本文件存在
ls scripts/generate-boundary-index.mjs

# 2. 确认 Node.js 版本 ≥ 14
node --version

# 3. 手动测试脚本
node scripts/generate-boundary-index.mjs

# 4. 检查输出目录是否存在
ls docs/
```

### Q: 为什么 `docs/BOUNDARY_INDEX.md` 时间戳不同步？

**A**: 每次运行脚本都会更新时间戳。这是正常的。如果只是时间戳变化，不需要提交新的差异。

### Q: 能否让脚本在构建时自动运行？

**A**: 可以，修改 `package.json`：

```json
{
  "scripts": {
    "build": "npm run docs:index && vite build",
    "prebuild": "npm run docs:index"
  }
}
```

### Q: 如何检查索引文件的有效性？

**A**: 

```bash
# 生成索引
npm run docs:index

# 验证生成的文件
cat docs/BOUNDARY_INDEX.md

# 检查文件大小（应该不会太大）
wc -l docs/BOUNDARY_INDEX.md
```

## 📝 总结

| 操作 | 命令 |
|-----|------|
| 生成或更新索引 | `npm run docs:index` |
| 查看索引内容 | `cat docs/BOUNDARY_INDEX.md` |
| 添加目录后的流程 | 修改脚本 → 运行 `npm run docs:index` |

**核心要点**：这是一个**"即插即用"的自动化工具**，只需记住一个命令 `npm run docs:index`，其余交给脚本自动处理！
