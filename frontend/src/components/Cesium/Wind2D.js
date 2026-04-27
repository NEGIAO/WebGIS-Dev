const DEFAULT_OPTIONS = {
  speedFactor: 1.0,
  cullSpeedMin: 0.0,
  cullSpeedMax: 15.0,
  windSpeedMin: 0.0,
  windSpeedMax: 15.0,
  arrowLength: 15000.0,
  trailLength: 20000.0,
  decaySpeed: 0.005,
  alphaFactor: 1.0,
  maxWindSpeed: 15.0,
};

const QUAD_POSITIONS = new Float32Array([
  -1.0, -1.0,
  1.0, -1.0,
  1.0, 1.0,
  -1.0, 1.0,
]);

const QUAD_TEXCOORDS = new Float32Array([
  0.0, 0.0,
  1.0, 0.0,
  1.0, 1.0,
  0.0, 1.0,
]);

const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function computeParticleTextureSize(targetCount, gl) {
  const gpuMaxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const maxTextureSize = Math.min(2048, gpuMaxSize);
  const safeCount = Math.max(1, Math.floor(targetCount));
  const root = Math.sqrt(safeCount);
  const log2Root = Math.log2(root);
  const roundedPow = Number.isFinite(log2Root) ? Math.round(log2Root) : 4;
  let size = Math.pow(2, roundedPow);
  size = clamp(size, 16, maxTextureSize);
  return size;
}

function createRandomParticleData(textureSize) {
  const total = textureSize * textureSize;
  const data = new Float32Array(total * 4);
  for (let i = 0; i < total; i += 1) {
    const base = i * 4;
    data[base] = Math.random();
    data[base + 1] = Math.random();
    data[base + 2] = Math.random();
    data[base + 3] = Math.random();
  }
  return data;
}

function createZeroTextureData(textureSize) {
  return new Float32Array(textureSize * textureSize * 4);
}

function createWindAtlasTexture(context, gl, width, height, data) {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error('Failed to create wind atlas texture.');
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  let released = false;
  return {
    _context: context,
    _texture: texture,
    _target: gl.TEXTURE_2D,
    _width: width,
    _height: height,
    destroy() {
      if (released) return;
      gl.deleteTexture(texture);
      released = true;
    },
  };
}

export default class Wind2D {
  constructor(viewer, options = {}) {
    if (!viewer || !viewer.scene || !viewer.scene.context) {
      throw new Error('Wind2D requires a valid Cesium Viewer instance.');
    }

    this._viewer = viewer;
    this._scene = viewer.scene;
    this._context = this._scene.context;
    this._gl = this._context._gl;
    this._Cesium = options.cesium || globalThis.Cesium;

    if (!this._Cesium) {
      throw new Error('Wind2D requires Cesium runtime from options.cesium or window.Cesium.');
    }

    if (!this._context.webgl2) {
      throw new Error('Wind2D requires WebGL2 context.');
    }

    const config = { ...DEFAULT_OPTIONS, ...options };

    this.speedFactor = toFiniteNumber(config.speedFactor, DEFAULT_OPTIONS.speedFactor);
    this.cullSpeedMin = toFiniteNumber(config.cullSpeedMin, DEFAULT_OPTIONS.cullSpeedMin);
    this.cullSpeedMax = toFiniteNumber(config.cullSpeedMax, DEFAULT_OPTIONS.cullSpeedMax);
    this.windSpeedMin = toFiniteNumber(config.windSpeedMin, DEFAULT_OPTIONS.windSpeedMin);
    this.windSpeedMax = toFiniteNumber(config.windSpeedMax, DEFAULT_OPTIONS.windSpeedMax);
    this.arrowLength = toFiniteNumber(config.arrowLength, DEFAULT_OPTIONS.arrowLength);
    this.trailLength = toFiniteNumber(config.trailLength, DEFAULT_OPTIONS.trailLength);
    this.decaySpeed = toFiniteNumber(config.decaySpeed, DEFAULT_OPTIONS.decaySpeed);
    this.alphaFactor = toFiniteNumber(config.alphaFactor, DEFAULT_OPTIONS.alphaFactor);
    this.maxWindSpeed = toFiniteNumber(config.maxWindSpeed, DEFAULT_OPTIONS.maxWindSpeed);

    this.visibleLayerMin = 0;
    this.visibleLayerMax = 0;
    this.particleDensity = toFiniteNumber(options.particleDensity, 1.0);

    this.show = true;

    this._isDestroyed = false;
    this._needsRebuild = true;
    this._particleState = 0;

    this._layerCount = 0;
    this._maxNx = 0;
    this._maxNy = 0;
    this._atlasWidth = 0;
    this._atlasHeight = 0;
    this._dataPointCount = 0;

    this._bounds = null;
    this._altitudes = [];

    this._centerLon = 0.0;
    this._centerLat = 0.0;
    this._centerHeight = 0.0;
    this._centerLonRad = 0.0;
    this._centerLatRad = 0.0;
    this._centerCartesian = this._Cesium.Cartesian3.fromDegrees(0.0, 0.0, 0.0);
    this._modelMatrix = this._Cesium.Transforms.eastNorthUpToFixedFrame(this._centerCartesian);

    this._particleTextureSize = 16;
    this._particleCount = 16 * 16;
    this._drawVertexCount = this._particleCount * 6;

    this._particlePositionTextures = [null, null];
    this._velocityTextures = [null, null];
    this._framebuffers = [null, null];
    this._windAtlasTexture = null;

    this._quadVertexArray = null;
    this._particleVertexArray = null;
    this._particleVertexBuffer = null;

    this._updateProgram = null;
    this._drawProgram = null;
    this._updateCommand = null;
    this._drawCommand = null;
  }

