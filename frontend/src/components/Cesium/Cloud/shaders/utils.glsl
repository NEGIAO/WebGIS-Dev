// ============================================================
// utils.glsl — 工具函数库（参考实现）
// 包含: 相位函数、密度剖面、光线-球面求交等
// cloudFragment.glsl 已内联这些函数，本文件保留作为模块化参考
// ============================================================

const float UTILS_PI = 3.141592653589793;

// ─── Henyey-Greenstein 相位函数 ────────────────────────────────
float henyeyGreenstein(float g, float cosTheta) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * UTILS_PI * pow(max(denom, 1e-10), 1.5));
}

// ─── 双 HG 混合相位函数 ───────────────────────────────────────
float dualHenyeyGreenstein(float cosTheta, float g1, float g2, float mixWeight) {
    return mix(henyeyGreenstein(g1, cosTheta), henyeyGreenstein(g2, cosTheta), mixWeight);
}

// ─── 云层密度剖面 ─────────────────────────────────────────────
float cloudDensityProfile(float heightFraction) {
    float base = exp(-heightFraction * 3.0);
    float bottomBoost = exp(-heightFraction * 8.0) * 0.5;
    float topErosion = 1.0 - exp(-(1.0 - heightFraction) * 4.0);
    float midBump = exp(-pow((heightFraction - 0.4) * 3.0, 2.0));
    return (base + bottomBoost) * topErosion * midBump;
}

// ─── 光线-球面求交 ────────────────────────────────────────────
bool raySphereIntersect(vec3 ro, vec3 rd, float radius, out float tNear, out float tFar) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float disc = b * b - c;
    if (disc < 0.0) { tNear = 0.0; tFar = 0.0; return false; }
    float s = sqrt(disc);
    tNear = -b - s;
    tFar = -b + s;
    return true;
}
