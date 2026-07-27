var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/index.ts
import {
  Cartesian2 as Cartesian23,
  Math as CesiumMath,
  Rectangle
} from "cesium";

// src/windParticlesComputing.ts
import { PixelDatatype, PixelFormat, Sampler, Texture, TextureMagnificationFilter, TextureMinificationFilter, Cartesian2, FrameRateMonitor } from "cesium";

// src/shaderManager.ts
import { ShaderSource } from "cesium";

// src/shaders/updatePosition.ts
var updatePositionShader = (
  /*glsl*/
  `#version 300 es
precision highp float;

uniform sampler2D currentParticlesPosition;
uniform sampler2D particlesSpeed;

in vec2 v_textureCoordinates;

out vec4 fragColor;

void main() {
    // \u83B7\u53D6\u5F53\u524D\u7C92\u5B50\u7684\u4F4D\u7F6E
    vec2 currentPos = texture(currentParticlesPosition, v_textureCoordinates).rg;
    // \u83B7\u53D6\u7C92\u5B50\u7684\u901F\u5EA6
    vec2 speed = texture(particlesSpeed, v_textureCoordinates).rg;
    // \u8BA1\u7B97\u4E0B\u4E00\u4E2A\u4F4D\u7F6E
    vec2 nextPos = currentPos + speed;
    
    // \u5C06\u65B0\u7684\u4F4D\u7F6E\u5199\u5165 fragColor
    fragColor = vec4(nextPos, 0.0, 1.0);
}
`
);

// src/shaders/calculateSpeed.ts
var calculateSpeedShader = (
  /*glsl*/
  `#version 300 es

// the size of UV textures: width = lon, height = lat
uniform sampler2D U; // eastward wind
uniform sampler2D V; // northward wind
uniform sampler2D currentParticlesPosition; // (lon, lat, lev)

uniform vec2 uRange; // (min, max)
uniform vec2 vRange; // (min, max)
uniform vec2 speedRange; // (min, max)
uniform vec2 dimension; // (lon, lat)
uniform vec2 minimum; // minimum of each dimension
uniform vec2 maximum; // maximum of each dimension

uniform float speedScaleFactor;
uniform float frameRateAdjustment;

in vec2 v_textureCoordinates;

vec2 getInterval(vec2 maximum, vec2 minimum, vec2 dimension) {
    return (maximum - minimum) / (dimension - 1.0);
}

vec2 mapPositionToNormalizedIndex2D(vec2 lonLat) {
    // ensure the range of longitude and latitude
    lonLat.x = clamp(lonLat.x, minimum.x, maximum.x);
    lonLat.y = clamp(lonLat.y,  minimum.y, maximum.y);

    vec2 interval = getInterval(maximum, minimum, dimension);
    
    vec2 index2D = vec2(0.0);
    index2D.x = (lonLat.x - minimum.x) / interval.x;
    index2D.y = (lonLat.y - minimum.y) / interval.y;

    vec2 normalizedIndex2D = vec2(index2D.x / dimension.x, index2D.y / dimension.y);
    return normalizedIndex2D;
}

float getWindComponent(sampler2D componentTexture, vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    float result = texture(componentTexture, normalizedIndex2D).r;
    return result;
}

vec2 getWindComponents(vec2 lonLat) {
    vec2 normalizedIndex2D = mapPositionToNormalizedIndex2D(lonLat);
    float u = texture(U, normalizedIndex2D).r;
    float v = texture(V, normalizedIndex2D).r;
    return vec2(u, v);
}

vec2 bilinearInterpolation(vec2 lonLat) {
    float lon = lonLat.x;
    float lat = lonLat.y;

    vec2 interval = getInterval(maximum, minimum, dimension);

    // Calculate grid cell coordinates
    float lon0 = floor(lon / interval.x) * interval.x;
    float lon1 = lon0 + interval.x;
    float lat0 = floor(lat / interval.y) * interval.y;
    float lat1 = lat0 + interval.y;

    // Get wind vectors at four corners
    vec2 v00 = getWindComponents(vec2(lon0, lat0));
    vec2 v10 = getWindComponents(vec2(lon1, lat0));
    vec2 v01 = getWindComponents(vec2(lon0, lat1));
    vec2 v11 = getWindComponents(vec2(lon1, lat1));

    // Check if all wind vectors are zero
    if (length(v00) == 0.0 && length(v10) == 0.0 && length(v01) == 0.0 && length(v11) == 0.0) {
        return vec2(0.0, 0.0);
    }

    // Calculate interpolation weights
    float s = (lon - lon0) / interval.x;
    float t = (lat - lat0) / interval.y;

    // Perform bilinear interpolation on vector components
    vec2 v0 = mix(v00, v10, s);
    vec2 v1 = mix(v01, v11, s);
    return mix(v0, v1, t);
}

vec2 lengthOfLonLat(vec2 lonLat) {
    // unit conversion: meters -> longitude latitude degrees
    // see https://en.wikipedia.org/wiki/Geographic_coordinate_system#Length_of_a_degree for detail

    // Calculate the length of a degree of latitude and longitude in meters
    float latitude = radians(lonLat.y);

    float term1 = 111132.92;
    float term2 = 559.82 * cos(2.0 * latitude);
    float term3 = 1.175 * cos(4.0 * latitude);
    float term4 = 0.0023 * cos(6.0 * latitude);
    float latLength = term1 - term2 + term3 - term4;

    float term5 = 111412.84 * cos(latitude);
    float term6 = 93.5 * cos(3.0 * latitude);
    float term7 = 0.118 * cos(5.0 * latitude);
    float longLength = term5 - term6 + term7;

    return vec2(longLength, latLength);
}

vec2 convertSpeedUnitToLonLat(vec2 lonLat, vec2 speed) {
    vec2 lonLatLength = lengthOfLonLat(lonLat);
    float u = speed.x / lonLatLength.x;
    float v = speed.y / lonLatLength.y;
    vec2 windVectorInLonLat = vec2(u, v);

    return windVectorInLonLat;
}

vec2 calculateSpeedByRungeKutta2(vec2 lonLat) {
    // see https://en.wikipedia.org/wiki/Runge%E2%80%93Kutta_methods#Second-order_methods_with_two_stages for detail
    const float h = 0.5;

    vec2 y_n = lonLat;
    vec2 f_n = bilinearInterpolation(lonLat);
    vec2 midpoint = y_n + 0.5 * h * convertSpeedUnitToLonLat(y_n, f_n) * speedScaleFactor;
    vec2 speed = h * bilinearInterpolation(midpoint) * speedScaleFactor;

    return speed;
}


vec2 calculateWindNorm(vec2 speed) {
    float speedLength = length(speed.xy);
    if(speedLength == 0.0){
      return vec2(0.0);
    }

    // Clamp speedLength to range
    float clampedSpeed = clamp(speedLength, speedRange.x, speedRange.y);
    float normalizedSpeed = (clampedSpeed - speedRange.x) / (speedRange.y - speedRange.x);
    return vec2(speedLength, normalizedSpeed);
}

out vec4 fragColor;

void main() {
    // texture coordinate must be normalized
    vec2 lonLat = texture(currentParticlesPosition, v_textureCoordinates).rg;
    vec2 speedOrigin = bilinearInterpolation(lonLat);
    vec2 speed = calculateSpeedByRungeKutta2(lonLat) * frameRateAdjustment;
    vec2 speedInLonLat = convertSpeedUnitToLonLat(lonLat, speed);

    fragColor = vec4(speedInLonLat, calculateWindNorm(speedOrigin));
}
`
);

