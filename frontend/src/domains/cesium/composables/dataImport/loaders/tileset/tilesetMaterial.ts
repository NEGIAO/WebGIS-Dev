/**
 * 功能名称：3D Tiles 材质模式（白模/高度伪色/自定义 shader）
 * 日    期：2026/11/13
 *
 * 从 tilesetLoader 拆出：MATERIAL_MODES 注册表、高度样式与自定义 GLSL 构建、
 * applyTilesetMaterial 应用入口（translucencyMode 跨 1.0 重建 shader）。
 */

// ============================================================
// 材质切换（5 种模式）
// ============================================================

/** 5 种材质模式的显示名称映射 */
export const MATERIAL_MODES = {
    pureWhite: '纯白膜',
    baimo: '白膜贴图',
    heightStyle: '高度分层',
    gradient: '高度渐变',
    none: '原始材质',
};

/**
 * 每个 tileset 上一次应用的材质状态。
 * 用途：区分「必须重建（换模式 / 跨半透明边界）」与「只改 alpha（更新 uniform）」。
 */
const tilesetMaterialState = new WeakMap();

/**
 * 对 tileset 应用「材质模式 × 透明度」合成外观（P1-2 单点合成，互不覆盖）。
 *
 * 性能约定：同模式且未跨半透明边界时，只 setUniform('u_alpha') 不重建 shader。
 * 给 tileset.customShader 赋值会让 Cesium 为每个瓦片重新编译着色器，大瓦片集
 * 单次可达数秒——历史上透明度滑杆「一动就卡死」即源于此。
 *
 * @param {Cesium.Cesium3DTileset} tileset
 * @param {string} mode - MATERIAL_MODES 的 key
 * @param {Cesium} Cesium
 * @param {number} [alpha=1] - 透明度 0~1（统一图层管理注入；1 = 完全不透明）
 */
export function applyTilesetMaterial(tileset: any, mode: string, Cesium: any, alpha = 1): void {
    if (!tileset) return;
    const safeAlpha = Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 1));
    const needsTranslucent = safeAlpha < 1;
    const prev = tilesetMaterialState.get(tileset);

    // ── 快路径：同模式 + 半透明通道未变 + 已有 shader → 只更新 u_alpha ──
    // 这是「拖透明度滑杆卡死」的根治点：给 tileset.customShader 赋值会让 Cesium
    // 为每个瓦片重新编译着色器（大瓦片集单次可达数秒），而 setUniform 零编译。
    // translucencyMode 是编译期参数，故仅在跨 1.0 边界时才允许走重建。
    if (
        prev
        && prev.mode === mode
        && prev.translucent === needsTranslucent
        && mode !== 'none'
        && mode !== 'heightStyle'
        && tileset.customShader
        && typeof tileset.customShader.setUniform === 'function'
    ) {
        try {
            tileset.customShader.setUniform('u_alpha', safeAlpha);
            prev.alpha = safeAlpha;
            return;
        } catch {
            // 旧 shader 无 u_alpha uniform：落到下面的完整重建
        }
    }

    // 清空之前的状态（style 与 customShader 均由本函数统一重建）
    tileset.customShader = null;
    tileset.style = undefined;

    if (mode === 'heightStyle') {
        tileset.style = buildHeightStyle(Cesium, safeAlpha);
    } else if (mode !== 'none') {
        // 高度渐变需要包围球信息来计算动态高度范围
        const bs = tileset.boundingSphere;
        const bsInfo = bs ? {
            centerZ: bs.center.z,
            radius: bs.radius,
        } : null;
        tileset.customShader = buildCustomShader(mode, Cesium, safeAlpha, bsInfo);
    } else if (safeAlpha < 1) {
        // 原始材质 + 半透明：白色乘 alpha 的 style（不改变色相）
        tileset.style = new Cesium.Cesium3DTileStyle({
            color: `color('#ffffff', ${safeAlpha.toFixed(3)})`,
        });
    }
    // 'none' 且 alpha=1：保持无 shader + 无 style

    tilesetMaterialState.set(tileset, { mode, alpha: safeAlpha, translucent: needsTranslucent });
}

