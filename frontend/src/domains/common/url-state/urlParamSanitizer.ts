/**
 * URL 占位参数清洗（V3.7.13）。
 *
 * 统一剔除"未启用/未授权/未编码"的占位值，避免地址栏出现 `s=0&loc=0&p=0` 噪声。
 * 各 URL 写入出口在 toString() 前调用本函数，保证语义单一来源。
 *
 * 规则：
 * - `s`：仅 '1' 保留（分享标记）；'0'/空/其它删除
 * - `loc`：仅 'gps' / 'ip' 保留（成功定位来源）；'0'/'1'/其它删除
 *   （读取端 normalizeLocationFlag 对 '1'→gps 的兼容映射保持不变）
 * - `p`：仅非空且非 '0' 保留（GPS 编码坐标）；未编码不写
 * - `cs`：仅非空且非 '0' 保留（罗盘编码，cs=0 表示罗盘关闭）
 * - 通用：空串值删除；数值参数（lng/lat/z/l）的合法 0 保留
 *
 * 读取端对旧链接占位值仍向后兼容，本函数只影响"新写入"，不破坏历史链接。
 */

/**
 * 仅属于根路径 search、不得被合并进 hash query 的参数。
 *
 * `v` 由入口 appVersionQuery 注入到根 search（?v=3.7.14#/），
 * 若被"search 补缺"逻辑并入快照再写回，会产生 hash 内的第二个 v。
 * 新增同类参数时登记到此处即可。
 */
export const SEARCH_ONLY_QUERY_KEYS = ['v'] as const;

/** 是否为仅 search 参数（写回 hash 时应跳过） */
export function isSearchOnlyQueryKey(key: string): boolean {
    return (SEARCH_ONLY_QUERY_KEYS as readonly string[]).includes(key);
}

/** 需要按专门语义清洗的参数判定表：返回 true 表示保留 */
const PARAM_KEEPERS: Record<string, (value: string) => boolean> = {
    s: (v) => v === '1',
    loc: (v) => v === 'gps' || v === 'ip',
    p: (v) => v.length > 0 && v !== '0',
    cs: (v) => v.length > 0 && v !== '0',
};

/**
 * 原地清洗 URLSearchParams 中的占位参数。
 *
 * @param params 待清洗的 URLSearchParams（会被原地修改）
 * @returns 同一个 params 实例，便于链式调用
 */
export function sanitizeUrlParams<T extends URLSearchParams>(params: T): T {
    // 仅 search 参数若出现在 hash query 中（历史遗留或旧写回路径产生），一律剔除。
    // 本函数所有调用点处理的都是 hash query；根 search 的 v 由 appVersionQuery 独立维护。
    for (const key of Array.from(params.keys())) {
        if (isSearchOnlyQueryKey(key)) {
            params.delete(key);
            continue;
        }
        const value = String(params.get(key) ?? '');
        const keeper = PARAM_KEEPERS[key];
        if (keeper) {
            if (!keeper(value)) params.delete(key);
        } else if (value === '') {
            // 通用空值：数值 0 属合法值（如 l=0、z=0），不在清理范围
            params.delete(key);
        }
    }
    return params;
}