// src/shaders/postProcessingPosition.ts
var postProcessingPositionFragmentShader = (
  /*glsl*/
  `#version 300 es
precision highp float;

uniform sampler2D nextParticlesPosition;
uniform sampler2D particlesSpeed; // (u, v, norm)

// range (min, max)
uniform vec2 lonRange;
uniform vec2 latRange;

// range (min, max)
uniform vec2 dataLonRange;
uniform vec2 dataLatRange;

uniform float randomCoefficient;
uniform float dropRate;
uniform float dropRateBump;

// \u6DFB\u52A0\u65B0\u7684 uniform \u53D8\u91CF
uniform bool useViewerBounds;

in vec2 v_textureCoordinates;

// pseudo-random generator
const vec3 randomConstants = vec3(12.9898, 78.233, 4375.85453);
const vec2 normalRange = vec2(0.0, 1.0);
float rand(vec2 seed, vec2 range) {
    vec2 randomSeed = randomCoefficient * seed;
    float temp = dot(randomConstants.xy, randomSeed);
    temp = fract(sin(temp) * (randomConstants.z + temp));
    return temp * (range.y - range.x) + range.x;
}

vec2 generateRandomParticle(vec2 seed) {
    vec2 range;
    float randomLon, randomLat;
    
    if (useViewerBounds) {
        // \u5728\u5F53\u524D\u89C6\u57DF\u8303\u56F4\u5185\u751F\u6210\u7C92\u5B50
        randomLon = rand(seed, lonRange);
        randomLat = rand(-seed, latRange);
    } else {
        // \u5728\u6570\u636E\u8303\u56F4\u5185\u751F\u6210\u7C92\u5B50
        randomLon = rand(seed, dataLonRange);
        randomLat = rand(-seed, dataLatRange);
    }

    return vec2(randomLon, randomLat);
}

bool particleOutbound(vec2 particle) {
    return particle.y < dataLatRange.x || particle.y > dataLatRange.y || particle.x < dataLonRange.x || particle.x > dataLonRange.y;
}

out vec4 fragColor;

void main() {
    vec2 nextParticle = texture(nextParticlesPosition, v_textureCoordinates).rg;
    vec4 nextSpeed = texture(particlesSpeed, v_textureCoordinates);
    float speedNorm = nextSpeed.a;
    float particleDropRate = dropRate + dropRateBump * speedNorm;

    vec2 seed1 = nextParticle.xy + v_textureCoordinates;
    vec2 seed2 = nextSpeed.rg + v_textureCoordinates;
    vec2 randomParticle = generateRandomParticle(seed1);
    float randomNumber = rand(seed2, normalRange);

    if (randomNumber < particleDropRate || particleOutbound(nextParticle)) {
        fragColor = vec4(randomParticle, 0.0, 1.0); // 1.0 means this is a random particle
    } else {
        fragColor = vec4(nextParticle, 0.0, 0.0);
    }
}
`
);

