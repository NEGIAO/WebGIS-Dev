/**
 * 通用的风水解释查询工具
 * 支持任意层级的查询，无需针对每个主题特殊处理
 */

export interface ExplanationResult {
    category: string;      // 分类名称（如"八数"、"九星"等）
    title: string;         // 宫位标题
    meaning: string;       // 解释内容
}

export interface DataLayer {
    name: string | string[];     // 层级名称
    data: any[];                 // 数据数组
    [key: string]: any;          // 其他属性
}

export interface PalaceQueryInput {
    layerIndex: number;
    segmentIndex: number;
    palaceName: string;
}

/**
 * 通用查询引擎
 * 不依赖主题特定逻辑，自动适应不同结构
 */
export class ExplanationLookup {
    /**
     * 根据主题层定义和解释 JSON，按宫位文字精确查找解释。
     * 优先使用 section key + palaceName 的精确映射。
     */
    static lookupThemeLayer(
        themeLayers: DataLayer[],
        explanationData: any,
        query: PalaceQueryInput
    ): ExplanationResult | null {
        const { layerIndex, segmentIndex, palaceName } = query;

        if (!Array.isArray(themeLayers) || !palaceName || layerIndex < 0 || layerIndex >= themeLayers.length) {
            return null;
        }

        const layer = themeLayers[layerIndex];
        const sectionKey = this.getSectionKey(layer?.name, segmentIndex);
        const section = this.getSection(explanationData, sectionKey);

        const exact = this.extractExactExplanation(section, palaceName, segmentIndex);
        if (exact) {
            return {
                category: this.getCategoryName(layer?.name, segmentIndex),
                title: palaceName,
                meaning: exact
            };
        }

        return null;
    }

    /**
     * 查询指定的宫位解释
     * @param layers - 主题的所有数据层
     * @param layerIndex - 要查询的层级索引
     * @param segmentIndex - 该层级中的分段索引
     * @param palaceName - 要查找的宫位名称
     * @returns 解释结果或 null
     */
    static query(
        layers: any[],
        layerIndex: number,
        segmentIndex: number,
        palaceName: string
    ): ExplanationResult | null {
        if (!layers || layerIndex < 0 || layerIndex >= layers.length) return null;
        const layer = layers[layerIndex];
        if (!layer || !layer.data) return null;

        const categoryName = this.getCategoryName(layer.name, segmentIndex);
        const result = this.queryFromData(layer.data, segmentIndex, palaceName);
        if (!result) return null;

        return { category: categoryName, title: palaceName, meaning: result };
    }

    /**
     * 从数据数组中查询
     * 支持多种数据结构：
     * 1. 简单字符串数组：["北", "东", "南", ...]
     * 2. 对象数组：[{key: value}, ...]
     * 3. 多维数组：[[a, b, c], [d, e, f], ...]
     */
    private static queryFromData(
        data: any[],
        segmentIndex: number,
        palaceName: string
    ): string | null {
        if (!Array.isArray(data) || data.length === 0) {
            return null;
        }

        // 情况1：简单数组 - 改为包含匹配（支持多字宫名的部分匹配/完全匹配）
        if (typeof data[0] === 'string' || typeof data[0] === 'number') {
            // 先找完全匹配，再找包含匹配
            const exactMatch = data.find(item => String(item) === palaceName);
            if (exactMatch) return String(exactMatch);

            const partialMatch = data.find(item => String(item).includes(palaceName) || palaceName.includes(String(item)));
            if (partialMatch) return String(partialMatch);
            return null;
        }

        // 情况2：多维数组 - 支持跨分段拼接/包含匹配
        if (Array.isArray(data[0]) && segmentIndex >= 0) {
            // 方案1：指定分段内的包含匹配
            if (segmentIndex < data.length) {
                const segment = data[segmentIndex];
                if (Array.isArray(segment)) {
                    const exactMatch = segment.find(item => String(item) === palaceName);
                    if (exactMatch) return String(exactMatch);

                    const partialMatch = segment.find(item => String(item).includes(palaceName) || palaceName.includes(String(item)));
                    if (partialMatch) return String(partialMatch);
                }
            }

            // 方案2：跨分段拼接（解决多字宫名拆分在不同分段的情况）
            const allSegments = data.flat(); // 扁平化多维数组
            const combinedMatch = allSegments
                .map(item => String(item))
                .join('')
                .includes(palaceName) ? palaceName : null;
            if (combinedMatch) return combinedMatch;
        }

        // 情况3：对象数组 - 支持 key 包含宫名/宫名包含 key
        if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
            for (const item of data) {
                if (!item) continue;

                // 遍历对象的所有 key，做包含匹配
                const matchedKey = Object.keys(item).find(
                    key => key === palaceName || key.includes(palaceName) || palaceName.includes(key)
                );
                if (matchedKey) return String(item[matchedKey]);
            }
        }