  loadData(apiData) {
    if (!apiData || typeof apiData !== 'object') {
      throw new Error('Wind2D.loadData requires a valid data object.');
    }

    const longitude = toFiniteNumber(apiData.longitude, NaN);
    const latitude = toFiniteNumber(apiData.latitude, NaN);
    const altitude = Array.isArray(apiData.altitude) ? apiData.altitude : [];
    const sizeMesh = Array.isArray(apiData.sizeMesh) ? apiData.sizeMesh : [];
    const count = Array.isArray(apiData.count) ? apiData.count : [];
    const hspeed = Array.isArray(apiData.hspeed) ? apiData.hspeed : [];
    const hdir = Array.isArray(apiData.hdir) ? apiData.hdir : [];
    const vspeed = Array.isArray(apiData.vspeed) ? apiData.vspeed : [];

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error('Wind2D.loadData requires finite longitude and latitude.');
    }

    const layerCount = altitude.length;
    if (layerCount < 1) {
      throw new Error('Wind2D.loadData requires at least one altitude layer.');
    }

    if (sizeMesh.length !== layerCount || count.length !== layerCount) {
      throw new Error('Wind2D.loadData sizeMesh/count length must match altitude length.');
    }

    const normalizedCount = count.map((item) => Math.max(1, Math.floor(toFiniteNumber(item, 1))));
    const normalizedMesh = sizeMesh.map((item) => Math.max(1, toFiniteNumber(item, 1)));
    const normalizedAltitude = altitude.map((item) => toFiniteNumber(item, 0));

    const totalPoints = normalizedCount.reduce((sum, nx) => sum + nx * nx, 0);
    if (hspeed.length < totalPoints || hdir.length < totalPoints || vspeed.length < totalPoints) {
      throw new Error('Wind2D.loadData hspeed/hdir/vspeed length does not match grid count.');
    }

    this._layerCount = layerCount;
    this.visibleLayerMin = 0;
    this.visibleLayerMax = layerCount - 1;
    this._altitudes = normalizedAltitude.slice();

    this._maxNx = Math.max(...normalizedCount);
    this._maxNy = this._maxNx;
    this._atlasWidth = this._maxNx;
    this._atlasHeight = this._maxNy * layerCount;

    const atlasData = new Float32Array(this._atlasWidth * this._atlasHeight * 4);
    let srcOffset = 0;

