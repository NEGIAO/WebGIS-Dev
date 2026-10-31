# Font Awesome Free 6.4.0 — 第三方资源说明

本目录为 Font Awesome Free 6.4.0 的本地镜像，取自 BootCDN 同名版本
（`https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/`），目录结构与上游保持一致，
`css/all.min.css` 内的 `url(../webfonts/…)` 相对路径未作任何改写。

## 版权与许可

Font Awesome Free 由 Fonticons, Inc. 发布，按用途分三重许可：

| 组成部分 | 许可 | 许可全文 |
| --- | --- | --- |
| 图标（SVG / 字体中的字形设计） | CC BY 4.0 | https://creativecommons.org/licenses/by/4.0/ |
| 字体文件（`webfonts/*.woff2`） | SIL OFL 1.1 | https://scripts.sil.org/OFL |
| CSS / JS 代码 | MIT | https://opensource.org/licenses/MIT |

Copyright (c) Fonticons, Inc. — https://fontawesome.com

## 已收录文件

- `css/all.min.css`
- `webfonts/fa-solid-900.woff2`（项目实际使用：`fas`）
- `webfonts/fa-brands-400.woff2`（项目实际使用：`fab`）
- `webfonts/fa-regular-400.woff2`（当前未使用，保留以免动态拼接的类名踩空）
- `webfonts/fa-v4compatibility.woff2`（仅 `.fa-v4compatibility` 使用，体积 4.4KB）

**未收录 `.ttf`**：`all.min.css` 的 `@font-face` 同时声明了 `.woff2` 与 `.ttf` 两种格式
（`src: url(…woff2) format("woff2"), url(…ttf) format("truetype")`）。浏览器按 `src`
顺序取第一个支持格式，而本项目为 Vite + ES Module 构建，不支持 woff2 的 IE11 等浏览器
根本无法运行应用，因此 `.ttf` 永远不会被请求，故未搬运（可省约 600KB 仓库体积）。
若日后需兼容旧内核，从上游补齐同名 `.ttf` 即可，CSS 无需改动。

## 升级方式

替换本目录内文件即可，但需同步 `frontend/index.html` 中标注的版本号注释，
并确认 `css/all.min.css` 仍以相对路径引用 `../webfonts/`。
