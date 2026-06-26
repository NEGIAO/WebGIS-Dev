// LUT 纹理尺寸常量
const TRANSMITTANCE_WIDTH = 128;
const TRANSMITTANCE_HEIGHT = 32;
const IRRADIANCE_WIDTH = 64;
const IRRADIANCE_HEIGHT = 16;
const SCATTERING_WIDTH = 128;
const SCATTERING_HEIGHT = 64;

// 地球物理常量
const EARTH_RADIUS = 6378137.0;  // WGS84 地球半径（米）
const ATMOSPHERE_TOP_RADIUS = EARTH_RADIUS + 90000.0;  // 大气层顶部高度（90km）

export default class AtmosphereLutResources {
    constructor(viewer, options = {}) {
        if (!viewer?.scene?.context) {
            throw new Error('AtmosphereLutResources requires a valid Cesium Viewer instance.');
        }

        this.context = viewer.scene.context;
        this.Cesium = options.cesium || globalThis.Cesium;
        this.transmittanceTexture = null;
        this.irradianceTexture = null;
        this.scatteringTexture = null;
        this._destroyed = false;

        this._createTextures();
    }

    destroy() {
        if (this._destroyed) return;

        // 安全销毁每个纹理，单个失败不阻断后续清理
        const safeDestroy = (texture, name) => {
            try {
                texture?.destroy?.();
            } catch (error) {
                console.warn(`AtmosphereLutResources: failed to destroy ${name}:`, error);
            }
        };

        safeDestroy(this.transmittanceTexture, 'transmittanceTexture');
        safeDestroy(this.irradianceTexture, 'irradianceTexture');
        safeDestroy(this.scatteringTexture, 'scatteringTexture');

        this.transmittanceTexture = null;
        this.irradianceTexture = null;
        this.scatteringTexture = null;
        this._destroyed = true;
    }

    isDestroyed() {
        return this._destroyed;
    }

    _createTextures() {
        const transmittanceData = createTransmittanceLut();
        const irradianceData = createIrradianceLut();
        const scatteringData = createScatteringLut();

        this.transmittanceTexture = createTexture({
            Cesium: this.Cesium,
            context: this.context,
            width: TRANSMITTANCE_WIDTH,
            height: TRANSMITTANCE_HEIGHT,
            data: transmittanceData,
        });
        this.irradianceTexture = createTexture({
            Cesium: this.Cesium,
            context: this.context,
            width: IRRADIANCE_WIDTH,
            height: IRRADIANCE_HEIGHT,
            data: irradianceData,
        });
        this.scatteringTexture = createTexture({
            Cesium: this.Cesium,
            context: this.context,
            width: SCATTERING_WIDTH,
            height: SCATTERING_HEIGHT,
            data: scatteringData,
        });
    }
}

function createTexture({ Cesium, context, width, height, data }) {
    return new Cesium.Texture({
        context,
        width,
        height,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
        source: {
            width,
            height,
            arrayBufferView: data,
        },
        sampler: new Cesium.Sampler({
            minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
            magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
            wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
            wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
        }),
    });
}

function createTransmittanceLut() {
    const data = new Uint8Array(TRANSMITTANCE_WIDTH * TRANSMITTANCE_HEIGHT * 4);
    for (let y = 0; y < TRANSMITTANCE_HEIGHT; y += 1) {
        const heightFraction = y / Math.max(TRANSMITTANCE_HEIGHT - 1, 1);
        const radius = EARTH_RADIUS + heightFraction * (ATMOSPHERE_TOP_RADIUS - EARTH_RADIUS);
        for (let x = 0; x < TRANSMITTANCE_WIDTH; x += 1) {
            const mu = x / Math.max(TRANSMITTANCE_WIDTH - 1, 1) * 2 - 1;
            const transmittance = approximateSunTransmittance(radius, mu);
            writeRgb(data, (y * TRANSMITTANCE_WIDTH + x) * 4, transmittance, 255);
        }
    }
    return data;
}

function createIrradianceLut() {
    const data = new Uint8Array(IRRADIANCE_WIDTH * IRRADIANCE_HEIGHT * 4);
    for (let y = 0; y < IRRADIANCE_HEIGHT; y += 1) {
        const heightFraction = y / Math.max(IRRADIANCE_HEIGHT - 1, 1);
        const radius = EARTH_RADIUS + heightFraction * (ATMOSPHERE_TOP_RADIUS - EARTH_RADIUS);
        for (let x = 0; x < IRRADIANCE_WIDTH; x += 1) {
            const sunUp = x / Math.max(IRRADIANCE_WIDTH - 1, 1);
            const irradiance = approximateSkyIrradiance(radius, sunUp);
            writeRgb(data, (y * IRRADIANCE_WIDTH + x) * 4, irradiance, 255);
        }
    }
    return data;
}

