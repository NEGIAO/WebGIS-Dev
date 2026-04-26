import * as Cesium from 'cesium';

// 默认配置
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

// 全屏quad顶点数据
const QUAD_POSITIONS = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);
const QUAD_TEXCOORDS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

function checkWebGL2(context) {
  if (!context.webgl2) {
    throw new Error('Wind2D requires WebGL 2.0');
  }
}

function nextPowerOfTwo(n) {
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

function computeParticleTextureSize(particleCount, gl) {
  const maxTextureSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
  let size = Math.sqrt(particleCount);
  size = nextPowerOfTwo(size);
  size = Math.min(maxTextureSize, Math.max(16, size));
  return size;
}

function generateRandomParticleData(textureSize) {
  const count = textureSize * textureSize;
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = Math.random();
    data[i * 4 + 1] = Math.random();
    data[i * 4 + 2] = Math.random();
    data[i * 4 + 3] = 0;
  }
  return data;
}

export default class Wind2D {
  constructor(viewer, options = {}) {
    this._viewer = viewer;
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._scene = viewer.scene;
    this._context = this._scene.context;
    
    checkWebGL2(this._context);
    this._gl = this._context._gl;
    
    this._isDestroyed = false;
    this._needsRebuild = true;
    this._particleState = 0;
    
    this._windAtlasTexture = null;
    this._atlasWidth = 0;
    this._atlasHeight = 0;
    this._maxNx = 0;
    this._maxNy = 0;
    this._layerCount = 0;
    this._altitudes = [];
    this._bounds = null;
    this._centerLon = 0;
    this._centerLat = 0;
    this._centerHeight = 0;
    this._modelMatrix = null;
    this._centerCartesian = null;
    this._centerLonRad = 0;
    this._centerLatRad = 0;
    
    this._particleCount = 0;
    this._particleTextureSize = 16;
    this._particleDensity = 1.0;
    this._maxParticleCount = 0;
    this._particlePositionTextures = [null, null];
    this._velocityTextures = [null, null];
    this._framebuffers = [null, null];
    
    this._quadVertexArray = null;
    this._particleVertexArray = null;
    this._particleVertexBuffer = null;
    this._updateCommand = null;
    this._drawCommand = null;
    
    this.speedFactor = this._options.speedFactor;
    this.cullSpeedMin = this._options.cullSpeedMin;
    this.cullSpeedMax = this._options.cullSpeedMax;
    this.windSpeedMin = this._options.windSpeedMin;
    this.windSpeedMax = this._options.windSpeedMax;
    this.arrowLength = this._options.arrowLength;
    this.trailLength = this._options.trailLength;
    this.decaySpeed = this._options.decaySpeed;
    this.alphaFactor = this._options.alphaFactor;
    this.maxWindSpeed = this._options.maxWindSpeed;
    this.visibleLayerMin = 0;
    this.visibleLayerMax = 0;
    
    this._updateProgram = null;
    this._drawProgram = null;
  }
  
