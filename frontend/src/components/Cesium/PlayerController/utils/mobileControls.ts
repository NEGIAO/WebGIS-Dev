type SetInputFn = (input: Partial<{
    moveX: 1 | 0 | -1;
    moveY: 1 | 0 | -1;
    lookDeltaX: number;
    lookDeltaY: number;
    jump: boolean;
    shift: boolean;
    toggleView: boolean;
    toggleFly: boolean;
}>) => void;

// 内联 SVG 图标（data URI），白色描边，适配深色按钮底
const svgIcon = (path: string) =>
    `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>')`;
// 实心填充版（白色填充，适合纸飞机这类剪影图标）
const svgIconFilled = (path: string) =>
    `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1" stroke-linejoin="round">${path}</svg>')`;
const jumpIcon = svgIcon('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'); // 上箭头
const flyIcon = svgIconFilled('<path d="M22 2L2 11l7 2 2 7 3-5 5 3z"/><path d="M9 13l5-5"/>'); // 纸飞机
const viewIcon = svgIcon('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>'); // 眼睛

// 虚拟摇杆
class VirtualJoystick {
    private baseEl: HTMLDivElement; // 外环
    private stickEl: HTMLDivElement; // 内点
    private pointerId: number | null = null; // 当前跟踪的指针 id
    private center = { x: 0, y: 0 }; // 摇杆中心屏幕坐标
    private radius: number; // 摇杆半径
    private onMove: (data: { vector: { x: number; y: number }; distance: number }) => void;
    private onEnd: () => void;

    constructor(
        zone: HTMLDivElement,
        size: number,
        onMove: (data: { vector: { x: number; y: number }; distance: number }) => void,
        onEnd: () => void,
    ) {
        this.radius = size / 2;
        this.onMove = onMove;
        this.onEnd = onEnd;

        // 外环
        this.baseEl = document.createElement("div");
        Object.assign(this.baseEl.style, {
            position: "absolute",
            left: "50%",
            bottom: "50%",
            transform: "translate(-50%, 50%)",
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: "50%",
            border: "2px solid rgba(0,0,0,0.5)",
            backgroundColor: "rgba(0,0,0,0.2)",
            boxSizing: "border-box",
            pointerEvents: "none",
        });
        zone.appendChild(this.baseEl);

        // 内点
        const stickSize = size * 0.2;
        this.stickEl = document.createElement("div");
        Object.assign(this.stickEl.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: `${stickSize}px`,
            height: `${stickSize}px`,
            borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.7)",
            pointerEvents: "none",
        });
        this.baseEl.appendChild(this.stickEl);

        zone.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        zone.addEventListener("pointermove", this.onPointerMove, { passive: false });
        zone.addEventListener("pointerup", this.onPointerUp, { passive: false });
        zone.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    }

    private onPointerDown = (e: PointerEvent) => {
        if (this.pointerId !== null) return;
        this.pointerId = e.pointerId;
        const rect = this.baseEl.parentElement!.getBoundingClientRect();
        this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.baseEl.parentElement!.setPointerCapture(e.pointerId);
        e.preventDefault();
        this.updateStick(e.clientX, e.clientY);
    };

    private onPointerMove = (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        e.preventDefault();
        this.updateStick(e.clientX, e.clientY);
    };

    private onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.pointerId) return;
        this.pointerId = null;
        this.stickEl.style.transform = "translate(-50%, -50%)";
        this.onEnd();
    };

    // 根据触摸位置更新内点偏移，并回调归一化向量
    private updateStick(clientX: number, clientY: number) {
        const dx = clientX - this.center.x;
        const dy = clientY - this.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, this.radius);
        const angle = Math.atan2(dy, dx);
        const ox = Math.cos(angle) * clampedDist;
        const oy = Math.sin(angle) * clampedDist;

        this.stickEl.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;

        // 归一化向量，y 轴取反
        const scale = dist > 0 ? clampedDist / this.radius / dist : 0;
        this.onMove({ vector: { x: dx * scale, y: -dy * scale }, distance: clampedDist });
    }

    destroy() {
        const zone = this.baseEl.parentElement;
        if (zone) {
            zone.removeEventListener("pointerdown", this.onPointerDown);
            zone.removeEventListener("pointermove", this.onPointerMove);
            zone.removeEventListener("pointerup", this.onPointerUp);
            zone.removeEventListener("pointercancel", this.onPointerUp);
        }
        this.baseEl.remove();
    }
}

