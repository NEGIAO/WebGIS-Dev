/**
 * Cesium 时序上采样（TAAU）管理模块
 *
 * 实现功能：
 * - ping-pong framebuffer 管理（current/resolve/history）
 * - TAAU 16x 上采样（1/16 分辨率 → 全分辨率）
 * - 方差裁剪（Variance Clipping）
 * - 速度重投影（Velocity Reprojection）
 * - STBN 蓝噪声抖动
 *
 * 基于 Frostbite 和 Playdead 的时序重建方案
 */

import { ref, shallowRef } from 'vue';

// Bayer 4x4 序列，用于确定当前帧的子像素位置
const BAYER_4X4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];

// 时序上采样配置
const TEMPORAL_CONFIG = {
    // 上采样因子（4x4 = 16 帧）
    UPSCALE_FACTOR: 4,
    // 历史混合权重（0-1，越高越稳定但可能 ghosting）
    HISTORY_BLEND_FACTOR: 0.9,
    // STBN 纹理尺寸（预留，generateSTBNData 使用）
    STBN_SIZE: 64,
    STBN_DEPTH: 64,
};

/**
 * 创建时序上采样管理器
 * @param {Object} options - 配置选项
 * @returns {Object} 时序上采样管理器接口
 */
export function useCesiumTemporalUpsampling(options = {}) {
    const { Cesium, viewer } = options;

    // 时序状态
    const temporalState = ref({
        frameIndex: 0,
        jitterX: 0,
        jitterY: 0,
        historyValid: false,
    });

    // framebuffer 引用（使用 shallowRef 避免深度响应）
    const framebuffers = shallowRef({
        current: null,
        resolve: null,
        history: null,
    });

    // TODO: 速度重投影接入后启用
    // let _previousViewProjection = null;

    /**
     * 初始化 framebuffer 资源
     * @param {number} width - 全分辨率宽度
     * @param {number} height - 全分辨率高度
     */
    function initialize(width, height) {
        if (!viewer?.scene?.context || !Cesium) {
            console.warn('TAAU: Cesium viewer not ready');
            return;
        }

        const context = viewer.scene.context;
        const lowWidth = Math.ceil(width / TEMPORAL_CONFIG.UPSCALE_FACTOR);
        const lowHeight = Math.ceil(height / TEMPORAL_CONFIG.UPSCALE_FACTOR);

        // 创建低分辨率 framebuffer（用于主云渲染）
        framebuffers.value = {
            current: createFramebuffer(context, Cesium, lowWidth, lowHeight),
            resolve: createFramebuffer(context, Cesium, width, height),
            history: createFramebuffer(context, Cesium, width, height),
        };

        // TODO: 速度重投影接入后取消注释
        // _previousViewProjection = Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);

        temporalState.value.historyValid = false;
        console.warn(`TAAU: Initialized with ${lowWidth}x${lowHeight} → ${width}x${height}`);
    }

    /**
     * 更新时序状态（每帧调用）
     * @param {number} frameCount - 当前帧计数
     * @param {Cesium.Matrix4} currentViewProjection - 当前视图投影矩阵
     */
    function update(frameCount, _currentViewProjection) {
        const state = temporalState.value;

        // 更新帧索引（循环 0-15）
        state.frameIndex = frameCount % 16;

        // 计算 Bayer 抖动偏移
        const bayerX = BAYER_4X4[state.frameIndex % 4][Math.floor(state.frameIndex / 4)] % 4;
        const bayerY = Math.floor(BAYER_4X4[state.frameIndex % 4][Math.floor(state.frameIndex / 4)] / 4);

        // 归一化抖动偏移（-0.5 到 0.5）
        state.jitterX = (bayerX + 0.5) / TEMPORAL_CONFIG.UPSCALE_FACTOR - 0.5;
        state.jitterY = (bayerY + 0.5) / TEMPORAL_CONFIG.UPSCALE_FACTOR - 0.5;

        // 保存当前矩阵用于下一帧重投影（仅在速度纹理接入后才有意义）
        // TODO: 速度重投影管线接入后取消注释
        // if (currentViewProjection) {
        //     _previousViewProjection = Cesium.Matrix4.clone(currentViewProjection);
        // }

        // historyValid 由 swapBuffers() 在首次交换后设置
    }

    /**
     * 获取当前帧的抖动矩阵
     * @param {Cesium.Matrix4} projectionMatrix - 原始投影矩阵
     * @param {number} width - 渲染宽度
     * @param {number} height - 渲染高度
     * @returns {Cesium.Matrix4} 带抖动的投影矩阵
     */
    function getJitteredProjection(projectionMatrix, width, height) {
        if (!Cesium) return projectionMatrix;

        const state = temporalState.value;
        const jitterMatrix = Cesium.Matrix4.fromTranslation(
            new Cesium.Cartesian3(
                state.jitterX / width * 2,
                state.jitterY / height * 2,
                0
            )
        );

        return Cesium.Matrix4.multiply(projectionMatrix, jitterMatrix, new Cesium.Matrix4());
    }

    /**
     * 获取 TAAU 上采样 shader 代码
     * @returns {string} GLSL fragment shader
     */
    function getResolveShader() {
        return `
            #if __VERSION__ == 300
            in vec2 v_textureCoordinates;
            #define SAMPLE_TEX texture
            #define FRAG_COLOR out_FragColor
            #else
            varying vec2 v_textureCoordinates;
            #define SAMPLE_TEX texture2D
            #define FRAG_COLOR gl_FragColor
            #endif

            uniform sampler2D colorTexture;
            uniform sampler2D depthTexture;
            uniform sampler2D historyTexture;
            uniform vec2 resolution;
            uniform vec2 jitterOffset;
            uniform float historyBlendFactor;
            uniform int frameIndex;

            // 方差裁剪：计算邻域颜色的 AABB
            vec4 varianceClip(vec4 historyColor, vec2 uv) {
                vec4 minColor = vec4(1.0);
                vec4 maxColor = vec4(0.0);
                vec4 moment1 = vec4(0.0);
                vec4 moment2 = vec4(0.0);

                // 3x3 邻域采样
                for (int y = -1; y <= 1; y++) {
                    for (int x = -1; x <= 1; x++) {
                        vec2 offset = vec2(float(x), float(y)) / resolution;
                        vec4 sampleColor = SAMPLE_TEX(colorTexture, uv + offset);

                        minColor = min(minColor, sampleColor);
                        maxColor = max(maxColor, sampleColor);

                        moment1 += sampleColor;
                        moment2 += sampleColor * sampleColor;
                    }
                }

                // 计算均值和方差
                vec4 mean = moment1 / 9.0;
                vec4 variance = moment2 / 9.0 - mean * mean;

                // 构造 AABB 并裁剪历史颜色
                vec4 stdDev = sqrt(max(variance, vec4(0.0001)));
                vec4 aabbMin = mean - stdDev * 1.0;
                vec4 aabbMax = mean + stdDev * 1.0;

                // 将历史颜色裁剪到 AABB 内
                return clamp(historyColor, aabbMin, aabbMax);
            }

            void main() {
                vec2 uv = v_textureCoordinates;

                // 当前帧颜色
                vec4 currentColor = SAMPLE_TEX(colorTexture, uv);

                // TODO: 速度重投影接入后，用 velocity texture 计算 history UV
                vec2 historyUv = uv;

                // 检查历史 UV 是否在屏幕内
                bool historyValid = historyUv.x >= 0.0 && historyUv.x <= 1.0 &&
                                    historyUv.y >= 0.0 && historyUv.y <= 1.0;

                if (historyValid && historyBlendFactor > 0.0) {
                    // 采样历史颜色
                    vec4 historyColor = SAMPLE_TEX(historyTexture, historyUv);

                    // 方差裁剪
                    historyColor = varianceClip(historyColor, uv);

                    // 混合当前帧和历史帧
                    float blendFactor = historyBlendFactor;
                    vec4 resolvedColor = mix(currentColor, historyColor, blendFactor);

                    FRAG_COLOR = resolvedColor;
                } else {
                    // 历史无效，直接使用当前帧
                    FRAG_COLOR = currentColor;
                }
            }
        `;
    }

    /**
     * 获取速度计算 shader 代码（用于速度重投影）
     * @returns {string} GLSL fragment shader
     */
    function getVelocityShader() {
        return `
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
            uniform mat4 inverseViewProjection;
            uniform mat4 _previousViewProjection;
            uniform vec2 resolution;

            void main() {
                // 读取深度
                float depth = czm_readDepth(depthTexture, v_textureCoordinates);

                // 重建世界坐标
                vec4 clipPos = vec4(v_textureCoordinates * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                vec4 worldPos = inverseViewProjection * clipPos;
                worldPos /= worldPos.w;

                // 投影到上一帧屏幕空间
                vec4 previousClipPos = _previousViewProjection * worldPos;
                previousClipPos /= previousClipPos.w;

                vec2 previousUv = previousClipPos.xy * 0.5 + 0.5;

                // 计算速度向量
                vec2 velocity = v_textureCoordinates - previousUv;

                FRAG_COLOR = vec4(velocity, 0.0, 1.0);
            }
        `;
    }

    // 每帧复用的 scratch 对象，避免 GC 压力
    const _jitterScratch = { jitterOffset: null, frameIndex: 0, historyBlendFactor: TEMPORAL_CONFIG.HISTORY_BLEND_FACTOR };

    /**
     * 获取抖动 uniform 值（复用 scratch 对象，每帧更新）
     * @returns {Object} 抖动偏移和帧索引
     */
    function getJitterUniforms() {
        const state = temporalState.value;
        if (!_jitterScratch.jitterOffset) {
            _jitterScratch.jitterOffset = new Cesium.Cartesian2(state.jitterX, state.jitterY);
        } else {
            _jitterScratch.jitterOffset.x = state.jitterX;
            _jitterScratch.jitterOffset.y = state.jitterY;
        }
        _jitterScratch.frameIndex = state.frameIndex;
        return _jitterScratch;
    }

    /**
     * 交换 resolve 和 history framebuffer
     */
    function swapBuffers() {
        const fb = framebuffers.value;
        if (fb.resolve && fb.history) {
            // 交换引用
            framebuffers.value = {
                current: fb.current,
                resolve: fb.history,
                history: fb.resolve,
            };
            // 首次交换后标记历史数据有效
            temporalState.value.historyValid = true;
        }
    }

    /**
     * 清理资源
     */
    function destroy() {
        const fb = framebuffers.value;
        if (fb.current) fb.current.destroy();
        if (fb.resolve) fb.resolve.destroy();
        if (fb.history) fb.history.destroy();

        framebuffers.value = {
            current: null,
            resolve: null,
            history: null,
        };

        // _previousViewProjection = null;
        temporalState.value.historyValid = false;
    }

    return {
        temporalState,
        framebuffers,
        initialize,
        update,
        getJitteredProjection,
        getResolveShader,
        getVelocityShader,
        getJitterUniforms,
        swapBuffers,
        destroy,
        TEMPORAL_CONFIG,
    };
}

