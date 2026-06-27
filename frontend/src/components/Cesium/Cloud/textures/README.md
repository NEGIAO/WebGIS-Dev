# 体积云纹理资产

本目录存放体积云渲染所需的预烘焙噪声纹理。

## 纹理列表

| 文件名 | 类型 | 尺寸 | 说明 |
|--------|------|------|------|
| `shape.bin` | 3D Texture (R8) | 128³ | 云体基础形状（低频 Perlin） |
| `shape_detail.bin` | 3D Texture (R8) | 32³ | 云体细节侵蚀（高频 Worley） |
| `local_weather.png` | 2D Texture (RGB) | 可变 | 天气覆盖率（R=覆盖, G=类型, B=降水） |
| `turbulence.png` | 2D Texture (RGB) | 可变 | 2D Curl Noise（域扭曲） |

## 来源

这些纹理文件来自上游项目 `@takram/three-clouds` 的预烘焙数据：

- **原始文件位置**: `D:\Dev\GitHub\tellux\src\assets\tellux\`
- **上游包**: `@takram/three-clouds` (npm)

## 如何获取

1. 从 tellux 项目复制：
   ```bash
   cp D:\Dev\GitHub\tellux\src\assets\tellux\shape.bin ./shape.bin
   cp D:\Dev\GitHub\tellux\src\assets\tellux\shape_detail.bin ./shape_detail.bin
   cp D:\Dev\GitHub\tellux\src\assets\tellux\local_weather.png ./local_weather.png
   cp D:\Dev\GitHub\tellux\src\assets\tellux\turbulence.png ./turbulence.png
   ```

2. 或使用程序化生成（着色器内建降级方案）：
   - 当纹理文件不存在时，着色器自动使用 Perlin/Worley 噪声程序化生成
   - 程序化方案画质略低，但无需额外资产文件

## 部署路径

纹理文件需放置在 Vite 的 `public` 目录下：
```
frontend/public/textures/cloud/
├── shape.bin
├── shape_detail.bin
├── local_weather.png
└── turbulence.png
```

对应代码中的默认路径为 `/textures/cloud/`（相对于站点根目录）。
继续啊