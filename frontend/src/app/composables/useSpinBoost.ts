/**
 * 悬停加速：对「已有 CSS 动画」做平滑倍速（playbackRate），且**随停留时长递增**
 *
 * 用途：Landing 首屏两个主按钮 hover 时加速背景同心环旋转；CTA 按钮 hover 时
 * 加速其卡片背景环。基础 4×，停留越久越快，到上限后封顶。
 *
 * 为什么改 playbackRate 而不是 animation-duration：
 *   改 duration 会让浏览器按「已过时间 / 新时长」重算进度，元素瞬间跳到另一个
 *   角度（肉眼即"闪一下"）；playbackRate 只改变推进速度，当前角度连续。
 *
 * 为什么不在 CSS 里写 `:hover { animation-duration: ... }`：
 *   一是同样的跳帧问题；二是 :hover 只能命中自身或后代，而按钮与背景环是兄弟
 *   分支，CSS 无法跨分支联动；三是"越停越快"需要按时间求值，纯 CSS 做不到。
 *
 * 速度模型（线性增长 + 指数平滑跟随）：
 *   target(t) = min(maxRate, baseRate + t × gainPerSecond)
 *   current  += (target - current) × (1 - e^(-dt/τ))      τ = rampMs / 3
 *   指数平滑保证"起手不跳"且与帧率无关；t 是本次悬停已持续的秒数。
 *
 * 只作用于动画名包含 match 的动画（默认 `ring-spin`），不牵动背景里的呼吸、
 * 漂移等其它动效；`prefers-reduced-motion: reduce` 时直接不介入（此时环本来
 * 就没有动画，getAnimations 返回空，天然 no-op）。
 */

import { onBeforeUnmount, onMounted } from 'vue';

export interface SpinBoostOptions {
    /** 起手倍速，默认 4 */
    baseRate?: number;
    /** 倍速上限，默认 16 */
    maxRate?: number;
    /** 每秒增加的倍速，默认 1.5（约 8 秒到顶） */
    gainPerSecond?: number;
    /** 收敛时长（毫秒），决定跟随快慢，默认 220 */
    rampMs?: number;
    /** 只影响动画名包含该片段的动画，默认 'ring-spin' */
    match?: string;
}

export interface SpinBoostController {
    /** 悬停进入：平滑升到 baseRate，并按停留时长继续递增 */
    start: () => void;
    /** 悬停离开：平滑回落 1 倍速 */
    stop: () => void;
}

export function useSpinBoost(
    getTarget: () => HTMLElement | null,
    options: SpinBoostOptions = {},
): SpinBoostController {
    const baseRate = options.baseRate ?? 4;
    const maxRate = options.maxRate ?? 16;
    const gainPerSecond = options.gainPerSecond ?? 1.5;
    const rampMs = options.rampMs ?? 220;
    const match = options.match ?? 'ring-spin';

    /** 指数平滑时间常数：约 3τ 收敛到目标值的 95%，与 rampMs 对齐 */
    const tau = Math.max(16, rampMs / 3);

    let frame = 0;
    let current = 1;
    let engaged = false;
    let engagedAt = 0;
    let lastTick = 0;
    let animations: Animation[] = [];

    const prefersReducedMotion = (): boolean =>
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

    /**
     * 收集目标子树中正在运行、且动画名命中 match 的动画
     *
     * subtree: true 会连同后代与伪元素（环上的两个点）一并返回，因此点的
     * 自转也会跟着加速；名字过滤把网格漂移、光斑呼吸排除在外。
     */
    const collect = (): Animation[] => {
        const target = getTarget();
        if (!target || typeof target.getAnimations !== 'function') return [];
        return target.getAnimations({ subtree: true }).filter((animation) => {
            const name = (animation as CSSAnimation).animationName ?? '';
            return name.includes(match);
        });
    };

    const apply = (rate: number): void => {
        for (const animation of animations) {
            animation.playbackRate = rate;
        }
    };

    const tick = (now: number): void => {
        frame = 0;

        // 切标签页回来时 dt 可能很大，钳到 64ms，避免一帧跳完整条曲线
        const dt = lastTick ? Math.min(64, Math.max(0, now - lastTick)) : 16;
        lastTick = now;

        const target = engaged
            ? Math.min(maxRate, baseRate + ((now - engagedAt) / 1000) * gainPerSecond)
            : 1;

        current += (target - current) * (1 - Math.exp(-dt / tau));

        // 回落到位就收工，避免空闲时长期占用 rAF
        if (!engaged && Math.abs(current - 1) < 0.01) {
            current = 1;
            apply(1);
            animations = [];
            lastTick = 0;
            return;
        }

        apply(current);
        frame = requestAnimationFrame(tick);
    };

    const run = (): void => {
        if (!frame) {
            lastTick = 0;
            frame = requestAnimationFrame(tick);
        }
    };

    const start = (): void => {
        if (prefersReducedMotion()) return;
        animations = collect();
        if (!animations.length) return;
        engaged = true;
        engagedAt = performance.now();
        run();
    };

    const stop = (): void => {
        if (prefersReducedMotion()) return;
        engaged = false;
        if (animations.length) run();
    };

    /**
     * 页面不可见时强制归位
     *
     * 背景标签页的 rAF 会被压到 ~1fps，若此时鼠标已离开但 mouseleave 没触发，
     * 倍速会停在半途。切走即复位，回来时环保持常速，不会"卡在高位"。
     */
    const onVisibilityChange = (): void => {
        if (document.visibilityState !== 'hidden') return;
        engaged = false;
        cancelAnimationFrame(frame);
        frame = 0;
        current = 1;
        lastTick = 0;
        apply(1);
        animations = [];
    };

    onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));

    onBeforeUnmount(() => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        cancelAnimationFrame(frame);
        frame = 0;
        apply(1);
    });

    return { start, stop };
}
