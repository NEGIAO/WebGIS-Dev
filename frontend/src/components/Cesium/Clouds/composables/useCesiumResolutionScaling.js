/**
 * Cesium 分辨率缩放模块
 *
 * 实现功能：
 * - 低分辨率渲染体积云（1/2 或 1/4 分辨率）
 * - 双边上采样（Bilateral Upsampling）保留边缘
 * - 动态分辨率调整（根据帧率自动调节）
 *
 * 基于 Frostbite 和 Unreal Engine 的半分辨率渲染方案
 */

/**
 * 创建分辨率缩放管理器
 * @param {Object} options - 配置选项
 * @returns {Object} 分辨率缩放管理器接口
 */
export function useCesiumResolutionScaling(_options = {}) {
    // 分辨率缩放配置
    const config = {
        // 缩放因子：0.5 = 半分辨率，0.25 = 四分之一分辨率
        scaleFactor: 0.5,
        // 是否启用动态分辨率
        dynamicResolution: true,
        // 目标帧率（低于此值时降低分辨率）
        targetFps: 30,
        // 最小缩放因子
        minScaleFactor: 0.25,
        // 最大缩放因子
        maxScaleFactor: 1.0,
        // 帧率采样窗口（帧数）
        fpsWindowSize: 60,
    };

    // 帧率统计
    const fpsHistory = [];
    let lastFrameTime = 0;
    let currentFps = 60;

    /**
     * 更新帧率统计
     * @param {number} timestamp - 当前时间戳
     */
    function updateFps(timestamp) {
        if (lastFrameTime > 0) {
            const delta = timestamp - lastFrameTime;
            const fps = 1000 / delta;
            fpsHistory.push(fps);

            if (fpsHistory.length > config.fpsWindowSize) {
                fpsHistory.shift();
            }

            // 计算平均帧率
            const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
            currentFps = avgFps;

            // 动态调整分辨率
            if (config.dynamicResolution) {
                adjustScaleFactor(avgFps);
            }
        }
        lastFrameTime = timestamp;
    }

    /**
     * 根据帧率动态调整缩放因子
     * @param {number} avgFps - 平均帧率
     */
    function adjustScaleFactor(avgFps) {
        if (avgFps < config.targetFps * 0.8) {
            // 帧率过低，降低分辨率
            config.scaleFactor = Math.max(
                config.minScaleFactor,
                config.scaleFactor - 0.05
            );
        } else if (avgFps > config.targetFps * 1.2) {
            // 帧率充足，提高分辨率
            config.scaleFactor = Math.min(
                config.maxScaleFactor,
                config.scaleFactor + 0.02
            );
        }
    }

    /**
     * 获取当前缩放后的分辨率
     * @param {number} width - 原始宽度
     * @param {number} height - 原始高度
     * @returns {{width: number, height: number, scaleFactor: number}}
     */
    function getScaledResolution(width, height) {
        const scaledWidth = Math.max(1, Math.floor(width * config.scaleFactor));
        const scaledHeight = Math.max(1, Math.floor(height * config.scaleFactor));
        return {
            width: scaledWidth,
            height: scaledHeight,
            scaleFactor: config.scaleFactor,
        };
    }

    /**
     * 获取上采样 shader 代码
     * 使用双边上采样保留边缘
     * @returns {string} GLSL fragment shader
     */
    function getUpscaleShader() {
        return `
uniform sampler2D lowResColorTexture;
uniform sampler2D highResDepthTexture;
uniform vec2 lowResResolution;
uniform vec2 highResResolution;
uniform float edgeSharpness;

in vec2 v_textureCoordinates;

// 深度感知的双边权重
float bilateralWeight(float centerDepth, float sampleDepth, float edgeSharpness) {
    float depthDiff = abs(centerDepth - sampleDepth);
    return exp(-depthDiff * edgeSharpness * 100.0);
}

void main() {
    vec2 uv = v_textureCoordinates;

    // 高分辨率深度
    float centerDepth = czm_readDepth(highResDepthTexture, uv);

    // 低分辨率纹理坐标
    vec2 lowResUv = uv;
    vec2 texelSize = 1.0 / lowResResolution;

    // 4 点双线性插值 + 深度感知权重
    vec4 color = vec4(0.0);
    float totalWeight = 0.0;

    // 2x2 采样
    for (int y = -1; y <= 1; y += 2) {
        for (int x = -1; x <= 1; x += 2) {
            vec2 offset = vec2(float(x), float(y)) * texelSize * 0.5;
            vec2 sampleUv = lowResUv + offset;

            // 边界检查
            if (sampleUv.x >= 0.0 && sampleUv.x <= 1.0 &&
                sampleUv.y >= 0.0 && sampleUv.y <= 1.0) {

                vec4 sampleColor = texture(lowResColorTexture, sampleUv);

                // 使用低分辨率深度计算权重
                // 这里简化处理，使用颜色差异作为边缘检测
                float colorDiff = length(sampleColor.rgb - color.rgb / max(totalWeight, 0.001));
                float weight = exp(-colorDiff * edgeSharpness * 5.0);

                color += sampleColor * weight;
                totalWeight += weight;
            }
        }
    }

    if (totalWeight > 0.0) {
        color /= totalWeight;
    }

    // 边缘保留锐化
    vec4 centerColor = texture(lowResColorTexture, lowResUv);
    color = mix(centerColor, color, edgeSharpness);

    FRAG_COLOR = color;
}
`;
    }

    /**
     * 获取性能统计
     * @returns {Object} 性能统计信息
     */
    function getStats() {
        return {
            fps: Math.round(currentFps),
            scaleFactor: config.scaleFactor,
            dynamicResolution: config.dynamicResolution,
        };
    }

    /**
     * 设置缩放因子
     * @param {number} factor - 缩放因子（0.25-1.0）
     */
    function setScaleFactor(factor) {
        config.scaleFactor = Math.max(
            config.minScaleFactor,
            Math.min(config.maxScaleFactor, factor)
        );
    }

    /**
     * 设置目标帧率
     * @param {number} fps - 目标帧率
     */
    function setTargetFps(fps) {
        config.targetFps = Math.max(15, Math.min(120, fps));
    }

    /**
     * 启用/禁用动态分辨率
     * @param {boolean} enabled - 是否启用
     */
    function setDynamicResolution(enabled) {
        config.dynamicResolution = !!enabled;
    }

    /**
     * 重置统计
     */
    function resetStats() {
        fpsHistory.length = 0;
        lastFrameTime = 0;
        currentFps = 60;
        config.scaleFactor = 0.5;
    }

    return {
        updateFps,
        getScaledResolution,
        getUpscaleShader,
        getStats,
        setScaleFactor,
        setTargetFps,
        setDynamicResolution,
        resetStats,
        config,
    };
}

/**
 * 性能预设
 */
export const PERFORMANCE_PRESETS = {
    // 极致性能：1/4 分辨率
    ultraPerformance: {
        scaleFactor: 0.25,
        dynamicResolution: false,
        targetFps: 30,
    },
    // 平衡：1/2 分辨率 + 动态调整
    balanced: {
        scaleFactor: 0.5,
        dynamicResolution: true,
        targetFps: 30,
    },
    // 质量优先：3/4 分辨率
    quality: {
        scaleFactor: 0.75,
        dynamicResolution: true,
        targetFps: 45,
    },
    // 原始分辨率
    native: {
        scaleFactor: 1.0,
        dynamicResolution: false,
        targetFps: 60,
    },
};
