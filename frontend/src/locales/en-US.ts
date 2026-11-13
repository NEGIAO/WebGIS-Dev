/** en-US 全量文案（懒加载 chunk）
 *
 * 按命名空间拆分到 `en-US/` 下，本文件只做合并：键路径与拆分前完全一致，
 * 消费方（useLocale）仍按 `import('@/locales/en-US')` 使用。
 */
import account from './en-US/account';
import ui from './en-US/ui';
import search_shell from './en-US/search-shell';
import admin from './en-US/admin';
import misc from './en-US/misc';
import cesiumBasic from './en-US/cesium-basic';
import cesiumModule1 from './en-US/cesium-module-1';
import cesiumModule2 from './en-US/cesium-module-2';

export default {
    ...account,
    ...ui,
    ...search_shell,
    ...admin,
    ...misc,
    cesium: {
        ...cesiumBasic,
        module: { ...cesiumModule1, ...cesiumModule2 },
    },
} as Record<string, any>;