// src/shaders/segmentDraw.ts
var renderParticlesVertexShader = (
  /*glsl*/
  `#version 300 es
precision highp float;

in vec2 st;
in vec3 normal;

uniform sampler2D previousParticlesPosition;
uniform sampler2D currentParticlesPosition;
uniform sampler2D postProcessingPosition;
uniform sampler2D particlesSpeed;

uniform float frameRateAdjustment;
uniform float particleHeight;
uniform float aspect;
uniform float pixelSize;
uniform vec2 lineWidth;
uniform vec2 lineLength;
uniform vec2 domain;
uniform bool is3D;

// \u6DFB\u52A0\u8F93\u51FA\u53D8\u91CF\u4F20\u9012\u7ED9\u7247\u5143\u7740\u8272\u5668
out vec4 speed;
out float v_segmentPosition;
out vec2 textureCoordinate;

// \u6DFB\u52A0\u7ED3\u6784\u4F53\u5B9A\u4E49
struct adjacentPoints {
    vec4 previous;
    vec4 current;
    vec4 next;
};

vec3 convertCoordinate(vec2 lonLat) {
    // WGS84 (lon, lat, lev) -> ECEF (x, y, z)
    // read https://en.wikipedia.org/wiki/Geographic_coordinate_conversion#From_geodetic_to_ECEF_coordinates for detail

    // WGS 84 geometric constants
    float a = 6378137.0; // Semi-major axis
    float b = 6356752.3142; // Semi-minor axis
    float e2 = 6.69437999014e-3; // First eccentricity squared

    float latitude = radians(lonLat.y);
    float longitude = radians(lonLat.x);

    float cosLat = cos(latitude);
    float sinLat = sin(latitude);
    float cosLon = cos(longitude);
    float sinLon = sin(longitude);

    float N_Phi = a / sqrt(1.0 - e2 * sinLat * sinLat);
    float h = particleHeight; // it should be high enough otherwise the particle may not pass the terrain depth test
    vec3 cartesian = vec3(0.0);
    cartesian.x = (N_Phi + h) * cosLat * cosLon;
    cartesian.y = (N_Phi + h) * cosLat * sinLon;
    cartesian.z = ((b * b) / (a * a) * N_Phi + h) * sinLat;
    return cartesian;
}

vec4 calculateProjectedCoordinate(vec2 lonLat) {
    if (is3D) {
        vec3 particlePosition = convertCoordinate(lonLat);
        // \u4F7F\u7528 modelViewProjection \u77E9\u9635\u8FDB\u884C\u6295\u5F71\u53D8\u6362
        vec4 projectedPosition = czm_modelViewProjection * vec4(particlePosition, 1.0);
        return projectedPosition;
    } else {
        vec3 position2D = vec3(radians(lonLat.x), radians(lonLat.y), 0.0);
        return czm_modelViewProjection * vec4(position2D, 1.0);
    }
}

vec4 calculateOffsetOnNormalDirection(vec4 pointA, vec4 pointB, float offsetSign, float widthFactor) {
    vec2 aspectVec2 = vec2(aspect, 1.0);
    vec2 pointA_XY = (pointA.xy / pointA.w) * aspectVec2;
    vec2 pointB_XY = (pointB.xy / pointB.w) * aspectVec2;

    // \u8BA1\u7B97\u65B9\u5411\u5411\u91CF
    vec2 direction = normalize(pointB_XY - pointA_XY);

    // \u8BA1\u7B97\u6CD5\u5411\u91CF
    vec2 normalVector = vec2(-direction.y, direction.x);
    normalVector.x = normalVector.x / aspect;

    // \u4F7F\u7528 widthFactor \u8C03\u6574\u5BBD\u5EA6
    float offsetLength = widthFactor * lineWidth.y;
    normalVector = offsetLength * normalVector;

    vec4 offset = vec4(offsetSign * normalVector, 0.0, 0.0);
    return offset;
}

void main() {
    // \u7FFB\u8F6C Y \u8F74\u5750\u6807
    vec2 flippedIndex = vec2(st.x, 1.0 - st.y);

    vec2 particleIndex = flippedIndex;
    speed = texture(particlesSpeed, particleIndex);

    vec2 previousPosition = texture(previousParticlesPosition, particleIndex).rg;
    vec2 currentPosition = texture(currentParticlesPosition, particleIndex).rg;
    vec2 nextPosition = texture(postProcessingPosition, particleIndex).rg;

    float isAnyRandomPointUsed = texture(postProcessingPosition, particleIndex).a +
        texture(currentParticlesPosition, particleIndex).a +
        texture(previousParticlesPosition, particleIndex).a;

    adjacentPoints projectedCoordinates;
    if (isAnyRandomPointUsed > 0.0) {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = projectedCoordinates.previous;
        projectedCoordinates.next = projectedCoordinates.previous;
    } else {
        projectedCoordinates.previous = calculateProjectedCoordinate(previousPosition);
        projectedCoordinates.current = calculateProjectedCoordinate(currentPosition);
        projectedCoordinates.next = calculateProjectedCoordinate(nextPosition);
    }

    int pointToUse = int(normal.x);
    float offsetSign = normal.y;
    vec4 offset = vec4(0.0);

    // \u8BA1\u7B97\u901F\u5EA6\u76F8\u5173\u7684\u5BBD\u5EA6\u548C\u957F\u5EA6\u56E0\u5B50
    float speedLength = clamp(speed.b, domain.x, domain.y);
    float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
    
    // \u6839\u636E\u901F\u5EA6\u8BA1\u7B97\u5BBD\u5EA6
    float widthFactor = mix(lineWidth.x, lineWidth.y, normalizedSpeed);
    widthFactor *= (pointToUse < 0 ? 1.0 : 0.5); // \u5934\u90E8\u66F4\u5BBD\uFF0C\u5C3E\u90E8\u66F4\u7A84

    // Calculate length based on speed
    float lengthFactor = mix(lineLength.x, lineLength.y, normalizedSpeed) * pixelSize;

    if (pointToUse == 1) {
        // \u5934\u90E8\u4F4D\u7F6E
        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.previous,
            projectedCoordinates.current,
            offsetSign,
            widthFactor
        );
        gl_Position = projectedCoordinates.previous + offset;
        v_segmentPosition = 0.0; // \u5934\u90E8
    } else if (pointToUse == -1) {
        // Get direction and normalize it to length 1.0
        vec4 direction = normalize(projectedCoordinates.next - projectedCoordinates.current);
        vec4 extendedPosition = projectedCoordinates.current + direction * lengthFactor;

        offset = pixelSize * calculateOffsetOnNormalDirection(
            projectedCoordinates.current,
            extendedPosition,
            offsetSign,
            widthFactor
        );
        gl_Position = extendedPosition + offset;
        v_segmentPosition = 1.0; // \u5C3E\u90E8
    }

    textureCoordinate = st;
}
`
);
var renderParticlesFragmentShader = (
  /*glsl*/
  `#version 300 es
precision highp float;

in vec4 speed;
in float v_segmentPosition;
in vec2 textureCoordinate;

uniform vec2 domain;
uniform vec2 displayRange;
uniform sampler2D colorTable;
uniform sampler2D segmentsDepthTexture;

out vec4 fragColor;

void main() {
    const float zero = 0.0;
    if(speed.a > zero && speed.b > displayRange.x && speed.b < displayRange.y) {
        float speedLength = clamp(speed.b, domain.x, domain.y);
        float normalizedSpeed = (speedLength - domain.x) / (domain.y - domain.x);
        vec4 baseColor = texture(colorTable, vec2(normalizedSpeed, zero));

        // \u4F7F\u7528\u66F4\u5E73\u6ED1\u7684\u6E10\u53D8\u6548\u679C
        float alpha = smoothstep(0.0, 1.0, v_segmentPosition);
        alpha = pow(alpha, 1.5); // \u8C03\u6574\u900F\u660E\u5EA6\u6E10\u53D8\u66F2\u7EBF

        // \u6839\u636E\u901F\u5EA6\u8C03\u6574\u900F\u660E\u5EA6
        float speedAlpha = mix(0.3, 1.0, speed.a);

        // \u7EC4\u5408\u989C\u8272\u548C\u900F\u660E\u5EA6
        fragColor = vec4(baseColor.rgb, baseColor.a * alpha * speedAlpha);
    } else {
        fragColor = vec4(zero);
    }

    float segmentsDepth = texture(segmentsDepthTexture, textureCoordinate).r;
    float globeDepth = czm_unpackDepth(texture(czm_globeDepthTexture, textureCoordinate));
    if (segmentsDepth < globeDepth) {
        fragColor = vec4(zero);
    }
}
`
);

// src/shaderManager.ts
var ShaderManager = class {
  static getCalculateSpeedShader() {
    return new ShaderSource({
      sources: [calculateSpeedShader]
    });
  }
  static getUpdatePositionShader() {
    return new ShaderSource({
      sources: [updatePositionShader]
    });
  }
  static getSegmentDrawVertexShader() {
    return new ShaderSource({
      sources: [renderParticlesVertexShader]
    });
  }
  static getSegmentDrawFragmentShader() {
    return new ShaderSource({
      sources: [renderParticlesFragmentShader]
    });
  }
  static getPostProcessingPositionShader() {
    return new ShaderSource({
      sources: [postProcessingPositionFragmentShader]
    });
  }
};

