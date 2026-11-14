import {
    Cartesian3, Matrix4, Model, Transforms, Math as CMath,
} from "cesium";
import type { Viewer } from "cesium";

import type { DynamicObject as DynamicBody, DynamicBodyOpts } from "./systems/PhysicsSystem";
import type { DynamicShape } from "./types";
import { DynamicObject } from "./dynamicObject";
import { LocalFrame } from "./utils/frame";
import {
    computeHeadWorldPosition,
    isMobileDevice,
    loadAndConfigurePlayerModel,
    slerpAngle,
} from "./utils/playerModelLoader";
import { MobileControls } from "./utils/mobileControls";
import { PhysicsSystem } from "./systems/PhysicsSystem";
import { InputSystem } from "./systems/InputSystem";
import { CameraSystem } from "./systems/CameraSystem";
import { AnimationSystem } from "./systems/AnimationSystem";
import { DebugColliderSystem } from "./systems/DebugColliderSystem";
import { smoothDamp } from "./utils/math";
import type { PlayerControllerOptions, PlayerModelOptions, KeyMap } from "./types";

export class playerController {
    // ==================== 场景引用 ====================
    viewer!: Viewer; // Cesium 视图
    model: Model | null = null; // 玩家模型

    // ==================== 玩家配置 ====================
    playerModelConfig!: PlayerModelOptions; // 模型配置项
    private initPos = new Cartesian3(); // 初始出生位置
    gravity = -2400; // 重力加速度
    jumpHeight = 600; // 跳跃初速度
    playerSpeed = 300; // 行走速度
    playerFlySpeed = 55000; // 飞行速度
    private curPlayerSpeed = 0; // 当前实际速度
    playerAcceleration = 30; // XZ 加速响应速度
    playerDeceleration = 30; // XZ 减速响应速度

    // ==================== 玩家胶囊体 ====================
    private playerCapsuleRadius = 30; // 胶囊体半径
    private playerCapsuleRadiusRatio = 1; // 半径缩放比
    private playerCapsuleHeight = 180; // 胶囊体高度
    capsuleInfo = { radius: 30, height: 180 }; // 胶囊实际尺寸（已乘 scale）

    // ==================== 运行状态 ====================
    isFirstPerson = false; // 第一人称状态
    playerIsOnGround = false; // 是否在地面
    isupdate = true; // 帧更新开关
    timeScale = 1; // 时间缩放系数
    private lastUpdateTime = 0; // 上一帧时间戳
    currentDelta = 0; // 本帧实际使用的 delta（已钳制 + timeScale）
    isFlying = false; // 飞行状态
    enableToward = true; // 启用朝向输入
    enableOverShoulderView = false; // 越肩视角开关
    private isShowMobileControls = true; // 显示移动端控件
    mobileControls: MobileControls | null = null; // 移动端控件

    // ==================== 移动手感 ====================
    private airControl = 0.3; // 空中控制系数（0=无空控，1=与地面相同）
    private landingDamping = 0.3; // 落地缓冲系数：首帧只吸收部分贴地修正，形成软着陆
    private moveSmoothTime = 0.08; // 水平速度平滑时间（秒），越小越灵敏
    private stepSmoothFactor = 12; // 贴地跟随平滑因子：坡度/台阶上渐进贴合，避免瞬移

    // ==================== 局部系重锚 ====================
    private physicsRebaseDistance = 10000;
    private _rebaseScratch = new Cartesian3();

    // ==================== 运动状态 ====================
    private velE = 0; // 东向速度
    private velN = 0; // 北向速度
    private velU = 0; // 竖直速度
    private yaw = 0; // 玩家朝向（绕 Up，弧度）
    private pitch = 0; // 玩家俯仰（飞行时身体上下倾斜，弧度）
    private rotationSpeed = 10; // 朝向旋转速度
    private pendingJump = false; // 待触发跳跃
    private posEcef = new Cartesian3(); // 当前位置（ECEF，胶囊中心）

    // ==================== 事件回调 ====================
    onAnimationChange?: (name: string) => void;
    onBeforeViewChange?: (isFirstPerson: boolean) => void;
    onViewChange?: (isFirstPerson: boolean) => void;
    onGroundChange?: (onGround: boolean) => void;
    onTowardChange?: (dx: number, dy: number, speed: number) => void;

    // ==================== 动态物体 ====================
    private dynamicObjects: DynamicObject[] = [];