  loadData(apiData) {
    const { longitude, latitude, altitude, sizeMesh, count, hspeed, hdir, vspeed } = apiData;
    
    this._layerCount = altitude.length;
    this.visibleLayerMax = this._layerCount - 1;
    this._altitudes = altitude.slice();
    this._centerLon = longitude;
    this._centerLat = latitude;
    this._centerHeight = altitude[0];
    
    const maxNx = Math.max(...count);
    const maxNy = maxNx;
    this._maxNx = maxNx;
    this._maxNy = maxNy;
    this._atlasWidth = maxNx;
    this._atlasHeight = maxNy * this._layerCount;
    
    const maxSizeMesh = Math.max(...sizeMesh);
    const totalSizeMeters = maxNx * maxSizeMesh;
    const halfSizeDeg = totalSizeMeters / 2.0 / 111320.0;
    const halfSizeLonDeg = totalSizeMeters / 2.0 / (111320.0 * Math.cos(latitude * Math.PI / 180));
    
    this._bounds = {
      minLon: longitude - halfSizeLonDeg,
      maxLon: longitude + halfSizeLonDeg,
      minLat: latitude - halfSizeDeg,
      maxLat: latitude + halfSizeDeg,
      minHeight: Math.min(...altitude),
      maxHeight: Math.max(...altitude),
    };
    
    const atlasData = new Float32Array(this._atlasWidth * this._atlasHeight * 4);
    let offset = 0;
    for (let k = 0; k < this._layerCount; k++) {
      const nx = count[k];
      const ny = nx;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const srcIdx = offset + j * nx + i;
          const speed = hspeed[srcIdx];
          const dir = hdir[srcIdx];
          const vw = vspeed[srcIdx];
          
          const dstIdx = ((k * this._maxNy + j) * this._atlasWidth + i) * 4;
          
          const isValid = isFinite(speed) && isFinite(dir) && isFinite(vw);
          if (isValid) {
            const dirRad = dir * Math.PI / 180;
            const u = speed * Math.sin(dirRad);
            const v = speed * Math.cos(dirRad);
            atlasData[dstIdx] = u;
            atlasData[dstIdx + 1] = v;
            atlasData[dstIdx + 2] = vw;
            atlasData[dstIdx + 3] = 1.0;
          } else {
            atlasData[dstIdx] = 0;
            atlasData[dstIdx + 1] = 0;
            atlasData[dstIdx + 2] = 0;
            atlasData[dstIdx + 3] = 0;
          }
        }
      }
      offset += nx * ny;
    }
    
    this._createWindAtlasTexture(atlasData);
    this._updateTransform();
    
    const totalGridPoints = this._layerCount * this._maxNx * this._maxNy;
    this._maxParticleCount = totalGridPoints;
    this.setParticleDensity(this._particleDensity);
    
    this._needsRebuild = true;
  }
  
  _createWindAtlasTexture(data) {
    if (this._windAtlasTexture) {
      this._windAtlasTexture.destroy();
    }
    
    const gl = this._gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this._atlasWidth, this._atlasHeight, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    
    this._windAtlasTexture = {
      _texture: texture,
      _target: gl.TEXTURE_2D,
      destroy: () => gl.deleteTexture(texture),
    };
  }
  
  _updateTransform() {
    const centerDeg = Cesium.Cartographic.fromDegrees(this._centerLon, this._centerLat, this._centerHeight);
    this._centerCartesian = Cesium.Cartographic.toCartesian(centerDeg);
    this._modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(this._centerCartesian);
    this._centerLonRad = centerDeg.longitude;
    this._centerLatRad = centerDeg.latitude;
  }
  
  setParticleCount(count) {
    const gl = this._gl;
    const newSize = computeParticleTextureSize(count, gl);
    if (newSize === this._particleTextureSize && this._particlePositionTextures[0]) {
      return;
    }
    
    this._particleTextureSize = newSize;
    this._particleCount = newSize * newSize;
    this._rebuildParticleTextures();
    this._needsRebuild = true;
  }
  
  _rebuildParticleTextures() {
    for (let i = 0; i < 2; i++) {
      if (this._particlePositionTextures[i]) {
        this._particlePositionTextures[i].destroy();
        this._particlePositionTextures[i] = null;
      }
      if (this._velocityTextures[i]) {
        this._velocityTextures[i].destroy();
        this._velocityTextures[i] = null;
      }
      if (this._framebuffers[i]) {
        this._framebuffers[i].destroy();
        this._framebuffers[i] = null;
      }
    }
    
    const gl = this._gl;
    const size = this._particleTextureSize;
    const randomData = generateRandomParticleData(size);
    
    for (let i = 0; i < 2; i++) {
      this._particlePositionTextures[i] = new Cesium.Texture({
        context: this._context,
        width: size,
        height: size,
        source: {
          arrayBufferView: randomData,
          width: size,
          height: size,
        },
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        sampler: new Cesium.Sampler({
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        }),
      });
      
      const zeroData = new Float32Array(size * size * 4);
      this._velocityTextures[i] = new Cesium.Texture({
        context: this._context,
        width: size,
        height: size,
        source: {
          arrayBufferView: zeroData,
          width: size,
          height: size,
        },
        pixelFormat: Cesium.PixelFormat.RGBA,
        pixelDatatype: Cesium.PixelDatatype.FLOAT,
        sampler: new Cesium.Sampler({
          minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
          magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        }),
      });
      
      this._framebuffers[i] = new Cesium.Framebuffer({
        context: this._context,
        colorTextures: [this._particlePositionTextures[i], this._velocityTextures[i]],
        destroyAttachments: false,
      });
      
      const glFBO = this._framebuffers[i]._framebuffer;
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, glFBO);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    }
  }
  
  setParticleDensity(density) {
    this._particleDensity = Math.max(0.1, Math.min(3.0, density));
    const targetCount = Math.floor(this._maxParticleCount * this._particleDensity);
    this.setParticleCount(targetCount);
  }
  
  setBounds(minLon, maxLon, minLat, maxLat) {
    if (this._bounds) {
      this._bounds.minLon = minLon;
      this._bounds.maxLon = maxLon;
      this._bounds.minLat = minLat;
      this._bounds.maxLat = maxLat;
      this._centerLon = (minLon + maxLon) / 2;
      this._centerLat = (minLat + maxLat) / 2;
      this._updateTransform();
      this._rebuildParticleTextures();
      this._needsRebuild = true;
    }
  }
  
  flyTo() {
    if (!this._bounds) return;
    const centerLon = (this._bounds.minLon + this._bounds.maxLon) / 2;
    const centerLat = (this._bounds.minLat + this._bounds.maxLat) / 2;
    this._viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 2000000),
      orientation: {
        heading: 0,
        pitch: -Math.PI / 2,
        roll: 0,
      },
    });
  }
  
  _rebuildCommands() {
    this._buildUpdateProgram();
    this._buildDrawProgram();
    this._buildQuadVAO();
    this._buildParticleVAO();
    this._buildUpdateCommand();
    this._buildDrawCommand();
    this._needsRebuild = false;
  }
  
  _buildUpdateProgram() {
    const vsSource = `#version 300 es
      in vec2 position;
      in vec2 textureCoordinates;
      out vec2 v_textureCoordinates;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
        v_textureCoordinates = textureCoordinates;
      }
    `;
    
    const fsSource = `#version 300 es
      precision highp float;
      in vec2 v_textureCoordinates;
      layout(location = 0) out vec4 positionOut;
      layout(location = 1) out vec4 velocityOut;
      
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
      uniform float altitudes[32];
      uniform float minHeight;
      uniform float maxHeight;
      
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      vec3 sampleWind(vec3 pos, out float isValid) {
        float height = minHeight + pos.z * (maxHeight - minHeight);
        
        int lowerIdx = -1;
        int upperIdx = -1;
        for (int i = 0; i < 32; i++) {
          if (i >= layerCount) break;
          if (height >= altitudes[i]) {
            lowerIdx = i;
          } else {
            upperIdx = i;
            break;
          }
        }
        if (lowerIdx == -1) {
          lowerIdx = 0;
          upperIdx = 0;
        }
        if (upperIdx == -1) {
          upperIdx = layerCount - 1;
          lowerIdx = layerCount - 1;
        }
        
        if (lowerIdx < visibleLayerMin || lowerIdx > visibleLayerMax ||
            upperIdx < visibleLayerMin || upperIdx > visibleLayerMax) {
          isValid = 0.0;
          return vec3(0.0);
        }
        
        float v0_start = float(lowerIdx) * maxNy / atlasH;
        float v0_end = float(lowerIdx + 1) * maxNy / atlasH;
        float v0 = mix(v0_start, v0_end, pos.y);
        vec2 uv0 = vec2(pos.x * maxNx / atlasW, v0);
        vec4 wind0 = texture(windAtlas, uv0);
        
        float v1_start = float(upperIdx) * maxNy / atlasH;
        float v1_end = float(upperIdx + 1) * maxNy / atlasH;
        float v1 = mix(v1_start, v1_end, pos.y);
        vec2 uv1 = vec2(pos.x * maxNx / atlasW, v1);
        vec4 wind1 = texture(windAtlas, uv1);
        
        if (wind0.a < 0.5 || wind1.a < 0.5) {
          isValid = 0.0;
          return vec3(0.0);
        }
        
        float t = (height - altitudes[lowerIdx]) / (altitudes[upperIdx] - altitudes[lowerIdx]);
        t = clamp(t, 0.0, 1.0);
        isValid = 1.0;
        return mix(wind0.xyz, wind1.xyz, t);
      }
      
      void main() {
        vec4 particle = texture(currentParticlesPosition, v_textureCoordinates);
        vec3 pos = particle.xyz;
        float age = fract(particle.w);
        
        age += decaySpeed;
        if (age > 1.0) {
          age = 0.0;
          pos = vec3(hash(v_textureCoordinates + 0.123), hash(v_textureCoordinates + 0.456), hash(v_textureCoordinates + 0.789));
        }
        
        float isValid;
        vec3 wind = sampleWind(pos, isValid);
        
        if (isValid < 0.5) {
          age = 0.0;
          pos = vec3(hash(v_textureCoordinates + 0.123), hash(v_textureCoordinates + 0.456), hash(v_textureCoordinates + 0.789));
          wind = vec3(0.0);
        }
        
        vec3 newPos = pos + wind * speedFactor * 0.001;
        newPos = fract(newPos);
        
        float speed = length(wind);
        float normSpeed = min(1.0, speed / maxWindSpeed);
        float packed = floor(normSpeed * 255.0) + age;
        
        positionOut = vec4(newPos, packed);
        velocityOut = vec4(wind, 0.0);
      }
    `;
    
    this._updateProgram = Cesium.ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource: vsSource,
      fragmentShaderSource: fsSource,
    });
  }
  
  _buildDrawProgram() {
    const vsSource = `#version 300 es
      in float particleIndex;
      
      uniform sampler2D currentParticlesPosition;
      uniform sampler2D velocityTexture;
      uniform float particlesTextureSize;
      uniform float arrowLength;
      uniform float trailLength;
      uniform float speedMin;
      uniform float speedMax;
      uniform float maxWindSpeed;
      uniform float boundsMinLon;
      uniform float boundsMaxLon;
      uniform float boundsMinLat;
      uniform float boundsMaxLat;
      uniform float boundsMinHeight;
      uniform float boundsMaxHeight;
      uniform vec3 centerECEF;
      uniform float centerLonRad;
      uniform float centerLatRad;
      
      uniform mat4 modelMatrix;
      
      out float v_age;
      out float v_speed;
      out float v_culled;
      
      vec3 ecefToLocal(vec3 ecef, vec3 center, float lonRad, float latRad) {
        vec3 offset = ecef - center;
        float cosLon = cos(lonRad);
        float sinLon = sin(lonRad);
        float cosLat = cos(latRad);
        float sinLat = sin(latRad);
        mat3 rot = mat3(
          -sinLon, cosLon, 0.0,
          -sinLat * cosLon, -sinLat * sinLon, cosLat,
          cosLat * cosLon, cosLat * sinLon, sinLat
        );
        return rot * offset;
      }
      
      void main() {
        int pIdx = int(floor(particleIndex / 6.0));
        int vType = int(particleIndex) - pIdx * 6;
        
        float u = (float(pIdx) + 0.5) / particlesTextureSize;
        float v = (float(pIdx % int(particlesTextureSize)) + 0.5) / particlesTextureSize;
        
        vec4 posTex = texture(currentParticlesPosition, vec2(u, v));
        vec4 velTex = texture(velocityTexture, vec2(u, v));
        
        vec3 posNorm = posTex.xyz;
        float packed = posTex.w;
        float age = fract(packed);
        float normSpeed = floor(packed) / 255.0;
        float speedPhys = normSpeed * maxWindSpeed;
        
        v_age = age;
        v_speed = speedPhys / maxWindSpeed;
        
        if (speedPhys < speedMin || speedPhys > speedMax) {
          v_culled = 1.0;
          gl_Position = vec4(0.0);
          return;
        }
        v_culled = 0.0;
        
        float lonRad = mix(boundsMinLon, boundsMaxLon, posNorm.x);
        float latRad = mix(boundsMinLat, boundsMaxLat, posNorm.y);
        float height = mix(boundsMinHeight, boundsMaxHeight, posNorm.z);
        
        float a = 6378137.0;
        float e2 = 0.00669437999014;
        float sinLat = sin(latRad);
        float cosLat = cos(latRad);
        float sinLon = sin(lonRad);
        float cosLon = cos(lonRad);
        float N = a / sqrt(1.0 - e2 * sinLat * sinLat);
        vec3 ecefPos = vec3(
          (N + height) * cosLat * cosLon,
          (N + height) * cosLat * sinLon,
          (N * (1.0 - e2) + height) * sinLat
        );
        
        vec3 localPos = ecefToLocal(ecefPos, centerECEF, centerLonRad, centerLatRad);
        
        vec3 windENU = velTex.xyz;
        float speed = length(windENU);
        if (speed < 0.001) {
          v_culled = 1.0;
          gl_Position = vec4(0.0);
          return;
        }
        vec3 forward = normalize(windENU);
        vec3 up = vec3(0.0, 0.0, 1.0);
        vec3 right = normalize(cross(forward, up));
        
        vec3 tip = localPos + forward * arrowLength;
        vec3 tail = localPos - forward * trailLength;
        float headLen = arrowLength * 0.3;
        float headWidth = arrowLength * 0.15;
        vec3 headBase = tip - forward * headLen;
        vec3 leftWing = headBase + right * headWidth;
        vec3 rightWing = headBase - right * headWidth;
        
        vec3 vertexPos;
        if (vType == 0) vertexPos = tail;
        else if (vType == 1) vertexPos = tip;
        else if (vType == 2) vertexPos = tip;
        else if (vType == 3) vertexPos = leftWing;
        else if (vType == 4) vertexPos = tip;
        else vertexPos = rightWing;
        
        gl_Position = czm_modelViewProjection * vec4(vertexPos, 1.0);
      }
    `;
    
    const fsSource = `#version 300 es
      precision highp float;
      in float v_age;
      in float v_speed;
      in float v_culled;
      uniform float alphaFactor;
      uniform float windSpeedMin;
      uniform float windSpeedMax;
      uniform float maxWindSpeed;
      
      vec3 speedToColor(float t) {
        t = clamp((t * maxWindSpeed - windSpeedMin) / (windSpeedMax - windSpeedMin), 0.0, 1.0);
        if (t < 0.25) {
          return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t / 0.25);
        } else if (t < 0.5) {
          return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) / 0.25);
        } else if (t < 0.75) {
          return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.5) / 0.25);
        } else {
          return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
        }
      }
      
      void main() {
        if (v_culled > 0.5) discard;
        float alpha = (1.0 - v_age) * alphaFactor;
        vec3 color = speedToColor(v_speed);
        out_FragColor = vec4(color, alpha);
      }
    `;
    
    this._drawProgram = Cesium.ShaderProgram.fromCache({
      context: this._context,
      vertexShaderSource: vsSource,
      fragmentShaderSource: fsSource,
    });
  }
  
  _buildQuadVAO() {
    const va = new Cesium.VertexArray({
      context: this._context,
      attributes: [
        {
          index: 0,
          vertexBuffer: Cesium.Buffer.createVertexBuffer({
            context: this._context,
            typedArray: QUAD_POSITIONS,
            usage: Cesium.BufferUsage.STATIC_DRAW,
          }),
          componentsPerAttribute: 2,
        },
        {
          index: 1,
          vertexBuffer: Cesium.Buffer.createVertexBuffer({
            context: this._context,
            typedArray: QUAD_TEXCOORDS,
            usage: Cesium.BufferUsage.STATIC_DRAW,
          }),
          componentsPerAttribute: 2,
        },
      ],
      indexBuffer: Cesium.Buffer.createIndexBuffer({
        context: this._context,
        typedArray: QUAD_INDICES,
        usage: Cesium.BufferUsage.STATIC_DRAW,
        indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
      }),
    });
    this._quadVertexArray = va;
  }
  
  _buildParticleVAO() {
    const vertexCount = this._particleCount * 6;
    const indices = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) indices[i] = i;
    
    this._particleVertexBuffer = Cesium.Buffer.createVertexBuffer({
      context: this._context,
      typedArray: indices,
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
  
  _buildUpdateCommand() {
    const renderState = Cesium.RenderState.fromCache({
      viewport: new Cesium.BoundingRectangle(0, 0, this._particleTextureSize, this._particleTextureSize),
    });
    
    this._updateCommand = new Cesium.DrawCommand({
      vertexArray: this._quadVertexArray,
      shaderProgram: this._updateProgram,
      renderState: renderState,
      framebuffer: this._framebuffers[1 - this._particleState],
      uniformMap: this._getUpdateUniforms(),
    });
  }
  
  _getUpdateUniforms() {
    return {
      currentParticlesPosition: () => this._particlePositionTextures[this._particleState],
      windAtlas: () => this._windAtlasTexture,
      speedFactor: () => this.speedFactor,
      maxWindSpeed: () => this.maxWindSpeed,
      decaySpeed: () => this.decaySpeed,
      layerCount: () => this._layerCount,
      maxNx: () => this._maxNx,
      maxNy: () => this._maxNy,
      atlasW: () => this._atlasWidth,
      atlasH: () => this._atlasHeight,
      visibleLayerMin: () => this.visibleLayerMin,
      visibleLayerMax: () => this.visibleLayerMax,
      minHeight: () => this._bounds.minHeight,
      maxHeight: () => this._bounds.maxHeight,
      altitudes: () => {
        const arr = new Float32Array(32);
        for (let i = 0; i < this._altitudes.length && i < 32; i++) {
          arr[i] = this._altitudes[i];
        }
        return arr;
      },
    };
  }
  
  _buildDrawCommand() {
    const renderState = Cesium.RenderState.fromCache({
      depthTest: {
        enabled: true,
      },
      blending: Cesium.BlendingState.ALPHA_BLEND,
    });
    
    this._drawCommand = new Cesium.DrawCommand({
      vertexArray: this._particleVertexArray,
      shaderProgram: this._drawProgram,
      renderState: renderState,
      modelMatrix: this._modelMatrix,
      uniformMap: this._getDrawUniforms(),
      pass: Cesium.Pass.TRANSLUCENT,
    });
  }
  
  _getDrawUniforms() {
    return {
      currentParticlesPosition: () => this._particlePositionTextures[this._particleState],
      velocityTexture: () => this._velocityTextures[this._particleState],
      particlesTextureSize: () => this._particleTextureSize,
      arrowLength: () => this.arrowLength,
      trailLength: () => this.trailLength,
      speedMin: () => this.cullSpeedMin / this.maxWindSpeed,
      speedMax: () => this.cullSpeedMax / this.maxWindSpeed,
      maxWindSpeed: () => this.maxWindSpeed,
      boundsMinLon: () => this._bounds.minLon * Math.PI / 180,
      boundsMaxLon: () => this._bounds.maxLon * Math.PI / 180,
      boundsMinLat: () => this._bounds.minLat * Math.PI / 180,
      boundsMaxLat: () => this._bounds.maxLat * Math.PI / 180,
      boundsMinHeight: () => this._bounds.minHeight,
      boundsMaxHeight: () => this._bounds.maxHeight,
      centerECEF: () => this._centerCartesian,
      centerLonRad: () => this._centerLonRad,
      centerLatRad: () => this._centerLatRad,
      modelMatrix: () => this._modelMatrix,
      alphaFactor: () => this.alphaFactor,
      windSpeedMin: () => this.windSpeedMin,
      windSpeedMax: () => this.windSpeedMax,
    };
  }
  
  update(frameState) {
    if (this._isDestroyed || !this._windAtlasTexture) return;
    
    if (this._needsRebuild) {
      this._rebuildCommands();
    }
    
    if (this._updateCommand) {
      this._updateCommand.framebuffer = this._framebuffers[1 - this._particleState];
      this._updateCommand.uniformMap = this._getUpdateUniforms();
      this._updateCommand.execute(this._context, frameState.passState);
    }
    
    if (this._drawCommand) {
      this._drawCommand.uniformMap = this._getDrawUniforms();
      frameState.commandList.push(this._drawCommand);
    }
    
    this._particleState = 1 - this._particleState;
  }
  
  destroy() {
    if (this._isDestroyed) return;
    
    if (this._windAtlasTexture) {
      this._windAtlasTexture.destroy();
      this._windAtlasTexture = null;
    }
    
    for (let i = 0; i < 2; i++) {
      if (this._particlePositionTextures[i]) {
        this._particlePositionTextures[i].destroy();
        this._particlePositionTextures[i] = null;
      }
      if (this._velocityTextures[i]) {
        this._velocityTextures[i].destroy();
        this._velocityTextures[i] = null;
      }
      if (this._framebuffers[i]) {
        this._framebuffers[i].destroy();
        this._framebuffers[i] = null;
      }
    }
    
    if (this._updateProgram) {
      this._updateProgram.destroy();
      this._updateProgram = null;
    }
    if (this._drawProgram) {
      this._drawProgram.destroy();
      this._drawProgram = null;
    }
    if (this._quadVertexArray) {
      this._quadVertexArray.destroy();
      this._quadVertexArray = null;
    }
    if (this._particleVertexArray) {
      this._particleVertexArray.destroy();
      this._particleVertexArray = null;
    }
    if (this._particleVertexBuffer) {
      this._particleVertexBuffer.destroy();
      this._particleVertexBuffer = null;
    }
    
    this._isDestroyed = true;
  }
  
  isDestroyed() {
    return this._isDestroyed;
  }
}