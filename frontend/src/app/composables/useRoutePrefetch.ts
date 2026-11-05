/**
 * 注册页资源预取（Landing → 注册页的形变过渡前置准备）
 *
 * ## 为什么需要这个模块
 *
 * 跨页过渡用 `document.startViewTransition` 包住 `router.push`。按 API 语义，
 * **回调执行期间浏览器冻结旧快照**——回调里任何网络等待都会直接表现为
 * "页面卡住一帧"。而首次点击时，回调里恰好有两条串行依赖：
 *
 *   1. 路由守卫的 `ensureValidSession()`（已登录用户会 import API 层并请求
 *      `/api/auth/me`，全仓库只有守卫一处调用，落地页从不预热）；
 *   2. `RegisterView` 的惰性 chunk（36 KB JS + 35 KB CSS，`router/index.js` 用
 *      `() => import(...)` 声明）。
 *
 * 第二次点击之所以不卡，正是这两项都已进缓存（模块缓存 / `validatedToken`）。
 *
 * ## 本模块做三件事
 *
 * - `armRegisterPrefetch()`：落地页挂载后在**空闲时段**预取 chunk（不做会话校验，
 *   避免在用户没打算离开当前页时触发鉴权副作用）；
 * - `prefetchRegisterRoute({ withSession })`：三个入口的 `pointerenter` /
 *   `focusin` / `touchstart` 上触发（幂等）。带 `withSession` 时顺带把会话校验
 *   跑掉——此时用户已经指向注册入口，校验失败本来也会在点击时发生；
 * - `isRegisterRouteReady()`：供过渡层做**就绪门控**（见
 *   `useViewTransitionNavigation` 的 `ready` 选项）。未就绪时宁可不播动画，
 *   也不让旧快照冻结。
 *
 * ## 边界
 *
 * - 省流模式（`Save-Data`）下完全跳过，不额外消耗流量；
 * - 预取失败不抛错、不标记就绪，下一次触发会重试；
 * - 只预热 chunk 与（可选的）会话校验，**不改变路由状态**，不产生导航副作用。
 */

import { getAuthToken } from '@common/user/services/auth';
import { useAuthStore } from '@common/user/stores/useAuthStore';

/** 注册页模块的加载 Promise（幂等：同一时刻只发一次请求） */
let chunkPromise: Promise<unknown> | null = null;
/** 注册页 chunk 是否已加载完成 */
let chunkReady = false;
/** 已完成会话校验时使用的 token：token 变更（登出 / 换号）后判定自动失效 */
let checkedToken = '';
/** 是否已安排空闲预取，避免重复排程 */
let armed = false;
/** 空闲预取句柄（idle callback 或 setTimeout，视浏览器支持） */
let idleHandle: number | null = null;

/** 省流模式判定：命中则不预取，避免替用户决定花流量 */
function saveDataEnabled(): boolean {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    return nav.connection?.saveData === true;
}

/**
 * 加载注册页 chunk。
 * @returns chunk 模块；失败时清空缓存以便下次重试
 */
function warmChunk(): Promise<unknown> {
    if (!chunkPromise) {
        chunkPromise = import('../RegisterView.vue')
            .then((mod) => {
                chunkReady = true;
                return mod;
            })
            .catch((error) => {
                chunkPromise = null;
                throw error;
            });
    }
    return chunkPromise;
}

/**
 * 预取注册页所需资源（幂等，可在任意事件上反复调用）。
 *
 * @param options.withSession 是否顺带做会话校验。
 *   仅应在**用户已指向注册入口**时开启（hover / focus / touchstart），
 *   因为校验失败会清理本地会话——这本来也是点击时会发生的结果，
 *   提前到意图阶段只是把等待挪出过渡回调。
 */
export function prefetchRegisterRoute(options: { withSession?: boolean } = {}): void {
    if (typeof window === 'undefined' || saveDataEnabled()) return;

    void warmChunk().catch(() => {
        /* 预取失败静默：点击时仍会走正常加载路径 */
    });

    const token = getAuthToken();
    // 无 token 时守卫会直接返回 false，不存在网络等待，无需预热
    if (!options.withSession || !token || checkedToken === token) return;

    void useAuthStore()
        .ensureValidSession()
        .then(() => {
            // 成功：守卫侧的 await 会走 `validatedToken` 短路；
            // 失败：token 已被清理，守卫侧同样不会再发请求。两种情况都算"已就绪"。
            checkedToken = token;
        })
        .catch(() => {
            checkedToken = token;
        });
}

/**
 * 注册页是否已具备「立即过渡」的条件。
 *
 * 未登录用户只差 chunk；已登录用户还要等会话校验完成——否则守卫里的
 * `await ensureValidSession()` 会落在过渡回调中，把旧快照冻住。
 */
export function isRegisterRouteReady(): boolean {
    if (!chunkReady) return false;
    const token = getAuthToken();
    // 游客（或已登出）：守卫不请求，chunk 就绪即可
    if (!token) return true;
    // 登录态：必须针对**当前** token 校验过，避免换号后仍判定为就绪
    return checkedToken === token;
}

/**
 * 在落地页空闲时段安排一次 chunk 预取。
 *
 * @returns 取消函数：组件卸载时调用，避免空闲回调打到已卸载的页面
 */
export function armRegisterPrefetch(): () => void {
    if (typeof window === 'undefined' || armed || saveDataEnabled()) {
        return () => {};
    }
    armed = true;

    const kick = () => {
        idleHandle = null;
        prefetchRegisterRoute(); // 只预热 chunk：不做会话校验，避免落地页产生鉴权副作用
    };

    const win = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };

    if (typeof win.requestIdleCallback === 'function') {
        // timeout 兜底：持续忙碌的页面也能在 3s 内插空执行
        idleHandle = win.requestIdleCallback(kick, { timeout: 3000 });
    } else {
        idleHandle = window.setTimeout(kick, 2000);
    }

    return () => {
        if (idleHandle !== null) {
            const cancelIdle = (window as unknown as { cancelIdleCallback?: (h: number) => void })
                .cancelIdleCallback;
            if (typeof cancelIdle === 'function') {
                cancelIdle(idleHandle);
            } else {
                window.clearTimeout(idleHandle);
            }
            idleHandle = null;
        }
        armed = false;
    };
}