/** 高度分层样式（alpha 融入各分层颜色，避免与透明度互写 style） */
export function buildHeightStyle(Cesium: any, alpha = 1) {
    const a = Math.min(1, Math.max(0, alpha)).toFixed(3);
    const tint = (rgb: string) => `color('rgb(${rgb})', ${a})`;
    // has_property 兜底：无 height 属性的瓦片集（摄影测量、Ion 数据）统一走默认色
    const fallback = tint('44, 49, 88');
    return new Cesium.Cesium3DTileStyle({
        color: {
            conditions: [
                ["!has_property('height')", fallback],
                ["${height} === null", fallback],
                ["Number(${height}) >= 130", tint('195, 21, 21')],
                ["Number(${height}) >= 60", tint('195, 83, 0')],
                ["Number(${height}) >= 30", tint('73, 52, 140')],
                ["true", fallback],
            ],
        },
    });
}

/** 构建 CustomShader（纯白膜 / 白膜贴图 / 高度渐变；alpha 走 uniform，拖动滑杆不重编译） */
export function buildCustomShader(
    mode: string,
    Cesium: any,
    alpha = 1,
    bsInfo: { centerZ: number; radius: number } | null = null,
) {
    const alphaValue = Math.min(1, Math.max(0, Number(alpha) || 0));
    // alpha<1 必须显式声明 TRANSLUCENT，否则不透明通道下 material.alpha 不生效。
    // 注意：translucencyMode 是编译期参数，跨 1.0 边界时必须重建（见 applyTilesetMaterial）；
    // 区间内（0,1) 的连续变化只更新 u_alpha，不触发重编译。
    const translucencyMode = alphaValue < 1
        ? Cesium.CustomShaderTranslucencyMode.TRANSLUCENT
        : Cesium.CustomShaderTranslucencyMode.INHERIT;

    /** alpha uniform 声明（三个模式共用，value 为初始值） */
    const alphaUniform = {
        u_alpha: {
            type: Cesium.UniformType.FLOAT,
            value: alphaValue,
        },
    };

    if (mode === 'pureWhite') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            translucencyMode,
            uniforms: { ...alphaUniform },
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    material.diffuse = vec3(0.95, 0.95, 0.95);
                    material.alpha = u_alpha;
                }`,
        });
    }

    if (mode === 'baimo') {
        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            translucencyMode,
            varyings: { v_normalMC: Cesium.VaryingType.VEC3 },
            uniforms: {
                u_texture: {
                    value: new Cesium.TextureUniform({
                        url: './textures/building7.png',
                    }),
                    type: Cesium.UniformType.SAMPLER_2D,
                },
                ...alphaUniform,
            },
            vertexShaderText: `
                void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
                    v_normalMC = vsInput.attributes.normalMC;
                }`,
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    vec3 positionMC = fsInput.attributes.positionMC;
                    if (dot(vec3(0.0, 0.0, 1.0), v_normalMC) > 0.95) {
                        material.diffuse = vec3(0.079, 0.107, 0.111);
                    } else {
                        float width = 100.0, height = 100.0;
                        float dotXAxis = dot(vec3(0.0, 1.0, 0.0), v_normalMC);
                        float textureX = (dotXAxis > 0.52 || dotXAxis < -0.52)
                            ? mod(positionMC.x, width) / width
                            : mod(positionMC.y, width) / width;
                        float textureY = mod(positionMC.z, height) / height;
                        material.diffuse = texture(u_texture, vec2(textureX, textureY)).rgb;
                    }
                    material.alpha = u_alpha;
                }`,
        });
    }

    if (mode === 'gradient') {
        // 动态高度范围：基于包围球计算，适配任意瓦片集
        // 使用 positionWC（世界坐标 ECEF）的 Z 分量，避免 positionMC 受模型局部坐标系影响
        let centerZ = 0.0;
        let range = 200.0;
        if (bsInfo) {
            centerZ = bsInfo.centerZ;
            range = Math.max(bsInfo.radius * 0.6, 10.0);
        }
        const bottomZ = (centerZ - range).toFixed(1);
        const zRange = (range * 2).toFixed(1);

        return new Cesium.CustomShader({
            lightingModel: Cesium.LightingModel.UNLIT,
            translucencyMode,
            uniforms: { ...alphaUniform },
            fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                    float bottomHeight = ${bottomZ};
                    float heightRange = ${zRange};
                    float heightRatio = clamp(
                        (fsInput.attributes.positionWC.z - bottomHeight) / heightRange,
                        0.0, 1.0);
                    // 绿(低) → 红(高) 渐变
                    material.diffuse = mix(vec3(0.0, 0.8, 0.0), vec3(0.8, 0.0, 0.0), heightRatio);
                    material.alpha = u_alpha;
                }`,
        });
    }

    return null;
}
