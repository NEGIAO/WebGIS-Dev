import {
    Cartesian3, Matrix3, Matrix4, Model, Transforms, Math as CMath,
    Primitive, GeometryInstance, Geometry as GeometryClass, GeometryAttribute,
    ComponentDatatype, PrimitiveType, BoundingSphere, ColorGeometryInstanceAttribute,
    Color, PerInstanceColorAppearance,
} from "cesium";
import type { Viewer } from "cesium";

import type { DynamicObject as DynamicBody, DynamicBodyOpts } from "./systems/PhysicsSystem";
import type { DynamicShape } from "./types";
import { DynamicObject } from "./dynamicObject";
import { LocalFrame } from "./utils/frame";
import { getGltfBboxSize } from "./utils/gltfGeometry";
import { MobileControls } from "./utils/mobileControls";
import { PhysicsSystem } from "./systems/PhysicsSystem";
import { InputSystem } from "./systems/InputSystem";
import { CameraSystem } from "./systems/CameraSystem";
import { AnimationSystem } from "./systems/AnimationSystem";
import type { PlayerControllerOptions, PlayerModelOptions, KeyMap } from "./types";

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

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
    private decelBase = 300; // 减速基准速度

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

    // ==================== 运动状态 ====================
    // 速度在 ENU 局部系:E/N 为水平，U 为竖直
    private velE = 0; // 东向速度
    private velN = 0; // 北向速度
    private velU = 0; // 竖直速度
    private yaw = 0; // 玩家朝向（绕 Up，弧度）
    private pitch = 0; // 玩家俯仰（飞行时身体上下倾斜，弧度）
    private rotationSpeed = 10; // 朝向旋转速度
    private pendingJump = false; // 待触发跳跃
    private posEcef = new Cartesian3(); // 当前位置（ECEF，胶囊中心）

    // ==================== 事件回调 ====================
    onAnimationChange?: (name: string) => void; // 动画切换回调
    onBeforeViewChange?: (isFirstPerson: boolean) => void; // 视角切换前回调
    onViewChange?: (isFirstPerson: boolean) => void; // 视角切换后回调
    onGroundChange?: (onGround: boolean) => void; // 落地状态回调
    onTowardChange?: (dx: number, dy: number, speed: number) => void; // 朝向变化回调

    // ==================== 调试 ====================
    private displayCollider = false; // 显示场景碰撞体
    private debugStaticPrimitive: any = null; // 静态碰撞体线框(地形/glTF),只建一次
    private debugCapsulePrimitive: any = null; // 玩家胶囊线框,随角色每帧重建

    // ==================== 动态物体 ====================
    private dynamicObjects: DynamicObject[] = []; // 受物理模拟、可被角色推动的物体

    // ==================== 子系统 ====================
    frame = new LocalFrame(); // ENU 局部坐标系
    physics = new PhysicsSystem(this.frame); // 物理系统（Rapier）
    input = new InputSystem(this); // 输入系统
    cam = new CameraSystem(this); // 相机系统
    animation = new AnimationSystem(this); // 动画系统

    // ==================== 初始化 ====================
    async init(opts: PlayerControllerOptions, callback?: () => void) {
        const m = opts.playerModelConfig;
        const s = m.scale ?? 1;

        this.viewer = opts.viewer;
        this.playerModelConfig = m;
        Cartesian3.clone(opts.initPos, this.initPos);
        Cartesian3.clone(opts.initPos, this.posEcef);

        // 应用玩家参数
        this.gravity = (m.gravity ?? this.gravity) * s;
        this.jumpHeight = (m.jumpHeight ?? this.jumpHeight) * s;
        this.playerSpeed = (m.speed ?? this.playerSpeed) * s;
        this.playerFlySpeed = (m.flySpeed ?? this.playerFlySpeed) * s;
        this.curPlayerSpeed = this.playerSpeed;
        this.playerCapsuleRadiusRatio = m.capsuleRadiusRatio ?? this.playerCapsuleRadiusRatio;
        this.playerAcceleration = m.acceleration ?? this.playerAcceleration;
        this.playerDeceleration = m.deceleration ?? this.playerDeceleration;
        this.decelBase = this.playerSpeed;
        this.yaw = m.rotateY ?? 0;

        // 应用相机参数
        this.cam.theta = this.yaw + Math.PI;
        this.cam.sensitivity = opts.mouseSensitivity ?? this.cam.sensitivity;
        this.cam.mouseMode = opts.thirdMouseMode ?? this.cam.mouseMode;
        this.cam.enableSpringCamera = opts.enableSpringCamera ?? this.cam.enableSpringCamera;
        this.cam.springCameraTime = opts.springCameraTime ?? this.cam.springCameraTime;
        this.cam.saveBaseSpringTime(); // 保存初始弹簧时间，供速度动态调整使用
        this.cam.zoomEnabled = opts.enableZoom ?? this.cam.zoomEnabled;
        this.cam.minDist = (opts.minCamDistance ?? this.cam.minDist) * s;
        this.cam.maxDist = (opts.maxCamDistance ?? this.cam.maxDist) * s;
        this.cam.originMaxDist = this.cam.maxDist;
        this.cam.lookAtHeightRatio = opts.camLookAtHeightRatio ?? this.cam.lookAtHeightRatio;
        this.cam.epsilon *= s;

        this.enableOverShoulderView = opts.enableOverShoulderView ?? this.enableOverShoulderView;
        this.isFirstPerson = opts.isFirstPerson ?? this.isFirstPerson;
        this.timeScale = opts.timeScale ?? this.timeScale;
        this.isShowMobileControls = (opts.isShowMobileControls ?? this.isShowMobileControls) && isMobileDevice();

        // 自定义键位
        if (opts.keyMap) this.input.buildKeyMap(opts.keyMap);

        // 初始化移动端控件
        if (this.isShowMobileControls) {
            this.mobileControls = new MobileControls(i => this.input.setInput(i));
            await this.mobileControls.init(opts.mobileControls);
        }

        // 建立 ENU 局部坐标系
        this.frame.setAnchor(this.initPos);

        // 初始化物理世界
        await this.physics.create(this.gravity);

        // 创建玩家胶囊：用临时 r/h 算实际尺寸，存入 capsuleInfo
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

        // 构建静态碰撞体
        if (opts.staticCollider) await this.physics.addStaticColliders(this.viewer, opts.staticCollider);
        // 初始化时注册动态碰撞体
        if (opts.kinematicCollider) {
            const list = Array.isArray(opts.kinematicCollider) ? opts.kinematicCollider : [opts.kinematicCollider];
            for (const d of list) await this.physics.addKinematicCollider(this.viewer, d);
        }

        // 加载玩家模型
        await this.loadPlayerModel();

        // 接管相机、绑定输入事件
        this.cam.takeOver();
        this.input.bindEvents();
        if (this.isFirstPerson) this.cam.setFirstPerson();
        else this.cam.setOverShoulder(this.enableOverShoulderView); // 第三人称应用初始越肩状态

        callback?.();
    }

    // ==================== 玩家模型 ====================

    private modelScale = 1; // 模型归一化系数（胶囊高度 / 模型包围盒高度）

    // 加载模型与动画
    private async loadPlayerModel(): Promise<Model> {
        // 先用 scale=1 加载，ready 后量包围盒算 modelScale，再设最终矩阵
        const modelMatrix = this.frame.composeModelMatrix(this.posEcef, this.yaw);
        const url = this.playerModelConfig.url;
        try {
            this.model = await Model.fromGltfAsync({
                url,
                modelMatrix,
                scene: this.viewer.scene,
            });
        } catch (e: any) {
            console.error("加载玩家模型失败:", e);
            throw e;
        }
        this.viewer.scene.primitives.add(this.model);
        await this.waitForModelReady(this.model); // 等待模型 ready 后再注册动画

        // 计算胶囊体尺寸：modelScale = 胶囊高度 / 模型包围盒高度
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch 模型失败: ${url} HTTP ${res.status}`);
        const glbBytes = await res.arrayBuffer();
        const size = await getGltfBboxSize(glbBytes, url);
        if (size.y > 0) this.modelScale = this.playerCapsuleHeight / size.y;

        // 挂载模型：最终缩放 = modelScale * s,并下移半个胶囊高让脚对齐胶囊底（lookAt 朝向）
        const s = this.playerModelConfig.scale;
        const fwdEN = { e: Math.sin(this.yaw), n: Math.cos(this.yaw) };
        this.frame.composeModelMatrixLookAt(this.posEcef, fwdEN, this.modelScale * s, this.model.modelMatrix, -this.capsuleInfo.height / 2, this.playerModelConfig.facingOffset ?? 0);

        this.animation.setup(this.model);
        return this.model;
    }

    // 等待模型 ready
    private waitForModelReady(model: Model): Promise<void> {
        if (model.ready) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const onReady = model.readyEvent.addEventListener(() => { onReady(); onErr(); resolve(); });
            const onErr = model.errorEvent.addEventListener((e: any) => { onReady(); onErr(); reject(e); });
        });
    }

    // ==================== 主循环 ====================

    // 主循环
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

    // 玩家帧更新
    private updatePlayer(delta: number) {
        // 计算移动方向
        const camYaw = this.getCameraYaw(); // 相机水平朝向（绕 Up）
        let dirE = 0, dirN = 0, dirU = 0;
        const i = this.input;
        // 按键移动方向（相对相机朝向）
        if (i.fwd) { dirE += Math.sin(camYaw); dirN += Math.cos(camYaw); }
        if (i.bkd) { dirE -= Math.sin(camYaw); dirN -= Math.cos(camYaw); }
        if (i.lft) { dirE -= Math.cos(camYaw); dirN += Math.sin(camYaw); }
        if (i.rgt) { dirE += Math.cos(camYaw); dirN -= Math.sin(camYaw); }

        if (this.isFlying) {
            this.curPlayerSpeed = i.shift ? this.playerFlySpeed * 2 : this.playerFlySpeed;
            // 飞行前进：沿相机视线向量（含俯仰），覆盖按键水平方向
            if (i.fwd) { const c = this.getCameraDirEnu(); dirE = c.e; dirN = c.n; dirU = c.u; }
            if (i.space) dirU += 1;
        } else {
            this.curPlayerSpeed = i.shift ? this.playerSpeed * 2 : this.playerSpeed;
        }

        // 根据当前速度动态调整相机弹簧时间（速度越快，相机跟得越紧）
        this.cam.updateSpringTimeBySpeed(this.curPlayerSpeed, this.playerSpeed);

        // 归一化方向向量（飞行按 3D 归一化以保留俯仰；地面只归一化水平）
        if (this.isFlying) {
            const len = Math.hypot(dirE, dirN, dirU);
            if (len > 0) { dirE /= len; dirN /= len; dirU /= len; }
        } else {
            const hLen = Math.hypot(dirE, dirN);
            if (hLen > 0) { dirE /= hLen; dirN /= hLen; }
        }

        // 速度驱动（XZ 作为整体 2D 向量限幅）
        const accelStep = this.playerAcceleration * this.decelBase * delta; // 加速步长
        const decelStep = this.playerDeceleration * this.decelBase * delta; // 减速步长
        const targetE = dirE * this.curPlayerSpeed; // 目标速度 E
        const targetN = dirN * this.curPlayerSpeed; // 目标速度 N
        const diffE = targetE - this.velE; // 速度差 E
        const diffN = targetN - this.velN; // 速度差 N
        const hasInput = dirE !== 0 || dirN !== 0;
        const diffLen = Math.hypot(diffE, diffN);
        if (diffLen > 0) {
            const applied = Math.min(diffLen, hasInput ? accelStep : decelStep);
            this.velE += (diffE / diffLen) * applied;
            this.velN += (diffN / diffLen) * applied;
        }

        // 跳跃
        if (!this.isFlying && this.pendingJump) { this.velU = this.jumpHeight; this.pendingJump = false; }

        if (this.isFlying) {
            // 飞行：竖直直接给速度
            const targetU = dirU * this.curPlayerSpeed;
            const dU = targetU - this.velU;
            this.velU += Math.sign(dU) * Math.min(Math.abs(dU), dirU !== 0 ? accelStep : decelStep);
        } else {
            // 地面检测
            const snapH = this.capsuleInfo.height / 2; // 胶囊中心静止离地高度
            const maxH = snapH * 1.2;                  // 1.2 倍容差带，吸收抖动
            const dist = this.physics.groundDistance(maxH * 4); // 胶囊中心到地面距离

            if (dist > maxH) {
                // 离地超出容差 → 加重力下落
                this.velU += this.gravity * delta;
                this.setOnGround(false);
            } else if (this.velU <= 0) {
                if (this.playerIsOnGround) {
                    // 已在地面：吸附跟随地形（本帧把中心移到 groundY + snapH）
                    this.velU = (snapH - dist) / delta;
                    this.setOnGround(true);
                } else {
                    // 从空中落下：本帧速度能到落点才吸附，否则继续下落
                    const predicted = dist + this.velU * delta;
                    if (predicted <= snapH) {
                        this.velU = (snapH - dist) / delta;
                        this.setOnGround(true);
                    } else {
                        this.velU += this.gravity * delta;
                        this.setOnGround(false);
                    }
                }
            } else {
                // velU > 0（跳跃上升中）：加重力，不在地面
                this.velU += this.gravity * delta;
                this.setOnGround(false);
            }
        }

        // 碰撞移动
        const desiredEnu = { e: this.velE * delta, n: this.velN * delta, u: this.velU * delta };
        this.physics.step();
        this.physics.moveCharacter(desiredEnu, this.posEcef);

        // 同步已绑定视觉的动态物体位姿，未 attach 的跳过
        for (const o of this.dynamicObjects) {
            if (o.visual) this.physics.getDynamicModelMatrix(o.body.body, o.visual.modelMatrix);
        }

        // 玩家朝向（对齐原库 setToward 后的朝向逻辑，按鼠标模式分支）。
        if (!this.isFirstPerson) {
            const moveYaw = Math.atan2(dirE, dirN); // 移动方向 yaw（atan2(E,N)）
            const mode = this.cam.mouseMode;
            const lerpT = Math.min(1, this.rotationSpeed * delta);
            let targetPitch = 0; // 默认不俯仰（地面/悬停）
            if (!this.isFlying) {
                if (mode === 4 || mode === 5) {
                    // mode 4/5：人物朝向始终与相机水平朝向一致（鼠标转向即驱动人物转向），硬设
                    this.yaw = camYaw;
                } else if (mode === 0 || mode === 2) {
                    // mode 0/2：有移动输入朝移动方向，否则朝相机方向，slerp
                    this.yaw = this.slerpAngle(this.yaw, hasInput ? moveYaw : camYaw, lerpT);
                } else if (hasInput) {
                    // 其他模式（默认 1）：仅有移动输入时朝移动方向
                    this.yaw = this.slerpAngle(this.yaw, moveYaw, lerpT);
                }
            } else {
                // 飞行：前进时朝移动方向，否则朝相机方向
                this.yaw = this.slerpAngle(this.yaw, this.input.fwd && hasInput ? moveYaw : camYaw, lerpT);
                // 前进时身体俯仰对齐 3D 移动方向（含上下），对齐 three 版 moveDirFlat（保留 Y）
                if (this.input.fwd) targetPitch = Math.asin(Math.max(-1, Math.min(1, dirU)));
            }
            this.pitch = this.slerpAngle(this.pitch, targetPitch, lerpT);
        }

        // 更新模型变换
        const cosP = Math.cos(this.pitch);
        const fwdEN = { e: Math.sin(this.yaw) * cosP, n: Math.cos(this.yaw) * cosP, u: Math.sin(this.pitch) };
        this.frame.composeModelMatrixLookAt(this.posEcef, fwdEN, this.modelScale * this.playerModelConfig.scale, this.model!.modelMatrix, -this.capsuleInfo.height / 2, this.playerModelConfig.facingOffset ?? 0);

        // 设置动画、更新混合器
        this.animation.setAnimationByPressed();
        this.animation.update(delta);
        // 更新相机
        this.cam.update(delta);

        // 刷新调试线框
        if (this.displayCollider) { this.updateCapsuleDebug(); this.updateDynamicDebug(); }
    }

    // ==================== 内部辅助 ====================
    // 相机水平朝向（绕本地 Up 的 yaw）
    private getCameraYaw(): number {
        const d = this.getCameraDirEnu();
        return Math.atan2(d.e, d.n); // atan2(E, N)
    }

    // 相机朝向在本地 ENU 下的单位向量 {e,n,u}（含俯仰，供飞行沿视线方向用）
    private getCameraDirEnu(): { e: number; n: number; u: number } {
        const dir = this.viewer.camera.directionWC;
        // 投影到本地 ENU 坐标系
        const enuInv = Matrix4.inverse(
            Transforms.eastNorthUpToFixedFrame(this.posEcef, undefined, new Matrix4()),
            new Matrix4(),
        );
        const local = Matrix4.multiplyByPointAsVector(enuInv, dir, new Cartesian3());
        const len = Math.hypot(local.x, local.y, local.z) || 1;
        return { e: local.x / len, n: local.y / len, u: local.z / len };
    }

    // 角度插值
    private slerpAngle(from: number, to: number, t: number): number {
        const d = CMath.negativePiToPi(to - from);
        return from + d * t;
    }

    // ==================== 内部辅助 ====================

    // 设置落地状态
    setOnGround(val: boolean) {
        if (this.playerIsOnGround === val) return;
        this.playerIsOnGround = val;
        this.onGroundChange?.(val);
        if (val) this.animation.onLand();
        else this.animation.onBecomeAirborne();
    }

    // ==================== 调试 ====================

    // 切换调试显示
    setDebug(debug: boolean) {
        this.displayCollider = debug;
        this.syncDebugVisibility();
    }

    // 同步 debug 可见性
    syncDebugVisibility() {
        if (!this.displayCollider) {
            this.removeDebugPrimitives();
            return;
        }
        // 静态碰撞体
        if (!this.debugStaticPrimitive && this.physics.world) {
            const ecef = this.physics.buildStaticDebugLinesEcef();
            this.debugStaticPrimitive = this.makeLinePrimitive(ecef, Color.fromCssColorString("#4a90d9"));
            if (this.debugStaticPrimitive) this.viewer.scene.primitives.add(this.debugStaticPrimitive);
        }
        this.updateCapsuleDebug();
        this.updateDynamicDebug();
    }

    // 动态物体碰撞线框：几何只建一次（本体局部空间），每帧由物理位姿驱动 modelMatrix。
    private updateDynamicDebug() {
        if (!this.displayCollider || !this.physics.world) return;
        for (const o of this.dynamicObjects) {
            if (!o.debugPrimitive) {
                const local = this.physics.buildDynamicDebugLocal(o.body);
                o.debugPrimitive = this.makeLinePrimitive(local, Color.WHITE);
                if (o.debugPrimitive) this.viewer.scene.primitives.add(o.debugPrimitive);
            }
            if (o.debugPrimitive) this.physics.getDynamicModelMatrix(o.body.body, o.debugPrimitive.modelMatrix);
        }
    }

    // 移除某个动态物体的 debug 线框
    private removeDynamicDebug(o: DynamicObject) {
        if (o.debugPrimitive) {
            this.viewer.scene.primitives.remove(o.debugPrimitive);
            o.debugPrimitive = null;
        }
    }

    // 胶囊线框:几何只建一次(ENU 局部空间),每帧只更新 modelMatrix 跟随角色(不重建、不重传 GPU)
    private updateCapsuleDebug() {
        if (!this.displayCollider || !this.physics.world) return;
        if (!this.debugCapsulePrimitive) {
            const local = this.physics.buildCapsuleDebugLocal();
            this.debugCapsulePrimitive = this.makeLinePrimitive(local, Color.YELLOW);
            if (this.debugCapsulePrimitive) this.viewer.scene.primitives.add(this.debugCapsulePrimitive);
        }
        if (this.debugCapsulePrimitive) {
            this.physics.getCapsuleModelMatrix(this.debugCapsulePrimitive.modelMatrix);
        }
    }

    // 移除全部调试图元
    private removeDebugPrimitives() {
        for (const key of ["debugStaticPrimitive", "debugCapsulePrimitive"] as const) {
            if (this[key]) {
                this.viewer.scene.primitives.remove(this[key]);
                this[key] = null;
            }
        }
        // 动态物体各自的碰撞线框
        for (const o of this.dynamicObjects) this.removeDynamicDebug(o);
    }

    // 由扁平 ECEF 顶点(线表)构建一个线段图元;包围盒直接用 typed array 计算(不再 Array.from)
    private makeLinePrimitive(ecef: Float64Array, color: Color): Primitive | null {
        if (ecef.length < 6) return null;
        return new Primitive({
            geometryInstances: new GeometryInstance({
                geometry: new GeometryClass({
                    attributes: {
                        position: new GeometryAttribute({
                            componentDatatype: ComponentDatatype.DOUBLE,
                            componentsPerAttribute: 3,
                            values: ecef,
                        }),
                    } as any,
                    primitiveType: PrimitiveType.LINES,
                    boundingSphere: BoundingSphere.fromVertices(ecef as any),
                }),
                attributes: {
                    color: ColorGeometryInstanceAttribute.fromColor(color),
                },
            }),
            appearance: new PerInstanceColorAppearance({ flat: true, translucent: false }),
            asynchronous: false,
        });
    }

    // 请求一次跳跃（供输入系统调用）
    requestJump() { this.pendingJump = true; }
    // 清零速度（进入飞行时调用）
    resetVelocity() { this.velE = this.velN = this.velU = 0; }
    // 鼠标驱动玩家朝向（第一人称，供相机系统调用）
    addYaw(d: number) { this.yaw = CMath.negativePiToPi(this.yaw + d); }
    // 获取玩家朝向
    getYaw() { return this.yaw; }

    // 第一人称相机位置：胶囊顶部 + offset
    // offset 在玩家朝向系（x=右、y=前、z=上），随 yaw 转动，乘 scale
    getHeadWorldPosition(offset?: [number, number, number]): Cartesian3 {
        const base = Cartesian3.add(
            this.posEcef,
            Cartesian3.multiplyByScalar(
                Cartesian3.normalize(this.posEcef, new Cartesian3()),
                this.capsuleInfo.height * 0.5,
                new Cartesian3(),
            ),
            new Cartesian3(),
        );
        const s = this.playerModelConfig.scale;
        const [x, y, z] = offset ?? [0, 0, 0];
        // ENU 绕 Up 旋转 -yaw，使 +y 对齐玩家朝向 (sin yaw, cos yaw)、+x 为其右侧
        const enu = Transforms.eastNorthUpToFixedFrame(base, undefined, new Matrix4());
        const heading = Matrix4.multiplyByMatrix3(enu, Matrix3.fromRotationZ(-this.yaw, new Matrix3()), new Matrix4());
        return Matrix4.multiplyByPoint(heading, new Cartesian3(x * s, y * s, z * s), new Cartesian3());
    }

    // 动态修改缩放
    setPlayerScale(newScale: number) {
        if (newScale <= 0) return;
        const ratio = newScale / this.playerModelConfig.scale;
        this.playerModelConfig.scale = newScale;

        // 更新比例相关参数
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
        // 重建角色胶囊 collider 尺寸
        const cr = this.capsuleInfo.radius;
        const ch = this.capsuleInfo.height;
        this.physics.updateCharacterShape({
            radius: cr,
            halfHeight: Math.max(0.01, (ch - 2 * cr) / 2),
        });
        // 重建胶囊体 debug
        this.rebuildCapsuleDebug();
    }

    // 重建胶囊体 debug
    private rebuildCapsuleDebug() {
        if (this.debugCapsulePrimitive) {
            this.viewer.scene.primitives.remove(this.debugCapsulePrimitive);
            this.debugCapsulePrimitive = null;
        }
        if (this.displayCollider) this.updateCapsuleDebug();
    }

    // 切换玩家模型
    async switchPlayerModel(newPlayerModel: PlayerModelOptions) {
        // 保存当前状态
        const savedPos = Cartesian3.clone(this.posEcef, new Cartesian3());
        const savedYaw = this.yaw;
        const wasFirstPerson = this.isFirstPerson;

        // 移除旧模型
        if (this.model) {
            this.viewer.scene.primitives.remove(this.model);
            this.model = null;
        }
        // 清除旧动画资源
        this.animation.reset();

        // 更新比例相关参数
        const ratio = newPlayerModel.scale / this.playerModelConfig.scale;
        this.playerModelConfig = { ...this.playerModelConfig, ...newPlayerModel };
        this.gravity *= ratio;
        this.jumpHeight *= ratio;
        this.playerSpeed *= ratio;
        this.playerFlySpeed *= ratio;
        this.curPlayerSpeed *= ratio;
        this.cam.epsilon *= ratio;
        this.cam.minDist *= ratio;
        this.cam.maxDist *= ratio;
        this.cam.originMaxDist *= ratio;

        await this.loadPlayerModel(); // 重新加载（会重算 modelScale）

        // 恢复位置、朝向、视角
        Cartesian3.clone(savedPos, this.posEcef);
        this.yaw = savedYaw;
        this.physics.teleportCharacter(this.posEcef);
        if (wasFirstPerson) this.cam.setFirstPerson();
        this.setDebug(this.displayCollider);
    }

    // ==================== API ====================

    // 获取当前位置
    getPosition(out = new Cartesian3()): Cartesian3 { return Cartesian3.clone(this.posEcef, out); }
    // 获取第一人称状态
    getIsFirstPerson() { return this.isFirstPerson; }
    // 获取飞行状态
    getIsFlying() { return this.isFlying; }
    // 获取落地状态
    getIsOnGround() { return this.playerIsOnGround; }
    // 获取本帧实际使用的 delta（已钳制 + timeScale）
    getCurrentDelta() { return this.currentDelta; }
    // 获取玩家模型
    getPlayerModel() { return this.model; }
    // 获取速度
    getVelocity() { return { e: this.velE, n: this.velN, u: this.velU }; }
    // 获取胶囊体（实际尺寸）
    getPlayerCapsule() { return this.capsuleInfo; }
    // 获取当前站立的运动学碰撞体
    getActiveKinematicCollider() { return this.physics.activeKinematicSource; }
    // 获取碰撞体
    getCollider() { return this.physics.charCollider ?? null; }

    // ==================== 动态物体 ====================

    // 添加一个受物理模拟、可被角色推动的动态物体
    addDynamicObject(positionEcef: Cartesian3, shape: DynamicShape, opts?: DynamicBodyOpts): DynamicObject {
        const body = this.physics.createDynamicBody(positionEcef, shape, opts);
        return this.registerDynamicObject(body);
    }

    // 移除一个动态物体
    removeDynamicObject(obj: DynamicObject) {
        const i = this.dynamicObjects.indexOf(obj);
        if (i >= 0) this.dynamicObjects.splice(i, 1);
        this.physics.removeDynamicObject(obj.body);
        this.removeDynamicDebug(obj);
        obj.detachVisual();
    }

    // 清除所有动态物体
    clearDynamicObjects() {
        for (const o of this.dynamicObjects) {
            this.physics.removeDynamicObject(o.body);
            this.removeDynamicDebug(o);
            o.detachVisual();
        }
        this.dynamicObjects = [];
    }

    // 建句柄并登记进每帧同步列表
    private registerDynamicObject(body: DynamicBody): DynamicObject {
        const obj = new DynamicObject(body, this.physics);
        this.dynamicObjects.push(obj);
        return obj;
    }

    // 注册运动学碰撞体
    async addKinematicCollider(collider: import("./types").ColliderSource, source?: object) {
        const body = await this.physics.addKinematicCollider(this.viewer, collider);
        if (body && source) this.physics.kinematicBySource.set(source, body);
        return body;
    }
    // 注销运动学碰撞体
    removeKinematicCollider(source: object) { this.physics.removeKinematicCollider(source); }
    // 清除所有运动学碰撞体
    clearKinematicColliders() { this.physics.clearKinematicColliders(); }

    // --- 玩家参数 ---
    // 设置鼠标灵敏度
    setMouseSensitivity(v: number) { this.cam.sensitivity = v; }
    // 设置重力
    setGravity(g: number) { this.gravity = g * this.playerModelConfig.scale; this.physics.setGravity(this.gravity); }
    // 设置跳跃高度
    setJumpHeight(j: number) { this.jumpHeight = j * this.playerModelConfig.scale; }
    // 设置行走速度
    setPlayerSpeed(sp: number) { this.playerSpeed = sp * this.playerModelConfig.scale; this.curPlayerSpeed = this.playerSpeed; }
    // 设置飞行速度
    setPlayerFlySpeed(f: number) { this.playerFlySpeed = f * this.playerModelConfig.scale; }
    // 设置加速惯性（值越大加速越快）
    setAcceleration(a: number) { this.playerAcceleration = a; }
    // 设置减速惯性（值越大松手后停得越快）
    setDeceleration(d: number) { this.playerDeceleration = d; }
    // 设置朝向开关
    setEnableToward(v: boolean) { this.enableToward = v; }

    // --- 相机参数 ---
    // 设置相机最近距
    setMinCamDistance(d: number) { this.cam.minDist = d * this.playerModelConfig.scale; }
    // 设置相机最远距
    setMaxCamDistance(d: number) { this.cam.maxDist = d * this.playerModelConfig.scale; this.cam.originMaxDist = this.cam.maxDist; }
    // 设置相机看向点高度比例
    setCamLookAtHeightRatio(r: number) { this.cam.lookAtHeightRatio = r; }
    // 设置鼠标模式
    setThirdMouseMode(mode: 0 | 1 | 2 | 3 | 4 | 5) { this.cam.mouseMode = mode; this.cam.setPointerLock(); }
    // 设置缩放开关
    setEnableZoom(e: boolean) { this.cam.zoomEnabled = e; this.viewer.scene.screenSpaceCameraController.enableZoom = false; }

    // --- 相机 ---
    // 切换视角模式
    changeView() { this.cam.changeView(); }
    // 设置第一人称
    setFirstPersonCamera(v = 0) { this.cam.setFirstPerson(v); }
    // 设置越肩视角
    setOverShoulderView(v: boolean) { this.enableOverShoulderView = v; this.cam.setOverShoulder(v); }
    // 屏幕中心检测
    getCenterScreenRaycastHit() { return this.cam.getCenterHit(); }

    // --- 动画 ---
    // 按名播放动画
    playPlayerAnimationByName(name: string) { this.animation.playByName(name); }
    // 获取当前动画名
    getCurrentPlayerAnimationName() { return this.animation.getCurrentName(); }
    // 注册自定义动画
    registerAnimation(key: string, clipName: string, opts?: Parameters<AnimationSystem["register"]>[2]) { this.animation.register(key, clipName, opts); }
    // 播放已注册动画
    playAnimation(key: string, opts?: Parameters<AnimationSystem["play"]>[1]) { this.animation.play(key, opts); }
    // 注册移动动作组
    registerLocomotionSet(setName: string, map: Parameters<AnimationSystem["registerLocomotionSet"]>[1]) { this.animation.registerLocomotionSet(setName, map); }
    // 切换移动动作组
    switchLocomotionSet(setName: string) { this.animation.switchLocomotionSet(setName); }
    // 获取当前移动动作组名
    getCurrentLocomotionSet() { return this.animation.currentLocomotionSet; }

    // --- 输入 ---
    // 设置输入状态
    setInput(input: Parameters<InputSystem["setInput"]>[0]) { this.input.setInput(input); }
    // 运行时自定义键位
    setKeyMap(map?: KeyMap) { this.input.buildKeyMap(map); }
    // 绑定输入事件
    onAllEvent() { this.input.bindEvents(); }
    // 解绑输入事件
    offAllEvent() { this.input.unbindEvents(); }

    // 重置玩家位置
    reset(position?: Cartesian3) {
        this.velE = this.velN = this.velU = 0;
        Cartesian3.clone(position ?? this.initPos, this.posEcef);
        this.physics.teleportCharacter(this.posEcef);
    }

    // --- 销毁 ---
    destroy() {
        this.input.unbindEvents();

        // 销毁移动端控件
        this.mobileControls?.destroy();
        this.mobileControls = null;

        // 清除玩家对象
        if (this.model) { this.viewer.scene.primitives.remove(this.model); this.model = null; }
        this.clearDynamicObjects();
        this.physics.destroy();

        // 恢复 Cesium 默认相机交互
        const sscc = this.viewer.scene.screenSpaceCameraController;
        sscc.enableRotate = true; sscc.enableTranslate = true; sscc.enableZoom = true;
        sscc.enableTilt = true; sscc.enableLook = true;
    }
}