/**
 * 创建 Cesium Framebuffer
 * @param {Object} context - Cesium context
 * @param {Object} Cesium - Cesium 命名空间
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {Object} Framebuffer 实例
 */
function createFramebuffer(context, Cesium, width, height) {
    const colorTexture = new Cesium.Texture({
        context,
        width,
        height,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
        sampler: new Cesium.Sampler({
            minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
            magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
            wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
            wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
        }),
    });

    // 使用 renderbuffer 代替纹理存储深度，兼容性更好（WebGL1/2 均支持）
    const depthRenderbuffer = new Cesium.Renderbuffer({
        context,
        width,
        height,
        format: Cesium.RenderbufferFormat.DEPTH_COMPONENT16,
    });

    return new Cesium.Framebuffer({
        context,
        colorTextures: [colorTexture],
        depthRenderbuffer,
    });
}

/** GLSL-style fract: x - floor(x) */
function fract(x) {
    return x - Math.floor(x);
}

/**
 * 生成 STBN（Spatiotemporal Blue Noise）纹理数据
 * 使用 Robert/Methley 旋转哈希生成空间蓝噪声近似，时间维度通过黄金旋转偏移
 *
 * 注意：这是运行时近似算法，质量低于预计算的 STBN 纹理。
 * 对于生产环境，建议使用 Igor Krawczyk 的预计算 STBN 数据。
 *
 * @param {number} size - 纹理尺寸（宽=高）
 * @param {number} depth - 时间维度深度
 * @returns {Uint8Array} 蓝噪声数据
 */
export function generateSTBNData(size = 64, depth = 64) {
    const data = new Uint8Array(size * size * depth);
    const invSize = 1.0 / size;

    for (let z = 0; z < depth; z++) {
        // 时间维度使用黄金角度旋转，确保帧间低相关性
        const timeOffset = (z * 2.39996322972865) / (2.0 * Math.PI); // 黄金角度归一化

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (z * size * size) + (y * size) + x;

                // Robert/Methley 哈希：空间蓝噪声近似
                const px = (x + 0.5) * invSize;
                const py = (y + 0.5) * invSize;

                // 旋转变量（每个时间帧不同角度）
                const angle = timeOffset * 2.0 * Math.PI;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const rx = px * cosA - py * sinA;
                const ry = px * sinA + py * cosA;

                // 多频率哈希叠加
                const h1 = fract(Math.sin(rx * 12.9898 + ry * 78.233) * 43758.5453);
                const h2 = fract(Math.sin(rx * 4.898 + ry * 7.23) * 23421.631);
                const value = Math.floor(fract(h1 * 0.5 + h2 * 0.5 + timeOffset) * 256);

                data[index] = value < 256 ? value : 255;
            }
        }
    }

    return data;
}