// src/customPrimitive.ts
import {
  ShaderProgram,
  VertexArray,
  DrawCommand,
  RenderState,
  Pass,
  ClearCommand,
  Color,
  defined,
  ComputeCommand,
  Matrix4,
  BufferUsage,
  destroyObject
} from "cesium";
var CustomPrimitive = class {
  constructor(options) {
    __publicField(this, "commandType");
    __publicField(this, "geometry");
    __publicField(this, "attributeLocations");
    __publicField(this, "primitiveType");
    __publicField(this, "uniformMap");
    __publicField(this, "vertexShaderSource");
    __publicField(this, "fragmentShaderSource");
    __publicField(this, "rawRenderState");
    __publicField(this, "framebuffer");
    __publicField(this, "outputTexture");
    __publicField(this, "autoClear");
    __publicField(this, "preExecute");
    __publicField(this, "show");
    __publicField(this, "commandToExecute");
    __publicField(this, "clearCommand");
    __publicField(this, "isDynamic");
    this.commandType = options.commandType;
    this.geometry = options.geometry;
    this.attributeLocations = options.attributeLocations;
    this.primitiveType = options.primitiveType;
    this.uniformMap = options.uniformMap || {};
    this.vertexShaderSource = options.vertexShaderSource;
    this.fragmentShaderSource = options.fragmentShaderSource;
    this.rawRenderState = options.rawRenderState;
    this.framebuffer = options.framebuffer;
    this.outputTexture = options.outputTexture;
    this.autoClear = options.autoClear ?? false;
    this.preExecute = options.preExecute;
    this.show = true;
    this.commandToExecute = void 0;
    this.clearCommand = void 0;
    this.isDynamic = options.isDynamic ?? (() => true);
    if (this.autoClear) {
      this.clearCommand = new ClearCommand({
        color: new Color(0, 0, 0, 0),
        depth: 1,
        framebuffer: this.framebuffer,
        pass: Pass.OPAQUE
      });
    }
  }
  createCommand(context) {
    if (this.commandType === "Draw") {
      const vertexArray = VertexArray.fromGeometry({
        context,
        geometry: this.geometry,
        attributeLocations: this.attributeLocations,
        bufferUsage: BufferUsage.STATIC_DRAW
      });
      const shaderProgram = ShaderProgram.fromCache({
        context,
        vertexShaderSource: this.vertexShaderSource,
        fragmentShaderSource: this.fragmentShaderSource,
        attributeLocations: this.attributeLocations
      });
      const renderState = RenderState.fromCache(this.rawRenderState);
      return new DrawCommand({
        owner: this,
        vertexArray,
        primitiveType: this.primitiveType,
        modelMatrix: Matrix4.IDENTITY,
        renderState,
        shaderProgram,
        framebuffer: this.framebuffer,
        uniformMap: this.uniformMap,
        pass: Pass.OPAQUE
      });
    } else if (this.commandType === "Compute") {
      return new ComputeCommand({
        owner: this,
        fragmentShaderSource: this.fragmentShaderSource,
        uniformMap: this.uniformMap,
        outputTexture: this.outputTexture,
        persists: true
      });
    } else {
      throw new Error("Unknown command type");
    }
  }
  setGeometry(context, geometry) {
    this.geometry = geometry;
    if (defined(this.commandToExecute)) {
      this.commandToExecute.vertexArray = VertexArray.fromGeometry({
        context,
        geometry: this.geometry,
        attributeLocations: this.attributeLocations,
        bufferUsage: BufferUsage.STATIC_DRAW
      });
    }
  }
  update(frameState) {
    if (!this.isDynamic()) {
      return;
    }
    if (!this.show || !defined(frameState)) {
      return;
    }
    if (!defined(this.commandToExecute)) {
      this.commandToExecute = this.createCommand(frameState.context);
    }
    if (defined(this.preExecute)) {
      this.preExecute();
    }
    if (!frameState.commandList) {
      console.warn("frameState.commandList is undefined");
      return;
    }
    if (defined(this.clearCommand)) {
      frameState.commandList.push(this.clearCommand);
    }
    if (defined(this.commandToExecute)) {
      frameState.commandList.push(this.commandToExecute);
    }
  }
  isDestroyed() {
    return false;
  }
  destroy() {
    if (defined(this.commandToExecute)) {
      this.commandToExecute.shaderProgram?.destroy();
      this.commandToExecute.shaderProgram = void 0;
    }
    return destroyObject(this);
  }
};

// src/utils.ts
function deepMerge(from, to) {
  if (!from) return to;
  if (!to) return from;
  const result = { ...to };
  for (const key in from) {
    if (Object.prototype.hasOwnProperty.call(from, key)) {
      const fromValue = from[key];
      const toValue = to[key];
      if (Array.isArray(fromValue)) {
        result[key] = fromValue.slice();
        continue;
      }
      if (fromValue && typeof fromValue === "object") {
        result[key] = deepMerge(fromValue, toValue || {});
        continue;
      }
      if (fromValue !== void 0) {
        result[key] = fromValue;
      }
    }
  }
  return result;
}

// src/windParticlesComputing.ts
var WindParticlesComputing = class {
  constructor(context, windData, options, viewerParameters, scene) {
    __publicField(this, "context");
    __publicField(this, "options");
    __publicField(this, "viewerParameters");
    __publicField(this, "windTextures");
    __publicField(this, "particlesTextures");
    __publicField(this, "primitives");
    __publicField(this, "windData");
    __publicField(this, "frameRateMonitor");
    __publicField(this, "frameRate", 60);
    __publicField(this, "frameRateAdjustment", 1);
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.windData = windData;
    this.frameRateMonitor = new FrameRateMonitor({
      scene,
      samplingWindow: 1,
      quietPeriod: 0
    });
    this.initFrameRate();
    this.createWindTextures();
    this.createParticlesTextures();
    this.createComputingPrimitives();
  }
  initFrameRate() {
    const updateFrameRate = () => {
      if (this.frameRateMonitor.lastFramesPerSecond > 20) {
        this.frameRate = this.frameRateMonitor.lastFramesPerSecond;
        this.frameRateAdjustment = 60 / Math.max(this.frameRate, 1);
      }
    };
    updateFrameRate();
    const intervalId = setInterval(updateFrameRate, 1e3);
    this.frameRateMonitor.lowFrameRate.addEventListener((scene, frameRate) => {
      console.warn(`Low frame rate detected: ${frameRate} FPS`);
    });
    this.frameRateMonitor.nominalFrameRate.addEventListener((scene, frameRate) => {
      console.log(`Frame rate returned to normal: ${frameRate} FPS`);
    });
    const originalDestroy = this.destroy.bind(this);
    this.destroy = () => {
      clearInterval(intervalId);
      originalDestroy();
    };
  }
  createWindTextures() {
    const options = {
      context: this.context,
      width: this.windData.width,
      height: this.windData.height,
      pixelFormat: PixelFormat.RED,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: this.options.flipY ?? false,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR
      })
    };
    this.windTextures = {
      U: new Texture({
        ...options,
        source: {
          arrayBufferView: new Float32Array(this.windData.u.array)
        }
      }),
      V: new Texture({
        ...options,
        source: {
          arrayBufferView: new Float32Array(this.windData.v.array)
        }
      })
    };
  }
  createParticlesTextures() {
    const options = {
      context: this.context,
      width: this.options.particlesTextureSize,
      height: this.options.particlesTextureSize,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      flipY: false,
      source: {
        arrayBufferView: new Float32Array(this.options.particlesTextureSize * this.options.particlesTextureSize * 4).fill(0)
      },
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST
      })
    };
    this.particlesTextures = {
      previousParticlesPosition: new Texture(options),
      currentParticlesPosition: new Texture(options),
      nextParticlesPosition: new Texture(options),
      postProcessingPosition: new Texture(options),
      particlesSpeed: new Texture(options)
    };
  }
  destroyParticlesTextures() {
    Object.values(this.particlesTextures).forEach((texture) => texture.destroy());
  }
  createComputingPrimitives() {
    this.primitives = {
      calculateSpeed: new CustomPrimitive({
        commandType: "Compute",
        uniformMap: {
          U: () => this.windTextures.U,
          V: () => this.windTextures.V,
          uRange: () => Cartesian2.fromElements(this.windData.u.min, this.windData.u.max, this._scratchURange ??= new Cartesian2()),
          vRange: () => Cartesian2.fromElements(this.windData.v.min, this.windData.v.max, this._scratchVRange ??= new Cartesian2()),
          speedRange: () => Cartesian2.fromElements(this.windData.speed.min, this.windData.speed.max, this._scratchSpeedRange ??= new Cartesian2()),
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          speedScaleFactor: () => {
            return (this.viewerParameters.pixelSize + 50) * this.options.speedFactor;
          },
          frameRateAdjustment: () => this.frameRateAdjustment,
          dimension: () => Cartesian2.fromElements(this.windData.width, this.windData.height, this._scratchDimension ??= new Cartesian2()),
          minimum: () => Cartesian2.fromElements(this.windData.bounds.west, this.windData.bounds.south, this._scratchMinimum ??= new Cartesian2()),
          maximum: () => Cartesian2.fromElements(this.windData.bounds.east, this.windData.bounds.north, this._scratchMaximum ??= new Cartesian2())
        },
        fragmentShaderSource: ShaderManager.getCalculateSpeedShader(),
        outputTexture: this.particlesTextures.particlesSpeed,
        preExecute: () => {
          const temp = this.particlesTextures.previousParticlesPosition;
          this.particlesTextures.previousParticlesPosition = this.particlesTextures.currentParticlesPosition;
          this.particlesTextures.currentParticlesPosition = this.particlesTextures.postProcessingPosition;
          this.particlesTextures.postProcessingPosition = temp;
          if (this.primitives.calculateSpeed.commandToExecute) {
            this.primitives.calculateSpeed.commandToExecute.outputTexture = this.particlesTextures.particlesSpeed;
          }
        },
        isDynamic: () => this.options.dynamic
      }),
      updatePosition: new CustomPrimitive({
        commandType: "Compute",
        uniformMap: {
          currentParticlesPosition: () => this.particlesTextures.currentParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed
        },
        fragmentShaderSource: ShaderManager.getUpdatePositionShader(),
        outputTexture: this.particlesTextures.nextParticlesPosition,
        preExecute: () => {
          if (this.primitives.updatePosition.commandToExecute) {
            this.primitives.updatePosition.commandToExecute.outputTexture = this.particlesTextures.nextParticlesPosition;
          }
        },
        isDynamic: () => this.options.dynamic
      }),
      postProcessingPosition: new CustomPrimitive({
        commandType: "Compute",
        uniformMap: {
          nextParticlesPosition: () => this.particlesTextures.nextParticlesPosition,
          particlesSpeed: () => this.particlesTextures.particlesSpeed,
          lonRange: () => this.viewerParameters.lonRange,
          latRange: () => this.viewerParameters.latRange,
          dataLonRange: () => new Cartesian2(this.windData.bounds.west, this.windData.bounds.east),
          dataLatRange: () => new Cartesian2(this.windData.bounds.south, this.windData.bounds.north),
          randomCoefficient: function() {
            return Math.random();
          },
          dropRate: () => this.options.dropRate,
          dropRateBump: () => this.options.dropRateBump,
          useViewerBounds: () => this.options.useViewerBounds
        },
        fragmentShaderSource: ShaderManager.getPostProcessingPositionShader(),
        outputTexture: this.particlesTextures.postProcessingPosition,
        preExecute: () => {
          if (this.primitives.postProcessingPosition.commandToExecute) {
            this.primitives.postProcessingPosition.commandToExecute.outputTexture = this.particlesTextures.postProcessingPosition;
          }
        },
        isDynamic: () => this.options.dynamic
      })
    };
  }
  reCreateWindTextures() {
    this.windTextures.U.destroy();
    this.windTextures.V.destroy();
    this.createWindTextures();
  }
  updateWindData(data) {
    this.windData = data;
    this.reCreateWindTextures();
  }
  updateOptions(options) {
    const needUpdateWindTextures = options.flipY !== void 0 && options.flipY !== this.options.flipY;
    this.options = deepMerge(options, this.options);
    if (needUpdateWindTextures) {
      this.reCreateWindTextures();
    }
  }
  processWindData(data) {
    const { array } = data;
    let { min, max } = data;
    const result = new Float32Array(array.length);
    if (min === void 0) {
      console.warn("min is undefined, calculate min");
      min = Math.min(...array);
    }
    if (max === void 0) {
      console.warn("max is undefined, calculate max");
      max = Math.max(...array);
    }
    const maxNum = Math.max(Math.abs(min), Math.abs(max));
    for (let i = 0; i < array.length; i++) {
      const value = array[i] / maxNum;
      result[i] = value;
    }
    console.log(result);
    return result;
  }
  destroy() {
    Object.values(this.windTextures).forEach((texture) => texture.destroy());
    Object.values(this.particlesTextures).forEach((texture) => texture.destroy());
    Object.values(this.primitives).forEach((primitive) => primitive.destroy());
    this.frameRateMonitor.destroy();
  }
};

