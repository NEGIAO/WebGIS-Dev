/**
 * 玩家物理调试几何（纯函数）
 *
 * 从 PhysicsSystem 拆出：只把 Rapier 侧数据（静态三角网 / 胶囊参数 / 动态刚体形状）
 * 转成 line-list 顶点数组，不持有任何物理状态，便于单独单测与复用。
 */
import type RAPIER from "@dimforge/rapier3d-compat";
import { Cartesian3, Matrix3, Quaternion } from "cesium";
import { LocalFrame } from "../utils/frame";
import type { DynamicObject, CharacterShapeDesc } from "./PhysicsSystem";

// 仅静态碰撞体(地形/glTF 解析出的三角网)的调试线段 → ECEF。
// 注意：collider 的顶点存于其自身局部空间，需叠加 collider 的平移/旋转（rebase 后不再为单位变换），
// 有父级时还要叠加父级变换，否则重锚后线框会错位。
export function buildStaticDebugLinesEcef(frame: LocalFrame, colliders: RAPIER.Collider[]): Float64Array {
    const meshes: { v: Float32Array; i: Uint32Array; rotation: Matrix3; translation: Cartesian3 }[] = [];
    let triCount = 0;
    for (const col of colliders) {
        // trimesh 顶点/索引在 shape 上
        const shape = col.shape as { vertices?: Float32Array; indices?: Uint32Array };
        const v = shape.vertices, i = shape.indices;
        if (!v || !i || v.length === 0 || i.length === 0) continue;
        const q = col.rotation();
        const t = col.translation();
        let worldRotation = new Quaternion(q.x, q.y, q.z, q.w);
        const worldTranslation = new Cartesian3(t.x, t.y, t.z);
        const parent = col.parent();
        if (parent) {
            const parentQ = parent.rotation();
            const parentT = parent.translation();
            const parentRotation = new Quaternion(parentQ.x, parentQ.y, parentQ.z, parentQ.w);
            Matrix3.multiplyByVector(
                Matrix3.fromQuaternion(parentRotation, new Matrix3()),
                worldTranslation,
                worldTranslation,
            );
            worldTranslation.x += parentT.x;
            worldTranslation.y += parentT.y;
            worldTranslation.z += parentT.z;
            worldRotation = Quaternion.multiply(parentRotation, worldRotation, worldRotation);
        }
        meshes.push({
            v,
            i,
            rotation: Matrix3.fromQuaternion(worldRotation, new Matrix3()),
            translation: worldTranslation,
        });
        triCount += i.length / 3;
    }
    const out = new Float64Array(triCount * 18); // 每三角 3 边 × 2 点 × 3 坐标
    const c = new Cartesian3();
    const local = new Cartesian3();
    const world = new Cartesian3();
    let o = 0;
    const emit = (mesh: typeof meshes[number], a: number) => {
        Cartesian3.fromElements(mesh.v[a], mesh.v[a + 1], mesh.v[a + 2], local);
        Matrix3.multiplyByVector(mesh.rotation, local, world);
        Cartesian3.add(world, mesh.translation, world);
        frame.rapierToEcef(world.x, world.y, world.z, c);
        out[o++] = c.x; out[o++] = c.y; out[o++] = c.z;
    };
    for (const mesh of meshes) {
        const { i } = mesh;
        for (let t = 0; t < i.length; t += 3) {
            const a = i[t] * 3, b = i[t + 1] * 3, d = i[t + 2] * 3;
            emit(mesh, a); emit(mesh, b); // 边 AB
            emit(mesh, b); emit(mesh, d); // 边 BC
            emit(mesh, d); emit(mesh, a); // 边 CA
        }
    }
    return out;
}

