# TypeScript 类型定义

这个文件夹包含了项目中使用的 TypeScript 类型定义。

## 文件结构

- `index.ts` - 导出所有类型定义的入口文件
- `compass.ts` - 罗盘相关的类型定义
- `theme.ts` - 主题相关的类型定义
- `common.ts` - 通用类型定义

## 使用方法

在组件中导入类型：

```typescript
// 导入单个类型
import type { FengShuiCompassConfig } from '@/types';

// 导入多个类型
import type { 
  FengShuiCompassConfig, 
  Layer, 
  ThemeItem 
} from '@/types';

// 导入所有类型
import type * as Types from '@/types';
```

## 类型说明

### 罗盘相关类型 (compass.ts)

- `FengShuiCompassConfig` - 罗盘主配置接口
- `Layer` - 层数据配置
- `CompassSize` - 罗盘尺寸配置
  - `width: number` - 罗盘宽度
  - `height: number` - 罗盘高度
  - `tianChiRadius?: number` - 天池圆圈半径（可选，不设置时自动计算为罗盘半径的10%）
- `LineStyle` - 线条样式配置
- `ScaleStyle` - 刻度样式配置
- `AnimationConfig` - 动画配置
- `LatticeClickEvent` - 宫格点击事件数据
- `TextPosition` - 文本位置信息
- `DividerPosition` - 分割线位置信息
- `ScalePosition` - 刻度位置信息

### 主题相关类型 (theme.ts)

- `ThemeItem` - 主题项接口
- `ThemeInfo` - 主题信息
- `ConfigChangeEvent` - 配置变更事件

### 通用类型 (common.ts)

- `Star` - 星星对象
- `ConstellationLine` - 星座连线
- `YaoConfig` - 爻位配置
- `YaoBar` - 爻位条
- `Point` - 坐标点
- `Size` - 尺寸类型
- `Position` - 位置类型
- `Transform` - 变换类型
- `ColorValue` - 颜色值类型
- `AngleValue` - 角度值类型
- `RadiusValue` - 半径值类型

## 添加新类型

1. 在相应的类型文件中添加新的接口或类型定义
2. 在 `index.ts` 中导出新添加的类型
3. 在组件中导入并使用新类型

## 注意事项

- 所有类型定义都应该使用 `export` 导出
- 接口命名使用 PascalCase
- 类型别名使用 PascalCase
- 尽量为复杂对象提供完整的类型定义
- 使用 `type` 关键字导入类型，避免运行时导入