// src/windParticlesRendering.ts
import { Geometry as Geometry2, GeometryAttribute, ComponentDatatype, PrimitiveType as PrimitiveType2, GeometryAttributes, Color as Color2, Texture as Texture2, Sampler as Sampler2, TextureMinificationFilter as TextureMinificationFilter2, TextureMagnificationFilter as TextureMagnificationFilter2, PixelFormat as PixelFormat2, PixelDatatype as PixelDatatype2, Framebuffer, Appearance, SceneMode, TextureWrap, VertexArray as VertexArray2, BufferUsage as BufferUsage2, Cartesian2 as Cartesian22 } from "cesium";
var WindParticlesRendering = class {
  constructor(context, options, viewerParameters, computing) {
    __publicField(this, "context");
    __publicField(this, "options");
    __publicField(this, "viewerParameters");
    __publicField(this, "computing");
    __publicField(this, "primitives");
    __publicField(this, "colorTable");
    __publicField(this, "textures");
    __publicField(this, "framebuffers");
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.computing = computing;
    if (typeof this.options.particlesTextureSize !== "number" || this.options.particlesTextureSize <= 0) {
      console.error("Invalid particlesTextureSize. Using default value of 256.");
      this.options.particlesTextureSize = 256;
    }
    this.colorTable = this.createColorTableTexture();
    this.textures = this.createRenderingTextures();
    this.framebuffers = this.createRenderingFramebuffers();
    this.primitives = this.createPrimitives();
  }
  createRenderingTextures() {
    const colorTextureOptions = {
      context: this.context,
      width: this.context.drawingBufferWidth,
      height: this.context.drawingBufferHeight,
      pixelFormat: PixelFormat2.RGBA,
      pixelDatatype: PixelDatatype2.UNSIGNED_BYTE
    };
    const depthTextureOptions = {
      context: this.context,
      width: this.context.drawingBufferWidth,
      height: this.context.drawingBufferHeight,
      pixelFormat: PixelFormat2.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype2.UNSIGNED_INT
    };
    return {
      segmentsColor: new Texture2(colorTextureOptions),
      segmentsDepth: new Texture2(depthTextureOptions)
    };
  }
  createRenderingFramebuffers() {
    return {
      segments: new Framebuffer({
        context: this.context,
        colorTextures: [this.textures.segmentsColor],
        depthTexture: this.textures.segmentsDepth
      })
    };
  }
  destoryRenderingFramebuffers() {
    Object.values(this.framebuffers).forEach((framebuffer) => {
      framebuffer.destroy();
    });
  }
  createColorTableTexture() {
    const colorTableData = new Float32Array(this.options.colors.flatMap((color) => {
      const cesiumColor = Color2.fromCssColorString(color);
      return [cesiumColor.red, cesiumColor.green, cesiumColor.blue, cesiumColor.alpha];
    }));
    return new Texture2({
      context: this.context,
      width: this.options.colors.length,
      height: 1,
      pixelFormat: PixelFormat2.RGBA,
      pixelDatatype: PixelDatatype2.FLOAT,
      sampler: new Sampler2({
        minificationFilter: TextureMinificationFilter2.LINEAR,
        magnificationFilter: TextureMagnificationFilter2.LINEAR,
        wrapS: TextureWrap.CLAMP_TO_EDGE,
        wrapT: TextureWrap.CLAMP_TO_EDGE
      }),
      source: {
        width: this.options.colors.length,
        height: 1,
        arrayBufferView: colorTableData
      }
    });
  }
  createSegmentsGeometry() {
    // 性能（本地修改）：原实现用 JS 数组 push 构建（600² 粒子时 ~940 万次 push，
    // 创建/改粒子数时主线程卡顿数百 ms），改为预分配 TypedArray 直写。
    const repeatVertex = 4, texureSize = this.options.particlesTextureSize;
    const particlesCount = texureSize * texureSize;
    const st = new Float32Array(particlesCount * repeatVertex * 2);
    let stOffset = 0;
    for (let s = 0; s < texureSize; s++) {
      const sNorm = s / texureSize;
      for (let t = 0; t < texureSize; t++) {
        const tNorm = t / texureSize;
        for (let i = 0; i < repeatVertex; i++) {
          st[stOffset++] = sNorm;
          st[stOffset++] = tNorm;
        }
      }
    }
    // (point to use, offset sign, not used component) — 每粒子 4 顶点固定模式
    const normalPattern = [-1, -1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0];
    const normal = new Float32Array(particlesCount * normalPattern.length);
    for (let i = 0; i < particlesCount; i++) {
      normal.set(normalPattern, i * normalPattern.length);
    }
    const vertexIndexes = new Uint32Array(particlesCount * 6);
    for (let i = 0, vertex = 0, idx = 0; i < particlesCount; i++, vertex += repeatVertex) {
      // 两个三角形
      vertexIndexes[idx++] = vertex + 0;
      vertexIndexes[idx++] = vertex + 1;
      vertexIndexes[idx++] = vertex + 2;
      vertexIndexes[idx++] = vertex + 2;
      vertexIndexes[idx++] = vertex + 1;
      vertexIndexes[idx++] = vertex + 3;
    }
    const geometry = new Geometry2({
      attributes: new GeometryAttributes({
        st: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 2,
          values: st
        }),
        normal: new GeometryAttribute({
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          values: normal
        })
      }),
      indices: vertexIndexes
    });
    return geometry;
  }
  createRawRenderState(options) {
    return Appearance.getDefaultRenderState(true, false, {
      viewport: void 0,
      depthTest: void 0,
      depthMask: void 0,
      blending: void 0,
      ...options
    });
  }
  createPrimitives() {
    const segments = new CustomPrimitive({
      commandType: "Draw",
      attributeLocations: {
        st: 0,
        normal: 1
      },
      geometry: this.createSegmentsGeometry(),
      primitiveType: PrimitiveType2.TRIANGLES,
      uniformMap: {
        previousParticlesPosition: () => this.computing.particlesTextures.previousParticlesPosition,
        currentParticlesPosition: () => this.computing.particlesTextures.currentParticlesPosition,
        postProcessingPosition: () => this.computing.particlesTextures.postProcessingPosition,
        particlesSpeed: () => this.computing.particlesTextures.particlesSpeed,
        frameRateAdjustment: () => this.computing.frameRateAdjustment,
        colorTable: () => this.colorTable,
        domain: () => {
          // 本地修改（GC 优化）：scratch 复用，避免每帧分配
          this._scratchDomain ??= new Cartesian22();
          return Cartesian22.fromElements(this.options.domain?.min ?? this.computing.windData.speed.min, this.options.domain?.max ?? this.computing.windData.speed.max, this._scratchDomain);
        },
        displayRange: () => {
          this._scratchDisplayRange ??= new Cartesian22();
          return Cartesian22.fromElements(
            this.options.displayRange?.min ?? this.computing.windData.speed.min,
            this.options.displayRange?.max ?? this.computing.windData.speed.max,
            this._scratchDisplayRange
          );
        },
        particleHeight: () => this.options.particleHeight || 0,
        aspect: () => this.context.drawingBufferWidth / this.context.drawingBufferHeight,
        pixelSize: () => this.viewerParameters.pixelSize,
        lineWidth: () => {
          const width = this.options.lineWidth || DefaultOptions.lineWidth;
          this._scratchLineWidth ??= new Cartesian22();
          return Cartesian22.fromElements(width.min, width.max, this._scratchLineWidth);
        },
        lineLength: () => {
          const length = this.options.lineLength || DefaultOptions.lineLength;
          this._scratchLineLength ??= new Cartesian22();
          return Cartesian22.fromElements(length.min, length.max, this._scratchLineLength);
        },
        is3D: () => this.viewerParameters.sceneMode === SceneMode.SCENE3D,
        segmentsDepthTexture: () => this.textures.segmentsDepth
      },
      vertexShaderSource: ShaderManager.getSegmentDrawVertexShader(),
      fragmentShaderSource: ShaderManager.getSegmentDrawFragmentShader(),
      rawRenderState: this.createRawRenderState({
        viewport: void 0,
        depthTest: {
          enabled: true
        },
        depthMask: true,
        blending: {
          enabled: true,
          blendEquation: WebGLRenderingContext.FUNC_ADD,
          blendFuncSource: WebGLRenderingContext.SRC_ALPHA,
          blendFuncDestination: WebGLRenderingContext.ONE_MINUS_SRC_ALPHA
        }
      })
    });
    return { segments };
  }
  onParticlesTextureSizeChange() {
    const geometry = this.createSegmentsGeometry();
    this.primitives.segments.geometry = geometry;
    const vertexArray = VertexArray2.fromGeometry({
      context: this.context,
      geometry,
      attributeLocations: this.primitives.segments.attributeLocations,
      bufferUsage: BufferUsage2.STATIC_DRAW
    });
    if (this.primitives.segments.commandToExecute) {
      this.primitives.segments.commandToExecute.vertexArray = vertexArray;
    }
  }
  onColorTableChange() {
    this.colorTable.destroy();
    this.colorTable = this.createColorTableTexture();
  }
  updateOptions(options) {
    const needUpdateColorTable = options.colors && JSON.stringify(options.colors) !== JSON.stringify(this.options.colors);
    this.options = deepMerge(options, this.options);
    if (needUpdateColorTable) {
      this.onColorTableChange();
    }
  }
  destroy() {
    Object.values(this.framebuffers).forEach((framebuffer) => {
      framebuffer.destroy();
    });
    Object.values(this.primitives).forEach((primitive) => {
      primitive.destroy();
    });
    this.colorTable.destroy();
  }
};