    // ==================== 子系统 ====================
    frame = new LocalFrame(); // ENU 局部坐标系
    physics = new PhysicsSystem(this.frame); // 物理系统（Rapier）
    input = new InputSystem(this); // 输入系统
    cam = new CameraSystem(this); // 相机系统
    animation = new AnimationSystem(this); // 动画系统
    debugCollider = new DebugColliderSystem({
        getViewer: () => this.viewer,
        getPhysics: () => this.physics,
        getDynamicObjects: () => this.dynamicObjects,
    }); // 碰撞体线框可视化

    // ==================== 初始化 ====================
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        const m = opts.playerModelConfig;
        const s = m.scale ?? 1;

        this.viewer = opts.viewer;
        this.playerModelConfig = m;
        Cartesian3.clone(opts.initPos, this.initPos);
        Cartesian3.clone(opts.initPos, this.posEcef);

        this.gravity = (m.gravity ?? this.gravity) * s;
        this.jumpHeight = (m.jumpHeight ?? this.jumpHeight) * s;
        this.playerSpeed = (m.speed ?? this.playerSpeed) * s;
        this.playerFlySpeed = (m.flySpeed ?? this.playerFlySpeed) * s;
        this.curPlayerSpeed = this.playerSpeed;
        this.playerCapsuleRadiusRatio = m.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
        this.playerAcceleration = m.acceleration ?? this.playerAcceleration;
        this.playerDeceleration = m.deceleration ?? this.playerDeceleration;
        this.yaw = m.rotateY ?? 0;

        this.cam.theta = this.yaw + (this.playerModelConfig.facingOffset ?? 0) + Math.PI;
        this.cam.sensitivity = opts.mouseSensitivity ?? this.cam.sensitivity;
        this.cam.mouseMode = opts.thirdMouseMode ?? this.cam.mouseMode;
        this.cam.enableSpringCamera = opts.enableSpringCamera ?? this.cam.enableSpringCamera;
        this.cam.springCameraTime = opts.springCameraTime ?? this.cam.springCameraTime;
        this.cam.saveBaseSpringTime();
        this.cam.zoomEnabled = opts.enableZoom ?? this.cam.zoomEnabled;
        this.cam.minDist = (opts.minCamDistance ?? this.cam.minDist) * s;
        this.cam.maxDist = (opts.maxCamDistance ?? this.cam.maxDist) * s;
        this.cam.originMaxDist = this.cam.maxDist;
        this.cam.lookAtHeightRatio = opts.camLookAtHeightRatio ?? this.cam.lookAtHeightRatio;
        this.cam.epsilon *= s;

        this.enableOverShoulderView = opts.enableOverShoulderView ?? this.enableOverShoulderView;
        this.isFirstPerson = opts.isFirstPerson ?? this.isFirstPerson;
        this.timeScale = opts.timeScale ?? this.timeScale;
        this.physicsRebaseDistance = opts.rebaseDistance ?? this.physicsRebaseDistance;
        this.isShowMobileControls = (opts.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();

        if (opts.keyMap) this.input.buildKeyMap(opts.keyMap);

        if (this.isShowMobileControls) {
            this.mobileControls = new MobileControls(i => this.input.setInput(i));
            await this.mobileControls.init(opts.mobileControls);
        }

        this.frame.setAnchor(this.initPos);
        await this.physics.create(this.gravity);

        const r = this.playerCapsuleRadius * s * this.playerCapsuleRadiusRatio;
        const h = this.playerCapsuleHeight * s;
        this.capsuleInfo = { radius: r, height: h };
        this.physics.createCharacter(this.initPos, {
            radius: r,
            halfHeight: Math.max(0.01, (h - 2 * r) / 2),
        }, {
            maxSlopeClimbDeg: 50,
            autostepMaxHeight: 40 * s,
        });

        if (opts.staticCollider) await this.physics.addStaticColliders(this.viewer, opts.staticCollider);
        if (opts.kinematicCollider) {
            const list = Array.isArray(opts.kinematicCollider) ? opts.kinematicCollider : [opts.kinematicCollider];
            for (const d of list) await this.physics.addKinematicCollider(this.viewer, d);
        }

        await this.loadPlayerModel();

        this.cam.takeOver();
        this.input.bindEvents();
        if (this.isFirstPerson) this.cam.setFirstPerson();
        else this.cam.setOverShoulder(this.enableOverShoulderView);

        callback?.();
    }

    // ==================== 玩家模型 ====================

