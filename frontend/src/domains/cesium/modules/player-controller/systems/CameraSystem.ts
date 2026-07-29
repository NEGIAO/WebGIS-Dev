import {
    Cartesian3, Math as CMath, Matrix4, Transforms,
} from "cesium";
import type { playerController } from "../playerController";
import { lerp, smoothDamp } from "../utils/math";

export class CameraSystem {
    private ctrl: playerController; // 主控制器引用

    collisionLerp = 0.12; // 碰撞恢复插值速度（降低以减少微抖）
    epsilon = 35; // 安全距离偏移
    minDist = 100; // 最小相机距离
    maxDist = 440; // 最大相机距离
    originMaxDist = 440; // 初始最大距离
    sensitivity = 5; // 鼠标灵敏度
    mouseMode: 0 | 1 | 2 | 3 | 4 | 5 = 1; // 鼠标控制模式
    zoomEnabled = false; // 是否允许缩放
    lookAtHeightRatio = 0.8; // 第三人称看向点高度比例（0=底部，1=顶部）

    enableSpringCamera = false;
    springCameraTime = 0.05;
    private baseSpringCameraTime = 0; // 初始弹簧相机时间（用于根据速度动态调整）

    // 第三人称轨道角：方位角 theta、仰角 phi
    theta = 0;
    private phi = CMath.toRadians(70);
    private fpPitch = 0; // 第一人称俯仰

    // 复用临时对象
    private _lastSafeDist = this.maxDist; // 上帧安全距离（lerp 用）
    private _spring = new Cartesian3(); // 弹簧平滑后的看向点
    private _springVel = new Cartesian3(); // 弹簧速度
    private _lookAtPoint = new Cartesian3(); // 预分配的看向点向量
    private _enu = new Matrix4(); // 看向点处的 ENU→ECEF 变换矩阵
    private _offEnu = new Cartesian3(); // 轨道角（theta/phi）算出的 ENU 单位偏移
    private _offWorld = new Cartesian3(); // _offEnu 转到 ECEF 后的世界方向向量
    private _camPos = new Cartesian3(); // 算出的相机位置（ECEF）
    private _dir = new Cartesian3(); // 相机视线方向（指向看向点）
    private _up = new Cartesian3(); // 相机本地 Up 方向
    private _rayDir = new Cartesian3(); // 避障射线方向
    private _right = new Cartesian3(); // 越肩横移用的 right 轴
    private _centerDir = new Cartesian3(); // 准星射线方向（getCenterHit 用）

    private _overShoulder = false; // 越肩开关（每帧 updateThirdPerson 读取）
    private _overShoulderOffset = 0; // 当前越肩横移比例（平滑过渡用）
    private static readonly overShoulderRatio = 0.2; // 越肩横移占相机距离的比例
    private static readonly overShoulderSmoothTime = 0.2; // 越肩过渡时间（秒）
    private static readonly centerRayMaxDist = 1e7; // 准星射线最大检测距离（米）

    // 弹簧时间平滑
    private _targetSpringTime = 0.05; // 目标弹簧时间
    private _springTimeSmoothTime = 0.3; // 弹簧时间过渡时间（秒）

    constructor(ctrl: playerController) {
        this.ctrl = ctrl;
    }

    private get camera() { return this.ctrl.viewer.camera; }
    private get scene() { return this.ctrl.viewer.scene; }

    // 接管相机：关闭 Cesium 默认相机交互
    takeOver() {
        const sscc = this.scene.screenSpaceCameraController;
        sscc.enableRotate = false;
        sscc.enableTranslate = false;
        sscc.enableZoom = false; // 缩放走自定义滚轮（zoomByWheel），关闭原生 dolly
        sscc.enableTilt = false;
        sscc.enableLook = false;
    }

    // 滚轮缩放：调整第三人称最大镜头距（originMaxDist 持久值，maxDist 同步）
    zoomByWheel(delta: number) {
        if (!this.zoomEnabled) return;
        const factor = delta > 0 ? 1 / 1.1 : 1.1; // delta>0 向前滚→拉近
        const next = CMath.clamp(this.originMaxDist * factor, this.minDist, this.minDist * 60);
        this.originMaxDist = next;
        this.maxDist = next;
    }

    // 第三人称相机看向点
    getLookAtPoint(out = new Cartesian3()): Cartesian3 {
        const totalH = this.ctrl.capsuleInfo.height; // 实际胶囊高度
        const pos = this.ctrl.getPosition();
        const up = this.localUp(pos, this._up);
        // posEcef 为 Rapier 胶囊中心，相对其抬高 (ratio - 0.5)*totalH（ratio=1 看顶，0 看底）
        const lift = (this.lookAtHeightRatio - 0.5) * totalH;
        return Cartesian3.add(pos, Cartesian3.multiplyByScalar(up, lift, out), out);
    }

