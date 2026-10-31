/**
 * defineResilientAsync —— 带重试与占位的异步组件工厂
 *
 * 背景（2026-10-31）：
 *   仓库大量使用 `defineAsyncComponent(() => import('./X.vue'))` 做按需加载。
 *   这种裸写法有三个缺口：
 *     1. 没有任何 loading 占位 —— 分片在途期间该区域是**完全空白**；
 *     2. 没有重试 —— 移动网络下分片请求偶发超时/中断后，组件**永久**不可用；
 *     3. 没有超时兜底 —— 请求挂住（pending）时用户看不到任何反馈。
 *   叠加产物被拆成 100+ 个 chunk（按需加载扇出较大），一次 RTT 抖动就会
 *   表现成「数据在、界面没加载」的观感，且无自愈路径。
 *
 * 功能：包装 defineAsyncComponent，补齐「占位 / 重试 / 超时」三件事。
 * 参数：
 *   loader        —— 与 defineAsyncComponent 相同的动态导入函数
 *   options.label —— 加载失败时展示的文案（缺省不展示文字，仅占位块）
 *   options.retries      —— 失败重试次数，默认 2（合计最多 3 次尝试）
 *   options.retryDelayMs —— 重试间隔基数，按尝试次数线性递增，默认 400ms
 *   options.delayMs      —— 占位延迟显示时间，避免快网下闪烁，默认 180ms
 *   options.timeoutMs    —— 超时判定的展示阈值，默认 25000ms
 *   options.minHeight    —— 占位块最小高度，默认 160px（避免布局塌陷）
 * 返回：可直接在模板中使用的异步组件。
 * 核心逻辑：
 *   loader 外层包一层「线性退避重试」；占位与失败态均使用**内联样式**渲染，
 *   这样即使样式分片同时失败，占位块本身仍然可见 —— 否则兜底 UI 会一起消失。
 */

import { defineAsyncComponent, h, type Component, type VNode } from 'vue';

export interface ResilientAsyncOptions {
    /** 加载失败时展示的文案；缺省只显示占位块 */
    label?: string;
    /** 失败重试次数（不含首次），默认 2 */
    retries?: number;
    /** 重试间隔基数（毫秒），按尝试次数线性递增，默认 400 */
    retryDelayMs?: number;
    /** 占位延迟显示时间（毫秒），默认 180 */
    delayMs?: number;
    /** 超时展示阈值（毫秒），默认 25000 */
    timeoutMs?: number;
    /** 占位块最小高度（像素），默认 160 */
    minHeight?: number;
}

/**
 * 以线性退避重试执行 loader。
 * @param loader 动态导入函数
 * @param retries 重试次数（不含首次）
 * @param retryDelayMs 间隔基数
 * @returns loader 的最终结果；全部尝试失败时抛出最后一次错误
 */
async function loadWithRetry<T>(
    loader: () => Promise<T>,
    retries: number,
    retryDelayMs: number,
): Promise<T> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            return await loader();
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
            }
        }
    }

    throw lastError;
}

/**
 * 生成占位节点（加载中 / 加载失败）。
 * 全部使用内联样式：样式分片失败时兜底 UI 仍然成立。
 * 失败态额外承接 defineAsyncComponent 注入的 `retry` 回调 —— 点击即可重新拉取分片，
 * 这是「自愈」的最后一道兜底：内部线性退避重试耗尽后，仍给用户一个手动恢复入口，
 * 避免像裸 defineAsyncComponent 那样一旦失败就永久空白（V3.6.35 的原始痛点）。
 * @param minHeight 最小高度
 * @param failed 是否为失败态
 * @param label 失败态文案（缺省给出「点击重试」式可读提示）
 */
function createPlaceholder(minHeight: number, failed: boolean, label?: string): Component {
    return {
        name: failed ? 'AsyncLoadFailed' : 'AsyncLoading',
        // 仅失败态声明 retry prop；defineAsyncComponent 只向 errorComponent 注入该回调，
        // 加载态无需也不应承接。
        props: failed ? { retry: { type: Function, default: null } } : {},
        setup(props): () => VNode {
            return () =>
                h(
                    'div',
                    {
                        class: failed ? 'async-placeholder async-placeholder--failed' : 'async-placeholder',
                        style: {
                            minHeight: `${minHeight}px`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            borderRadius: '12px',
                            background: failed ? 'rgba(198, 40, 40, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                            color: failed ? '#c62828' : 'rgba(0, 0, 0, 0.35)',
                            fontSize: '12px',
                            letterSpacing: '0.02em',
                            // 失败态且具备 retry 回调：变为可点击的恢复入口（cursor / 键盘可达）
                            ...(failed && props.retry
                                ? {
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                      role: 'button',
                                      tabindex: '0',
                                      title: '加载失败，点击重试',
                                      onClick: () => props.retry?.(),
                                      onKeydown: (e: KeyboardEvent) => {
                                          if (e.key === 'Enter' || e.key === ' ') props.retry?.();
                                      },
                                  }
                                : {}),
                        },
                    },
                    // 失败态文案：优先使用调用方传入的 label，否则给出可读的「点击重试」提示
                    failed ? label || (props.retry ? '加载失败，点击重试' : '加载失败') : '',
                );
        },
    };
}

/**
 * 创建带重试与占位的异步组件。
 * @param loader 动态导入函数，如 `() => import('./Panel.vue')`
 * @param options 见 ResilientAsyncOptions
 */
export function defineResilientAsync(
    loader: () => Promise<unknown>,
    options: ResilientAsyncOptions = {},
) {
    const {
        label,
        retries = 2,
        retryDelayMs = 400,
        delayMs = 180,
        timeoutMs = 25000,
        minHeight = 160,
    } = options;

    return defineAsyncComponent({
        loader: () => loadWithRetry(loader, retries, retryDelayMs) as Promise<Component>,
        loadingComponent: createPlaceholder(minHeight, false),
        errorComponent: createPlaceholder(minHeight, true, label),
        delay: delayMs,
        timeout: timeoutMs,
    });
}