        return null;
    }

    private static getSectionKey(name: string | string[] | undefined, segmentIndex: number): string {
        if (Array.isArray(name)) {
            if (name.length === 1) return String(name[0] || '');
            return name.join('-');
        }

        return String(name || '');
    }

    private static getSection(explanationData: any, sectionKey: string): any {
        if (!explanationData || typeof explanationData !== 'object') return null;
        if (!sectionKey) return null;

        return explanationData[sectionKey] ?? explanationData[sectionKey.replace(/-/g, '')] ?? null;
    }

    private static extractExactExplanation(section: any, palaceName: string, segmentIndex: number): string | null {
        if (!section || !palaceName) return null;

        if (typeof section === 'string') {
            return section.trim() ? section : null;
        }

        if (Array.isArray(section)) {
            const segment = section[segmentIndex];
            // 处理数组中的对象 - 包含匹配
            if (segment && typeof segment === 'object' && !Array.isArray(segment)) {
                const matchedKey = Object.keys(segment).find(
                    key => key === palaceName || key.includes(palaceName) || palaceName.includes(key)
                );
                if (matchedKey) return String(segment[matchedKey]);
            }

            // 遍历所有数组项 - 包含匹配
            for (const item of section) {
                if (item && typeof item === 'object' && !Array.isArray(item)) {
                    const matchedKey = Object.keys(item).find(
                        key => key === palaceName || key.includes(palaceName) || palaceName.includes(key)
                    );
                    if (matchedKey) return String(item[matchedKey]);
                }
            }

            return null;
        }

        if (typeof section === 'object') {
            // 处理单层对象 - 包含匹配
            const matchedKey = Object.keys(section).find(
                key => key === palaceName || key.includes(palaceName) || palaceName.includes(key)
            );
            if (matchedKey) return String(section[matchedKey]);

            // 处理嵌套对象 - 包含匹配
            for (const key of Object.keys(section)) {
                const value = section[key];
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    const nestedMatchedKey = Object.keys(value).find(
                        nestedKey => nestedKey === palaceName || nestedKey.includes(palaceName) || palaceName.includes(nestedKey)
                    );
                    if (nestedMatchedKey) return String(value[nestedMatchedKey]);
                }
            }
        }

        return null;
    }

    /**
     * 从层级名称中提取分类名称
     * 名称可能是单字符串或数组（多级名称）
     */
    private static getCategoryName(name: string | string[], segmentIndex: number): string {
        if (Array.isArray(name)) {
            if (segmentIndex >= 0 && segmentIndex < name.length) {
                return name[segmentIndex];
            }
            return name[0] || '信息';
        }
        return String(name || '信息');
    }

    /**
     * 通用查询（用于 simple 主题或不规则结构）
     * 遍历所有可能的结构找到目标
     */
    static universalQuery(
        explanationData: any,
        palaceName: string
    ): ExplanationResult | null {
        if (!explanationData || typeof explanationData !== 'object') {
            return null;
        }

        // 遍历所有顶层属性
        for (const key in explanationData) {
            const section = explanationData[key];

            // 情况1：直接是 key-value 对象
            if (typeof section === 'object' && !Array.isArray(section)) {
                if (section[palaceName]) {
                    return {
                        category: key,
                        title: palaceName,
                        meaning: String(section[palaceName])
                    };
                }
            }

            // 情况2：是数组，可能是对象数组或嵌套数组
            if (Array.isArray(section)) {
                for (let i = 0; i < section.length; i++) {
                    const item = section[i];

                    // 对象数组
                    if (typeof item === 'object' && !Array.isArray(item) && item[palaceName]) {
                        return {
                            category: key,
                            title: palaceName,
                            meaning: String(item[palaceName])
                        };
                    }

                    // 多维数组
                    if (Array.isArray(item) && item.includes(palaceName)) {
                        return {
                            category: key,
                            title: palaceName,
                            meaning: palaceName
                        };
                    }
                }
            }
        }

        return null;
    }
}
