import {
    BoundingSphere, Color, ColorGeometryInstanceAttribute, ComponentDatatype,
    Geometry as GeometryClass, GeometryAttribute, GeometryInstance,
    PerInstanceColorAppearance, Primitive, PrimitiveType,
} from "cesium";
import type { Viewer } from "cesium";

import type { DynamicObject } from "../dynamicObject";
import type { PhysicsSystem } from "./PhysicsSystem";

/** 调试线框所需的外部上下文（由 playerController 提供） */
export interface DebugColliderContext {
    getViewer(): Viewer;
    getPhysics(): PhysicsSystem;
    getDynamicObjects(): DynamicObject[];
}

/**
 * 碰撞体线框可视化：静态碰撞体（地形/glTF）、玩家胶囊、动态物体各一份。
 * 几何只建一次（ENU 局部空间），每帧仅由物理位姿驱动 modelMatrix，不重建、不重传 GPU。
 */
export class DebugColliderSystem {


    private ctx: DebugColliderContext;
    private enabled = false;
    private staticPrimitive: Primitive | null = null;
    private capsulePrimitive: Primitive | null = null;

    constructor(ctx: DebugColliderContext) {
        this.ctx = ctx;
    }

    /** 当前是否开启线框显示 */
    get isEnabled(): boolean {
        return this.enabled;
    }

    // 切换调试显示
    setEnabled(debug: boolean) {
        this.enabled = debug;
        this.syncVisibility();
    }

    // 同步 debug 可见性
    syncVisibility() {
        if (!this.enabled) {
            this.removeAll();
            return;
        }
        const viewer = this.ctx.getViewer();
        const physics = this.ctx.getPhysics();
        // 静态碰撞体
        if (!this.staticPrimitive && physics.world) {
            const ecef = physics.buildStaticDebugLinesEcef();
            this.staticPrimitive = this.makeLinePrimitive(ecef, Color.fromCssColorString("#4a90d9"));
            if (this.staticPrimitive) viewer.scene.primitives.add(this.staticPrimitive);
        }
        this.updateCapsuleDebug();
        this.updateDynamicDebug();
    }

    // 动态物体碰撞线框：几何只建一次（本体局部空间），每帧由物理位姿驱动 modelMatrix。
    updateDynamicDebug() {
        const viewer = this.ctx.getViewer();
        const physics = this.ctx.getPhysics();
        if (!this.enabled || !physics.world) return;
        for (const o of this.ctx.getDynamicObjects()) {
            if (!o.debugPrimitive) {
                const local = physics.buildDynamicDebugLocal(o.body);
                o.debugPrimitive = this.makeLinePrimitive(local, Color.WHITE);
                if (o.debugPrimitive) viewer.scene.primitives.add(o.debugPrimitive);
            }
            if (o.debugPrimitive) physics.getDynamicModelMatrix(o.body.body, o.debugPrimitive.modelMatrix);
        }
    }

    // 移除某个动态物体的 debug 线框
    removeDynamicObject(o: DynamicObject) {
        if (o.debugPrimitive) {
            this.ctx.getViewer().scene.primitives.remove(o.debugPrimitive);
            o.debugPrimitive = null;
        }
    }

    // 胶囊线框：几何只建一次（ENU 局部空间），每帧只更新 modelMatrix 跟随角色
    updateCapsuleDebug() {
        const viewer = this.ctx.getViewer();
        const physics = this.ctx.getPhysics();
        if (!this.enabled || !physics.world) return;
        if (!this.capsulePrimitive) {
            const local = physics.buildCapsuleDebugLocal();
            this.capsulePrimitive = this.makeLinePrimitive(local, Color.YELLOW);
            if (this.capsulePrimitive) viewer.scene.primitives.add(this.capsulePrimitive);
        }
        if (this.capsulePrimitive) {
            physics.getCapsuleModelMatrix(this.capsulePrimitive.modelMatrix);
        }
    }

    // 胶囊尺寸变化后重建线框（旧几何按旧半径/高度生成，必须丢弃）
    rebuildCapsule() {
        if (this.capsulePrimitive) {
            this.ctx.getViewer().scene.primitives.remove(this.capsulePrimitive);
            this.capsulePrimitive = null;
        }
        if (this.enabled) this.updateCapsuleDebug();
    }

    // 移除全部调试图元
    removeAll() {
        const viewer = this.ctx.getViewer();
        for (const primitive of [this.staticPrimitive, this.capsulePrimitive]) {
            if (primitive) viewer.scene.primitives.remove(primitive);
        }
        this.staticPrimitive = null;
        this.capsulePrimitive = null;
        // 动态物体各自的碰撞线框
        for (const o of this.ctx.getDynamicObjects()) this.removeDynamicObject(o);
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
}