// src/windParticleSystem.ts
import { ClearCommand as ClearCommand2, Color as Color3, Pass as Pass2 } from "cesium";
var WindParticleSystem = class {
  constructor(context, windData, options, viewerParameters, scene) {
    __publicField(this, "computing");
    __publicField(this, "rendering");
    __publicField(this, "options");
    __publicField(this, "viewerParameters");
    __publicField(this, "context");
    this.context = context;
    this.options = options;
    this.viewerParameters = viewerParameters;
    this.computing = new WindParticlesComputing(context, windData, options, viewerParameters, scene);
    this.rendering = new WindParticlesRendering(context, options, viewerParameters, this.computing);
    this.clearFramebuffers();
  }
  getPrimitives() {
    const primitives = [
      this.computing.primitives.calculateSpeed,
      this.computing.primitives.updatePosition,
      this.computing.primitives.postProcessingPosition,
      this.rendering.primitives.segments
    ];
    return primitives;
  }
  clearFramebuffers() {
    const clearCommand = new ClearCommand2({
      color: new Color3(0, 0, 0, 0),
      depth: 1,
      framebuffer: void 0,
      pass: Pass2.OPAQUE
    });
    Object.keys(this.rendering.framebuffers).forEach((key) => {
      clearCommand.framebuffer = this.rendering.framebuffers[key];
      clearCommand.execute(this.context);
    });
  }
  changeOptions(options) {
    let maxParticlesChanged = false;
    if (options.particlesTextureSize && this.options.particlesTextureSize !== options.particlesTextureSize) {
      maxParticlesChanged = true;
    }
    const newOptions = deepMerge(options, this.options);
    if (newOptions.particlesTextureSize < 1) {
      throw new Error("particlesTextureSize must be greater than 0");
    }
    this.options = newOptions;
    this.rendering.updateOptions(options);
    this.computing.updateOptions(options);
    if (maxParticlesChanged) {
      this.computing.destroyParticlesTextures();
      this.computing.createParticlesTextures();
      this.rendering.onParticlesTextureSizeChange();
    }
  }
  applyViewerParameters(viewerParameters) {
    this.viewerParameters = viewerParameters;
    this.computing.viewerParameters = viewerParameters;
    this.rendering.viewerParameters = viewerParameters;
  }
  destroy() {
    this.computing.destroy();
    this.rendering.destroy();
  }
};

