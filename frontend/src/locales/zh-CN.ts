/** zh-CN 全量文案（懒加载 chunk）
 *
 * 按命名空间拆分到 `zh-CN/` 下，本文件只做合并：键路径与拆分前完全一致，
 * 消费方（useLocale）仍按 `import('@/locales/zh-CN')` 使用。
 */
import account from './zh-CN/account';
import ui from './zh-CN/ui';
import search_shell from './zh-CN/search-shell';
import admin from './zh-CN/admin';
import misc from './zh-CN/misc';
import cesiumBasic from './zh-CN/cesium-basic';
import cesiumModule1 from './zh-CN/cesium-module-1';
import cesiumModule2 from './zh-CN/cesium-module-2';

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
