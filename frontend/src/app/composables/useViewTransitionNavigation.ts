/**
 * 跨页 / 跨状态形变（View Transitions API）
 *
 * 两个使用场景：
 *   1. 路由跳转：Landing 三个入口 → 注册页（共享元素：按钮 → 表单卡、装饰层）；
 *   2. 状态切换：Home 侧栏折叠/展开（共享元素：面板本身，宽度形变）。
 *
 * 能力与降级：`canAnimateViewTransition()` 统一判断浏览器支持、用户偏好与设备能力，
 * 任一不满足即调用方走原路径（不启动过渡）。判断纳入：
 *   - 不支持 `document.startViewTransition`；
 *   - `prefers-reduced-motion: reduce`；
 *   - `Save-Data`（省流模式）；
 *   - `deviceMemory < 4GB`（低内存设备，整页快照容易掉帧）；
 *   - 2G / slow-2g 网络；
 *   - `(update: slow)`（低刷新率设备）。
 *
 * 时序要点：`router.push` / 状态赋值都是异步或需等渲染完成的，必须在回调里
 * await 之后 `await nextTick()`，否则浏览器抓到的新快照还是旧的。
 */

import { nextTick } from 'vue';
import type { Router } from 'vue-router';

interface ViewTransitionLike {
    finished: Promise<void>;
}

type DocumentWithViewTransition = Document & {
    startViewTransition?: (callback: () => Promise<void> | void) => ViewTransitionLike;
};

type NavigatorWithHints = Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
};

export interface ViewTransitionNavigationOptions {
    /** 额外的跳过条件，返回 true 时不做过渡 */
    skip?: () => boolean;
}

/** 共享元素名：按钮 → 表单卡 */
const MORPH_NAME = 'auth-card';

/** 标记本次导航由形变过渡发起，供目标页跳过自身的入场动画 */
const NAV_FLAG_KEY = 'webgis:view-transition-nav';

/** 用户是否要求减少动态效果 */
function prefersReducedMotion(): boolean {
    return (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    );
}

/**
 * 是否允许启动形变过渡
 *
 * 除了浏览器能力，还排除省流、低内存、慢网与低刷新率设备——这些机器上
 * 整页快照（含 WebGL 画布）的代价远大于动画收益，直接跳过更稳。
 */
export function canAnimateViewTransition(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as DocumentWithViewTransition;
    if (typeof doc.startViewTransition !== 'function') return false;
    if (prefersReducedMotion()) return false;

    const nav = navigator as NavigatorWithHints;
    if (nav.connection?.saveData) return false;
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return false;
    if (nav.connection?.effectiveType && /(^|-)(2g|slow-2g)$/.test(nav.connection.effectiveType)) {
        return false;
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(update: slow)').matches) {
        return false;
    }
    return true;
}

/**
 * 用形变过渡包住一次状态更新
 *
 * @param update 触发 DOM 变化的操作（同步赋值或异步导航均可）
 * @returns 过渡结束（或降级路径完成）后 resolve；不支持时仅执行 update
 */
export async function runWithViewTransition(update: () => void | Promise<void>): Promise<void> {
    const doc = document as DocumentWithViewTransition;

    if (!canAnimateViewTransition()) {
        await update();
        return;
    }

    const transition = doc.startViewTransition!(async () => {
        await update();
        // 等渲染提交，避免新快照抓到旧状态
        await nextTick();
    });
    await transition.finished;
}

/**
 * 读取并清除「本次导航来自形变过渡」的标记
 *
 * 目标页用它决定是否跳过 `.fade-in`：入场动画从 opacity 0 起跑，若不禁用，
 * 浏览器抓到的新快照会是一张几乎透明的卡片，形变过去只剩背景。
 */
export function consumeViewTransitionNavFlag(): boolean {
    try {
        const hit = sessionStorage.getItem(NAV_FLAG_KEY) === '1';
        if (hit) sessionStorage.removeItem(NAV_FLAG_KEY);
        return hit;
    } catch {
        return false;
    }
}

function markNavigation(): void {
    try {
        sessionStorage.setItem(NAV_FLAG_KEY, '1');
    } catch {
        /* 隐私模式下不可写：不影响过渡，只是目标页会多播一次入场动画 */
    }
}

function clearNavigationMark(): void {
    try {
        sessionStorage.removeItem(NAV_FLAG_KEY);
    } catch {
        /* 同上 */
    }
}

/**
 * 生成一个「带形变过渡的导航函数」
 *
 * @param router 路由实例
 * @param options 跳过条件
 * @returns 接收目标路径与触发元素的函数；传入元素时该元素会参与共享元素形变
 */
export function useViewTransitionNavigation(
    router: Router,
    options: ViewTransitionNavigationOptions = {},
): (to: string, sourceEl?: HTMLElement | null) => Promise<void> {
    const skip = options.skip ?? (() => false);

    return async (to: string, sourceEl?: HTMLElement | null): Promise<void> => {
        // 让被点的按钮临时成为共享元素；动画结束/异常都要还原，避免残留同名节点
        if (sourceEl && canAnimateViewTransition() && !skip()) {
            sourceEl.style.viewTransitionName = MORPH_NAME;
        }

        try {
            if (!canAnimateViewTransition() || skip()) {
                await router.push(to);
                return;
            }
            markNavigation();
            await runWithViewTransition(async () => {
                await router.push(to);
            });
        } catch {
            clearNavigationMark();
            // 过渡异常不应阻断导航：push 已生效时无需重试
            if (router.currentRoute.value.path !== to) {
                await router.push(to);
            }
        } finally {
            if (sourceEl) {
                sourceEl.style.viewTransitionName = '';
            }
        }
    };
}
