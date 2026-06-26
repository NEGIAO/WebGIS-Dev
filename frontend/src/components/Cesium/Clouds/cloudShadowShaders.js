export const CLOUD_SHADOW_VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 v_uv;

void main() {
    v_uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const CLOUD_SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_FragColor;

uniform vec4 u_shadowAtlas;       // x=cascade count, y=resolution, z=bottom radius, w=top radius
uniform vec4 u_shadowParams;      // x=extinction density, y=coverage, z=step count, w=time
uniform vec3 u_sunDirectionWC;
uniform mat4 u_inverseCascadeMatrices[4];

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    float x00 = mix(n000, n100, f.x);
    float x10 = mix(n010, n110, f.x);
    float x01 = mix(n001, n101, f.x);
    float x11 = mix(n011, n111, f.x);
    float y0 = mix(x00, x10, f.y);
    float y1 = mix(x01, x11, f.y);
    return mix(y0, y1, f.z);
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += valueNoise(p) * amplitude;
        p = p * 2.03 + vec3(17.1, 31.7, 11.3);
        amplitude *= 0.5;
    }
    return value;
}

vec2 raySphere(vec3 origin, vec3 direction, float radius) {
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return vec2(1.0, 0.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

// 12 个正二十面体顶点法线（Golden Ratio 生成）
const vec3 STRUCTURE_NORMALS[12] = vec3[12](
    normalize(vec3(-1.0,  1.61803398875,  0.0)),
    normalize(vec3( 1.0,  1.61803398875,  0.0)),
    normalize(vec3(-1.0, -1.61803398875,  0.0)),
    normalize(vec3( 1.0, -1.61803398875,  0.0)),
    normalize(vec3( 0.0, -1.0,  1.61803398875)),
    normalize(vec3( 0.0,  1.0,  1.61803398875)),
    normalize(vec3( 0.0, -1.0, -1.61803398875)),
    normalize(vec3( 0.0,  1.0, -1.61803398875)),
    normalize(vec3( 1.61803398875,  0.0, -1.0)),
    normalize(vec3( 1.61803398875,  0.0,  1.0)),
    normalize(vec3(-1.61803398875,  0.0, -1.0)),
    normalize(vec3(-1.61803398875,  0.0,  1.0))
);

vec3 getStructureNormal(int index) {
    return STRUCTURE_NORMALS[clamp(index, 0, 11)];
}

float stableBlueNoise(vec2 texel, float cascadeIndex) {
    // 多频率空间哈希叠加，减少低频图案可见性
    vec2 cell = floor(texel);
    float seed = cascadeIndex * 0.113;
    float h1 = fract(sin(dot(cell, vec2(12.9898, 78.233)) + seed) * 43758.5453);
    float h2 = fract(sin(dot(cell, vec2(63.7264, 10.873)) + seed * 1.3) * 23421.631);
    return fract(h1 * 0.618 + h2 * 0.382);
}

float sampleCloudDensity(vec3 position, float heightFraction) {
    vec3 normal = normalize(position);
    vec3 wind = vec3(u_shadowParams.w * 0.0025, u_shadowParams.w * 0.0015, 0.0);
    vec3 weatherCoord = normal * 42.0 + wind;
    vec3 shapeCoord = position * 0.000075 + vec3(u_shadowParams.w * 0.006, 0.0, 0.0);

    float weather = fbm(weatherCoord);
    float shape = fbm(shapeCoord);
    float detail = fbm(shapeCoord * 3.2 + 19.0);
    float profile = smoothstep(0.02, 0.22, heightFraction) * (1.0 - smoothstep(0.72, 1.0, heightFraction));
    float coverageCutoff = 1.0 - u_shadowParams.y;
    float baseDensity = smoothstep(coverageCutoff, coverageCutoff + 0.28, weather * 0.72 + shape * 0.28);
    float carved = baseDensity * smoothstep(0.10, 0.82, detail);

    return carved * profile;
}

void main() {
    float cascadeCount = max(u_shadowAtlas.x, 1.0);
    float cascadeWidth = 1.0 / cascadeCount;
    int cascadeIndex = int(clamp(floor(v_uv.x / cascadeWidth), 0.0, cascadeCount - 1.0));
    float localX = fract(v_uv.x * cascadeCount);
    vec2 cascadeUv = vec2(localX, v_uv.y);
    vec2 ndc = cascadeUv * 2.0 - 1.0;

    mat4 inverseCascade = u_inverseCascadeMatrices[cascadeIndex];
    vec4 nearWorld = inverseCascade * vec4(ndc, -1.0, 1.0);
    vec4 farWorld = inverseCascade * vec4(ndc, 1.0, 1.0);
    nearWorld.xyz /= max(abs(nearWorld.w), 0.000001);
    farWorld.xyz /= max(abs(farWorld.w), 0.000001);

    vec3 rayOrigin = nearWorld.xyz;
    vec3 rayDirection = normalize(farWorld.xyz - nearWorld.xyz);
    if (dot(rayDirection, u_sunDirectionWC) < 0.0) {
        rayDirection = -rayDirection;
    }

    vec2 outerHit = raySphere(rayOrigin, rayDirection, u_shadowAtlas.w);
    if (outerHit.x > outerHit.y || outerHit.y <= 0.0) {
        out_FragColor = vec4(0.0);
        return;
    }

    vec2 innerHit = raySphere(rayOrigin, rayDirection, u_shadowAtlas.z);
    float nearT = max(outerHit.x, 0.0);
    float farT = outerHit.y;
    if (innerHit.x <= innerHit.y && innerHit.y > 0.0) {
        farT = min(farT, max(innerHit.x, 0.0));
    }
    if (farT <= nearT) {
        out_FragColor = vec4(0.0);
        return;
    }

    int stepCount = int(clamp(floor(u_shadowParams.z + 0.5), 8.0, 48.0));
    float span = farT - nearT;
    float stepSize = span / float(stepCount);
    float stableJitter = stableBlueNoise(gl_FragCoord.xy, float(cascadeIndex));
    int structureIndex = int(floor(stableJitter * 12.0));
    vec3 structureNormal = getStructureNormal(structureIndex);
    float structureDenom = dot(rayDirection, structureNormal);
    float structureSpacing = max(stepSize, 250.0);
    float t = nearT + stableJitter * stepSize;
    float planeIndex = 0.0;
    float planeDirection = 1.0;

    if (abs(structureDenom) > 0.035) {
        vec3 nearPosition = rayOrigin + rayDirection * nearT;
        float nearCoord = dot(nearPosition, structureNormal);
        planeDirection = sign(structureDenom);
        planeIndex = planeDirection > 0.0
            ? ceil(nearCoord / structureSpacing + stableJitter)
            : floor(nearCoord / structureSpacing - stableJitter);
        float planeCoord = planeIndex * structureSpacing;
        t = (planeCoord - dot(rayOrigin, structureNormal)) / structureDenom;
        if (t < nearT) {
            planeIndex += planeDirection;
            planeCoord = planeIndex * structureSpacing;
            t = (planeCoord - dot(rayOrigin, structureNormal)) / structureDenom;
        }
    }

    float opticalDepth = 0.0;
    float firstDepth = -1.0;
    float maxDensity = 0.0;

    for (int i = 0; i < 48; i++) {
        if (i >= stepCount || t > farT) break;

        float currentT = t;
        float nextT = currentT + stepSize;
        if (abs(structureDenom) > 0.035) {
            float nextPlaneCoord = (planeIndex + planeDirection) * structureSpacing;
            nextT = (nextPlaneCoord - dot(rayOrigin, structureNormal)) / structureDenom;
        }
        float sampleLength = clamp(nextT - currentT, 0.0, stepSize * 2.5);
        vec3 position = rayOrigin + rayDirection * t;
        float radius = length(position);
        float heightFraction = saturate((radius - u_shadowAtlas.z) / max(u_shadowAtlas.w - u_shadowAtlas.z, 1.0));
        float density = sampleCloudDensity(position, heightFraction);
        if (density > 0.001) {
            if (firstDepth < 0.0) firstDepth = t;
            opticalDepth += density * sampleLength * u_shadowParams.x;
            maxDensity = max(maxDensity, density);
        }

        if (abs(structureDenom) > 0.035) {
            planeIndex += planeDirection;
            float planeCoord = planeIndex * structureSpacing;
            t = (planeCoord - dot(rayOrigin, structureNormal)) / structureDenom;
        } else {
            t += stepSize;
        }
    }

    float normalizedFront = firstDepth < 0.0 ? 0.0 : saturate((firstDepth - nearT) / max(farT - nearT, 1.0));
    float encodedOcclusion = 1.0 - exp(-opticalDepth * 0.85);
    out_FragColor = vec4(normalizedFront, saturate(encodedOcclusion), saturate(maxDensity), firstDepth < 0.0 ? 0.0 : 1.0);
}
`;
