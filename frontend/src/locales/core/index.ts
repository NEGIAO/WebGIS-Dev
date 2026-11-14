/**
 * core 语言包入口
 *
 * 拆出原因：单文件超 500 行；按语言分片后首屏 chunk 仍只加载当前语言所需部分。
 */
import zhCN from './zh-CN';
import enUS from './en-US';

export const coreMessages = {
    'zh-CN': zhCN,
    'en-US': enUS,
} as const;
