import type { Matrix4 } from "cesium";
import type { DynamicObject as DynamicBody, PhysicsSystem as PhysicsSystemType } from "./systems/PhysicsSystem";

// 可被库每帧同步位姿的视觉对象：任何含可写 modelMatrix 的对象
export interface DynamicVisual {
    modelMatrix: Matrix4;
}

// 动态物体句柄
export class DynamicObject {
    // 物理刚体句柄（body + collider）
    body: DynamicBody;
    // 已绑定的视觉对象
    visual: DynamicVisual | null = null;
    // debug 碰撞线框图元
    debugPrimitive: any = null;
    private physics: PhysicsSystemType;

    constructor(body: DynamicBody, physics: PhysicsSystemType) {
        this.body = body;
        this.physics = physics;
    }

    // 绑定一个视觉对象，之后库每帧自动同步其 modelMatrix
    attachVisual(visual: DynamicVisual): this {
        this.visual = visual;
        this.physics.getDynamicModelMatrix(this.body.body, visual.modelMatrix);
        return this;
    }

    // 解绑视觉（不销毁视觉，仅停止同步）
    detachVisual(): this {
        this.visual = null;
        return this;
    }
}