export class MobileControls {
    setInput: SetInputFn; // 输入派发回调（接到 InputSystem.setInput）

    // 摇杆状态
    joystick: VirtualJoystick | null = null; // 虚拟摇杆实例
    prevJoyState = { dirX: 0, dirY: 0, shift: false }; // 上次摇杆方向/冲刺状态（去重用）

    // DOM 元素
    joystickZoneEl: HTMLDivElement | null = null; // 摇杆区域
    lookAreaEl: HTMLDivElement | null = null; // 视角触摸区
    jumpBtnEl: HTMLButtonElement | null = null; // 跳跃按钮
    flyBtnEl: HTMLButtonElement | null = null; // 飞行按钮
    viewBtnEl: HTMLButtonElement | null = null; // 视角切换按钮

    // 触摸状态
    lookPointerId: number | null = null; // 视角区跟踪的指针 id
    isLookDown = false; // 视角区是否正在触摸
    lastTouchX = 0; // 上次触摸 X
    lastTouchY = 0; // 上次触摸 Y

    constructor(setInput: SetInputFn) {
        this.setInput = setInput;
    }

    // 初始化移动端控制
    async init(opts?: { joystick?: boolean; jump?: boolean; fly?: boolean; view?: boolean }) {
        const showJoystick = opts?.joystick ?? true;
        const showJump = opts?.jump ?? true;
        const showFly = opts?.fly ?? true;
        const showView = opts?.view ?? true;

        const JOY_SIZE = 120;
        const container = document.body;

        // 创建摇杆区域
        if (showJoystick) {
            this.joystickZoneEl = document.createElement("div");
            this.joystickZoneEl.id = "joy-zone";
            Object.assign(this.joystickZoneEl.style, {
                position: "absolute",
                left: "16px",
                bottom: "16px",
                width: `${JOY_SIZE + 40}px`,
                height: `${JOY_SIZE + 40}px`,
                touchAction: "none",
                zIndex: "999",
                pointerEvents: "auto",
                WebkitUserSelect: "none",
                userSelect: "none",
            });
            container.appendChild(this.joystickZoneEl);
            this.blockTouch(this.joystickZoneEl);

            // 初始化自定义摇杆
            this.joystick = new VirtualJoystick(
                this.joystickZoneEl,
                JOY_SIZE,
                (data) => {
                    const rawX = data.vector?.x ?? 0;
                    const rawY = data.vector?.y ?? 0;
                    const distance = data.distance ?? 0;
                    const deadzone = 0.2;
                    const dirX = rawX > deadzone ? 1 : rawX < -deadzone ? -1 : 0;
                    const dirY = rawY > deadzone ? 1 : rawY < -deadzone ? -1 : 0;
                    const isSprinting = distance >= JOY_SIZE / 2;
                    const prev = this.prevJoyState;
                    if (dirX === prev.dirX && dirY === prev.dirY && isSprinting === prev.shift) return;
                    this.prevJoyState = { dirX, dirY, shift: isSprinting };
                    this.setInput({ moveX: dirX as any, moveY: dirY as any, shift: isSprinting });
                },
                () => {
                    const prev = this.prevJoyState;
                    if (prev.dirX !== 0 || prev.dirY !== 0 || prev.shift) {
                        this.prevJoyState = { dirX: 0, dirY: 0, shift: false };
                        this.setInput({ moveX: 0, moveY: 0, shift: false });
                    }
                },
            );
        }

        // 创建视角区域（右半屏触摸转视角）
        this.lookAreaEl = document.createElement("div");
        Object.assign(this.lookAreaEl.style, {
            position: "absolute",
            right: "0",
            bottom: "0",
            width: "50%",
            height: "100%",
            zIndex: "998",
            touchAction: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        });
        container.appendChild(this.lookAreaEl);
        this.blockTouch(this.lookAreaEl);

        // 绑定视角触摸事件
        this.lookAreaEl.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        this.lookAreaEl.addEventListener("pointermove", this.onPointerMove, { passive: false });
        this.lookAreaEl.addEventListener("pointerup", this.onPointerUp, { passive: false });
        this.lookAreaEl.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        // 创建操作按钮
        if (showJump) {
            this.jumpBtnEl = this.createBtn(container, 14, 14, jumpIcon);
            this.jumpBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ jump: true }); }, { passive: false });
            this.jumpBtnEl.addEventListener("touchend", (e) => { e.preventDefault(); this.setInput({ jump: false }); }, { passive: false });
            this.jumpBtnEl.addEventListener("touchcancel", (e) => { e.preventDefault(); this.setInput({ jump: false }); }, { passive: false });
        }
        if (showFly) {
            this.flyBtnEl = this.createBtn(container, 14, 14 + 80, flyIcon);
            this.flyBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ toggleFly: true }); }, { passive: false });
        }
        if (showView) {
            this.viewBtnEl = this.createBtn(container, 14, 14 + 200, viewIcon);
            this.viewBtnEl.addEventListener("touchstart", (e) => { e.preventDefault(); this.setInput({ toggleView: true }); }, { passive: false });
        }
    }

    // 销毁移动端控制
    destroy() {
        try {
            this.joystick?.destroy();
            this.joystick = null;

            if (this.lookAreaEl) {
                this.lookAreaEl.removeEventListener("pointerdown", this.onPointerDown);
                this.lookAreaEl.removeEventListener("pointermove", this.onPointerMove);
                this.lookAreaEl.removeEventListener("pointerup", this.onPointerUp);
                this.lookAreaEl.removeEventListener("pointercancel", this.onPointerUp);
            }

            // 移除所有 DOM 元素
            [this.joystickZoneEl, this.lookAreaEl, this.jumpBtnEl, this.flyBtnEl, this.viewBtnEl]
                .forEach(el => el?.parentElement?.removeChild(el));

            this.joystickZoneEl = this.lookAreaEl = this.jumpBtnEl =
                this.flyBtnEl = this.viewBtnEl = null;
        } catch (e) {
            console.warn("销毁移动端控制时出错：", e);
        }
    }

    // 触摸按下
    private onPointerDown = (e: PointerEvent) => {
        if (e.pointerType !== "touch") return;
        this.isLookDown = true;
        this.lookPointerId = e.pointerId;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.lookAreaEl?.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    };

    // 触摸移动
    private onPointerMove = (e: PointerEvent) => {
        if (!this.isLookDown || e.pointerId !== this.lookPointerId) return;
        const dx = e.clientX - this.lastTouchX;
        const dy = e.clientY - this.lastTouchY;
        this.lastTouchX = e.clientX;
        this.lastTouchY = e.clientY;
        this.setInput({ lookDeltaX: dx, lookDeltaY: dy });
        e.preventDefault();
    };

    // 触摸抬起
    private onPointerUp = (e: PointerEvent) => {
        if (e.pointerId !== this.lookPointerId) return;
        this.isLookDown = false;
        this.lookPointerId = null;
        this.lookAreaEl?.releasePointerCapture?.(e.pointerId);
    };

    // 阻止默认触摸
    private blockTouch(el: HTMLElement) {
        ["touchstart", "touchmove", "touchend", "touchcancel"].forEach(name => {
            el.addEventListener(name, e => e.preventDefault(), { passive: false });
        });
    }

    // 创建圆形按钮
    private createBtn(container: HTMLElement, rightPx: number, bottomPx: number, bgUrl: string): HTMLButtonElement {
        const btn = document.createElement("button");
        Object.assign(btn.style, {
            position: "absolute",
            right: `${rightPx}px`,
            bottom: `${bottomPx}px`,
            width: "56px",
            height: "56px",
            zIndex: "1000",
            borderRadius: "50%",
            border: "2px solid black",
            padding: "20px",
            opacity: "0.95",
            touchAction: "none",
            fontSize: "14px",
            userSelect: "none",
            overflow: "hidden",
            boxSizing: "border-box",
            backgroundColor: "transparent",
            backgroundRepeat: "no-repeat, no-repeat",
            backgroundPosition: "center center, center center",
            backgroundSize: "55% 55%, 100% 100%",
            backgroundImage: `${bgUrl},linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0.5))`,
        });
        container.appendChild(btn);
        ["touchstart", "touchend", "touchcancel"].forEach(name => {
            btn.addEventListener(name, e => e.preventDefault(), { passive: false });
        });
        return btn;
    }
}
