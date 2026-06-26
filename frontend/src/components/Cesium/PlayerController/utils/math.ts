import { Cartesian3 } from "cesium";

// 通用插值工具

// 标量线性插值：从 from 朝 to 插值 t（t∈[0,1]，0=不动，1=直达）
export function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}

// 向量线性插值：把 out 朝 to 插值 t，写回并返回 out
export function lerpCartesian3(out: Cartesian3, to: Cartesian3, t: number): Cartesian3 {
    out.x = lerp(out.x, to.x, t);
    out.y = lerp(out.y, to.y, t);
    out.z = lerp(out.z, to.z, t);
    return out;
}
