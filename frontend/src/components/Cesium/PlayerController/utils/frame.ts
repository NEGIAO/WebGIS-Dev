import { Cartesian3, Math as CMath, Matrix3, Matrix4, Transforms } from "cesium";

// 坐标映射层:以固定锚点建 ENU 局部系
export class LocalFrame {
    // 锚点（ECEF）
    anchor = new Cartesian3();
    // ENU→ECEF 4x4（列主序 by Cesium）
    enuToEcef = new Matrix4();
    // ECEF→ENU 4x4
    ecefToEnu = new Matrix4();

    // 复用临时对象,避免每帧分配
    private _scratchM4 = new Matrix4();
    private _scratchC3 = new Cartesian3();

    // composeModelMatrixLookAt 专用 scratch 对象（GC 优化）
    private _fwd = new Cartesian3();
    private _right = new Cartesian3();
    private _up = new Cartesian3();
    private _worldUp = new Cartesian3(0, 0, 1);
    private _northAxis = new Cartesian3(0, 1, 0);
    private _offset = new Cartesian3();
    private _rotLocal = new Matrix3();
    private _rz = new Matrix3();
    private _rot4 = new Matrix4();

    constructor(anchor?: Cartesian3) {
        if (anchor) this.setAnchor(anchor);
    }

    // 设置局部系原点为某 ECEF 点（init 时调用一次）
    setAnchor(anchorEcef: Cartesian3) {
        Cartesian3.clone(anchorEcef, this.anchor);
        Transforms.eastNorthUpToFixedFrame(this.anchor, undefined, this.enuToEcef);
        Matrix4.inverse(this.enuToEcef, this.ecefToEnu);
    }

    // ---------- ECEF <-> ENU ----------

    // ECEF 点 → ENU 局部坐标（Z-up）
    ecefToLocal(ecef: Cartesian3, out = new Cartesian3()): Cartesian3 {
        return Matrix4.multiplyByPoint(this.ecefToEnu, ecef, out);
    }

    // ENU 局部坐标（Z-up）→ ECEF 点
    localToEcef(local: Cartesian3, out = new Cartesian3()): Cartesian3 {
        return Matrix4.multiplyByPoint(this.enuToEcef, local, out);
    }

    // ECEF 方向向量 → ENU 向量（只旋转不平移）
    ecefVectorToEnu(ecefVec: Cartesian3, out = new Cartesian3()): Cartesian3 {
        return Matrix4.multiplyByPointAsVector(this.ecefToEnu, ecefVec, out);
    }

    // ENU 方向向量 → ECEF 向量（只旋转不平移）
    enuVectorToEcef(enuVec: Cartesian3, out = new Cartesian3()): Cartesian3 {
        return Matrix4.multiplyByPointAsVector(this.enuToEcef, enuVec, out);
    }

    // ---------- ENU(Z-up) <-> Rapier(Y-up) ----------

    // ENU（Z-up）→ Rapier（Y-up）,返回 {x,y,z} 普通对象供 Rapier 用
    static enuToRapier(e: number, n: number, u: number): { x: number; y: number; z: number } {
        return { x: e, y: u, z: -n };
    }

    // Rapier（Y-up）→ ENU（Z-up） Cartesian3
    static rapierToEnu(x: number, y: number, z: number, out = new Cartesian3()): Cartesian3 {
        out.x = x; // E
        out.y = -z; // N
        out.z = y; // U
        return out;
    }

    // ---------- ECEF <-> Rapier ----------

    // ECEF 点 → Rapier 坐标
    ecefToRapier(ecef: Cartesian3): { x: number; y: number; z: number } {
        const local = this.ecefToLocal(ecef, this._scratchC3);
        return LocalFrame.enuToRapier(local.x, local.y, local.z);
    }

    // Rapier 坐标 → ECEF 点
    rapierToEcef(x: number, y: number, z: number, out = new Cartesian3()): Cartesian3 {
        const local = LocalFrame.rapierToEnu(x, y, z, this._scratchC3);
        return this.localToEcef(local, out);
    }

    // ---------- 姿态:把玩家在 ENU 平面的朝向角转成 ECEF modelMatrix ----------

    // 给定 yaw（绕 Up 轴,弧度,0=朝北）和 ECEF 位置,生成只含朝向的 modelMatrix
    composeModelMatrix(positionEcef: Cartesian3, yaw: number, out = new Matrix4()): Matrix4 {
        // 在该点取 ENU 朝向基
        Transforms.eastNorthUpToFixedFrame(positionEcef, undefined, this._scratchM4);
        // 绕本地 Up（ENU 的 Z）旋转 yaw
        const rotZ = Matrix3.fromRotationZ(yaw, new Matrix3());
        const rot4 = Matrix4.fromRotationTranslation(rotZ, Cartesian3.ZERO, new Matrix4());
        Matrix4.multiply(this._scratchM4, rot4, out);
        return out;
    }

    // 按位置 + 朝向生成模型变换矩阵（使用 scratch 对象避免 GC）
    composeModelMatrixLookAt(
        positionEcef: Cartesian3,
        fwdEN: { e: number; n: number; u?: number },
        scale: number,
        out = new Matrix4(),
        verticalOffset = 0,
        facingOffset = 0,
    ): Matrix4 {
        // pivot 固定在胶囊中心,取该点 ENU 基（列：E, N, U）
        Transforms.eastNorthUpToFixedFrame(positionEcef, undefined, this._scratchM4);

        // 用朝向向量正交化出 right/up,构造朝向旋转基（复用 scratch 对象）
        const fwd = this._fwd;
        fwd.x = fwdEN.e; fwd.y = fwdEN.n; fwd.z = fwdEN.u ?? 0;
        Cartesian3.normalize(fwd, fwd);
        let right = Cartesian3.cross(fwd, this._worldUp, this._right);
        if (Cartesian3.magnitude(right) < 1e-6) {
            // 朝向近乎竖直时 fwd×up 退化,改用 North 轴求稳定的 right
            right = Cartesian3.cross(fwd, this._northAxis, this._right);
        }
        Cartesian3.normalize(right, right);
        const up = Cartesian3.cross(right, fwd, this._up);
        Cartesian3.normalize(up, up);
        // Matrix3 行主序参数；列 = [right, fwd, up]（使用 fromArray 构造避免索引赋值）
        let rotLocal = Matrix3.fromArray([
            right.x, fwd.x, up.x,
            right.y, fwd.y, up.y,
            right.z, fwd.z, up.z,
        ], 0, this._rotLocal);
        // facingOffset：绕本体 Up（+Z 列）后乘,校正模型正面轴差异（不改变 up 方向）
        if (facingOffset !== 0) {
            Matrix3.fromRotationZ(facingOffset, this._rz);
            rotLocal = Matrix3.multiply(rotLocal, this._rz, rotLocal);
        }
        // 竖直补偿沿本体 up 平移（世界米,不受 scale 影响）,折进 rot4
        Cartesian3.multiplyByScalar(up, verticalOffset, this._offset);
        const rot4 = Matrix4.fromRotationTranslation(rotLocal, this._offset, this._rot4);
        Matrix4.multiply(this._scratchM4, rot4, out);
        Matrix4.multiplyByUniformScale(out, scale, out); // 只缩旋转列,不动平移
        return out;
    }

    // 工具:经纬度（度）+ 高（米）→ ECEF
    static fromDegrees(lon: number, lat: number, height = 0): Cartesian3 {
        return Cartesian3.fromDegrees(lon, lat, height);
    }

    // 工具:把 yaw 角规范到 [-π, π]
    static wrapAngle(a: number): number {
        return CMath.negativePiToPi(a);
    }
}