    private modelScale = 1;

    private async loadPlayerModel(): Promise<Model> {
        const { model, modelScale } = await loadAndConfigurePlayerModel({
            viewer: this.viewer,
            frame: this.frame,
            posEcef: this.posEcef,
            yaw: this.yaw,
            playerModelConfig: this.playerModelConfig,
            playerCapsuleHeight: this.playerCapsuleHeight,
            capsuleHeight: this.capsuleInfo.height,
        });
        this.model = model;
        this.modelScale = modelScale;
        this.animation.setup(this.model);
        return this.model;
    }

    // ==================== 主循环 ====================

    update(delta?: number) {
        if (!this.isupdate || !this.model || !this.physics.world) return;
        if (delta === undefined) {
            const now = performance.now();
            if (this.lastUpdateTime === 0) this.lastUpdateTime = now;
            delta = (now - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = now;
        }
        delta = Math.min(delta, 1 / 30) * this.timeScale;
        this.currentDelta = delta;
        this.updatePlayer(delta);
    }

    private updatePlayer(delta: number) {
        this.maybeRebase();
        this.physics.step(delta);

        const camYaw = this.getCameraYaw();
        let dirE = 0, dirN = 0, dirU = 0;
        let groundCorrectionU = 0;
        const i = this.input;
        if (i.fwd) { dirE += Math.sin(camYaw); dirN += Math.cos(camYaw); }
        if (i.bkd) { dirE -= Math.sin(camYaw); dirN -= Math.cos(camYaw); }
        if (i.lft) { dirE -= Math.cos(camYaw); dirN += Math.sin(camYaw); }
        if (i.rgt) { dirE += Math.cos(camYaw); dirN -= Math.sin(camYaw); }

        if (this.isFlying) {
            this.curPlayerSpeed = i.shift ? this.playerFlySpeed * 2 : this.playerFlySpeed;
            if (i.fwd) { const c = this.getCameraDirEnu(); dirE = c.e; dirN = c.n; dirU = c.u; }
            if (i.space) dirU += 1;
        } else {
            this.curPlayerSpeed = i.shift ? this.playerSpeed * 2 : this.playerSpeed;
        }

        this.cam.updateSpringTimeBySpeed(this.curPlayerSpeed, this.playerSpeed, delta);

        if (this.isFlying) {
            const len = Math.hypot(dirE, dirN, dirU);
            if (len > 0) { dirE /= len; dirN /= len; dirU /= len; }
        } else {
            const hLen = Math.hypot(dirE, dirN);
            if (hLen > 0) { dirE /= hLen; dirN /= hLen; }
        }

        const targetE = dirE * this.curPlayerSpeed;
        const targetN = dirN * this.curPlayerSpeed;
        const hasInput = dirE !== 0 || dirN !== 0;
        const airFactor = (!this.isFlying && !this.playerIsOnGround) ? this.airControl : 1;
        const smoothTime = hasInput ? this.moveSmoothTime / airFactor : this.moveSmoothTime * 1.5 / airFactor;
        this.velE = smoothDamp(this.velE, targetE, smoothTime, delta);
        this.velN = smoothDamp(this.velN, targetN, smoothTime, delta);

        if (!this.isFlying && this.pendingJump) {
            this.velU = Math.max(this.velU, 0) + this.jumpHeight;
            this.pendingJump = false;
        }

        if (this.isFlying) {
            const targetU = dirU * this.curPlayerSpeed;
            this.velU = smoothDamp(this.velU, targetU, smoothTime, delta);
        } else {
            const snapH = this.capsuleInfo.height / 2;
            const maxH = snapH * 1.2;
            const dist = this.physics.groundDistance(maxH * 4);

            if (dist > maxH) {
                this.velU += this.gravity * delta;
                this.setOnGround(false);
            } else if (this.velU <= 0) {
                if (this.playerIsOnGround) {
                    const correction = snapH - dist;
                    const smoothThreshold = this.capsuleInfo.height * 0.25;
                    groundCorrectionU = Math.abs(correction) <= smoothThreshold
                        ? correction * Math.min(1, this.stepSmoothFactor * delta)
                        : correction;
                    this.velU = 0;
                    this.setOnGround(true);
                } else {
                    const predicted = dist + this.velU * delta;
                    if (predicted <= snapH) {
                        groundCorrectionU = (snapH - dist) * this.landingDamping;
                        this.velU = 0;
                        this.setOnGround(true);
                    } else {
                        this.velU += this.gravity * delta;
                        this.setOnGround(false);
                    }
                }
            } else {
                this.velU += this.gravity * delta;
                this.setOnGround(false);
            }
        }

        const desiredEnu = {
            e: this.velE * delta,
            n: this.velN * delta,
            u: this.velU * delta + groundCorrectionU,
        };
        this.physics.moveCharacter(desiredEnu, this.posEcef);

        for (const o of this.dynamicObjects) {
            if (o.visual) this.physics.getDynamicModelMatrix(o.body.body, o.visual.modelMatrix);
        }

        if (!this.isFirstPerson) {
            const moveYaw = Math.atan2(dirE, dirN);
            const mode = this.cam.mouseMode;
            const lerpT = Math.min(1, this.rotationSpeed * delta);
            let targetPitch = 0;
            if (!this.isFlying) {
                if (mode === 4 || mode === 5) {
                    this.yaw = camYaw;
                } else if (mode === 0 || mode === 2) {
                    this.yaw = slerpAngle(this.yaw, hasInput ? moveYaw : camYaw, lerpT);
                } else if (hasInput) {
                    this.yaw = slerpAngle(this.yaw, moveYaw, lerpT);
                }
            } else {
                this.yaw = slerpAngle(this.yaw, this.input.fwd && hasInput ? moveYaw : camYaw, lerpT);
                if (this.input.fwd) targetPitch = Math.asin(Math.max(-1, Math.min(1, dirU)));
            }
            this.pitch = slerpAngle(this.pitch, targetPitch, lerpT);
        }

        const cosP = Math.cos(this.pitch);
        const fwdEN = { e: Math.sin(this.yaw) * cosP, n: Math.cos(this.yaw) * cosP, u: Math.sin(this.pitch) };
        this.frame.composeModelMatrixLookAt(this.posEcef, fwdEN, this.modelScale * this.playerModelConfig.scale, this.model!.modelMatrix, -this.capsuleInfo.height / 2, this.playerModelConfig.facingOffset ?? 0);

        this.animation.setAnimationByPressed();
        this.animation.update(delta);
        this.cam.update(delta);

        if (this.debugCollider.isEnabled) { this.debugCollider.updateCapsuleDebug(); this.debugCollider.updateDynamicDebug(); }
    }

    private maybeRebase() {
        if (!Number.isFinite(this.physicsRebaseDistance) || this.physicsRebaseDistance <= 0) return;
        const local = this.frame.ecefToLocal(this.posEcef, this._rebaseScratch);
        if (Math.hypot(local.x, local.y) >= this.physicsRebaseDistance) {
            this.physics.rebase(this.posEcef);
        }
    }

    // ==================== 内部辅助 ====================
    private getCameraYaw(): number {
        const d = this.getCameraDirEnu();
        return Math.atan2(d.e, d.n);
    }

    private _enuScratch = new Matrix4();
    private _camDirResult = { e: 0, n: 0, u: 0 };

    private getCameraDirEnu(): { e: number; n: number; u: number } {
        const dir = this.viewer.camera.directionWC;
        const m = Transforms.eastNorthUpToFixedFrame(this.posEcef, undefined, this._enuScratch);
        const r = this._camDirResult;
        r.e = dir.x * m[0] + dir.y * m[1] + dir.z * m[2];
        r.n = dir.x * m[4] + dir.y * m[5] + dir.z * m[6];
        r.u = dir.x * m[8] + dir.y * m[9] + dir.z * m[10];
        const len = Math.hypot(r.e, r.n, r.u) || 1;
        r.e /= len; r.n /= len; r.u /= len;
        return r;
    }

    setOnGround(val: boolean) {
        if (this.playerIsOnGround === val) return;
        this.playerIsOnGround = val;
        this.onGroundChange?.(val);
        if (val) this.animation.onLand();
        else this.animation.onBecomeAirborne();
    }

    // ==================== 调试 ====================

    setDebug(debug: boolean) {
        this.debugCollider.setEnabled(debug);
    }

    syncDebugVisibility() {
        this.debugCollider.syncVisibility();
    }

    requestJump() { this.pendingJump = true; }
    resetVelocity() { this.velE = this.velN = this.velU = 0; }
    addYaw(d: number) { this.yaw = CMath.negativePiToPi(this.yaw + d); }
    getYaw() { return this.yaw; }

    getHeadWorldPosition(offset?: [number, number, number]): Cartesian3 {
        return computeHeadWorldPosition(
            this.posEcef,
            this.capsuleInfo.height,
            this.playerModelConfig.scale,
            this.yaw,
            offset,
        );
    }

    setPlayerScale(newScale: number) {
        if (newScale <= 0) return;
        const ratio = newScale / this.playerModelConfig.scale;
        this.playerModelConfig.scale = newScale;

        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.capsuleInfo.radius *= ratio;
        this.capsuleInfo.height *= ratio;
        this.cam.epsilon *= ratio;
        this.cam.minDist *= ratio;
        this.cam.maxDist *= ratio;
        this.cam.originMaxDist *= ratio;
        this.physics.setGravity(this.gravity);
        const cr = this.capsuleInfo.radius;
        const ch = this.capsuleInfo.height;
        this.physics.updateCharacterShape({
            radius: cr,
            halfHeight: Math.max(0.01, (ch - 2 * cr) / 2),
        });
        this.debugCollider.rebuildCapsule();
    }

    async switchPlayerModel(newPlayerModel: PlayerModelOptions) {
        const savedPos = Cartesian3.clone(this.posEcef, new Cartesian3());
        const savedYaw = this.yaw;
        const wasFirstPerson = this.isFirstPerson;

        if (this.model) {
            this.viewer.scene.primitives.remove(this.model);
            this.model = null;
        }
        this.animation.reset();

        const ratio = newPlayerModel.scale / this.playerModelConfig.scale;
        this.playerModelConfig = { ...this.playerModelConfig, ...newPlayerModel };
        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.capsuleInfo.radius *= ratio;
        this.capsuleInfo.height *= ratio;
        this.physics.updateCharacterShape({
            radius: this.capsuleInfo.radius,
            halfHeight: Math.max(0.01, (this.capsuleInfo.height - 2 * this.capsuleInfo.radius) / 2),
        });
        this.cam.epsilon *= ratio;
        this.cam.minDist *= ratio;
        this.cam.maxDist *= ratio;
        this.cam.originMaxDist *= ratio;

        await this.loadPlayerModel();

        Cartesian3.clone(savedPos, this.posEcef);
        this.yaw = savedYaw;
        this.physics.teleportCharacter(this.posEcef);
        if (wasFirstPerson) this.cam.setFirstPerson();
        this.setDebug(this.debugCollider.isEnabled);
    }

    // ==================== API ====================

    getPosition(out = new Cartesian3()): Cartesian3 { return Cartesian3.clone(this.posEcef, out); }
    getIsFirstPerson() { return this.isFirstPerson; }
    getIsFlying() { return this.isFlying; }
    getIsOnGround() { return this.playerIsOnGround; }
    getCurrentDelta() { return this.currentDelta; }
    getPlayerModel() { return this.model; }
    getVelocity() { return { e: this.velE, n: this.velN, u: this.velU }; }
    getPlayerCapsule() { return this.capsuleInfo; }
    getActiveKinematicCollider() { return this.physics.activeKinematicSource; }
    getCollider() { return this.physics.charCollider ?? null; }

    // ==================== 动态物体 ====================

    addDynamicObject(positionEcef: Cartesian3, shape: DynamicShape, opts?: DynamicBodyOpts): DynamicObject {
        const body = this.physics.createDynamicBody(positionEcef, shape, opts);
        return this.registerDynamicObject(body);
    }

    removeDynamicObject(obj: DynamicObject) {
        const i = this.dynamicObjects.indexOf(obj);
        if (i >= 0) this.dynamicObjects.splice(i, 1);
        this.physics.removeDynamicObject(obj.body);
        this.debugCollider.removeDynamicObject(obj);
        obj.detachVisual();
    }

    clearDynamicObjects() {
        for (const o of this.dynamicObjects) {
            this.physics.removeDynamicObject(o.body);
            this.debugCollider.removeDynamicObject(o);
            o.detachVisual();
        }
        this.dynamicObjects = [];
    }

    private registerDynamicObject(body: DynamicBody): DynamicObject {
        const obj = new DynamicObject(body, this.physics);
        this.dynamicObjects.push(obj);
        return obj;
    }

    async addKinematicCollider(collider: import("./types").ColliderSource, source?: object) {
        const body = await this.physics.addKinematicCollider(this.viewer, collider);
        if (body && source) this.physics.kinematicBySource.set(source, body);
        return body;
    }
    removeKinematicCollider(source: object) { this.physics.removeKinematicCollider(source); }
    clearKinematicColliders() { this.physics.clearKinematicColliders(); }

    // --- 玩家参数 ---
    setMouseSensitivity(v: number) { this.cam.sensitivity = v; }
    setGravity(g: number) { this.gravity = g * this.playerModelConfig.scale; this.physics.setGravity(this.gravity); }
    setJumpHeight(j: number) { this.jumpHeight = j * this.playerModelConfig.scale; }
    setPlayerSpeed(sp: number) { this.playerSpeed = sp * this.playerModelConfig.scale; this.curPlayerSpeed = this.playerSpeed; }
    setPlayerFlySpeed(f: number) { this.playerFlySpeed = f * this.playerModelConfig.scale; }
    setAcceleration(a: number) { this.playerAcceleration = a; }
    setDeceleration(d: number) { this.playerDeceleration = d; }
    setEnableToward(v: boolean) { this.enableToward = v; }

    // --- 局部系重锚 ---
    rebase(anchorEcef?: Cartesian3) { this.physics.rebase(anchorEcef ?? this.posEcef); }
    setRebaseDistance(d: number) { this.physicsRebaseDistance = d; }
    getRebaseDistance() { return this.physicsRebaseDistance; }

    // --- 相机参数 ---
    setMinCamDistance(d: number) { this.cam.minDist = d * this.playerModelConfig.scale; }
    setMaxCamDistance(d: number) { this.cam.maxDist = d * this.playerModelConfig.scale; this.cam.originMaxDist = this.cam.maxDist; }
    setCamLookAtHeightRatio(r: number) { this.cam.lookAtHeightRatio = r; }
    setThirdMouseMode(mode: 0 | 1 | 2 | 3 | 4 | 5) { this.cam.mouseMode = mode; this.cam.setPointerLock(); }
    setEnableZoom(e: boolean) { this.cam.zoomEnabled = e; this.viewer.scene.screenSpaceCameraController.enableZoom = false; }

    // --- 相机 ---
    changeView() { this.cam.changeView(); }
    setFirstPersonCamera(v = 0) { this.cam.setFirstPerson(v); }
    setFirstPersonCameraOffset(offset: [number, number, number]) { this.playerModelConfig.firstPersonCameraOffset = offset; }
    setOverShoulderView(v: boolean) { this.enableOverShoulderView = v; this.cam.setOverShoulder(v); }
    getCenterScreenRaycastHit() { return this.cam.getCenterHit(); }

    // --- 动画 ---
    playPlayerAnimationByName(name: string) { this.animation.playByName(name); }
    getCurrentPlayerAnimationName() { return this.animation.getCurrentName(); }
    registerAnimation(key: string, clipName: string, opts?: Parameters<AnimationSystem["register"]>[2]) { this.animation.register(key, clipName, opts); }
    playAnimation(key: string, opts?: Parameters<AnimationSystem["play"]>[1]) { this.animation.play(key, opts); }
    registerLocomotionSet(setName: string, map: Parameters<AnimationSystem["registerLocomotionSet"]>[1]) { this.animation.registerLocomotionSet(setName, map); }
    switchLocomotionSet(setName: string) { this.animation.switchLocomotionSet(setName); }
    getCurrentLocomotionSet() { return this.animation.currentLocomotionSet; }

    // --- 输入 ---
    setInput(input: Parameters<InputSystem["setInput"]>[0]) { this.input.setInput(input); }
    setKeyMap(map?: KeyMap) { this.input.buildKeyMap(map); }
    onAllEvent() { this.input.bindEvents(); }
    offAllEvent() { this.input.unbindEvents(); }

    reset(position?: Cartesian3) {
        this.velE = this.velN = this.velU = 0;
        Cartesian3.clone(position ?? this.initPos, this.posEcef);
        this.physics.teleportCharacter(this.posEcef);
    }

    // --- 销毁 ---
    destroy() {
        this.input.unbindEvents();

        this.mobileControls?.destroy();
        this.mobileControls = null;

        this.debugCollider.removeAll();

        this.animation.reset();
        if (this.model) { this.viewer.scene.primitives.remove(this.model); this.model = null; }
        this.clearDynamicObjects();
        this.physics.destroy();

        const sscc = this.viewer.scene.screenSpaceCameraController;
        sscc.enableRotate = true; sscc.enableTranslate = true; sscc.enableZoom = true;
        sscc.enableTilt = true; sscc.enableLook = true;
    }
}
