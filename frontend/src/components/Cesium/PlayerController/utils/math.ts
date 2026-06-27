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

/**
 * 平滑阻尼插值（类似 Unity SmoothDamp）
 * 使用临界阻尼弹簧模型，实现自然的缓入缓出效果，不会过冲。
 *
 * @param current 当前值
 * @param target  目标值
 * @param smoothTime 响应时间（秒），越小越快跟上，0.0001 为瞬间
 * @param delta   帧间隔（秒）
 * @returns 插值后的新值
 */
export function smoothDamp(current: number, target: number, smoothTime: number, delta: number): number {
    const st = Math.max(0.0001, smoothTime);
    const omega = 2 / st;
    const x = omega * delta;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    return target + (current - target) * exp;
}
