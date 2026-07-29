/**
 * 与 three-geospatial 完全一致的 .bin 加载方式：
 * 使用 DataTextureLoader(Data3DTexture, parseUint8Array, options).load(url)，
 * 解析结果为 Three.js 的 Data3DTexture。解析阶段不涉及 Cesium。
 *
 * 参考：Clouds.tsx useLoad3DTexture、DataTextureLoader.ts
 */
import {
  Data3DTexture,
  FileLoader,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
} from "three";
// getCesium 不在此处调用：Cesium 作为参数由 bindData3DTextureToCesiumContext 的调用方传入

// --- 与 packages/core 一致：parseUint8Array、ArrayBufferLoader、TypedArrayLoader、DataTextureLoader 逻辑 ---

const parseUint8Array = (buffer) => new Uint8Array(buffer);

function loadArrayBuffer(url, onLoad, onProgress, onError) {
  const loader = new FileLoader();
  loader.setResponseType("arraybuffer");
  loader.load(url, onLoad, onProgress, onError);
}

function loadTypedArray(url, parser, onLoad, onProgress, onError) {
  loadArrayBuffer(
    url,
    (arrayBuffer) => {
      try {
        onLoad(parser(arrayBuffer));
      } catch (error) {
        if (onError) onError(error);
        else console.error(error);
      }
    },
    onProgress,
    onError
  );
}

/**
 * 与 Clouds.tsx useLoad3DTexture 相同：DataTextureLoader(Data3DTexture, parseUint8Array, options).load(input)
 * 返回 Promise<Data3DTexture>，解析仅在此完成，不涉及 Cesium。
 */
export function loadBinThreeGeospatial(url, size) {
  return new Promise((resolve, reject) => {
    const texture = new Data3DTexture();
    const options = {
      width: size,
      height: size,
      depth: size,
      format: RedFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      colorSpace: NoColorSpace,
    };
    loadTypedArray(
      url,
      parseUint8Array,
      (array) => {
        texture.image.data = array;
        texture.image.width = options.width;
        texture.image.height = options.height;
        texture.image.depth = options.depth;
        texture.format = options.format;
        texture.minFilter = options.minFilter;
        texture.magFilter = options.magFilter;
        texture.wrapS = options.wrapS;
        texture.wrapT = options.wrapT;
        texture.wrapR = options.wrapR;
        texture.colorSpace = options.colorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

/**
 * 将已解析好的 Three.js Data3DTexture 绑定到 Cesium 上下文并返回可供着色器使用的纹理。
 * 与 three-geospatial 一致使用单通道（RedFormat → Cesium PixelFormat.RED），直接传 data，不扩成 RGBA。
 * 此处不做解析，仅做「解析结果 → 传给着色器」的绑定。Cesium 由调用方传入，避免全局依赖。
 */
export function bindData3DTextureToCesiumContext(viewer, data3DTexture, Cesium) {
  const raw = data3DTexture.image.data;
  const w = data3DTexture.image.width;
  const h = data3DTexture.image.height;
  const d = data3DTexture.image.depth;
  return new Cesium.Texture3D({
    context: viewer.scene.context,
    width: w,
    height: h,
    depth: d,
    pixelFormat: Cesium.PixelFormat.RED,
    pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
    flipY: false,
    source: {
      arrayBufferView: raw,
      width: w,
      height: h,
      depth: d,
    },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.REPEAT,
      wrapT: Cesium.TextureWrap.REPEAT,
      wrapR: Cesium.TextureWrap.REPEAT,
    }),
  });
}

/**
 * 将 3D 体积数据打包成 2D 图集（按 slice 平铺），用于 Cesium PostProcessStage（仅支持 sampler2D）。
 * 布局：depth 个 slice，每 slice 为 size×size，按 cols 列×rows 行平铺。
 * @param {Uint8Array} data - size×size×size 的线性数据，索引 z*size*size + y*size + x
 * @param {number} size - 每维尺寸（width=height=depth=size）
 * @returns {{ data: Uint8Array, atlasWidth: number, atlasHeight: number, cols: number, rows: number, volumeSize: number }}
 */
export function pack3DTo2DAtlas(data, size) {
  const depth = size;
  const cols = Math.min(16, size);
  const rows = Math.ceil(depth / cols);
  const atlasWidth = cols * size;
  const atlasHeight = rows * size;
  const atlasData = new Uint8Array(atlasWidth * atlasHeight);

  for (let z = 0; z < depth; z++) {
    const col = z % cols;
    const row = Math.floor(z / cols);
    const baseAx = col * size;
    const baseAy = row * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i3 = z * size * size + y * size + x;
        const ax = baseAx + x;
        const ay = baseAy + y;
        const i2 = ay * atlasWidth + ax;
        atlasData[i2] = data[i3];
      }
    }
  }

  return { data: atlasData, atlasWidth, atlasHeight, cols, rows, volumeSize: size };
}

/**
 * 加载 .bin 并转为 Cesium 可用的 2D 图集纹理（供 PostProcessStage 使用，因其不支持 Texture3D）。
 * @param {object} viewer - Cesium Viewer
 * @param {string} url - .bin 地址
 * @param {number} size - 体积尺寸（如 128、32）
 * @param {object} Cesium - Cesium 命名空间
 * @returns {Promise<{ texture: Cesium.Texture, atlasCols: number, atlasRows: number, volumeSize: number }>}
 */
export async function loadBinAs2DAtlasForCesium(viewer, url, size, Cesium) {
  const data3D = await loadBinThreeGeospatial(url, size);
  const raw = data3D.image.data;
  const { data, atlasWidth, atlasHeight, cols, rows, volumeSize } = pack3DTo2DAtlas(raw, size);

  const texture = new Cesium.Texture({
    context: viewer.scene.context,
    width: atlasWidth,
    height: atlasHeight,
    pixelFormat: Cesium.PixelFormat.RED,
    pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
    flipY: true,
    source: {
      arrayBufferView: data,
      width: atlasWidth,
      height: atlasHeight,
    },
    sampler: new Cesium.Sampler({
      minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
      magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
      wrapS: Cesium.TextureWrap.REPEAT,
      wrapT: Cesium.TextureWrap.REPEAT,
    }),
  });

  return { texture, atlasCols: cols, atlasRows: rows, volumeSize };
}