    // 某 ECEF 点处的本地 Up 方向
    private localUp(ecef: Cartesian3, out = new Cartesian3()): Cartesian3 {
        return Cartesian3.normalize(ecef, out);
    }

    // 通用弹簧阻尼：把看向点朝 dest 平滑跟随，返回本帧的目标点
    springTarget(dest: Cartesian3, delta: number): Cartesian3 {
        if (!this.enableSpringCamera) return dest;
        const cur = this._spring;
        const v = this._springVel;
        const smoothTime = Math.max(0.0001, this.springCameraTime);
        const omega = 2 / smoothTime;
        const x = omega * delta;
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
        for (const a of ["x", "y", "z"] as const) {
            const change = (cur as any)[a] - (dest as any)[a];
            const temp = (((v as any)[a]) + omega * change) * delta;
            (v as any)[a] = ((v as any)[a] - omega * temp) * exp;
            (cur as any)[a] = (dest as any)[a] + (change + temp) * exp;
        }
        return cur;
    }

    /**
     * 保存初始弹簧时间（在 init 完成后调用一次）
     */
    saveBaseSpringTime() {
        this.baseSpringCameraTime = this.springCameraTime;
    }

    /**
     * 根据当前玩家速度动态调整弹簧相机时间（平滑过渡，无跳变）
     * 速度越快 → springCameraTime 越小 → 相机跟得更紧
     * 速度越慢 → springCameraTime 越大 → 相机跟得更平滑
     *
     * @param currentSpeed 当前实际速度（curPlayerSpeed）
     * @param baseSpeed    基准速度（playerSpeed，即无加速时的行走速度）
     * @param delta        帧间隔（秒）
     */
    updateSpringTimeBySpeed(currentSpeed: number, baseSpeed: number, delta: number) {
        if (this.baseSpringCameraTime <= 0) return;
        const ratio = Math.max(0.1, currentSpeed / Math.max(1, baseSpeed));
        const clamped = Math.min(3, Math.max(0.5, ratio));
        this._targetSpringTime = this.baseSpringCameraTime / clamped;
        // 平滑过渡到目标值，避免冲刺/行走切换时相机突变
        this.springCameraTime = smoothDamp(this.springCameraTime, this._targetSpringTime, this._springTimeSmoothTime, delta);
    }

    // 处理鼠标朝向
    setToward(dx: number, dy: number, speed: number) {
        this.ctrl.onTowardChange?.(dx, dy, speed);
        if (!this.ctrl.enableToward) return;
        const sens = this.sensitivity;
        if (this.ctrl.isFirstPerson) {
            // 第一人称：dx 驱动玩家 yaw ，dy 驱动相机 pitch
            this.ctrl.addYaw(dx * speed * sens);
            this.fpPitch = CMath.clamp(
                this.fpPitch + (-dy * speed * sens), // dy<0（上移）→ pitch 增大 → 看上
                -CMath.PI * (60 / 180), CMath.PI * (80 / 180),
            );
        } else {
            // 第三人称：绕玩家轨道
            this.theta += dx * speed * sens;
            this.phi = CMath.clamp(this.phi - dy * speed * sens, 0.1, Math.PI - 0.1); // dy<0（上移）→ phi 减小 → 相机抬高
        }
    }

    // 每帧更新相机
    update(delta: number) {
        if (this.ctrl.isFirstPerson) { this.updateFirstPerson(); return; }
        this.updateThirdPerson(delta);
    }

    // 第三人称：手动轨道 + 弹簧跟随 + 射线避障 + 越肩平滑过渡
    private updateThirdPerson(delta: number) {
        const target = this.getLookAtPoint(this._lookAtPoint);
        const smoothed = this.springTarget(target, delta);

        // 在目标点处建 ENU，把轨道角（theta/phi）转成 ENU 偏移，再到 ECEF
        const enu = Transforms.eastNorthUpToFixedFrame(smoothed, undefined, this._enu);
        const sinPhi = Math.sin(this.phi);
        // ENU 偏移
        const offEnu = this._offEnu;
        offEnu.x = sinPhi * Math.sin(this.theta);
        offEnu.y = sinPhi * Math.cos(this.theta);
        offEnu.z = Math.cos(this.phi);
        // 相机射线避障：把上帧安全距离朝本帧瞬时安全距离插值（遮挡渐拉近、松开渐拉远）
        const safe = this.raycastDistance(smoothed, offEnu, enu, this.maxDist);
        this._lastSafeDist = lerp(this._lastSafeDist, safe, this.collisionLerp);
        const dist = Math.min(this.maxDist, this._lastSafeDist);

        // ENU 偏移转成 ECEF 世界方向，归一化后乘安全距离，从看向点沿该方向退出得相机位置
        const offWorld = Matrix4.multiplyByPointAsVector(enu, offEnu, this._offWorld);
        Cartesian3.normalize(offWorld, offWorld);
        const camPos = Cartesian3.add(smoothed, Cartesian3.multiplyByScalar(offWorld, dist, offWorld), this._camPos);

        // 视线方向 = 看向点 - 相机位置；Up 取相机所在处的本地上方
        const direction = Cartesian3.subtract(smoothed, camPos, this._dir);
        Cartesian3.normalize(direction, direction);
        const up = this.localUp(camPos, this._up);

        // 越肩视角：平滑过渡横移量（0→目标比例 或 目标比例→0）
        const targetOffset = this._overShoulder ? CameraSystem.overShoulderRatio : 0;
        this._overShoulderOffset = smoothDamp(this._overShoulderOffset, targetOffset, CameraSystem.overShoulderSmoothTime, delta);
        if (Math.abs(this._overShoulderOffset) > 0.001) {
            const right = Cartesian3.normalize(Cartesian3.cross(direction, up, this._right), this._right);
            Cartesian3.add(camPos, Cartesian3.multiplyByScalar(right, dist * this._overShoulderOffset, right), camPos);
        }

        // 更新相机位置和朝向
        this.camera.setView({
            destination: camPos,
            orientation: { direction, up },
        });
    }