function createScatteringLut() {
    const data = new Uint8Array(SCATTERING_WIDTH * SCATTERING_HEIGHT * 4);
    for (let y = 0; y < SCATTERING_HEIGHT; y += 1) {
        const distanceFraction = y / Math.max(SCATTERING_HEIGHT - 1, 1);
        for (let x = 0; x < SCATTERING_WIDTH; x += 1) {
            const cosTheta = x / Math.max(SCATTERING_WIDTH - 1, 1) * 2 - 1;
            const scattering = approximateInScattering(cosTheta, distanceFraction);
            writeRgb(data, (y * SCATTERING_WIDTH + x) * 4, scattering, 255);
        }
    }
    return data;
}

/**
 * 计算太阳透射率（近似 Bruneton 模型）
 *
 * 物理常数说明：
 * - 10000.0: Rayleigh 散射标高（米），大气密度随高度指数衰减的特征高度
 * - 3200.0: Mie 散射标高（米），气溶胶密度衰减特征高度
 * - 5.5e-6, 13.0e-6, 28.4e-6: Rayleigh 散射系数（RGB），基于 550nm 参考波长
 * - 21.0e-6: Mie 散射系数，典型气溶胶值
 * - 18000.0: 光学深度缩放因子，用于 LUT 量化
 *
 * @param {number} radius - 距地心距离（米）
 * @param {number} mu - 天顶角余弦值（cos(theta)）
 * @returns {number[]} RGB 透射率 [0,1]
 */
function approximateSunTransmittance(radius, mu) {
    const altitude = Math.max(radius - EARTH_RADIUS, 0);
    const horizon = smoothstep(-0.08, 0.18, mu);
    const slant = 1 / Math.max(mu * 0.5 + 0.5, 0.08);

    // Rayleigh/Mie 密度随高度指数衰减
    const rayleighDensity = Math.exp(-altitude / 10000.0);  // Rayleigh 标高 10km
    const mieDensity = Math.exp(-altitude / 3200.0);        // Mie 标高 3.2km

    const opticalDepthScale = slant * (0.22 + 0.78 * horizon);

    // 光学深度 = (散射系数 * 密度) * 路径长度
    return [
        Math.exp(-(5.5e-6 * rayleighDensity + 21.0e-6 * mieDensity) * opticalDepthScale * 18000.0),  // R
        Math.exp(-(13.0e-6 * rayleighDensity + 21.0e-6 * mieDensity) * opticalDepthScale * 18000.0), // G
        Math.exp(-(28.4e-6 * rayleighDensity + 21.0e-6 * mieDensity) * opticalDepthScale * 18000.0), // B
    ].map((value) => value * (0.22 + 0.78 * horizon));
}

function approximateSkyIrradiance(radius, sunUp) {
    const altitude = Math.max(radius - EARTH_RADIUS, 0);
    const density = Math.exp(-altitude / 10000.0);
    const blueScatter = [0.32, 0.62, 1.0];
    const sunset = [0.95, 0.62, 0.38];
    const mixAmount = smoothstep(0.08, 0.75, sunUp);
    const ambient = 0.18 + 0.55 * sunUp;
    return blueScatter.map((blue, index) => {
        const tint = sunset[index] * (1 - mixAmount) + blue * 1.35 * mixAmount;
        return tint * ambient * (0.35 + 0.65 * density);
    });
}

function approximateInScattering(cosTheta, distanceFraction) {
    const rayleigh = rayleighPhase(cosTheta);
    const mie = hgPhase(cosTheta, 0.76);
    const distanceGain = 1 - Math.exp(-distanceFraction * 3.2);
    const horizonWarmth = smoothstep(0.58, 1.0, distanceFraction) * smoothstep(0.15, 1.0, cosTheta * 0.5 + 0.5);
    const blue = [0.42, 0.58, 0.9].map((value) => value * rayleigh * 18.0);
    const warm = [1.0, 0.78, 0.48].map((value) => value * mie * 5.5);
    return blue.map((value, index) => (value + warm[index] * (0.55 + horizonWarmth)) * distanceGain);
}

function rayleighPhase(cosTheta) {
    return 0.05968310366 * (1 + cosTheta * cosTheta);
}

function hgPhase(cosTheta, g) {
    const g2 = g * g;
    const denom = Math.pow(Math.max(1 + g2 - 2 * g * cosTheta, 0.001), 1.5);
    return (1 - g2) / (12.5663706144 * denom);
}

function writeRgb(data, offset, rgb, alpha) {
    data[offset] = toByte(rgb[0]);
    data[offset + 1] = toByte(rgb[1]);
    data[offset + 2] = toByte(rgb[2]);
    data[offset + 3] = alpha;
}

function toByte(value) {
    return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