// 玩家胶囊调试线框(ENU 局部空间,只建一次):2 个水平环 + 2 个竖直轮廓环,摆放由 modelMatrix 负责。
export function buildCapsuleDebugLocal(shape: CharacterShapeDesc | undefined, seg = 24): Float64Array {
    if (!shape) return new Float64Array(0);
    const r = shape.radius, hh = shape.halfHeight;
    const pts: number[] = []; // ENU 局部坐标:x=E, y=N, z=U(胶囊轴沿 z)
    const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
        pts.push(x1, y1, z1, x2, y2, z2);

    // 2 个水平环(z = ±halfHeight,在 E-N 平面)
    for (const lvl of [hh, -hh]) {
        for (let k = 0; k < seg; k++) {
            const a1 = (k / seg) * 2 * Math.PI, a2 = ((k + 1) / seg) * 2 * Math.PI;
            line(
                r * Math.cos(a1), r * Math.sin(a1), lvl,
                r * Math.cos(a2), r * Math.sin(a2), lvl,
            );
        }
    }
    // 2 个竖直轮廓环(在含 z 轴的平面,phi = 0 与 90°),stadium 参数:上/下半球用 ±hh 偏移
    for (const phi of [0, Math.PI / 2]) {
        const dx = Math.cos(phi), dy = Math.sin(phi);
        let ph = r, pv = hh; // a = 0 起点
        for (let k = 1; k <= seg; k++) {
            const a = (k / seg) * 2 * Math.PI;
            const h = r * Math.cos(a);
            const v = (Math.sin(a) >= 0 ? hh : -hh) + r * Math.sin(a);
            line(ph * dx, ph * dy, pv, h * dx, h * dy, v);
            ph = h; pv = v;
        }
    }
    return new Float64Array(pts);
}

// 动态物体碰撞形状的调试线框（本体局部 ENU 空间，x=E/y=N/z=U）
export function buildDynamicDebugLocal(obj: DynamicObject, seg = 20): Float64Array {
    const pts: number[] = [];
    const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) =>
        pts.push(x1, y1, z1, x2, y2, z2);
    // 三个轴向圆环（半径环），用于球/圆柱/圆锥/胶囊轮廓
    const ring = (r: number, axis: 0 | 1 | 2, off = 0) => {
        for (let k = 0; k < seg; k++) {
            const a1 = (k / seg) * 2 * Math.PI, a2 = ((k + 1) / seg) * 2 * Math.PI;
            const c1 = r * Math.cos(a1), s1 = r * Math.sin(a1);
            const c2 = r * Math.cos(a2), s2 = r * Math.sin(a2);
            if (axis === 2) line(c1, s1, off, c2, s2, off);       // E-N 平面（绕 Up）
            else if (axis === 0) line(off, c1, s1, off, c2, s2);  // N-U 平面（绕 E）
            else line(c1, off, s1, c2, off, s2);                  // E-U 平面（绕 N）
        }
    };
    const s = obj.shape;
    switch (s.kind) {
        case "ball": {
            const r = s.radius;
            ring(r, 2, 0); ring(r, 0, 0); ring(r, 1, 0); // 三个正交大圆
            break;
        }
        case "box": {
            // 12 条棱：half 三轴半边长（ENU）
            const { e, n, u } = s.half;
            const C: [number, number, number][] = [];
            for (const sx of [-e, e]) for (const sy of [-n, n]) for (const sz of [-u, u]) C.push([sx, sy, sz]);
            const edge = (a: number, b: number) => line(C[a][0], C[a][1], C[a][2], C[b][0], C[b][1], C[b][2]);
            // 顶点序：索引按 (sx,sy,sz) 二进制；连接相差一位的为棱
            for (let i = 0; i < 8; i++) for (let bit = 0; bit < 3; bit++) {
                const j = i ^ (1 << bit);
                if (i < j) edge(i, j);
            }
            break;
        }
        case "cylinder": {
            const hh = s.halfHeight, r = s.radius;
            ring(r, 2, hh); ring(r, 2, -hh); // 上下两个圆（轴沿 U）
            for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) line(dx, dy, hh, dx, dy, -hh); // 4 条母线
            break;
        }
        case "cone": {
            const hh = s.halfHeight, r = s.radius;
            ring(r, 2, -hh); // 底圆（轴沿 U，尖朝 +U）
            for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) line(dx, dy, -hh, 0, 0, hh); // 4 条到尖的棱
            break;
        }
    }
    return new Float64Array(pts);
}
