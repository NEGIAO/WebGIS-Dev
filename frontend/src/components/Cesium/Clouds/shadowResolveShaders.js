/**
 * BSM Shadow Resolve Shader
 *
 * 对 Beer Shadow Map 进行时序抗锯齿（TAA）
 * 减少低分辨率阴影图下的单像素闪烁
 *
 * 基于 Frostbite 和 Playdead 的时序重建方案
 */

/**
 * Shadow Resolve Fragment Shader
 *
 * 输入：
 * - shadowTexture: 当前帧 BSM 纹理 (RGBA)
 * - historyTexture: 上一帧 BSM 纹理 (RGBA)
 * - velocityTexture: 速度向量纹理（可选）
 *
 * 输出：
 * - resolve 后的 BSM 纹理 (RGBA)
 */
export const SHADOW_RESOLVE_FRAGMENT_SHADER = `
#if __VERSION__ == 300
in vec2 v_textureCoordinates;
#define SAMPLE_TEX texture
#define FRAG_COLOR out_FragColor
#else
varying vec2 v_textureCoordinates;
#define SAMPLE_TEX texture2D
#define FRAG_COLOR gl_FragColor
#endif

uniform sampler2D shadowTexture;
uniform sampler2D historyTexture;
uniform vec2 resolution;
uniform float historyBlendFactor;

// 方差裁剪：计算邻域 BSM 的 AABB
vec4 varianceClip(vec4 historyValue, vec2 uv) {
    vec4 minVal = vec4(1.0);
    vec4 maxVal = vec4(0.0);
    vec4 moment1 = vec4(0.0);
    vec4 moment2 = vec4(0.0);

    // 3x3 邻域采样
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) / resolution;
            vec4 sampleVal = SAMPLE_TEX(shadowTexture, uv + offset);

            minVal = min(minVal, sampleVal);
            maxVal = max(maxVal, sampleVal);

            moment1 += sampleVal;
            moment2 += sampleVal * sampleVal;
        }
    }

    // 计算均值和方差
    vec4 mean = moment1 / 9.0;
    vec4 variance = moment2 / 9.0 - mean * mean;

    // 构造 AABB 并裁剪历史值
    vec4 stdDev = sqrt(max(variance, vec4(0.0001)));
    vec4 aabbMin = mean - stdDev * 1.0;
    vec4 aabbMax = mean + stdDev * 1.0;

    // 将历史值裁剪到 AABB 内
    return clamp(historyValue, aabbMin, aabbMax);
}

void main() {
    vec2 uv = v_textureCoordinates;

    // 当前帧 BSM 值
    vec4 currentShadow = SAMPLE_TEX(shadowTexture, uv);

    // 采样历史 BSM 值
    vec4 historyShadow = SAMPLE_TEX(historyTexture, uv);

    // 方差裁剪
    historyShadow = varianceClip(historyShadow, uv);

    // 混合当前帧和历史帧
    // 使用较小的混合因子来保持阴影的响应性
    float blendFactor = historyBlendFactor * 0.8; // 阴影比云层更敏感
    vec4 resolvedShadow = mix(currentShadow, historyShadow, blendFactor);

    FRAG_COLOR = resolvedShadow;
}
`;

/**
 * Shadow Velocity Fragment Shader
 *
 * 计算阴影空间的速度向量（用于重投影）
 * 基于太阳正交投影矩阵的变化
 */
export const SHADOW_VELOCITY_FRAGMENT_SHADER = `
#if __VERSION__ == 300
in vec2 v_textureCoordinates;
#define SAMPLE_TEX texture
#define FRAG_COLOR out_FragColor
#else
varying vec2 v_textureCoordinates;
#define SAMPLE_TEX texture2D
#define FRAG_COLOR gl_FragColor
#endif

uniform sampler2D depthTexture;
uniform mat4 currentShadowMatrix;
uniform mat4 previousShadowMatrix;
uniform vec2 resolution;

void main() {
    // 读取深度
    float depth = czm_readDepth(depthTexture, v_textureCoordinates);

    // 重建阴影空间坐标
    vec4 clipPos = vec4(v_textureCoordinates * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 currentPos = inverse(currentShadowMatrix) * clipPos;
    currentPos /= currentPos.w;

    // 投影到上一帧阴影空间
    vec4 previousClipPos = previousShadowMatrix * currentPos;
    previousClipPos /= previousClipPos.w;

    vec2 previousUv = previousClipPos.xy * 0.5 + 0.5;

    // 计算速度向量
    vec2 velocity = v_textureCoordinates - previousUv;

    FRAG_COLOR = vec4(velocity, 0.0, 1.0);
}
`;

/**
 * BSM TAA 配置
 */
export const SHADOW_TAA_CONFIG = {
    // 阴影历史混合因子（比云层更低，保持响应性）
    HISTORY_BLEND_FACTOR: 0.75,
};
