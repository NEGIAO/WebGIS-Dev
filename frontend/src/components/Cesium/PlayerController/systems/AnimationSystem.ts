import type { Model, ModelAnimation } from "cesium";
import { ModelAnimationLoop } from "cesium";
import type { playerController } from "../playerController";

type AnimEntry = {
    name: string; // clip 名
    loop: boolean; // 是否循环
    timeScale: number; // 速度
    once: boolean; // 播放一次
    runtime?: ModelAnimation; // 当前激活的运行时动画
};

export class AnimationSystem {
    private ctrl: playerController; // 主控制器引用
    model?: Model; // 当前模型

    actions = new Map<string, AnimEntry>(); // 动作映射表（语义键 idle/walking → 条目）
    stateKey: string | null = null; // 当前播放状态语义键
    hasThreePartJump = false; // 是否使用三段跳跃动画
    // 手动动画时钟（秒）。每帧累加已被 timeScale 缩放的 delta，经 animationTime 回调驱动动画
    private animSeconds = 0;
    private staticPoseRuntime?: ModelAnimation; // 当前若为单关键帧静态姿势 clip，持有其 runtime，需每帧手动贴姿势

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    // 模型加载完成后，根据 playerModelConfig 注册动作映射
    setup(model: Model) {
        this.model = model;
        // Cesium 模型动画跟随 viewer.clock 推进，shouldAnimate 为 false 时动画会停在第一帧不动
        this.ctrl.viewer.clock.shouldAnimate = true;
        const mc = this.ctrl.playerModelConfig;
        const isThreePart = Array.isArray(mc.jumpAnim);
        this.hasThreePartJump = isThreePart;

        const def = (clip: string | undefined, key: string, loop = true, timeScale = 1, once = false) => {
            if (!clip) return;
            this.actions.set(key, { name: clip, loop, timeScale, once });
        };

        def(mc.idleAnim, "idle");
        def(mc.walkAnim, "walking");
        def(mc.leftWalkAnim || mc.walkAnim, "left_walking");
        def(mc.rightWalkAnim || mc.walkAnim, "right_walking");
        def(mc.backwardAnim || mc.walkAnim, "walking_backward");
        def(mc.runAnim, "running");
        def(mc.flyIdleAnim || mc.idleAnim, "flyidle");
        def(mc.flyAnim || mc.idleAnim, "flying");
        def(mc.flyHoverForwardAnim || mc.flyAnim || mc.idleAnim, "flyHoverForward");
        def(mc.flyHoverBackAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverBack");
        def(mc.flyHoverLeftAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverLeft");
        def(mc.flyHoverRightAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverRight");
        def(mc.flyHoverUpAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverUp");
        def(mc.flyHoverDownAnim || mc.flyIdleAnim || mc.idleAnim, "flyHoverDown");

        // 跳跃动画特殊处理：三段跳分起跳/循环/落地，否则单段
        if (isThreePart) {
            const [s, l, e] = mc.jumpAnim as [string, string, string];
            def(s, "jumpStart", false, 1.2, true);
            def(l, "jumpLoop", true, 1);
            def(e, "jumpEnd", false, 1, true);
        } else {
            def(mc.jumpAnim as string, "jumping", false, 1.2, true);
        }

        // 监听一次性动画完成事件，推进状态机
        (model.activeAnimations as any).animationRemoved?.addEventListener?.((_model: any, animation: any) => {
            this.onAnimFinished(animation);
        });

        this.playByName("idle");
    }

    // 按名切换动画
    playByName(key: string) {
        if (!this.model) return;
        const next = this.actions.get(key);
        // 如果动画不存在，或已在播放，则忽略
        if (!next || this.stateKey === key) return;

        // 停掉旧状态
        if (this.stateKey) {
            const prev = this.actions.get(this.stateKey);
            if (prev?.runtime) { this.model.activeAnimations.remove(prev.runtime); prev.runtime = undefined; }
        }

        // 播放新动画
        const runtime = this.addRuntime(next);
        next.runtime = runtime;

        // 单关键帧 clip（_localStopTime===0）Cesium 不走时间驱动，由 update() 每帧重激活维持
        this.staticPoseRuntime = (runtime as any)?._localStopTime === 0 ? runtime : undefined;

        this.stateKey = key;
        this.ctrl.onAnimationChange?.(key);
    }

    // 激活一个 clip，animationTime 回调手动驱动播放时间
    private addRuntime(entry: AnimEntry): ModelAnimation {
        const tScale = entry.timeScale;
        const start = this.animSeconds;
        return this.model!.activeAnimations.add({
            name: entry.name,
            loop: entry.loop ? ModelAnimationLoop.REPEAT : ModelAnimationLoop.NONE,
            removeOnStop: !entry.loop,
            animateWhilePaused: true, // 脱离时钟，由 animSeconds 驱动
            // duration 为 0（单关键帧）时不能除，返回 0
            animationTime: (d: number) => d === 0 ? 0 : ((this.animSeconds - start) * tScale) / d,
        } as any);
    }

    // 每帧更新
    update(delta: number) {
        this.animSeconds += delta;
        // 单关键帧静态姿势：每帧重新激活 clip 强制重贴
        const sp = this.staticPoseRuntime;
        const entry = this.stateKey ? this.actions.get(this.stateKey) : undefined;
        if (sp && entry && this.model) {
            entry.runtime = undefined; // 解绑，避免 remove 的事件误清状态机                 
            this.model.activeAnimations.remove(sp);
            const fresh = this.addRuntime(entry);
            entry.runtime = fresh;
            this.staticPoseRuntime = fresh;
        }
    }

    // 一次性动画播放完毕的回调，推进状态机
    private onAnimFinished(evt: any) {
        // 找出完成的语义键
        let finishedKey: string | null = null;
        let finishedEntry: AnimEntry | null = null;
        for (const [k, e] of this.actions) if (e.runtime === evt) { finishedKey = k; finishedEntry = e; break; }
        if (!finishedKey || !finishedEntry) return;

        // Cesium 已移除该 runtime，清掉陈旧引用和状态键，避免 playByName 重复 remove 或被守卫挡住
        finishedEntry.runtime = undefined;
        if (this.stateKey === finishedKey) this.stateKey = null;

        if (finishedKey === "jumping") this.resolveGroundAnim();
        else if (finishedKey === "jumpStart") this.playByName("jumpLoop");
        else if (finishedKey === "jumpEnd") this.resolveGroundAnim();

        // 自定义 onFinished 回调（register 注册的）
        const cb = this._onFinishedCbs.get(finishedKey);
        if (cb) cb();
        // returnToPrev：播完返回上一状态（play 设置的）
        const back = this._returnToAfter.get(finishedKey);
        if (back) { this._returnToAfter.delete(finishedKey); this.playByName(back); }
    }

    // 触发跳跃动画（统一入口）
    startJump(inAir = false) {
        // 根据是否配置了三段跳跃，播放不同动画
        if (this.hasThreePartJump) this.playByName(inAir ? "jumpLoop" : "jumpStart");
        else this.playByName("jumping");
    }

    // 离地时触发 jumpLoop（三段模式专用）
    onBecomeAirborne() {
        if (!this.hasThreePartJump) return;
        // 如果当前已经在跳跃动画中，则不打断
        if (["jumpStart", "jumpLoop", "jumpEnd"].includes(this.stateKey ?? "")) return;
        this.playByName("jumpLoop");
    }

    // 落地时触发 jumpEnd（三段模式专用）
    onLand() {
        const i = this.ctrl.input;
        const hasMove = i.fwd || i.bkd || i.lft || i.rgt;
        // 有移动输入则直接切走/跑等地面动画，不等缓冲；
        // 无移动输入且三段跳则播一下 jumpEnd 落地缓冲（播完 onAnimFinished 自动回 idle）
        if (hasMove || !this.hasThreePartJump) {
            this.resolveGroundAnim();
        } else if (this.stateKey === "jumpStart" || this.stateKey === "jumpLoop") {
            this.playByName("jumpEnd");
        } else {
            this.resolveGroundAnim();
        }
    }

    // 根据当前输入立即解析到对应地面动画
    private resolveGroundAnim() {
        const i = this.ctrl.input;
        if (i.fwd) { this.playByName(i.shift ? "running" : "walking"); return; }
        if (i.bkd) { this.playByName("walking_backward"); return; }
        if (i.rgt || i.lft) { this.playByName("walking"); return; }
        this.playByName("idle");
    }

    // 是否处于任意跳跃动画中（用于防止在跳跃动画播放时重复起跳）
    isJumping(): boolean {
        return ["jumping", "jumpStart", "jumpLoop", "jumpEnd"].includes(this.stateKey ?? "");
    }

    // 获取当前动画名
    getCurrentName(): string | null { return this.stateKey; }

    // 清空动画状态（切换模型前调用）
    reset() {
        if (this.model) {
            try { this.model.activeAnimations.removeAll(); } catch { /* model 可能已销毁 */ }
        }
        this.actions.clear();
        this.sets.clear();
        this._onFinishedCbs.clear();
        this._returnToAfter.clear();
        this.stateKey = null;
        this.staticPoseRuntime = undefined;
        this.currentLocomotionSet = null;
        this.model = undefined;
    }

    sets = new Map<string, Map<string, AnimEntry>>(); // 动作集合组
    currentLocomotionSet: string | null = null; // 当前激活的动作集合名

    // 注册自定义动画
    register(key: string, clipName: string, opts?: {
        loop?: boolean; timeScale?: number; duration?: number;
        clampWhenFinished?: boolean; onFinished?: () => void;
    }) {
        if (!this.model) return;
        // duration 优先于 timeScale
        const timeScale = opts?.timeScale ?? 1;
        this.actions.set(key, {
            name: clipName,
            loop: opts?.loop !== false,
            timeScale,
            once: opts?.loop === false,
        });
        // 如果有 onFinished 回调，则记录下来在动画完成时调用
        if (opts?.onFinished) this._onFinishedCbs.set(key, opts.onFinished);
    }
    private _onFinishedCbs = new Map<string, () => void>();

    // 播放已注册动画
    play(key: string, opts?: { force?: boolean; returnToPrev?: boolean }) {
        const action = this.actions.get(key);
        if (!action) { console.warn(`playAnimation: "${key}" 未注册`); return; }
        // 记录初始动画状态以便返回
        const prevKey = opts?.returnToPrev ? this.stateKey : null;
        if (opts?.force && action.runtime && this.model) {
            this.model.activeAnimations.remove(action.runtime);
            action.runtime = undefined;
        }
        this.playByName(key);
        // 如果设置 returnToPrev，则一次性动画播完后返回之前的动画状态
        if (opts?.returnToPrev && prevKey && action.once) {
            this._returnToAfter.set(key, prevKey);
        }
    }
    private _returnToAfter = new Map<string, string>();

    // 注册移动动作组
    registerLocomotionSet(setName: string, map: Partial<Record<
        "idle" | "walking" | "walking_backward" | "running" | "jumping" | "flyidle" | "flying", string>>) {
        const set = new Map<string, AnimEntry>();
        for (const [key, clipName] of Object.entries(map) as [string, string][]) {
            // 跳跃动画特殊处理：只播放一次
            const once = key === "jumping";
            set.set(key, { name: clipName, loop: !once, timeScale: once ? 1.2 : 1, once });
        }
        this.sets.set(setName, set);
    }

    // 切换移动动作组
    switchLocomotionSet(setName: string) {
        const set = this.sets.get(setName);
        if (!set) { console.warn(`switchLocomotionSet: 未找到集合 "${setName}"`); return; }
        this.currentLocomotionSet = setName;
        for (const [key, entry] of set.entries()) {
            const old = this.actions.get(key);
            // 替换当前动作表中的动作为新集合中的动作
            this.actions.set(key, entry);
            // 如果正在播放的动画被替换，则立即切换到新动画
            if (this.stateKey === key) {
                if (old?.runtime && this.model) { this.model.activeAnimations.remove(old.runtime); old.runtime = undefined; }
                this.stateKey = null; // 强制 playByName 重新激活
                this.playByName(key);
            }
        }
    }

    // 按键状态触发动画
    setAnimationByPressed() {
        if (!this.model) return;
        // 恢复相机距离
        this.ctrl.cam.maxDist = this.ctrl.cam.originMaxDist;
        const { fwd, bkd, lft, rgt, shift, space } = this.ctrl.input;

        // 飞行状态下的动画逻辑
        if (this.ctrl.isFlying) {
            // 向前飞：加速播 flying，否则播前进悬停
            if (fwd) { this.playByName(shift ? "flying" : "flyHoverForward"); return; }
            if (bkd) { this.playByName("flyHoverBack"); return; }
            if (lft) { this.playByName("flyHoverLeft"); return; }
            if (rgt) { this.playByName("flyHoverRight"); return; }
            if (space) { this.playByName("flyHoverUp"); return; }
            // 无任何操作时，播放悬停动画
            this.playByName("flyidle");
            return;
        }

        // 地面状态下的动画逻辑
        if (this.ctrl.playerIsOnGround) {
            // 无方向键输入：若正在播落地缓冲 jumpEnd 则让它播完不打断，否则播站立动画
            if (!fwd && !bkd && !lft && !rgt) {
                if (this.stateKey !== "jumpEnd") this.playByName("idle");
                return;
            }
            // 向前走或跑
            if (fwd) { this.playByName(shift ? "running" : "walking"); return; }
            // 第三人称下，左、右、后退也播放走/跑动画（模型会自动转向）
            if (!this.ctrl.isFirstPerson && (lft || rgt || bkd)) { this.playByName(shift ? "running" : "walking"); return; }
            // 第一人称下的平移和后退
            if (lft) { this.playByName("left_walking"); return; }
            if (rgt) { this.playByName("right_walking"); return; }
            if (bkd) { this.playByName("walking_backward"); return; }
        }
    }
}
