/**
 * 功能名称：云影 BSM 数学工具（正交相机/矩阵求逆/测地偏移/级联插值）
 * 日    期：2026/11/13
 *
 * 从 CloudShadowPass 拆出：与渲染状态解耦的纯数学函数；
 * Cesium 命名空间与 viewer 由调用方注入。
 */
import { getCesium } from "./getCesium";

const Cesium = getCesium();

/**
 * Bruneton bottom 球(bottomRadius) 与 WGS84 椭球的球心偏移（ECEF 向量）。
 * 算法与 ThreeGeospatialPipeline._getAltitudeCorrectionOffset 一致：
 *   center = surfacePoint - normal * bottomRadius；correction = -center
 * 用于把 ECEF 射线起点对齐到 shader 中 u_bottomRadius 球的坐标系。
 * 返回 [x,y,z] 数组（与 set3f 配合）。
 */
export function getAltitudeCorrectionOffset(viewer: any, bottomRadius: number): [number, number, number] {
    const ellipsoid = viewer?.scene?.globe?.ellipsoid;
    const cameraPos = viewer?.camera?.positionWC;
    if (!ellipsoid || !cameraPos) return [0, 0, 0];
    const carto = Cesium.Cartographic.fromCartesian(cameraPos, ellipsoid);
    if (!carto) return [0, 0, 0];
    const surface = Cesium.Cartesian3.fromRadians(
        carto.longitude, carto.latitude, 0.0, ellipsoid
    );
    const normal = ellipsoid.geodeticSurfaceNormal(surface, new Cesium.Cartesian3());
    const center = Cesium.Cartesian3.subtract(
        surface,
        Cesium.Cartesian3.multiplyByScalar(normal, Number(bottomRadius) || 0, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
    );
    const corr = Cesium.Cartesian3.negate(center, new Cesium.Cartesian3());
    return [corr.x, corr.y, corr.z];
}

export function lerp4(a: any, b: any, t: any): any {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        1.0
    ];
}

export function dist3(a: any, b: any): any {
    const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function mulMat4Vec4(m: any, v: any): any {
    // 列主序
    const x = v[0], y = v[1], z = v[2], w = v[3] ?? 1.0;
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12] * w,
        m[1] * x + m[5] * y + m[9] * z + m[13] * w,
        m[2] * x + m[6] * y + m[10] * z + m[14] * w,
        m[3] * x + m[7] * y + m[11] * z + m[15] * w
    ];
}

export function expandBBox(bbox: any, v4: any): any {
    const x = v4[0], y = v4[1], z = v4[2];
    bbox.min[0] = Math.min(bbox.min[0], x);
    bbox.min[1] = Math.min(bbox.min[1], y);
    bbox.min[2] = Math.min(bbox.min[2], z);
    bbox.max[0] = Math.max(bbox.max[0], x);
    bbox.max[1] = Math.max(bbox.max[1], y);
    bbox.max[2] = Math.max(bbox.max[2], z);
}

export function lookAt(eye: any, center: any, up: any): any {
    // 列主序 lookAt（对齐 GLSL/Cesium/three.js）
    // out = view matrix that transforms world -> view
    const out = new Float32Array(16);

    const eyex = eye[0], eyey = eye[1], eyez = eye[2];
    const upx = up[0], upy = up[1], upz = up[2];
    const centerx = center[0], centery = center[1], centerz = center[2];

    if (
        Math.abs(eyex - centerx) < 1e-6 &&
        Math.abs(eyey - centery) < 1e-6 &&
        Math.abs(eyez - centerz) < 1e-6
    ) {
        out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
        out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
        return out;
    }

    let z0 = eyex - centerx;
    let z1 = eyey - centery;
    let z2 = eyez - centerz;

    let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len; z1 *= len; z2 *= len;

    let x0 = upy * z2 - upz * z1;
    let x1 = upz * z0 - upx * z2;
    let x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (len > 0) {
        len = 1 / len;
        x0 *= len; x1 *= len; x2 *= len;
    }

    const y0 = z1 * x2 - z2 * x1;
    const y1 = z2 * x0 - z0 * x2;
    const y2 = z0 * x1 - z1 * x0;

    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
    out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
    out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;
    return out;
}

export function ortho(left: any, right: any, bottom: any, top: any, near: any, far: any): any {
    // 列主序 ortho（对齐 GLSL/Cesium/three.js）
    const out = new Float32Array(16);
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
}

export function multiply(out: any, a: any, b: any): any {
    // 列主序（GLSL / Cesium Matrix4 使用）矩阵乘法：out = a * b
    // 参考 gl-matrix mat4.multiply 的实现，避免投影矩阵转置/错序导致 UV 恒为 0。
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = b[0], b01 = b[1], b02 = b[2], b03 = b[3];
    const b10 = b[4], b11 = b[5], b12 = b[6], b13 = b[7];
    const b20 = b[8], b21 = b[9], b22 = b[10], b23 = b[11];
    const b30 = b[12], b31 = b[13], b32 = b[14], b33 = b[15];

    out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;

    out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;

    out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;

    out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
    out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
    out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
    out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
}

export function invert(out: any, m: any): any {
    const a00 = m[0], a01 = m[4], a02 = m[8], a03 = m[12];
    const a10 = m[1], a11 = m[5], a12 = m[9], a13 = m[13];
    const a20 = m[2], a21 = m[6], a22 = m[10], a23 = m[14];
    const a30 = m[3], a31 = m[7], a32 = m[11], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return;
    det = 1 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[4] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[8] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[12] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[9] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[13] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[6] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[14] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[3] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[7] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[11] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
}
