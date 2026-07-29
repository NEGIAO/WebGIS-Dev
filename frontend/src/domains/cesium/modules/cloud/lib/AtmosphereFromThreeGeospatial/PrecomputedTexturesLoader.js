/**
 * 从静态 .bin 资源加载大气 LUT（与 three-geospatial PrecomputedTexturesLoader 一致）。
 * .bin 为 half-float (float16) RGBA，此处解码为 float32 后创建 Cesium 纹理。
 */

import { PRECOMPUTE_CONSTANTS } from './AtmosphereParameters.js';
import { getCesium } from "../getCesium.js";
/* eslint-disable @typescript-eslint/no-unused-vars */
const Cesium = getCesium();

const C = PRECOMPUTE_CONSTANTS;

/** 将 half-float (uint16) 转为 float32 */
function float16ToFloat32(u16) {
  const sign = (u16 & 0x8000) >> 15;
  const exp = (u16 & 0x7c00) >> 10;
  const frac = u16 & 0x03ff;
  if (exp === 0) {
    return (sign ? -1 : 1) * (frac ? Math.pow(2, -14) * (frac / 1024) : 0);
  }
  if (exp === 31) {
    return frac ? Number.NaN : (sign ? -Infinity : Infinity);
  }
  return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
}

/** 将 ArrayBuffer 中的 float16 数据解码为 Float32Array（RGBA，即 4 分量/像素） */
function decodeFloat16ToFloat32(buffer) {
  const uint16 = new Uint16Array(buffer);
  const n = uint16.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = float16ToFloat32(uint16[i]);
  }
  return out;
}

function fetchArrayBuffer(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.arrayBuffer();
  });
}

/**
 * 从 baseUrl 加载 transmittance.bin、irradiance.bin、scattering.bin，并创建 Cesium 纹理。
 * @param {string} baseUrl - 资源目录 URL，末尾可有或无 /
 * @param {object} context - Cesium.Context（如 viewer.scene.context）
 * @param {object} Cesium - 全局 Cesium 命名空间
 * @returns {Promise<{ transmittanceTexture: Cesium.Texture, irradianceTexture: Cesium.Texture, scatteringTexture: Cesium.Texture3D }>}
 */
export async function loadPrecomputedTextures(baseUrl, context, Cesium) {
  const base = baseUrl.replace(/\/?$/, '/');

  const [transBuf, irrBuf, scatterBuf, singleMieScatterBuf, higherOrderScatterBuf] = await Promise.all([
    fetchArrayBuffer(base + 'transmittance.bin'),
    fetchArrayBuffer(base + 'irradiance.bin'),
    fetchArrayBuffer(base + 'scattering.bin'),
    fetchArrayBuffer(base + 'single_mie_scattering.bin'),
    fetchArrayBuffer(base + 'higher_order_scattering.bin'),
  ]);

  const tw = C.TRANSMITTANCE_TEXTURE_WIDTH;
  const th = C.TRANSMITTANCE_TEXTURE_HEIGHT;
  const iw = C.IRRADIANCE_TEXTURE_WIDTH;
  const ih = C.IRRADIANCE_TEXTURE_HEIGHT;
  const sw = C.SCATTERING_TEXTURE_WIDTH;
  const sh = C.SCATTERING_TEXTURE_HEIGHT;
  const sd = C.SCATTERING_TEXTURE_DEPTH;
  const sms = C.SCATTERING_TEXTURE_WIDTH;
  const smh = C.SCATTERING_TEXTURE_HEIGHT;
  const smd = C.SCATTERING_TEXTURE_DEPTH;
  const hos = C.SCATTERING_TEXTURE_WIDTH;
  const hosh = C.SCATTERING_TEXTURE_HEIGHT;
  const hosd = C.SCATTERING_TEXTURE_DEPTH;
  const transF32 = decodeFloat16ToFloat32(transBuf);
  const irrF32 = decodeFloat16ToFloat32(irrBuf);
  const scatterF32 = decodeFloat16ToFloat32(scatterBuf);
  const singleMieScatterF32 = decodeFloat16ToFloat32(singleMieScatterBuf);
  const higherOrderScatterF32 = decodeFloat16ToFloat32(higherOrderScatterBuf);
  const transTex = new Cesium.Texture({
    context,
    width: tw,
    height: th,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: transF32, width: tw, height: th },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
    }),
  });

  const irrTex = new Cesium.Texture({
    context,
    width: iw,
    height: ih,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: irrF32, width: iw, height: ih },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
    }),
  });

  const scatterTex = new Cesium.Texture3D({
    context,
    width: sw,
    height: sh,
    depth: sd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: scatterF32 },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapR: Cesium.TextureWrap.CLAMP_TO_EDGE,
    }),
  });
  const singleMieScatterTex = new Cesium.Texture3D({
    context,
    width: sms,
    height: smh,
    depth: smd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: singleMieScatterF32 },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapR: Cesium.TextureWrap.CLAMP_TO_EDGE,
    }),
  })
  const higherOrderScatterTex = new Cesium.Texture3D({
    context,
    width: hos,
    height: hosh,
    depth: hosd,
    pixelFormat: Cesium.PixelFormat.RGBA,
    pixelDatatype: Cesium.PixelDatatype.FLOAT,
    source: { arrayBufferView: higherOrderScatterF32 },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
      wrapR: Cesium.TextureWrap.CLAMP_TO_EDGE,
    }),
  })
  return {
    transmittanceTexture: transTex,
    irradianceTexture: irrTex,
    scatteringTexture: scatterTex,
    singleMieScatteringTexture: singleMieScatterTex,
    higherOrderScatteringTexture: higherOrderScatterTex,
  };
}

/** three-geospatial 官方预计算资源 CDN（可选使用） */
export const DEFAULT_PRECOMPUTED_TEXTURES_URL =
  'https://media.githubusercontent.com/media/takram-design-engineering/three-geospatial/9c6dfd0054f077f3ad4695b802e74d4c6a814440/packages/atmosphere/assets';
