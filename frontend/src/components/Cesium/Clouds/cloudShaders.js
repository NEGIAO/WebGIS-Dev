export const CLOUD_VERTEX_SHADER = `#version 300 es
in vec2 position;
in vec2 textureCoordinates;
out vec2 v_uv;

void main() {
    v_uv = textureCoordinates;
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const CLOUD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec4 u_cloudRadii;   // x=bottom radius, y=top radius, z=max distance, w=step count
uniform vec4 u_cloudParams;  // x=coverage, y=density, z=alpha, w=thickness
uniform vec4 u_lighting;     // x=sun strength, y=ambient, z=bottom altitude, w=reserved
uniform vec4 u_noise;        // x=shape scale, y=weather scale, z=wind meters, w=time
uniform vec2 u_windDirection;
uniform vec3 u_cameraPositionWC;

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

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += valueNoise(p) * amplitude;
        p = p * 2.03 + vec3(17.1, 9.2, 5.4);
        amplitude *= 0.5;
    }
    return value;
}

vec2 raySphereIntersection(vec3 origin, vec3 direction, float radius) {
    float b = dot(origin, direction);
    float c = dot(origin, origin) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return vec2(1.0, -1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

float hgPhase(float cosTheta, float g) {
    float g2 = g * g;
    float denom = pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5);
    return (1.0 - g2) / (12.5663706144 * denom);
}

float sampleCloudDensity(vec3 position, float heightFraction) {
    float verticalProfile = smoothstep(0.02, 0.22, heightFraction) * (1.0 - smoothstep(0.72, 1.0, heightFraction));
    float roundedTop = 1.0 - pow(abs(heightFraction * 2.0 - 1.0), 2.0);

    vec3 windOffset = vec3(u_windDirection * u_noise.z, 0.0);
    vec3 shapePos = (position + windOffset) * u_noise.x;
    vec3 weatherPos = (position + windOffset * 0.35) * u_noise.y;

    float weather = fbm(weatherPos);
    float shape = fbm(shapePos);
    float detail = fbm(shapePos * 4.0 + vec3(0.0, 0.0, u_noise.w * 0.02));
    float coverageMask = smoothstep(u_cloudParams.x, 1.0, weather * 0.72 + shape * 0.28);
    float erosion = smoothstep(0.18, 0.92, shape * 0.78 + detail * 0.22);

    return max(0.0, verticalProfile * roundedTop * coverageMask * erosion * u_cloudParams.y);
}

vec3 reconstructRayDirection(vec2 uv) {
    vec2 ndc = uv * 2.0 - 1.0;
    vec4 eye = czm_inverseProjection * vec4(ndc, 1.0, 1.0);
    eye /= max(eye.w, 0.000001);
    vec3 directionEC = normalize(eye.xyz);
    return normalize((czm_inverseView * vec4(directionEC, 0.0)).xyz);
}

void main() {
    vec3 rayOrigin = u_cameraPositionWC;
    vec3 rayDirection = reconstructRayDirection(v_uv);

    vec2 outerHit = raySphereIntersection(rayOrigin, rayDirection, u_cloudRadii.y);
    if (outerHit.y <= 0.0) {
        discard;
    }

    vec2 innerHit = raySphereIntersection(rayOrigin, rayDirection, u_cloudRadii.x);
    float nearT = max(outerHit.x, 0.0);
    float farT = outerHit.y;

    float cameraRadius = length(rayOrigin);
    if (cameraRadius < u_cloudRadii.x && innerHit.y > 0.0) {
        nearT = max(innerHit.y, nearT);
    } else if (innerHit.x > 0.0 && innerHit.x < farT) {
        farT = innerHit.x;
    }

    farT = min(farT, u_cloudRadii.z);
    if (farT <= nearT) {
        discard;
    }

    int stepCount = int(clamp(floor(u_cloudRadii.w + 0.5), 8.0, 160.0));
    float marchLength = farT - nearT;
    float stepSize = marchLength / float(stepCount);
    float jitter = hash31(vec3(gl_FragCoord.xy, u_noise.w));
    float t = nearT + jitter * stepSize;

    vec3 sunDirection = normalize(czm_sunDirectionWC);
    vec3 cloudColor = vec3(0.0);
    float transmittance = 1.0;
    float alpha = 0.0;

    for (int i = 0; i < 160; i++) {
        if (i >= stepCount || transmittance < 0.025) break;

        vec3 position = rayOrigin + rayDirection * t;
        float radius = length(position);
        float heightFraction = clamp((radius - u_cloudRadii.x) / max(u_cloudRadii.y - u_cloudRadii.x, 1.0), 0.0, 1.0);
        float density = sampleCloudDensity(position, heightFraction);

        if (density > 0.001) {
            float extinction = density * 0.000085;
            float stepAlpha = 1.0 - exp(-extinction * stepSize);
            float cosTheta = dot(rayDirection, sunDirection);
            float phase = hgPhase(cosTheta, 0.58) * 5.0 + hgPhase(cosTheta, -0.25) * 1.2;
            float topLight = mix(0.55, 1.25, heightFraction);
            vec3 sunLight = vec3(1.0, 0.92, 0.78) * phase * u_lighting.x * topLight;
            vec3 skyLight = vec3(0.50, 0.64, 0.86) * u_lighting.y;
            vec3 sampleColor = sunLight + skyLight;

            cloudColor += transmittance * stepAlpha * sampleColor;
            alpha += transmittance * stepAlpha;
            transmittance *= 1.0 - stepAlpha;
        }

        t += stepSize;
    }

    alpha = clamp(alpha * u_cloudParams.z, 0.0, 0.92);
    if (alpha <= 0.003) {
        discard;
    }

    vec3 color = cloudColor / max(alpha, 0.001);
    color = mix(vec3(0.72, 0.78, 0.84), color, clamp(alpha * 1.8, 0.0, 1.0));
    out_FragColor = vec4(color, alpha);
}
`;
