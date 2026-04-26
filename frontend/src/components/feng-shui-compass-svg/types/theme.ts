import type { Layer, FengShuiCompassConfig } from "./compass";
// 主题相关类型定义

// 主题信息
export interface ThemeInfo {
  id: number | string;
  name: string;
  preview: string;
}

export interface ThemeInfopPreview {
  id: number | string;
  name: string | undefined;
  preview: string;
  data: FengShuiCompassConfig;
}

// 配置变更事件
export interface ConfigChangeEvent {
  type: "theme" | "data" | "style";
  data: any;
}