    for (let k = 0; k < layerCount; k += 1) {
      const nx = normalizedCount[k];
      const ny = nx;

      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const srcIdx = srcOffset + j * nx + i;
          const dstIdx = ((k * this._maxNy + j) * this._atlasWidth + i) * 4;

          const speed = Number(hspeed[srcIdx]);
          const directionDeg = Number(hdir[srcIdx]);
          const vertical = Number(vspeed[srcIdx]);
          const valid = Number.isFinite(speed) && Number.isFinite(directionDeg);

          if (!valid) {
            atlasData[dstIdx] = 0.0;
            atlasData[dstIdx + 1] = 0.0;
            atlasData[dstIdx + 2] = 0.0;
            atlasData[dstIdx + 3] = 0.0;
            continue;
          }

          const dirRad = (directionDeg * Math.PI) / 180.0;
          atlasData[dstIdx] = speed * Math.sin(dirRad);
          atlasData[dstIdx + 1] = speed * Math.cos(dirRad);
          atlasData[dstIdx + 2] = Number.isFinite(vertical) ? vertical : 0.0;
          atlasData[dstIdx + 3] = 1.0;
        }
      }

      srcOffset += nx * ny;
    }

    this._createOrReplaceWindAtlasTexture(atlasData);

    const maxSizeMesh = Math.max(...normalizedMesh);
    const totalSizeMeters = this._maxNx * maxSizeMesh;
    const halfSizeDeg = totalSizeMeters / 2.0 / 111320.0;
    const latRad = (latitude * Math.PI) / 180.0;
    const cosLat = Math.max(0.000001, Math.abs(Math.cos(latRad)));
    const halfSizeLonDeg = totalSizeMeters / 2.0 / (111320.0 * cosLat);

    this._bounds = {
      minLon: longitude - halfSizeLonDeg,
      maxLon: longitude + halfSizeLonDeg,
      minLat: latitude - halfSizeDeg,
      maxLat: latitude + halfSizeDeg,
      minHeight: Math.min(...normalizedAltitude),
      maxHeight: Math.max(...normalizedAltitude),
    };

    this._dataPointCount = totalPoints;
    this._updateTransform();
    this.setParticleDensity(this.particleDensity);
    this._needsRebuild = true;
  }

  setParticleCount(count) {
    const target = Math.max(1, Math.floor(toFiniteNumber(count, 1)));
    const nextSize = computeParticleTextureSize(target, this._gl);

    const hasResources = !!(
      this._particlePositionTextures[0]
      && this._particlePositionTextures[1]
      && this._velocityTextures[0]
      && this._velocityTextures[1]
      && this._framebuffers[0]
      && this._framebuffers[1]
    );

    if (hasResources && nextSize === this._particleTextureSize) {
      return;
    }

    this._particleTextureSize = nextSize;
    this._particleCount = nextSize * nextSize;
    this._drawVertexCount = this._particleCount * 6;

    this._rebuildParticleResources();
    this._needsRebuild = true;
  }

  setParticleDensity(density) {
    const safeDensity = clamp(toFiniteNumber(density, this.particleDensity), 0.05, 10.0);
    this.particleDensity = safeDensity;

    if (this._dataPointCount <= 0) {
      return;
    }

    const targetCount = Math.max(1, Math.floor(this._dataPointCount * safeDensity));
    this.setParticleCount(targetCount);
  }

  setBounds(minLon, maxLon, minLat, maxLat) {
    const lon0 = toFiniteNumber(minLon, NaN);
    const lon1 = toFiniteNumber(maxLon, NaN);
    const lat0 = toFiniteNumber(minLat, NaN);
    const lat1 = toFiniteNumber(maxLat, NaN);

    if (!Number.isFinite(lon0) || !Number.isFinite(lon1) || !Number.isFinite(lat0) || !Number.isFinite(lat1)) {
      return;
    }

    const nextBounds = this._bounds
      ? { ...this._bounds }
      : {
        minHeight: 0,
        maxHeight: 0,
      };

    nextBounds.minLon = Math.min(lon0, lon1);
    nextBounds.maxLon = Math.max(lon0, lon1);
    nextBounds.minLat = Math.min(lat0, lat1);
    nextBounds.maxLat = Math.max(lat0, lat1);

    this._bounds = nextBounds;
    this._updateTransform();
    this._needsRebuild = true;
  }

  flyTo() {
    if (!this._bounds || !this._viewer || !this._viewer.camera) {
      return;
    }

    const centerLon = (this._bounds.minLon + this._bounds.maxLon) * 0.5;
    const centerLat = (this._bounds.minLat + this._bounds.maxLat) * 0.5;

    this._viewer.camera.flyTo({
      destination: this._Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 2000000.0),
      orientation: {
        heading: 0.0,
        pitch: -this._Cesium.Math.PI_OVER_TWO,
        roll: 0.0,
      },
    });
  }

  update(frameState) {
    if (this._isDestroyed || !this.show) {
      return;
    }

    const ready = !!(
      this._windAtlasTexture
      && this._particlePositionTextures[0]
      && this._particlePositionTextures[1]
      && this._velocityTextures[0]
      && this._velocityTextures[1]
      && this._framebuffers[0]
      && this._framebuffers[1]
    );

    if (!ready) {
      return;
    }

    if (this._needsRebuild || !this._updateCommand || !this._drawCommand) {
      this._rebuildCommands();
    }

    if (!this._updateCommand || !this._drawCommand) {
      return;
    }

    const readState = this._particleState;
    const writeState = 1 - readState;

    this._updateCommand.framebuffer = this._framebuffers[writeState];
    this._updateCommand.execute(this._context, frameState ? frameState.passState : undefined);

    this._particleState = writeState;
    this._drawCommand.modelMatrix = this._modelMatrix;

    if (frameState && Array.isArray(frameState.commandList)) {
      frameState.commandList.push(this._drawCommand);
    }
  }

  destroy() {
    if (this._isDestroyed) {
      return;
    }

    this._destroyCommandResources();
    this._destroyParticleResources();

    if (this._quadVertexArray) {
      this._quadVertexArray.destroy();
      this._quadVertexArray = null;
    }

    if (this._windAtlasTexture) {
      this._windAtlasTexture.destroy();
      this._windAtlasTexture = null;
    }

    this._isDestroyed = true;
  }

  isDestroyed() {
    return this._isDestroyed;
  }

  _createOrReplaceWindAtlasTexture(atlasData) {
    if (this._windAtlasTexture) {
      this._windAtlasTexture.destroy();
      this._windAtlasTexture = null;
    }

    this._windAtlasTexture = createWindAtlasTexture(
      this._context,
      this._gl,
      this._atlasWidth,
      this._atlasHeight,
      atlasData,
    );
  }

  _updateTransform() {
    if (!this._bounds) {
      return;
    }

    this._centerLon = (this._bounds.minLon + this._bounds.maxLon) * 0.5;
    this._centerLat = (this._bounds.minLat + this._bounds.maxLat) * 0.5;
    this._centerHeight = (this._bounds.minHeight + this._bounds.maxHeight) * 0.5;

    this._centerLonRad = this._Cesium.Math.toRadians(this._centerLon);
    this._centerLatRad = this._Cesium.Math.toRadians(this._centerLat);
    this._centerCartesian = this._Cesium.Cartesian3.fromDegrees(
      this._centerLon,
      this._centerLat,
      this._centerHeight,
    );
    this._modelMatrix = this._Cesium.Transforms.eastNorthUpToFixedFrame(this._centerCartesian);
  }

  _rebuildParticleResources() {
    this._destroyParticleResources();

    const Cesium = this._Cesium;
    const size = this._particleTextureSize;
    const randomData = createRandomParticleData(size);
    const zeroData = createZeroTextureData(size);

    for (let i = 0; i < 2; i += 1) {
      this._particlePositionTextures[i] = new Cesium.Texture({
        context: this._context,
        width: size,
        height: size,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        source: {
          width: size,
          height: size,
          arrayBufferView: randomData,
        },
        sampler: new Cesium.Sampler({
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        }),
      });

      this._velocityTextures[i] = new Cesium.Texture({
        context: this._context,
        width: size,
        height: size,
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        source: {
          width: size,
          height: size,
          arrayBufferView: zeroData,
        },
        sampler: new Cesium.Sampler({
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        }),
      });

      this._framebuffers[i] = new Cesium.Framebuffer({
        context: this._context,
        colorTextures: [
          this._particlePositionTextures[i],
          this._velocityTextures[i],
        ],
        destroyAttachments: false,
      });

      const nativeFbo = this._framebuffers[i]._framebuffer;
      this._gl.bindFramebuffer(this._gl.DRAW_FRAMEBUFFER, nativeFbo);
      this._gl.drawBuffers([this._gl.COLOR_ATTACHMENT0, this._gl.COLOR_ATTACHMENT1]);
      this._gl.bindFramebuffer(this._gl.DRAW_FRAMEBUFFER, null);
    }

    this._particleState = 0;
  }

  _destroyParticleResources() {
    for (let i = 0; i < 2; i += 1) {
      if (this._framebuffers[i]) {
        this._framebuffers[i].destroy();
        this._framebuffers[i] = null;
      }
      if (this._particlePositionTextures[i]) {
        this._particlePositionTextures[i].destroy();
        this._particlePositionTextures[i] = null;
      }
      if (this._velocityTextures[i]) {
        this._velocityTextures[i].destroy();
        this._velocityTextures[i] = null;
      }
    }
  }

  _rebuildCommands() {
    const hasTextures = !!(
      this._particlePositionTextures[0]
      && this._particlePositionTextures[1]
      && this._velocityTextures[0]
      && this._velocityTextures[1]
      && this._framebuffers[0]
      && this._framebuffers[1]
      && this._windAtlasTexture
    );

    if (!hasTextures) {
      return;
    }

    this._destroyCommandResources();
    this._buildQuadVertexArray();
    this._buildParticleVertexArray();
    this._buildUpdateProgram();
    this._buildDrawProgram();
    this._buildUpdateCommand();
    this._buildDrawCommand();
    this._needsRebuild = false;
  }

  _destroyCommandResources() {
    this._updateCommand = null;
    this._drawCommand = null;

    if (this._updateProgram) {
      this._updateProgram.destroy();
      this._updateProgram = null;
    }

    if (this._drawProgram) {
      this._drawProgram.destroy();
      this._drawProgram = null;
    }

    if (this._particleVertexArray) {
      this._particleVertexArray.destroy();
      this._particleVertexArray = null;
    }

    if (this._particleVertexBuffer) {
      this._particleVertexBuffer.destroy();
      this._particleVertexBuffer = null;
    }
  }

  _buildQuadVertexArray() {
    if (this._quadVertexArray) {
      return;
    }

    const Cesium = this._Cesium;
    const positionBuffer = Cesium.Buffer.createVertexBuffer({
      context: this._context,
      typedArray: QUAD_POSITIONS,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    });

    const texCoordBuffer = Cesium.Buffer.createVertexBuffer({
      context: this._context,
      typedArray: QUAD_TEXCOORDS,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    });

    const indexBuffer = Cesium.Buffer.createIndexBuffer({
      context: this._context,
      typedArray: QUAD_INDICES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    });

    this._quadVertexArray = new Cesium.VertexArray({
      context: this._context,
      attributes: [
        {
          index: 0,
          vertexBuffer: positionBuffer,
          componentsPerAttribute: 2,
        },
        {
          index: 1,
          vertexBuffer: texCoordBuffer,
          componentsPerAttribute: 2,
        },
      ],
      indexBuffer,
    });
  }

  _buildParticleVertexArray() {
    const Cesium = this._Cesium;
    const particleIndices = new Float32Array(this._drawVertexCount);
    for (let i = 0; i < particleIndices.length; i += 1) {
      particleIndices[i] = i;
    }

    this._particleVertexBuffer = Cesium.Buffer.createVertexBuffer({
      context: this._context,
      typedArray: particleIndices,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    });

    this._particleVertexArray = new Cesium.VertexArray({
      context: this._context,
      attributes: [
        {
          index: 0,
          vertexBuffer: this._particleVertexBuffer,
          componentsPerAttribute: 1,
        },
      ],
    });
  }

  _buildUpdateProgram() {
    const Cesium = this._Cesium;
    const vertexShaderSource = `#version 300 es
in vec2 position;
in vec2 textureCoordinates;
out vec2 v_textureCoordinates;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
  v_textureCoordinates = textureCoordinates;
}`;

    const fragmentShaderSource = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_textureCoordinates;

uniform sampler2D currentParticlesPosition;
uniform sampler2D windAtlas;
uniform float speedFactor;
uniform float maxWindSpeed;
uniform float decaySpeed;
uniform int layerCount;
uniform float maxNx;
uniform float maxNy;
uniform float atlasW;
uniform float atlasH;
uniform int visibleLayerMin;
uniform int visibleLayerMax;

layout(location = 0) out vec4 positionOut;
layout(location = 1) out vec4 velocityOut;

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 randomPos(vec2 uv) {
  return vec3(
    hash2(uv + vec2(0.123, 0.713)),
    hash2(uv + vec2(0.531, 0.219)),
    hash2(uv + vec2(0.917, 0.417))
  );
}

float wrap01(float value) {
  return value < 0.0 ? value + 1.0 : (value > 1.0 ? value - 1.0 : value);
}

vec4 sampleLayer(int layerIdx, vec2 posXY) {
  float layerStartV = float(layerIdx) * maxNy / atlasH;
  float layerEndV = float(layerIdx + 1) * maxNy / atlasH;
  float u = posXY.x * maxNx / atlasW;
  float v = mix(layerStartV, layerEndV, posXY.y);
  return texture(windAtlas, vec2(u, v));
}

vec4 sampleWind(vec3 pos) {
  if (layerCount <= 0) {
    return vec4(0.0);
  }

  int minLayer = max(0, min(visibleLayerMin, layerCount - 1));
  int maxLayer = max(minLayer, min(visibleLayerMax, layerCount - 1));

  float z = clamp(pos.z, 0.0, 1.0);

  int lower = 0;
  int upper = 0;

  if (layerCount > 1) {
    float firstCenter = 0.5 / float(layerCount);
    if (z > firstCenter) {
      lower = layerCount - 1;
      upper = layerCount - 1;
      for (int i = 0; i < 64; i++) {
        if (i >= layerCount) {
          break;
        }

        float center = (float(i) + 0.5) / float(layerCount);
        if (z >= center) {
          lower = i;
        }
        if (z < center) {
          upper = i;
          break;
        }
      }

      if (upper < lower) {
        upper = lower;
      }
    }
  }

  if (lower < minLayer || lower > maxLayer || upper < minLayer || upper > maxLayer) {
    return vec4(0.0);
  }

  vec4 lowerWind = sampleLayer(lower, pos.xy);
  if (lowerWind.a < 0.5) {
    return vec4(0.0);
  }

  if (upper == lower) {
    return vec4(lowerWind.xyz, 1.0);
  }

  vec4 upperWind = sampleLayer(upper, pos.xy);
  if (upperWind.a < 0.5) {
    return vec4(0.0);
  }

  float zLower = (float(lower) + 0.5) / float(layerCount);
  float zUpper = (float(upper) + 0.5) / float(layerCount);
  float t = clamp((z - zLower) / max(1e-6, zUpper - zLower), 0.0, 1.0);
  return vec4(mix(lowerWind.xyz, upperWind.xyz, t), 1.0);
}

void main() {
  vec4 particle = texture(currentParticlesPosition, v_textureCoordinates);
  vec3 pos = particle.xyz;
  float age = fract(particle.w);

  age += decaySpeed;
  if (age > 1.0) {
    age = 0.0;
    pos = randomPos(v_textureCoordinates);
  }

  vec4 sampled = sampleWind(pos);
  vec3 wind = sampled.xyz;

  float packed = 0.0;
  if (sampled.a < 0.5) {
    age = 0.0;
    pos = randomPos(v_textureCoordinates + vec2(0.217, 0.683));
    wind = vec3(0.0);
    packed = 0.0;
  } else {
    vec3 nextPos = pos + wind * speedFactor * 0.001;
    pos = vec3(wrap01(nextPos.x), wrap01(nextPos.y), wrap01(nextPos.z));
    float normalizedSpeed = clamp(length(wind) / max(maxWindSpeed, 1e-6), 0.0, 1.0);
    packed = floor(normalizedSpeed * 255.0) + age;
  }

  positionOut = vec4(pos, packed);
  velocityOut = vec4(wind, 0.0);
}`;

    this._updateProgram = Cesium.ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations: {
        position: 0,
        textureCoordinates: 1,
      },
    });
  }

  _buildDrawProgram() {
    const Cesium = this._Cesium;
    const vertexShaderSource = `#version 300 es
precision highp float;
precision highp sampler2D;

in float particleIndex;

uniform sampler2D currentParticlesPosition;
uniform sampler2D velocityTexture;
uniform float particlesTextureSize;
uniform float arrowLength;
uniform float trailLength;
uniform float speedMin;
uniform float speedMax;
uniform float boundsMinLon;
uniform float boundsMaxLon;
uniform float boundsMinLat;
uniform float boundsMaxLat;
uniform float boundsMinHeight;
uniform float boundsMaxHeight;
uniform vec3 centerECEF;
uniform float centerLonRad;
uniform float centerLatRad;

out float v_age;
out float v_speed;
out float v_culled;

mat3 enuToECEF(float lon, float lat) {
  float cosLon = cos(lon);
  float sinLon = sin(lon);
  float cosLat = cos(lat);
  float sinLat = sin(lat);

  vec3 east = vec3(-sinLon, cosLon, 0.0);
  vec3 north = vec3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
  vec3 up = vec3(cosLat * cosLon, cosLat * sinLon, sinLat);
  return mat3(east, north, up);
}

vec3 lonLatHeightToECEF(float lon, float lat, float height) {
  float a = 6378137.0;
  float e2 = 0.00669437999014;

  float sinLat = sin(lat);
  float cosLat = cos(lat);
  float sinLon = sin(lon);
  float cosLon = cos(lon);

  float N = a / sqrt(1.0 - e2 * sinLat * sinLat);
  return vec3(
    (N + height) * cosLat * cosLon,
    (N + height) * cosLat * sinLon,
    (N * (1.0 - e2) + height) * sinLat
  );
}

void main() {
  float pIdx = floor(particleIndex / 6.0);
  float vType = particleIndex - pIdx * 6.0;

  float tx = mod(pIdx, particlesTextureSize);
  float ty = floor(pIdx / particlesTextureSize);
  vec2 uv = (vec2(tx, ty) + 0.5) / particlesTextureSize;

  vec4 particle = texture(currentParticlesPosition, uv);
  vec3 normalizedPos = clamp(particle.xyz, 0.0, 1.0);
  vec3 windENU = texture(velocityTexture, uv).xyz;

  float age = fract(particle.w);
  float packedSpeed = floor(particle.w) / 255.0;

  v_age = age;
  v_speed = packedSpeed;
  v_culled = 0.0;

  if (packedSpeed < speedMin || packedSpeed > speedMax) {
    v_culled = 1.0;
    gl_Position = vec4(0.0);
    return;
  }

  mat3 enuToEcefCenter = enuToECEF(centerLonRad, centerLatRad);
  mat3 ecefToLocal = transpose(enuToEcefCenter);
  vec3 windLocal = ecefToLocal * (enuToEcefCenter * windENU);
  float speedLocal = length(windLocal);
  if (speedLocal < 1e-6) {
    v_culled = 1.0;
    gl_Position = vec4(0.0);
    return;
  }

  float lon = mix(boundsMinLon, boundsMaxLon, normalizedPos.x);
  float lat = mix(boundsMinLat, boundsMaxLat, normalizedPos.y);
  float height = mix(boundsMinHeight, boundsMaxHeight, normalizedPos.z);
  vec3 ecefPosition = lonLatHeightToECEF(lon, lat, height);
  vec3 localPosition = ecefToLocal * (ecefPosition - centerECEF);

  vec3 forward = normalize(windLocal);
  vec3 up = vec3(0.0, 0.0, 1.0);
  vec3 right = cross(forward, up);
  float rightLen = length(right);
  right = rightLen < 1e-6 ? vec3(1.0, 0.0, 0.0) : (right / rightLen);

  vec3 tip = localPosition + forward * arrowLength;
  vec3 tail = localPosition - forward * trailLength;
  float headLen = arrowLength * 0.3;
  float headWidth = arrowLength * 0.15;
  vec3 headBase = tip - forward * headLen;
  vec3 leftWing = headBase + right * headWidth;
  vec3 rightWing = headBase - right * headWidth;

  vec3 vertex = tail;
  if (vType < 0.5) {
    vertex = tail;
  } else if (vType < 1.5) {
    vertex = tip;
  } else if (vType < 2.5) {
    vertex = tip;
  } else if (vType < 3.5) {
    vertex = leftWing;
  } else if (vType < 4.5) {
    vertex = tip;
  } else {
    vertex = rightWing;
  }

  gl_Position = czm_modelViewProjection * vec4(vertex, 1.0);
}`;

    const fragmentShaderSource = `#version 300 es
precision highp float;

in float v_age;
in float v_speed;
in float v_culled;

uniform float alphaFactor;
uniform float colorSpeedMin;
uniform float colorSpeedMax;

out vec4 out_FragColor;

vec3 speedToColor(float t) {
  if (t < 0.25) {
    return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t / 0.25);
  }
  if (t < 0.5) {
    return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) / 0.25);
  }
  if (t < 0.75) {
    return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.5) / 0.25);
  }
  return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
}