// src/index.ts
var DefaultOptions = {
  particlesTextureSize: 100,
  dropRate: 3e-3,
  particleHeight: 1e3,
  dropRateBump: 0.01,
  speedFactor: 1,
  lineWidth: { min: 1, max: 2 },
  lineLength: { min: 20, max: 100 },
  colors: ["white"],
  flipY: false,
  useViewerBounds: false,
  domain: void 0,
  displayRange: void 0,
  dynamic: true
};
var _WindLayer = class _WindLayer {
  /**
   * WindLayer class for visualizing wind field data with particle animation in Cesium.
   * 
   * @class
   * @param {Viewer} viewer - The Cesium viewer instance.
   * @param {WindData} windData - The wind field data to visualize.
   * @param {Partial<WindLayerOptions>} [options] - Optional configuration options for the wind layer.
   * @param {number} [options.particlesTextureSize=100] - Size of the particle texture. Determines the maximum number of particles (size squared).
   * @param {number} [options.particleHeight=0] - Height of particles above the ground in meters.
   * @param {Object} [options.lineWidth={ min: 1, max: 2 }] - Width range of particle trails.
   * @param {Object} [options.lineLength={ min: 20, max: 100 }] - Length range of particle trails.
   * @param {number} [options.speedFactor=1.0] - Factor to adjust the speed of particles.
   * @param {number} [options.dropRate=0.003] - Rate at which particles are dropped (reset).
   * @param {number} [options.dropRateBump=0.001] - Additional drop rate for slow-moving particles.
   * @param {string[]} [options.colors=['white']] - Array of colors for particles. Can be used to create color gradients.
   * @param {boolean} [options.flipY=false] - Whether to flip the Y-axis of the wind data.
   * @param {boolean} [options.useViewerBounds=false] - Whether to use the viewer bounds to generate particles.
   * @param {boolean} [options.dynamic=true] - Whether to enable dynamic particle animation.
   */
  constructor(viewer, windData, options) {
    __publicField(this, "_show", true);
    __publicField(this, "_resized", false);
    __publicField(this, "windData");
    __publicField(this, "viewer");
    __publicField(this, "scene");
    __publicField(this, "options");
    __publicField(this, "particleSystem");
    __publicField(this, "viewerParameters");
    __publicField(this, "_isDestroyed", false);
    __publicField(this, "primitives", []);
    __publicField(this, "eventListeners", /* @__PURE__ */ new Map());
    this.show = true;
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.options = { ..._WindLayer.defaultOptions, ...options };
    this.windData = this.processWindData(windData);
    this.viewerParameters = {
      lonRange: new Cartesian23(-180, 180),
      latRange: new Cartesian23(-90, 90),
      pixelSize: 1e3,
      sceneMode: this.scene.mode
    };
    this.updateViewerParameters();
    this.particleSystem = new WindParticleSystem(this.scene.context, this.windData, this.options, this.viewerParameters, this.scene);
    this.add();
    this.setupEventListeners();
  }
  get show() {
    return this._show;
  }
  set show(value) {
    if (this._show !== value) {
      this._show = value;
      this.updatePrimitivesVisibility(value);
    }
  }
  setupEventListeners() {
    // 本地修改（缺陷修复）：
    // 1) 原实现 add/remove 各自 .bind(this) 生成不同函数，removeEventListener 永远
    //    匹配不上 → 风场销毁后 camera.changed/morphComplete/resize 监听残留（泄漏）。
    //    改为缓存同一 bound 引用。
    // 2) percentageChanged 是 viewer 级全局设置（影响整个应用 camera.changed 触发频率），
    //    快照原值并在销毁时恢复，消除全局副作用。
    this._boundUpdateViewerParameters = this._boundUpdateViewerParameters
      || this.updateViewerParameters.bind(this);
    this._prevPercentageChanged = this.viewer.camera.percentageChanged;
    this.viewer.camera.percentageChanged = 0.01;
    this.viewer.camera.changed.addEventListener(this._boundUpdateViewerParameters);
    this.scene.morphComplete.addEventListener(this._boundUpdateViewerParameters);
    window.addEventListener("resize", this._boundUpdateViewerParameters);
  }
  removeEventListeners() {
    if (this._boundUpdateViewerParameters) {
      this.viewer.camera.changed.removeEventListener(this._boundUpdateViewerParameters);
      this.scene.morphComplete.removeEventListener(this._boundUpdateViewerParameters);
      window.removeEventListener("resize", this._boundUpdateViewerParameters);
    }
    if (typeof this._prevPercentageChanged === "number") {
      this.viewer.camera.percentageChanged = this._prevPercentageChanged;
      this._prevPercentageChanged = undefined;
    }
  }
  processWindData(windData) {
    if (windData.speed?.min === void 0 || windData.speed?.max === void 0 || windData.speed.array === void 0) {
      const speed = {
        array: new Float32Array(windData.u.array.length),
        min: Number.MAX_VALUE,
        max: Number.MIN_VALUE
      };
      for (let i = 0; i < windData.u.array.length; i++) {
        speed.array[i] = Math.sqrt(windData.u.array[i] * windData.u.array[i] + windData.v.array[i] * windData.v.array[i]);
        if (speed.array[i] !== 0) {
          speed.min = Math.min(speed.min, speed.array[i]);
          speed.max = Math.max(speed.max, speed.array[i]);
        }
      }
      windData = { ...windData, speed };
    }
    return windData;
  }
  /**
   * Get the wind data at a specific longitude and latitude.
   * @param {number} lon - The longitude.
   * @param {number} lat - The latitude.
   * @returns {Object} - An object containing the u, v, and speed values at the specified coordinates.
   */
  getDataAtLonLat(lon, lat) {
    const { bounds, width, height, u, v, speed } = this.windData;
    const { flipY } = this.options;
    if (lon < bounds.west || lon > bounds.east || lat < bounds.south || lat > bounds.north) {
      return null;
    }
    const xNorm = (lon - bounds.west) / (bounds.east - bounds.west) * (width - 1);
    let yNorm = (lat - bounds.south) / (bounds.north - bounds.south) * (height - 1);
    if (flipY) {
      yNorm = height - 1 - yNorm;
    }
    const x = Math.floor(xNorm);
    const y = Math.floor(yNorm);
    const x0 = Math.floor(xNorm);
    const x1 = Math.min(x0 + 1, width - 1);
    const y0 = Math.floor(yNorm);
    const y1 = Math.min(y0 + 1, height - 1);
    const wx = xNorm - x0;
    const wy = yNorm - y0;
    const index = y * width + x;
    const i00 = y0 * width + x0;
    const i10 = y0 * width + x1;
    const i01 = y1 * width + x0;
    const i11 = y1 * width + x1;
    const u00 = u.array[i00];
    const u10 = u.array[i10];
    const u01 = u.array[i01];
    const u11 = u.array[i11];
    const uInterp = (1 - wx) * (1 - wy) * u00 + wx * (1 - wy) * u10 + (1 - wx) * wy * u01 + wx * wy * u11;
    const v00 = v.array[i00];
    const v10 = v.array[i10];
    const v01 = v.array[i01];
    const v11 = v.array[i11];
    const vInterp = (1 - wx) * (1 - wy) * v00 + wx * (1 - wy) * v10 + (1 - wx) * wy * v01 + wx * wy * v11;
    const interpolatedSpeed = Math.sqrt(uInterp * uInterp + vInterp * vInterp);
    return {
      original: {
        u: u.array[index],
        v: v.array[index],
        speed: speed.array[index]
      },
      interpolated: {
        u: uInterp,
        v: vInterp,
        speed: interpolatedSpeed
      }
    };
  }
  updateViewerParameters() {
    const scene = this.viewer.scene;
    const canvas = scene.canvas;
    const corners = [
      { x: 0, y: 0 },
      { x: 0, y: canvas.clientHeight },
      { x: canvas.clientWidth, y: 0 },
      { x: canvas.clientWidth, y: canvas.clientHeight }
    ];
    let minLon = 180;
    let maxLon = -180;
    let minLat = 90;
    let maxLat = -90;
    let isOutsideGlobe = false;
    for (const corner of corners) {
      const cartesian = scene.camera.pickEllipsoid(
        new Cartesian23(corner.x, corner.y),
        scene.globe.ellipsoid
      );
      if (!cartesian) {
        isOutsideGlobe = true;
        break;
      }
      const cartographic = scene.globe.ellipsoid.cartesianToCartographic(cartesian);
      const lon = CesiumMath.toDegrees(cartographic.longitude);
      const lat = CesiumMath.toDegrees(cartographic.latitude);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    if (!isOutsideGlobe) {
      const lonRange = new Cartesian23(
        Math.max(this.windData.bounds.west, minLon),
        Math.min(this.windData.bounds.east, maxLon)
      );
      const latRange = new Cartesian23(
        Math.max(this.windData.bounds.south, minLat),
        Math.min(this.windData.bounds.north, maxLat)
      );
      const lonBuffer = (lonRange.y - lonRange.x) * 0.05;
      const latBuffer = (latRange.y - latRange.x) * 0.05;
      lonRange.x = Math.max(this.windData.bounds.west, lonRange.x - lonBuffer);
      lonRange.y = Math.min(this.windData.bounds.east, lonRange.y + lonBuffer);
      latRange.x = Math.max(this.windData.bounds.south, latRange.x - latBuffer);
      latRange.y = Math.min(this.windData.bounds.north, latRange.y + latBuffer);
      this.viewerParameters.lonRange = lonRange;
      this.viewerParameters.latRange = latRange;
      const dataLonRange = this.windData.bounds.east - this.windData.bounds.west;
      const dataLatRange = this.windData.bounds.north - this.windData.bounds.south;
      const visibleRatioLon = (lonRange.y - lonRange.x) / dataLonRange;
      const visibleRatioLat = (latRange.y - latRange.x) / dataLatRange;
      const visibleRatio = Math.min(visibleRatioLon, visibleRatioLat);
      const pixelSize = 1e3 * visibleRatio;
      if (pixelSize > 0) {
        this.viewerParameters.pixelSize = Math.max(0, Math.min(1e3, pixelSize));
      }
    }
    this.viewerParameters.sceneMode = this.scene.mode;
    this.particleSystem?.applyViewerParameters(this.viewerParameters);
  }
  /**
   * Update the wind data of the wind layer.
   * @param {WindData} data - The new wind data to apply.
   */
  updateWindData(data) {
    if (this._isDestroyed) return;
    this.windData = this.processWindData(data);
    this.particleSystem.computing.updateWindData(this.windData);
    this.viewer.scene.requestRender();
    this.dispatchEvent("dataChange", this.windData);
  }
  /**
   * Update the options of the wind layer.
   * @param {Partial<WindLayerOptions>} options - The new options to apply.
   */
  updateOptions(options) {
    if (this._isDestroyed) return;
    this.options = deepMerge(options, this.options);
    this.particleSystem.changeOptions(options);
    this.viewer.scene.requestRender();
    this.dispatchEvent("optionsChange", this.options);
  }
  /**
   * Zoom to the wind data bounds.
   * @param {number} [duration=0] - The duration of the zoom animation.
   */
  zoomTo(duration = 0) {
    if (this.windData.bounds) {
      const rectangle = Rectangle.fromDegrees(
        this.windData.bounds.west,
        this.windData.bounds.south,
        this.windData.bounds.east,
        this.windData.bounds.north
      );
      this.viewer.camera.flyTo({
        destination: rectangle,
        duration
      });
    }
  }
  /**
   * Add the wind layer to the scene.
   */
  add() {
    this.primitives = this.particleSystem.getPrimitives();
    this.primitives.forEach((primitive) => {
      this.scene.primitives.add(primitive);
    });
  }
  /**
   * Remove the wind layer from the scene.
   */
  remove() {
    this.primitives.forEach((primitive) => {
      this.scene.primitives.remove(primitive);
    });
    this.primitives = [];
  }
  /**
   * Check if the wind layer is destroyed.
   * @returns {boolean} - True if the wind layer is destroyed, otherwise false.
   */
  isDestroyed() {
    return this._isDestroyed;
  }
  /**
   * Destroy the wind layer and release all resources.
   */
  destroy() {
    this.remove();
    this.removeEventListeners();
    this.particleSystem.destroy();
    this.eventListeners.clear();
    this._isDestroyed = true;
  }
  updatePrimitivesVisibility(visibility) {
    const show = visibility !== void 0 ? visibility : this._show;
    this.primitives.forEach((primitive) => {
      primitive.show = show;
    });
  }
  /**
   * Add an event listener for the specified event type.
   * @param {WindLayerEventType} type - The type of event to listen for.
   * @param {WindLayerEventCallback} callback - The callback function to execute when the event occurs.
   */
  addEventListener(type, callback) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, /* @__PURE__ */ new Set());
    }
    this.eventListeners.get(type)?.add(callback);
  }
  /**
   * Remove an event listener for the specified event type.
   * @param {WindLayerEventType} type - The type of event to remove.
   * @param {WindLayerEventCallback} callback - The callback function to remove.
   */
  removeEventListener(type, callback) {
    this.eventListeners.get(type)?.delete(callback);
  }
  dispatchEvent(type, data) {
    this.eventListeners.get(type)?.forEach((callback) => callback(data));
  }
};
__publicField(_WindLayer, "defaultOptions", DefaultOptions);
var WindLayer = _WindLayer;
export {
  DefaultOptions,
  WindLayer
};
//# sourceMappingURL=index.mjs.map