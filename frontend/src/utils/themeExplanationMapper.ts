/**
 * 风水罗盘主题和解释文件映射
 * 用于关联不同主题的宫位解释数据
 */

import polygonExplanationData from '../components/feng-shui-compass-svg/Explanation/polygon_explanation.json';
import compassExplanationData from '../components/feng-shui-compass-svg/Explanation/compass_explanation.json';
import circleExplanationData from '../components/feng-shui-compass-svg/Explanation/circle_explanation.json';
import darkExplanationData from '../components/feng-shui-compass-svg/Explanation/dark_explantion.json';
import simpleExplanationData from '../components/feng-shui-compass-svg/Explanation/simple_explanation.json';

/**
 * 主题配置接口
 */
export interface ThemeExplanationConfig {
  cid: string;
  themeIndex: number;
  themeId: number;
  themeName: string;
  explanationFile: string;
  data: any;
}

/**
 * 所有主题的解释映射配置
 */
export const THEME_EXPLANATIONS: Record<string, ThemeExplanationConfig> = {
  // 索引 0：compass 主题
  'compass': {
    cid: 'compass',
    themeIndex: 0,
    themeId: 2,
    themeName: '地理专业版',
    explanationFile: 'compass_explanation.json',
    data: compassExplanationData
  },
  // 索引 1：circle 主题（theme-crice）
  'circle': {
    cid: 'circle',
    themeIndex: 1,
    themeId: 1,
    themeName: '二',
    explanationFile: 'circle_explanation.json',
    data: circleExplanationData
  },
  // 索引 2：dark 主题
  'dark': {
    cid: 'dark',
    themeIndex: 2,
    themeId: 3,
    themeName: '三',
    explanationFile: 'dark_explantion.json',
    data: darkExplanationData
  },
  // 索引 3：polygon 主题
  'polygon': {
    cid: 'polygon',
    themeIndex: 3,
    themeId: 4,
    themeName: '四',
    explanationFile: 'polygon_explanation.json',
    data: polygonExplanationData
  },
  // 索引 4：simple 主题
  'simple': {
    cid: 'simple',
    themeIndex: 4,
    themeId: 5,
    themeName: '5',
    explanationFile: 'simple_explanation.json',
    data: simpleExplanationData // 使用实际导入的数据
  }
};

/**
 * 按主题索引映射
 */
export const THEME_EXPLANATIONS_BY_INDEX: Record<number, ThemeExplanationConfig> = {
  0: THEME_EXPLANATIONS.compass,
  1: THEME_EXPLANATIONS.circle,
  2: THEME_EXPLANATIONS.dark,
  3: THEME_EXPLANATIONS.polygon,
  4: THEME_EXPLANATIONS.simple
};

/**
 * 按主题 ID 映射
 */
export const THEME_EXPLANATIONS_BY_ID: Record<number, ThemeExplanationConfig> = {
  1: THEME_EXPLANATIONS.circle,
  2: THEME_EXPLANATIONS.compass,
  3: THEME_EXPLANATIONS.dark,
  4: THEME_EXPLANATIONS.polygon,
  5: THEME_EXPLANATIONS.simple
};

/**
 * 获取指定主题的解释数据
 * @param themeIdentifier - 主题标识：可以是 cid (string)、themeIndex (0-4) 或 themeId (1-5)
 * @returns 主题解释配置，若未找到则返回 polygon 主题
 */
export function getThemeExplanation(
  themeIdentifier?: string | number
): ThemeExplanationConfig {
  if (!themeIdentifier) {
    return THEME_EXPLANATIONS.polygon;
  }

  // 按 cid (string) 查找
  if (typeof themeIdentifier === 'string') {
    return THEME_EXPLANATIONS[themeIdentifier] || THEME_EXPLANATIONS.polygon;
  }

  // 按 themeIndex (0-4) 查找
  if (typeof themeIdentifier === 'number' && themeIdentifier >= 0 && themeIdentifier <= 4) {
    return THEME_EXPLANATIONS_BY_INDEX[themeIdentifier] || THEME_EXPLANATIONS.polygon;
  }

  // 按 themeId (1-5) 查找
  if (typeof themeIdentifier === 'number' && themeIdentifier >= 1 && themeIdentifier <= 5) {
    return THEME_EXPLANATIONS_BY_ID[themeIdentifier] || THEME_EXPLANATIONS.polygon;
  }

  return THEME_EXPLANATIONS.polygon;
}

/**
 * 根据 FengShuiCompassConfig 识别主题
 * @param config - 罗盘配置
 * @returns 对应的主题解释配置
 */
export function getThemeExplanationByConfig(
  config?: any
): ThemeExplanationConfig {
  if (!config || !config.info) {
    return THEME_EXPLANATIONS.polygon;
  }

  // 根据 info.name 或 info.id 来识别主题
  const themeName = String(config.info?.name || '').toLowerCase();
  const themeId = config.info?.id;

  // 按名称匹配
  if (themeName.includes('地理')) return THEME_EXPLANATIONS.compass;
  if (themeName === '二' || themeId === 1) return THEME_EXPLANATIONS.circle;
  if (themeName === '三' || themeId === 3) return THEME_EXPLANATIONS.dark;
  if (themeName === '四' || themeId === 4) return THEME_EXPLANATIONS.polygon;
  if (themeName === '5' || themeId === 5) return THEME_EXPLANATIONS.simple;

  // 默认返回 polygon
  return THEME_EXPLANATIONS.polygon;
}

/**
 * 获取所有可用主题列表
 */
export function getAllThemeExplanations(): ThemeExplanationConfig[] {
  return [
    THEME_EXPLANATIONS.compass,
    THEME_EXPLANATIONS.circle,
    THEME_EXPLANATIONS.dark,
    THEME_EXPLANATIONS.polygon,
    THEME_EXPLANATIONS.simple
  ];
}