void main() {
  if (v_culled > 0.5) {
    discard;
  }

  float speedT = clamp(
    (v_speed - colorSpeedMin) / max(1e-6, colorSpeedMax - colorSpeedMin),
    0.0,
    1.0
  );

  vec3 color = speedToColor(speedT);
  float alpha = clamp((1.0 - v_age) * alphaFactor, 0.0, 1.0);
  out_FragColor = vec4(color, alpha);
}`;

    this._drawProgram = Cesium.ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations: {
        particleIndex: 0,
      },
    });
  }

  _buildUpdateCommand() {
    const Cesium = this._Cesium;
    const renderState = Cesium.RenderState.fromCache({
      viewport: new Cesium.BoundingRectangle(
        0,
        0,
        this._particleTextureSize,
        this._particleTextureSize,
      ),
    });

    this._updateCommand = new Cesium.DrawCommand({
      owner: this,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      vertexArray: this._quadVertexArray,
      shaderProgram: this._updateProgram,
      renderState,
      framebuffer: this._framebuffers[1 - this._particleState],
      uniformMap: this._getUpdateUniformMap(),
    });
  }

  _buildDrawCommand() {
    const Cesium = this._Cesium;
    const renderState = Cesium.RenderState.fromCache({
      depthTest: {
        enabled: true,
      },
      depthMask: false,
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });

    this._drawCommand = new Cesium.DrawCommand({
      owner: this,
      primitiveType: Cesium.PrimitiveType.LINES,
      vertexArray: this._particleVertexArray,
      shaderProgram: this._drawProgram,
      renderState,
      modelMatrix: this._modelMatrix,
      uniformMap: this._getDrawUniformMap(),
      pass: Cesium.Pass.TRANSLUCENT,
      count: this._drawVertexCount,
    });
  }

  _getVisibleLayerRange() {
    if (this._layerCount <= 0) {
      return { min: 0, max: 0 };
    }

    const minLayer = clamp(
      Math.floor(toFiniteNumber(this.visibleLayerMin, 0)),
      0,
      this._layerCount - 1,
    );

    const maxLayer = clamp(
      Math.floor(toFiniteNumber(this.visibleLayerMax, this._layerCount - 1)),
      minLayer,
      this._layerCount - 1,
    );

    return { min: minLayer, max: maxLayer };
  }

  _normalizeSpeedRange(minValue, maxValue) {
    const denominator = Math.max(0.0001, toFiniteNumber(this.maxWindSpeed, DEFAULT_OPTIONS.maxWindSpeed));
    const normMin = clamp(toFiniteNumber(minValue, 0) / denominator, 0, 1);
    const normMax = clamp(toFiniteNumber(maxValue, denominator) / denominator, 0, 1);
    return {
      min: Math.min(normMin, normMax),
      max: Math.max(normMin, normMax),
    };
  }

  _getUpdateUniformMap() {
    return {
      currentParticlesPosition: () => this._particlePositionTextures[this._particleState],
      windAtlas: () => this._windAtlasTexture,
      speedFactor: () => toFiniteNumber(this.speedFactor, DEFAULT_OPTIONS.speedFactor),
      maxWindSpeed: () => Math.max(0.0001, toFiniteNumber(this.maxWindSpeed, DEFAULT_OPTIONS.maxWindSpeed)),
      decaySpeed: () => clamp(toFiniteNumber(this.decaySpeed, DEFAULT_OPTIONS.decaySpeed), 0.0, 1.0),
      layerCount: () => this._layerCount,
      maxNx: () => this._maxNx,
      maxNy: () => this._maxNy,
      atlasW: () => this._atlasWidth,
      atlasH: () => this._atlasHeight,
      visibleLayerMin: () => this._getVisibleLayerRange().min,
      visibleLayerMax: () => this._getVisibleLayerRange().max,
    };
  }

  _getDrawUniformMap() {
    return {
      currentParticlesPosition: () => this._particlePositionTextures[this._particleState],
      velocityTexture: () => this._velocityTextures[this._particleState],
      particlesTextureSize: () => this._particleTextureSize,
      arrowLength: () => toFiniteNumber(this.arrowLength, DEFAULT_OPTIONS.arrowLength),
      trailLength: () => toFiniteNumber(this.trailLength, DEFAULT_OPTIONS.trailLength),
      speedMin: () => this._normalizeSpeedRange(this.cullSpeedMin, this.cullSpeedMax).min,
      speedMax: () => this._normalizeSpeedRange(this.cullSpeedMin, this.cullSpeedMax).max,
      colorSpeedMin: () => this._normalizeSpeedRange(this.windSpeedMin, this.windSpeedMax).min,
      colorSpeedMax: () => this._normalizeSpeedRange(this.windSpeedMin, this.windSpeedMax).max,
      alphaFactor: () => clamp(toFiniteNumber(this.alphaFactor, DEFAULT_OPTIONS.alphaFactor), 0.0, 1.0),
      boundsMinLon: () => (this._bounds ? this._Cesium.Math.toRadians(this._bounds.minLon) : 0.0),
      boundsMaxLon: () => (this._bounds ? this._Cesium.Math.toRadians(this._bounds.maxLon) : 0.0),
      boundsMinLat: () => (this._bounds ? this._Cesium.Math.toRadians(this._bounds.minLat) : 0.0),
      boundsMaxLat: () => (this._bounds ? this._Cesium.Math.toRadians(this._bounds.maxLat) : 0.0),
      boundsMinHeight: () => (this._bounds ? this._bounds.minHeight : 0.0),
      boundsMaxHeight: () => (this._bounds ? this._bounds.maxHeight : 0.0),
      centerECEF: () => this._centerCartesian,
      centerLonRad: () => this._centerLonRad,
      centerLatRad: () => this._centerLatRad,
    };
  }
}