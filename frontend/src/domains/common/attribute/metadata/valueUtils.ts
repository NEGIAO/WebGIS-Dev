/**
 * 值与对象工具：克隆 / 纯对象判定 / 原始值归一 / 类型推断 / 类型计数 / 嵌套扁平化
 *
 * 从 useLayerMetadataNormalization 拆出：这些函数不依赖 DOM、不依赖几何，
 * 是属性表、字段配置、统计三处的公共底座。
 */

export function isPlainObject(value: any): boolean {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
}

export function safeClone(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(value);
        } catch {
            // fall through
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function normalizePrimitiveValue(value: any): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (value instanceof Date)
        return Number.isFinite(value.getTime()) ? value.toISOString() : String(value);
    if (typeof value === 'string') return value.trim();
    return String(value);
}

export function inferValueType(value: any): string {
    if (value === null || value === undefined || value === '') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number' && Number.isFinite(value)) return 'number';
    if (value instanceof Date && Number.isFinite(value.getTime())) return 'date';

    if (typeof value === 'string') {
        const compact = value.trim();
        if (!compact) return 'string';
        if (/^(true|false)$/i.test(compact)) return 'boolean';
        if (/^-?\d+(?:\.\d+)?$/.test(compact) && Number.isFinite(Number(compact))) return 'number';
        const timestamp = Date.parse(compact);
        if (Number.isFinite(timestamp) && /[-/:T ]/.test(compact)) return 'date';
    }

    return 'string';
}

export function mergeTypeCounts(target: any, source: any) {
    const next: Record<string, any> = { ...target };
    Object.entries(source || {}).forEach(([key, value]) => {
        next[key] = (next[key] || 0) + Number(value || 0);
    });
    return next;
}

export function flattenAttributes(
    input: any,
    prefix = '',
    target: Record<string, any> = {},
    seen: WeakSet<object> = new WeakSet(),
): Record<string, any> {
    if (input === null || input === undefined) return target;

    if (typeof input !== 'object') {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (input instanceof Date) {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (Array.isArray(input)) {
        if (!input.length && prefix) {
            target[prefix] = [];
            return target;
        }

        input.forEach((item, index) => {
            const nextKey = prefix ? `${prefix}.${index}` : String(index);
            flattenAttributes(item, nextKey, target, seen);
        });
        return target;
    }

    if (!isPlainObject(input)) {
        if (prefix) target[prefix] = normalizePrimitiveValue(input);
        return target;
    }

    if (seen.has(input)) {
        if (prefix) target[prefix] = '[Circular]';
        return target;
    }
    seen.add(input);

    const entries = Object.entries(input).filter(
        ([key]) => !['geometry', 'style', 'id', '_gid'].includes(key),
    );

    if (!entries.length && prefix) {
        target[prefix] = {};
        return target;
    }

    entries.forEach(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value === null || value === undefined) {
            target[nextKey] = value;
            return;
        }

        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            value instanceof Date
        ) {
            target[nextKey] = normalizePrimitiveValue(value);
            return;
        }

        flattenAttributes(value, nextKey, target, seen);
    });

    return target;
}