    // 射线防穿墙：返回安全距离
    private raycastDistance(target: Cartesian3, offEnu: Cartesian3, enu: Matrix4, maxDist: number): number {
        const dir = Matrix4.multiplyByPointAsVector(enu, offEnu, this._rayDir);
        Cartesian3.normalize(dir, dir);
        const hitDist = this.ctrl.physics.raycastEcef(target, dir, maxDist);
        if (hitDist !== Infinity) {
            return Math.max(Math.min(maxDist, hitDist - this.epsilon), this.minDist);
        }
        return maxDist;
    }

    // 第一人称：相机放到胶囊顶部偏移，按 yaw + pitch 求朝向
    private updateFirstPerson() {
        const offset = this.ctrl.playerModelConfig.firstPersonCameraOffset;
        const head = this.ctrl.getHeadWorldPosition(offset);
        const yaw = this.ctrl.getYaw();
        // 在 head 处建 ENU，按 yaw + pitch 求朝向
        const enu = Transforms.eastNorthUpToFixedFrame(head, undefined, this._enu);
        const cosP = Math.cos(this.fpPitch);
        const dirEnu = this._offEnu;
        dirEnu.x = cosP * Math.sin(yaw);
        dirEnu.y = cosP * Math.cos(yaw);
        dirEnu.z = Math.sin(this.fpPitch);
        const dir = Matrix4.multiplyByPointAsVector(enu, dirEnu, this._dir);
        Cartesian3.normalize(dir, dir);
        const up = this.localUp(head, this._up);
        this.camera.setView({ destination: head, orientation: { direction: dir, up } });
    }

    // 切换视角模式
    changeView() {
        this.ctrl.onBeforeViewChange?.(this.ctrl.isFirstPerson);
        this.ctrl.isFirstPerson = !this.ctrl.isFirstPerson;
        // 第一人称无越肩；第三人称按开关恢复
        this.setOverShoulder(this.ctrl.isFirstPerson ? false : this.ctrl.enableOverShoulderView);
        this.setPointerLock();
        this.ctrl.onViewChange?.(this.ctrl.isFirstPerson);
    }

    // 进入第一人称
    setFirstPerson(vertAngle = 0) {
        this.ctrl.isFirstPerson = true;
        this.fpPitch = CMath.clamp(vertAngle, -CMath.PI * (60 / 180), CMath.PI * (80 / 180));
        this.setPointerLock();
    }

    // 设置越肩视角：仅记录开关，实际横移在 updateThirdPerson 每帧施加。
    setOverShoulder(enable: boolean) {
        this._overShoulder = enable && !this.ctrl.isFirstPerson;
    }

    // 指针锁定控制
    setPointerLock() {
        const el = this.ctrl.viewer.canvas;
        if (!el.requestPointerLock) return;
        const lockModes = this.mouseMode === 0 || this.mouseMode === 1 || this.mouseMode === 5;
        if (this.ctrl.isFirstPerson || lockModes) {
            el.requestPointerLock();
        } else {
            document.exitPointerLock?.();
        }
    }

    // 屏幕中心检测
    getCenterHit(): { distance: number; position: Cartesian3; normal: Cartesian3 } | undefined {
        const ray = this.camera.getPickRay(
            { x: this.scene.canvas.clientWidth / 2, y: this.scene.canvas.clientHeight / 2 } as any,
        );
        if (!ray) return undefined;
        const dir = Cartesian3.normalize(ray.direction, this._centerDir);
        const hit = this.ctrl.physics.raycastEcefHit(ray.origin, dir, CameraSystem.centerRayMaxDist);
        if (!hit) return undefined;
        return { distance: hit.distance, position: hit.point, normal: hit.normal };
    }
}
