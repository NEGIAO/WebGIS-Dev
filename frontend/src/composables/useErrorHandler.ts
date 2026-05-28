/**
 * 统一错误处理 composable
 * 提供全局错误处理、API 错误分类、用户通知等功能
 *
 * @example
 * ```ts
 * const { handleApiError, wrapAsync } = useErrorHandler()
 *
 * // 方式一：手动处理
 * try { await apiCall() } catch (e) { handleApiError(e) }
 *
 * // 方式二：自动包装
 * const safeCall = wrapAsync(apiCall, '数据加载失败')
 * await safeCall()
 * ```
 */
export function useErrorHandler() {
    /**
     * 判断错误是否为配额用尽（429）
     * @param error - 捕获的错误对象
     * @returns 是否为配额错误
     */
    function isQuotaError(error: unknown): boolean {
        return error instanceof Error && (error as any).isQuotaExceeded === true;
    }

    /**
     * 判断错误是否为网络错误
     * @param error - 捕获的错误对象
     * @returns 是否为网络错误
     */
    function isNetworkError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        const msg = String(error.message || '').toLowerCase();
        return msg.includes('network') || msg.includes('网络') || msg.includes('fetch');
    }

    /**
     * 判断错误是否为超时错误
     * @param error - 捕获的错误对象
     * @returns 是否为超时错误
     */
    function isTimeoutError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        const msg = String(error.message || '').toLowerCase();
        return msg.includes('timeout') || msg.includes('超时');
    }

    /**
     * 从错误对象中提取用户可读的错误消息
     * @param error - 捕获的错误对象
     * @param fallback - 默认回退消息
     * @returns 格式化后的错误消息
     */
    function extractMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        if (typeof error === 'string' && error.trim()) {
            return error.trim();
        }
        return fallback;
    }

    /**
     * 统一处理 API 错误，输出到控制台（不直接调用 UI 通知，由调用方决定通知方式）
     * @param error - 捕获的错误对象
     * @param context - 错误上下文描述，便于日志追踪
     */
    function handleApiError(error: unknown, context = 'API'): void {
        const message = extractMessage(error);

        if (isQuotaError(error)) {
            console.warn(`[${context}] 配额用尽:`, message);
        } else if (isNetworkError(error)) {
            console.error(`[${context}] 网络错误:`, message);
        } else if (isTimeoutError(error)) {
            console.error(`[${context}] 请求超时:`, message);
        } else {
            console.error(`[${context}] 错误:`, message, error);
        }
    }

    /**
     * 包装异步函数，自动捕获并处理错误
     * @param fn - 原始异步函数
     * @param context - 错误上下文描述
     * @param fallbackValue - 出错时的回退值（默认 undefined，即继续抛出）
     * @returns 包装后的安全异步函数
     */
    function wrapAsync<T extends (...args: any[]) => Promise<any>>(
        fn: T,
        context = 'API',
        fallbackValue?: Awaited<ReturnType<T>>,
    ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | undefined> {
        return async (...args: Parameters<T>) => {
            try {
                return await fn(...args);
            } catch (error) {
                handleApiError(error, context);
                if (fallbackValue !== undefined) {
                    return fallbackValue;
                }
                throw error;
            }
        };
    }

    return {
        isQuotaError,
        isNetworkError,
        isTimeoutError,
        extractMessage,
        handleApiError,
        wrapAsync,
    };
}