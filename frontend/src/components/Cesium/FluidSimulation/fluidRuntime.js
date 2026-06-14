export function createFluidRuntime(Cesium) {
    if (!Cesium) {
        throw new Error('Cesium runtime is required for FluidRenderer.');
    }

    function getSceneView(scene) {
        return scene?._view || scene?.view;
    }

    function getScenePassState(scene) {
        const view = getSceneView(scene);
        if (!view?.passState) {
            throw new Error('Cesium scene passState is unavailable.');
        }
        return view.passState;
    }

    function getFrustumCommandsList(scene) {
        const view = getSceneView(scene);
        return view?.frustumCommandsList || view?._frustumCommandsList || [];
    }

    const Command = `
// cesium for fluid by mind3d , fluid demo from https://www.shadertoy.com/view/7tSSDD 
const int textureSize = 1024;
// Render
const vec3 backgroundColor = vec3(0.2);
// Terrain
const float transitionTime = 5.0;
const float transitionPercent = 0.3;
const int octaves = 7;
const float minAnimatedFilmDepth = 0.003;
// Water simulation
// const float attenuation = 0.995;
// const float strenght = 0.25;
// const float minTotalFlow = 0.0001;
// fluidParam: x=attenuation, y=strength, z=minTotalFlow, w=initialWaterLevel(normalized absolute elevation)
// customParam: x=threshold(fogDist), y=blend(specPower), z=lightStrength(specIntensity), w=reserved
uniform vec4 fluidParam;
uniform vec4 customParam;

mat2 rot(in float ang) 
{
   return mat2(
			cos(ang), -sin(ang),
			sin(ang),  cos(ang));
}

// hash from Dave_Hoskins https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p)
{
	vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3)
{
	p3  = fract(p3 * .1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

// Box intersection by IQ https://iquilezles.org/articles/boxfunctions

vec2 boxIntersection( in vec3 ro, in vec3 rd, in vec3 rad, out vec3 oN ) 
{
    vec3 m = 1.0 / rd;
    vec3 n = m * ro;
    vec3 k = abs(m) * rad;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;

    float tN = max( max( t1.x, t1.y ), t1.z );
    float tF = min( min( t2.x, t2.y ), t2.z );
	
    if( tN > tF || tF < 0.0) return vec2(-1.0); // no intersection
    
    oN = -sign(rd)*step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);

    return vec2( tN, tF );
}

vec2 hitBox(vec3 orig, vec3 dir) {
    const vec3 box_min = vec3(-0.5);
    const vec3 box_max = vec3(0.5);
    vec3 inv_dir = 1.0 / dir;
    vec3 tmin_tmp = (box_min - orig) * inv_dir;
    vec3 tmax_tmp = (box_max - orig) * inv_dir;
    vec3 tmin = min(tmin_tmp, tmax_tmp);
    vec3 tmax = max(tmin_tmp, tmax_tmp);
    float t0 = max(tmin.x, max(tmin.y, tmin.z));
    float t1 = min(tmax.x, min(tmax.y, tmax.z));
    return vec2(t0, t1);
}

// Fog by IQ https://iquilezles.org/articles/fog

vec3 applyFog( in vec3  rgb, vec3 fogColor, in float distance)
{
    float fogAmount = exp( -distance );
    return mix( fogColor, rgb, fogAmount );
}
`;

    // 计算地形和更新水位的一个pass
    const BufferA = `
// compute Terrain and update water level 1st pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform sampler2D heightMap;
uniform float     iTime;
uniform int     iFrame;
uniform vec2     center;
uniform float   playTime;
uniform vec2    resolution;
uniform float     minHeight;
uniform float     maxHeight;
float boxNoise( in vec2 p, in float z )
{
    vec2 fl = floor(p);
    vec2 fr = fract(p);
    fr = smoothstep(0.0, 1.0, fr);    
    float res = mix(mix( hash13(vec3(fl, z)),             hash13(vec3(fl + vec2(1,0), z)),fr.x),
                mix( hash13(vec3(fl + vec2(0,1), z)), hash13(vec3(fl + vec2(1,1), z)),fr.x),fr.y);
    return res;
}

float Terrain( in vec2 p, in float z, in int octaveNum)
{
	float a = 1.0;
	float f = .0;
	for (int i = 0; i < octaveNum; i++)
	{
		f += a * boxNoise(p, z);
		a *= 0.45;
		p = 2.0 * rot(radians(41.0)) * p;
	}
	return f;
}

vec2 readHeight(ivec2 p)
{
	p = clamp(p, ivec2(0), ivec2(textureSize - 1));
	return texelFetch(iChannel0, p, 0).xy;
} 

vec4 readOutFlow(ivec2 p)
{
	if(p.x < 0 || p.y < 0 || p.x >= textureSize || p.y >= textureSize)
		return vec4(0);
	return texelFetch(iChannel1, p, 0);
} 
void main( )
{
    // Outside ?
    if( max(gl_FragCoord.x, gl_FragCoord.y) > float(textureSize) )
    discard;
       
    // Terrain
    vec2 uv = gl_FragCoord.xy / float(textureSize);
    float t = iTime / transitionTime;
    // float terrainElevation = mix(Terrain(uv * 4.0, floor(t), octaves), Terrain(uv * 4.0, floor(t) + 1.0, octaves), smoothstep(1.0 - transitionPercent, 1.0, fract(t))) * 0.5;

    float terrainElevation = texture(heightMap, uv).r;
    float heightSpan = max(maxHeight - minHeight, 0.0001);
    terrainElevation = clamp((terrainElevation - minHeight) / heightSpan, 0.0, 1.0);

    // Water
    // fluidParam.w is a normalized absolute water level in the current elevation range.
    float animatedFilmDepth = min(min(fluidParam.w, minAnimatedFilmDepth), max(1.0 - terrainElevation, 0.0));
    float waterDept = max(fluidParam.w - terrainElevation, animatedFilmDepth);
    if(iFrame != 0)
    {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 height = readHeight(p);
    vec4 OutFlow = texelFetch(iChannel1, p, 0);
    float totalOutFlow = OutFlow.x + OutFlow.y + OutFlow.z + OutFlow.w;
    float totalInFlow = 0.0;
    totalInFlow += readOutFlow(p  + ivec2( 1,  0)).z;
    totalInFlow += readOutFlow(p  + ivec2( 0,  1)).w;
    totalInFlow += readOutFlow(p  + ivec2(-1,  0)).x;
    totalInFlow += readOutFlow(p  + ivec2( 0, -1)).y;
    waterDept = height.y - totalOutFlow + totalInFlow;
    }
    out_FragColor = vec4(terrainElevation, waterDept, 0, 1);
}
`;

    // 更新流出量的pass
    const BufferB = `
// Update Outflow 1st pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
	p = clamp(p, ivec2(0), ivec2(textureSize - 1));
	return texelFetch(iChannel0, p, 0).xy;
} 

float computeOutFlowDir(vec2 centerHeight, ivec2 pos)
{
	vec2 dirHeight = readHeight(pos);
	return max(0.0, (centerHeight.x + centerHeight.y) - (dirHeight.x + dirHeight.y));
}

void main()
{
    ivec2 p = ivec2(gl_FragCoord.xy);
    // Init to zero at frame 0
    if(iFrame == 0)
    {
    out_FragColor = vec4(0);
    return;
    }    
    
    // Outside ?
    if( max(p.x, p.y) > textureSize )
    discard;
    
    
   	vec4 oOutFlow = texelFetch(iChannel1, p, 0);
	vec2 height = readHeight(p);
	vec4 nOutFlow;        
	nOutFlow.x = computeOutFlowDir(height, p + ivec2( 1,  0));
	nOutFlow.y = computeOutFlowDir(height, p + ivec2( 0,  1));
	nOutFlow.z = computeOutFlowDir(height, p + ivec2(-1,  0));
	nOutFlow.w = computeOutFlowDir(height, p + ivec2( 0, -1));
	nOutFlow = fluidParam.x * oOutFlow + fluidParam.y * nOutFlow;
	float totalFlow = nOutFlow.x + nOutFlow.y + nOutFlow.z + nOutFlow.w;
	if(totalFlow > fluidParam.z)
	{
		if(height.y < totalFlow)
		{
			nOutFlow = nOutFlow * (height.y / totalFlow);
		}
	}
	else
	{
		nOutFlow = vec4(0);
	}


    out_FragColor = nOutFlow;
}
`;

    // 水位计算的第二个pass
    const BufferC = `
// water level 2nd pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
	p = clamp(p, ivec2(0), ivec2(textureSize - 1));
	return texelFetch(iChannel0, p, 0).xy;
} 

vec4 readOutFlow(ivec2 p)
{
	if(p.x < 0 || p.y < 0 || p.x >= textureSize || p.y >= textureSize)
		return vec4(0);
	return texelFetch(iChannel1, p, 0);
} 

void main( )
{
    // Outside ?
    if( max(gl_FragCoord.x, gl_FragCoord.y) > float(textureSize) )
    discard;
       
    // Water
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec2 height = readHeight(p);
    vec4 OutFlow = texelFetch(iChannel1, p, 0);
    float totalOutFlow = OutFlow.x + OutFlow.y + OutFlow.z + OutFlow.w;
    float totalInFlow = 0.0;
    totalInFlow += readOutFlow(p  + ivec2( 1,  0)).z;
    totalInFlow += readOutFlow(p  + ivec2( 0,  1)).w;
    totalInFlow += readOutFlow(p  + ivec2(-1,  0)).x;
    totalInFlow += readOutFlow(p  + ivec2( 0, -1)).y;
    float waterDept = height.y - totalOutFlow + totalInFlow;

    out_FragColor = vec4(height.x, waterDept, 0, 1);
}
`;

    // 更新流出量的 第二个pass
    const BufferD = `
// Update Outflow 2nd pass
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;
uniform float     iTime;
uniform int     iFrame;
vec2 readHeight(ivec2 p)
{
	p = clamp(p, ivec2(0), ivec2(textureSize - 1));
	return texelFetch(iChannel0, p, 0).xy;
} 

float computeOutFlowDir(vec2 centerHeight, ivec2 pos)
{
	vec2 dirHeight = readHeight(pos);
	return max(0.0, (centerHeight.x + centerHeight.y) - (dirHeight.x + dirHeight.y));
}

void main( )
{
    ivec2 p = ivec2(gl_FragCoord.xy);
    
    // Outside ?
    if( max(p.x, p.y) > textureSize )
    discard;
    
    
   	vec4 oOutFlow = texelFetch(iChannel1, p, 0);
	vec2 height = readHeight(p);
	vec4 nOutFlow;        
	nOutFlow.x = computeOutFlowDir(height, p + ivec2( 1,  0));
	nOutFlow.y = computeOutFlowDir(height, p + ivec2( 0,  1));
	nOutFlow.z = computeOutFlowDir(height, p + ivec2(-1,  0));
	nOutFlow.w = computeOutFlowDir(height, p + ivec2( 0, -1));
	nOutFlow = fluidParam.x * oOutFlow + fluidParam.y * nOutFlow;
	float totalFlow = nOutFlow.x + nOutFlow.y + nOutFlow.z + nOutFlow.w;
	if(totalFlow > fluidParam.z)
	{
		if(height.y < totalFlow)
		{
			nOutFlow = nOutFlow * (height.y / totalFlow);
		}
	}
	else
	{
		nOutFlow = vec4(0);
	}


    out_FragColor = nOutFlow;
}
`;
    // 默认体渲染，水体效果和地形部分有待完善
    const renderShaderSource = `
// Created by David Gallardo - xjorma/2021
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0
#define AA
#define GAMMA 1
uniform sampler2D iChannel0;
uniform sampler2D heightMap;
uniform sampler2D colorTexture;
uniform vec3 waterColor;
uniform vec2     iResolution;
uniform float     iTime;
uniform int     iFrame;
in vec3 vo;
in vec3 vd;
in vec2 v_st;
const vec3 light = vec3(0.,4.,2.);
const vec3 boxSize = vec3(0.5);
vec2 getHeight(in vec3 p)
{
    // 局部坐标 [-0.5, 0.5] → [0, 1] → texel 坐标 [0, textureSize)
    vec2 uv = p.xz + 0.5;
    ivec2 texel = ivec2(clamp(uv * vec2(textureSize), vec2(0.0), vec2(float(textureSize - 1))));
    vec2 h = texelFetch(iChannel0, texel, 0).xy;
    h.y += h.x;
    return h - boxSize.z;
}

vec3 getNormal(in vec3 p, int comp)
{
    float d = 2.0 / float(textureSize);
    float hMid = getHeight(p)[comp];
    float hRight = getHeight(p + vec3(d, 0, 0))[comp];
    float hTop = getHeight(p + vec3(0, 0, d))[comp];
    return normalize(cross(vec3(0, hTop - hMid, d), vec3(d, hRight - hMid, 0)));
}

vec3 terrainColor(in vec3 p, in vec3 n, out float spec)
{
    // p.xz 为局部坐标 [-0.5, 0.5]，需转换为 UV [0, 1]
    vec2 uv = p.xz + 0.5;
    // 采样模拟输出（含 terrainElevation + waterDepth），而非原始高度图
    vec2 simData = texture(iChannel0, uv).xy;
    // 简单地形着色：水面区域蓝色，陆地区域灰绿
    float waterDepth = max(0.0, simData.y - simData.x);
    vec3 landColor = vec3(0.25, 0.45, 0.18);
    vec3 waterTint = vec3(0.05, 0.15, 0.45);
    return mix(landColor, waterTint, smoothstep(0.001, 0.02, waterDepth));
}

vec3 undergroundColor(float d)
{
    vec3 color[4] = vec3[](vec3(0.5, 0.45, 0.5), vec3(0.40, 0.35, 0.25), vec3(0.55, 0.50, 0.4), vec3(0.45, 0.30, 0.20));
    d *= 6.0;
    d = min(d, 3.0 - 0.001);
    float fr = fract(d);
    float fl = floor(d);
    return mix(color[int(fl)], color[int(fl) + 1], fr);
}


vec3 Render(in vec3 ro, in vec3 rd)
{

    vec3 n;
    vec2 ret = boxIntersection(ro, rd, boxSize, n);
    vec2 uv = gl_FragCoord.xy / czm_viewport.zw;
    if(ret.x > 0.0)
    {
    vec3 pi = ro + rd * ret.x;
    // Find Terrain
    vec3 tc;
    vec3 tn;
    float tt = ret.x;
    vec2 h = getHeight(pi);
    float spec;
    if(pi.y < h.x)
    {
        tn = n;
        tc = undergroundColor(h.x - pi.y);
    }
    else
    {
        for (int i = 0; i < 80; i++)
        {
            vec3 p = ro + rd * tt;
            float h = p.y - getHeight(p).x;
            if (h < 0.0002 || tt > ret.y)
                break;
            tt += h * 0.3;
        }
        // tn = getNormal(ro + rd * tt, 0);
        // tc = terrainColor(ro + rd * tt, tn, spec);
        vec3 p =  ro + rd * tt;
        vec2 uv = gl_FragCoord.xy / czm_viewport.zw;
        tc = texture(colorTexture, uv).rgb;
    }
    
    {
        // vec3 lightDir = czm_sunDirectionEC;
        // tc = tc * (max( 0.0, dot(lightDir, tn)) + 0.3);
        // spec *= pow(max(0., dot(lightDir, reflect(rd, tn))), 10.0);
        // tc += spec;            
    }
    
    if(tt > ret.y) {
        // tc = vec3(0, 0, 0.4);
        tc = texture(colorTexture, uv).rgb;
    }
    
    // Find Water
    float wt = ret.x;
    h = getHeight(pi);
    vec3 waterNormal;
    if(pi.y < h.y)
    {
        waterNormal = n;
    }
    else
    {
        for (int i = 0; i < 80; i++)
        {
            vec3 p = ro + rd * wt;
            float h = p.y - getHeight(p).y;
            if (h < 0.0002 || wt > min(tt, ret.y))
                break;
            wt += h * 0.3;
        }
        waterNormal = getNormal(ro + rd * wt, 1);
    }
    
    if(wt < ret.y)
    {
        float dist = (min(tt, ret.y) - wt);
        vec3 p = waterNormal;
        vec3 lightDir = normalize(light - (ro + rd * tt));
        vec3 color = waterColor;
        tc = applyFog( tc, color, dist * customParam.x);
        float spec = pow(max(0., dot(lightDir, reflect(rd, waterNormal))),customParam.y);
        tc += customParam.z * spec * smoothstep(0.0, 0.1, dist);
    }else{
        discard;
    }
    return tc;
    }
    discard;
}


vec3 vignette(vec3 color, vec2 q, float v)
{
    color *= 0.3 + 0.8 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), v);
    return color;
}


void main()
{
	vec3 tot = vec3(0.0);
    vec3 rayDir = normalize(vd);
    vec3 col = Render(vo, rayDir);
    tot += col;
	out_FragColor = vec4( tot, 1.0 );
}
`;

    /**
     * @description 自定义DC
     */
    class CustomPrimitive {
        constructor(options) {
            this.commandType = options.commandType;

            this.geometry = options.geometry;
            this.attributeLocations = options.attributeLocations;
            this.primitiveType = options.primitiveType;

            this.uniformMap = options.uniformMap;

            this.vertexShaderSource = options.vertexShaderSource;
            this.fragmentShaderSource = options.fragmentShaderSource;

            this.rawRenderState = options.rawRenderState;
            this.framebuffer = options.framebuffer;
            this.isPostRender = options.isPostRender;

            this.outputTexture = options.outputTexture;

            this.autoClear = Cesium.defaultValue(options.autoClear, false);
            this.preExecute = options.preExecute;

            this.modelMatrix = Cesium.defaultValue(
                options.modelMatrix,
                Cesium.Matrix4.IDENTITY
            );
            this.show = true;
            this.commandToExecute = undefined;
            this.clearCommand = undefined;
            if (this.autoClear) {
                this.clearCommand = new Cesium.ClearCommand({
                    color: new Cesium.Color(0.0, 0.0, 0.0, 0.0),
                    depth: 1.0,
                    framebuffer: this.framebuffer,
                    pass: Cesium.Pass.OPAQUE,
                });
            }
        }

        createCommand(context) {
            switch (this.commandType) {
                case "Draw": {
                    const vertexArray = Cesium.VertexArray.fromGeometry({
                        context: context,
                        geometry: this.geometry,
                        attributeLocations: this.attributeLocations,
                        bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
                    });

                    const shaderProgram = Cesium.ShaderProgram.fromCache({
                        context: context,
                        attributeLocations: this.attributeLocations,
                        vertexShaderSource: this.vertexShaderSource,
                        fragmentShaderSource: this.fragmentShaderSource,
                    });

                    const renderState = Cesium.RenderState.fromCache(
                        this.rawRenderState
                    );
                    return new Cesium.DrawCommand({
                        owner: this,
                        vertexArray: vertexArray,
                        primitiveType: this.primitiveType,
                        uniformMap: this.uniformMap,
                        modelMatrix: this.modelMatrix,
                        shaderProgram: shaderProgram,
                        framebuffer: this.framebuffer,
                        renderState: renderState,
                        pass: Cesium.Pass.OPAQUE,
                    });
                }
                case "Compute": {
                    return new Cesium.ComputeCommand({
                        owner: this,
                        fragmentShaderSource: this.fragmentShaderSource,
                        uniformMap: this.uniformMap,
                        outputTexture: this.outputTexture,
                        persists: true,
                    });
                }
            }
        }

        setGeometry(context, geometry) {
            this.geometry = geometry;
            const vertexArray = Cesium.VertexArray.fromGeometry({
                context: context,
                geometry: this.geometry,
                attributeLocations: this.attributeLocations,
                bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
            });
            this.commandToExecute.vertexArray = vertexArray;
        }

        update(frameState) {
            if (!this.show) {
                return;
            }

            if (!Cesium.defined(this.commandToExecute)) {
                this.commandToExecute = this.createCommand(frameState.context);
                this.commandToExecute.isPostRender = this.isPostRender;
            }

            if (Cesium.defined(this.preExecute)) {
                this.preExecute(this);
            }

            if (Cesium.defined(this.clearCommand)) {
                frameState.commandList.push(this.clearCommand);
            }
            frameState.commandList.push(this.commandToExecute);
        }

        isDestroyed() {
            return false;
        }

        destroy() {
            if (Cesium.defined(this.commandToExecute)) {
                if (Cesium.defined(this.commandToExecute.shaderProgram)) {
                    this.commandToExecute.shaderProgram =
                        this.commandToExecute.shaderProgram.destroy();
                }
                if (Cesium.defined(this.commandToExecute.vertexArray)) {
                    this.commandToExecute.vertexArray =
                        this.commandToExecute.vertexArray.destroy();
                }
            }
            return Cesium.destroyObject(this);
        }
    }

    /**
     * @description 渲染工具类
     */
    class RenderUtil {
        constructor() {
        }

        static loadText(filePath) {
            const request = new XMLHttpRequest();
            request.open("GET", filePath, false);
            request.send();
            return request.responseText;
        }

        static getFullscreenQuad() {
            const fullscreenQuad = new Cesium.Geometry({
                attributes: new Cesium.GeometryAttributes({
                    position: new Cesium.GeometryAttribute({
                        componentDatatype: Cesium.ComponentDatatype.FLOAT,
                        componentsPerAttribute: 3,
                        //  v3----v2
                        //  |     |
                        //  |     |
                        //  v0----v1
                        values: new Float32Array([
                            -1,
                            -1,
                            0, // v0
                            1,
                            -1,
                            0, // v1
                            1,
                            1,
                            0, // v2
                            -1,
                            1,
                            0, // v3
                        ]),
                    }),
                    st: new Cesium.GeometryAttribute({
                        componentDatatype: Cesium.ComponentDatatype.FLOAT,
                        componentsPerAttribute: 2,
                        values: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    }),
                }),
                indices: new Uint32Array([3, 2, 0, 0, 2, 1]),
            });
            return fullscreenQuad;
        }

        static createTexture(options) {
            if (Cesium.defined(options.arrayBufferView)) {
                // typed array needs to be passed as source option, this is required by Cesium.Texture
                const source = {};
                source.arrayBufferView = options.arrayBufferView;
                options.source = source;
                options.flipY = false;
            }

            const texture = new Cesium.Texture(options);
            return texture;
        }

        static createDepthFramebuffer(context, width, height) {
            return new Cesium.Framebuffer({
                context: context,
                colorTextures: [
                    this.createTexture({
                        context: context,
                        width: width,
                        height: height,
                        flipY: false,
                        pixelFormat: Cesium.PixelFormat.RGBA,
                        pixelDatatype: Cesium.PixelDatatype.FLOAT,
                        arrayBufferView: new Float32Array(width * height * 4),
                    }),
                ],
                depthRenderbuffer: new Cesium.Renderbuffer({
                    context: context,
                    width: width,
                    height: height,
                    format: Cesium.RenderbufferFormat.DEPTH_COMPONENT16,
                }),
                destroyAttachments: true,
            });
        }

        static createFramebuffer(context, colorTexture, depthTexture, destroyAttachments = false) {
            const options = {
                context: context,
                colorTextures: [colorTexture],
                destroyAttachments,
            };
            if (depthTexture) {
                options.depthTexture = depthTexture;
            }
            return new Cesium.Framebuffer(options);
        }

        static createRawRenderState(options) {
            const translucent = true;
            const closed = false;
            const existing = {
                viewport: options.viewport,
                depthTest: options.depthTest,
                depthMask: options.depthMask,
                blending: options.blending,
            };

            const rawRenderState = Cesium.Appearance.getDefaultRenderState(
                translucent,
                closed,
                existing
            );
            return rawRenderState;
        }
    }

    /**
     * @description 流体体渲染
     */
    class FluidRenderer {
        static DEFAULTS = {
            width: 1024,
            height: 1024,
            dimensions: new Cesium.Cartesian3(2500, 2500, 2500),
            heightRange: [0, 2000],
            baseHeight: 0,
            // x=attenuation, y=strength, z=minTotalFlow, w=initialWaterLevel
            fluidParams: new Cesium.Cartesian4(0.995, 0.25, 0.0001, 0.03),
            customParams: new Cesium.Cartesian4(10, 20, 0.2, 10),
            waterColor: new Cesium.Cartesian3(0.05, 0.31, 0.64),
            lonLat: [120.20998865783179, 30.13650797533829],
            timeStep: 0.3,
            heightMapSource: null,
        };

        constructor(viewer, options = {}) {
            if (!viewer) throw new Error("Cesium Viewer is required");

            this.viewer = viewer;
            this._initConfiguration(options);
            this._initState();
            this._createResources();
            this._setupRenderPipeline();
        }

        // 初始化配置参数
        _initConfiguration(options) {
            this.config = {
                resolution: new Cesium.Cartesian2(
                    options.width || FluidRenderer.DEFAULTS.width,
                    options.height || FluidRenderer.DEFAULTS.height
                ),
                dimensions:
                    options.dimensions || FluidRenderer.DEFAULTS.dimensions.clone(),
                heightRange: {
                    min: options.minHeight ?? FluidRenderer.DEFAULTS.heightRange[0],
                    max: options.maxHeight ?? FluidRenderer.DEFAULTS.heightRange[1],
                },
                baseHeight: options.baseHeight ?? FluidRenderer.DEFAULTS.baseHeight,
                fluidParams:
                    options.fluidParams || FluidRenderer.DEFAULTS.fluidParams.clone(),
                customParams:
                    options.customParams ||
                    FluidRenderer.DEFAULTS.customParams.clone(),
                waterColor:
                    options.waterColor || FluidRenderer.DEFAULTS.waterColor.clone(),
                lonLat: options.lonLat || [...FluidRenderer.DEFAULTS.lonLat],
                timeStep: options.timeStep || FluidRenderer.DEFAULTS.timeStep,
                heightMapSource:
                    options.heightMapSource || FluidRenderer.DEFAULTS.heightMapSource,
            };
        }

        // 初始化运行状态
        _initState() {
            this._frameCount = 0;
            this._isActive = true;
            this._time = 0;
        }

        setInitialWaterLevel(normalizedWaterLevel) {
            const level = Number(normalizedWaterLevel);
            if (!Number.isFinite(level) || !this.config.fluidParams) return;

            this.config.fluidParams.w = Math.max(0, Math.min(1, level));
            this.resetSimulation();
        }

        resetSimulation() {
            this._frameCount = 0;
            this.viewer.scene.requestRender?.();
        }

        // 创建图形资源
        _createResources() {
            this._createTextures();
            this._setupHeightMap();
            this._createDebugVisualization();
        }

        // 创建处理纹理
        _createTextures() {
            const createFloatTexture = () => {
                return RenderUtil.createTexture({
                    context: this.viewer.scene.context,
                    width: this.config.resolution.x,
                    height: this.config.resolution.y,
                    pixelFormat: Cesium.PixelFormat.RGBA,
                    pixelDatatype: Cesium.PixelDatatype.FLOAT,
                    arrayBufferView: new Float32Array(
                        this.config.resolution.x * this.config.resolution.y * 4
                    ),
                });
            };

            this.textures = {
                A: createFloatTexture(),
                B: createFloatTexture(),
                C: createFloatTexture(),
                D: createFloatTexture(),
            };
        }

        // 设置高度图系统
        _setupHeightMap() {
            this.heightMapCamera = this._createOrthographicCamera();
            this._heightMap = this.config.heightMapSource
                ? this._createHeightMapTexture(this.config.heightMapSource)
                : this._generateHeightMapTexture();
        }

        _createHeightMapTexture(source) {
            if (!source?.arrayBufferView || !source.width || !source.height) {
                throw new Error("Invalid height map source.");
            }

            return RenderUtil.createTexture({
                context: this.viewer.scene.context,
                width: source.width,
                height: source.height,
                flipY: false,
                pixelFormat: Cesium.PixelFormat.RGBA,
                pixelDatatype: Cesium.PixelDatatype.FLOAT,
                arrayBufferView: source.arrayBufferView,
                sampler: new Cesium.Sampler({
                    wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
                    wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
                    minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                    magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                }),
            });
        }

        // 生成高度图纹理
        _generateHeightMapTexture() {
            const context = this.viewer.scene.context;
            const fbo = RenderUtil.createDepthFramebuffer(
                context,
                this.config.resolution.x,
                this.config.resolution.y
            );

            // 保存原始状态
            const scene = this.viewer.scene;
            const frameState = scene.frameState;
            const passState = getScenePassState(this.viewer.scene);
            const originalCamera = scene.camera;
            const originalFrameStateCamera = frameState.camera;
            const originalFramebuffer = passState.framebuffer;
            const originalViewport = Cesium.BoundingRectangle.clone(
                passState.viewport,
                new Cesium.BoundingRectangle()
            );
            let copyFBO = null;
            let patchedCommands = [];

            try {
                // 配置渲染状态
                passState.viewport.x = 0;
                passState.viewport.y = 0;
                passState.viewport.width = this.config.resolution.x;
                passState.viewport.height = this.config.resolution.y;
                passState.framebuffer = fbo;
                scene.camera = this.heightMapCamera;
                frameState.camera = this.heightMapCamera;
                frameState.context.uniformState.updateCamera(this.heightMapCamera);

                // 在渲染深度预处理前添加着色器处理
                patchedCommands = this._processHeightMapShaders();
                // 执行深度渲染
                this._renderDepthPrepass(passState);

                // 创建高度图纹理
                const heightMap = RenderUtil.createTexture({
                    context: context,
                    width: this.config.resolution.x,
                    height: this.config.resolution.y,
                    flipY: false,
                    pixelFormat: Cesium.PixelFormat.RGBA,
                    pixelDatatype: Cesium.PixelDatatype.FLOAT,
                });

                // 拷贝数据到高度图纹理
                copyFBO = RenderUtil.createFramebuffer(context, heightMap);
                this._copyTexture(fbo.getColorTexture(0), copyFBO);

                return heightMap;
            } finally {
                this._restoreHeightMapShaders(patchedCommands);
                passState.framebuffer = originalFramebuffer;
                Cesium.BoundingRectangle.clone(originalViewport, passState.viewport);
                scene.camera = originalCamera;
                frameState.camera = originalFrameStateCamera;
                if (originalFrameStateCamera) {
                    frameState.context.uniformState.updateCamera(originalFrameStateCamera);
                }

                if (copyFBO && !copyFBO.isDestroyed?.()) {
                    copyFBO.destroy();
                }
                if (fbo && !fbo.isDestroyed?.()) {
                    fbo.destroy();
                }
            }
        }

        // 执行深度预渲染
        _renderDepthPrepass(passState) {
            const frameState = this.viewer.scene.frameState;

            // 更新相机状态
            frameState.camera = this.heightMapCamera;
            this.viewer.scene.frameState.context.uniformState.updateCamera(
                this.heightMapCamera
            );

            // 执行渲染命令
            const commands = this._getDepthRenderCommands();
            commands.forEach((cmd) =>
                cmd.execute(this.viewer.scene.context, passState)
            );
        }

        // 创建调试实体
        _createDebugVisualization() {
            this.debugEntity = this.viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(
                    ...this.config.lonLat,
                    this.config.baseHeight + this.config.dimensions.z / 2
                ),
                box: {
                    dimensions: this.config.dimensions,
                    fill: false,
                    outline: true,
                    outlineColor: Cesium.Color.WHITE,
                },
            });
        }

        // 设置渲染管线
        _setupRenderPipeline() {
            this._createComputePasses();
            this._createMainRenderPass();
            this._startRenderLoop();
        }

        // 创建计算通道
        _createComputePasses() {
            const commonUniforms = {
                iTime: () => this._time,
                iFrame: () => this._frameCount,
                resolution: () => this.config.resolution,
                fluidParam: () => this.config.fluidParams,
                customParam: () => this.config.customParams,
                minHeight: () => this.config.heightRange.min,
                maxHeight: () => this.config.heightRange.max,
                heightMap: () => this._heightMap,
            };

            this.computePasses = [
                this._createComputePass("A", {
                    uniforms: {
                        ...commonUniforms,
                        iChannel0: () => this.textures.C,
                        iChannel1: () => this.textures.D,
                    },
                    shaderSource: BufferA,
                }),
                this._createComputePass("B", {
                    uniforms: {
                        ...commonUniforms,
                        iChannel0: () => this.textures.A,
                        iChannel1: () => this.textures.D,
                    },
                    shaderSource: BufferB,
                }),
                this._createComputePass("C", {
                    uniforms: {
                        ...commonUniforms,
                        iChannel0: () => this.textures.A,
                        iChannel1: () => this.textures.B,
                    },
                    shaderSource: BufferC,
                }),
                this._createComputePass("D", {
                    uniforms: {
                        ...commonUniforms,
                        iChannel0: () => this.textures.C,
                        iChannel1: () => this.textures.B,
                    },
                    shaderSource: BufferD,
                }),
            ];
        }

        // 计算通道工厂方法
        _createComputePass(outputTextureName, {uniforms, shaderSource}) {
            return new CustomPrimitive({
                commandType: "Compute",
                uniformMap: uniforms,
                fragmentShaderSource: new Cesium.ShaderSource({
                    sources: [Command, shaderSource],
                }),
                geometry: RenderUtil.getFullscreenQuad(),
                outputTexture: this.textures[outputTextureName],
                preExecute: (cmd) =>
                    (cmd.commandToExecute.outputTexture =
                        this.textures[outputTextureName]),
            });
        }

        // 创建主渲染通道
        _createMainRenderPass() {
            const modelMatrix = generateModelMatrix(
                [
                    ...this.config.lonLat,
                    this.config.baseHeight + this.config.dimensions.z / 2,
                ],
                [90, 0, 0],
                [
                    this.config.dimensions.x,
                    this.config.dimensions.z,
                    this.config.dimensions.y,
                ]
            );
            this.mainRenderPass = new CustomPrimitive({
                commandType: "Draw",
                uniformMap: this._getMainRenderUniforms(),
                vertexShaderSource: this._getVertexShader(),
                fragmentShaderSource: new Cesium.ShaderSource({
                    sources: [Command, renderShaderSource],
                }),
                geometry: this._createBoxGeometry(),
                modelMatrix: modelMatrix,
                attributeLocations: this._getAttributeLocations(),
                rawRenderState: this._createRenderState(),
            });
        }

        // 获取主渲染Uniform
        _getMainRenderUniforms() {
            return {
                iTime: () => this._time,
                iFrame: () => this._frameCount,
                iResolution: () => this.config.resolution,
                iChannel0: () => this.textures.C,
                heightMap: () => this._heightMap,
                customParam: () => this.config.customParams,
                waterColor: () => this.config.waterColor,
                colorTexture: () =>
                    getSceneView(this.viewer.scene)?.globeDepth?.colorFramebufferManager
                        ?._colorTextures?.[0],
            };
        }

        // 启动渲染循环
        _startRenderLoop() {
            this.postRenderHandler =
                this.viewer.scene.postRender.addEventListener(() => {
                    if (!this._isActive) return;

                    this._time = performance.now() / 1000;
                    this._frameCount += this.config.timeStep;
                });

            this.computePasses.forEach((p) =>
                this.viewer.scene.primitives.add(p)
            );
            this.viewer.scene.primitives.add(this.mainRenderPass);
        }

        // 屏幕坐标转世界坐标
        _screenToWorld(screenPos) {
            const ray = this.viewer.camera.getPickRay(screenPos);
            return this.viewer.scene.globe.pick(ray, this.viewer.scene);
        }

        // 创建正交投影相机
        _createOrthographicCamera() {
            const camera = new Cesium.Camera(this.viewer.scene);
            camera.frustum = new Cesium.OrthographicOffCenterFrustum();

            const [lon, lat] = this.config.lonLat;
            const center = Cesium.Cartesian3.fromDegrees(lon, lat, this.config.baseHeight);
            const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);

            // 配置视锥体
            // far plane 必须覆盖 baseHeight 到 maxHeight 的完整范围
            // 再加上 dimensions.z 的余量确保不裁剪
            const frustum = camera.frustum;
            frustum.near = 0.01;
            frustum.far = Math.max(
                this.config.dimensions.z * 2,
                (this.config.heightRange.max - this.config.heightRange.min) + this.config.dimensions.z
            );
            frustum.left = -this.config.dimensions.x / 2;
            frustum.right = this.config.dimensions.x / 2;
            frustum.bottom = -this.config.dimensions.y / 2;
            frustum.top = this.config.dimensions.y / 2;

            // 计算相机方位
            const dir = Cesium.Matrix4.getColumn(
                enuMatrix,
                2,
                new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.negate(dir, dir);
            const up = Cesium.Matrix4.getColumn(
                enuMatrix,
                1,
                new Cesium.Cartesian3()
            );
            const right = Cesium.Matrix4.getColumn(
                enuMatrix,
                0,
                new Cesium.Cartesian3()
            );

            // 定位相机位置
            const offset = Cesium.Cartesian3.multiplyByScalar(
                dir,
                -frustum.far,
                new Cesium.Cartesian3()
            );
            camera.position = Cesium.Cartesian3.add(
                center,
                offset,
                new Cesium.Cartesian3()
            );
            camera.direction = dir;
            camera.up = up;
            camera.right = right;

            return camera;
        }

        // 销毁资源
        destroy() {
            this._isActive = false;
            if (typeof this.postRenderHandler === "function") {
                this.postRenderHandler();
                this.postRenderHandler = null;
            }

            [this.mainRenderPass, ...(this.computePasses || [])].forEach((p) => {
                if (p) {
                    this.viewer.scene.primitives.remove(p);
                }
            });
            this.mainRenderPass = null;
            this.computePasses = [];

            if (this.debugEntity) {
                this.viewer.entities.remove(this.debugEntity);
                this.debugEntity = null;
            }

            Object.values(this.textures || {}).forEach((tex) => {
                if (tex && !tex.isDestroyed?.()) {
                    tex.destroy();
                }
            });
            this.textures = {};

            if (this._heightMap && !this._heightMap.isDestroyed?.()) {
                this._heightMap.destroy();
                this._heightMap = null;
            }
        }

        /* 纹理拷贝方法 */
        _copyTexture(sourceTexture, targetFBO) {
            const context = this.viewer.scene.context;
            const passState = getScenePassState(this.viewer.scene);

            const drawCommand = context.createViewportQuadCommand(
                `uniform sampler2D u_texToCopy;
        in vec2 v_textureCoordinates;
        void main() {
            out_FragColor = texture(u_texToCopy, vec2(v_textureCoordinates.x, 1.0 - v_textureCoordinates.y));
        }`,
                {
                    uniformMap: {
                        u_texToCopy: () => sourceTexture,
                    },
                    owner: this,
                }
            );

            // 保存原始状态
            const originalFramebuffer = passState.framebuffer;

            // 执行拷贝
            passState.framebuffer = targetFBO;
            drawCommand.execute(context, passState);

            // 恢复状态
            passState.framebuffer = originalFramebuffer;
        }

        /* 获取地形深度渲染命令 */
        _getDepthRenderCommands() {
            const commands = [];
            const frustumCommandsList = getFrustumCommandsList(this.viewer.scene);
            for (let i = 0; i < frustumCommandsList.length; ++i) {
                const frustumCommands = frustumCommandsList[i];
                const passCommands = frustumCommands?.commands?.[2];
                const length = frustumCommands?.indices?.[2] ?? passCommands?.length ?? 0;
                if (passCommands && length > 0) {
                    commands.push(...passCommands.slice(0, length));
                }
            }
            return commands;
        }

        /* 高度图着色器处理 */
        _processHeightMapShaders() {
            const patchedCommands = [];
            // 计算逆ENU矩阵
            const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(
                Cesium.Cartesian3.fromDegrees(...this.config.lonLat, this.config.baseHeight)
            );
            const localMat4 = Cesium.Matrix4.inverse(
                enuMatrix,
                new Cesium.Matrix4()
            );
            const frameState = this.viewer.scene.frameState;
            const commands = this._getDepthRenderCommands();
            
            commands.forEach((command) => {
                if (!command?.shaderProgram?.fragmentShaderSource || !command.uniformMap) {
                    return;
                }

                const hadInverseUniform = Object.prototype.hasOwnProperty.call(
                    command.uniformMap,
                    "u_inverseEnuMatrix"
                );
                const originalInverseUniform = command.uniformMap.u_inverseEnuMatrix;
                const originalShaderProgram = command.shaderProgram;
                const inverseEnuMatrix = new Cesium.Matrix4();

                command.uniformMap.u_inverseEnuMatrix = () => {
                    const modelMatrix = command.modelMatrix || Cesium.Matrix4.IDENTITY;
                    return Cesium.Matrix4.multiply(
                        localMat4,
                        modelMatrix,
                        inverseEnuMatrix
                    );
                };
                if (!command.heightMap_ShaderProgram) {
                    command.heightMap_ShaderProgram = this._getDerivedShaderProgram(
                        frameState.context,
                        command.shaderProgram,
                        "Height_Map"
                    );
                }
                command.shaderProgram = command.heightMap_ShaderProgram;
                patchedCommands.push({
                    command,
                    hadInverseUniform,
                    originalInverseUniform,
                    originalShaderProgram,
                });
            });

            return patchedCommands;
        }

        _restoreHeightMapShaders(patchedCommands) {
            patchedCommands.forEach((patch) => {
                const {command, hadInverseUniform, originalInverseUniform, originalShaderProgram} = patch;
                if (!command?.uniformMap) return;

                command.shaderProgram = originalShaderProgram;
                if (hadInverseUniform) {
                    command.uniformMap.u_inverseEnuMatrix = originalInverseUniform;
                } else {
                    delete command.uniformMap.u_inverseEnuMatrix;
                }
            });
        }

        /* 创建派生着色器程序 */
        _getDerivedShaderProgram(context, baseShaderProgram, passName) {
            let derivedProgram = context.shaderCache.getDerivedShaderProgram(
                baseShaderProgram,
                passName
            );

            if (!Cesium.defined(derivedProgram)) {
                derivedProgram = this._createHeightMapShaderProgram(
                    context,
                    baseShaderProgram,
                    passName
                );
            }

            return derivedProgram;
        }

        /* 生成高度图专用着色器 */
        _createHeightMapShaderProgram(context, baseShaderProgram, passName) {
            // 修改片段着色器源码
            const newFS = this._modifyFragmentShader(
                baseShaderProgram.fragmentShaderSource
            );

            return context.shaderCache.createDerivedShaderProgram(
                baseShaderProgram,
                passName,
                {
                    vertexShaderSource: baseShaderProgram.vertexShaderSource,
                    fragmentShaderSource: newFS,
                    attributeLocations: baseShaderProgram._attributeLocations,
                }
            );
        }

        /* 修改片段着色器 */
        _modifyFragmentShader(originalFS) {
            const modifiedSources = originalFS.sources.map((source) =>
                Cesium.ShaderSource.replaceMain(source, "czm_heightMap_main")
            );

            modifiedSources.push(`
        uniform mat4 u_inverseEnuMatrix;
        void main() {
            czm_heightMap_main();
            vec3 posMC = (u_inverseEnuMatrix * vec4(v_positionMC, 1.0)).xyz;
            out_FragColor = vec4(posMC.z, out_FragColor.gb, 1.0);
        }
    `);

            return new Cesium.ShaderSource({
                sources: modifiedSources,
                defines: originalFS.defines,
            });
        }

        /* 创建流体几何体 */
        _createBoxGeometry() {
            return Cesium.BoxGeometry.createGeometry(
                Cesium.BoxGeometry.fromDimensions({
                    vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
                    dimensions: new Cesium.Cartesian3(1, 1, 1),
                })
            );
        }

        /* 获取属性位置映射 */
        _getAttributeLocations() {
            return Cesium.GeometryPipeline.createAttributeLocations(
                this._createBoxGeometry()
            );
        }

        /* 创建渲染状态配置 */
        _createRenderState() {
            return {
                cull: {
                    enabled: false,
                    face: Cesium.CullFace.BACK,
                },
                depthRange: {near: 0, far: 1},
                depthTest: {enabled: true},
                depthMask: true,
                colorMask: {
                    red: true,
                    green: true,
                    blue: true,
                    alpha: true,
                },
            };
        }

        /* 顶点着色器生成 */
        _getVertexShader() {
            return new Cesium.ShaderSource({
                sources: [
                    `
            in vec3 position;
            in vec2 st;
          
            out vec3 vo;
            out vec3 vd;
            out vec2 v_st;
            
            void main() {    
                vo = czm_encodedCameraPositionMCHigh + czm_encodedCameraPositionMCLow;
                vd = position - vo;
                v_st = st;
                gl_Position = czm_modelViewProjection * vec4(position,1.0);
            }`,
                ],
            });
        }
    }

    /**
     * 生成矩阵
     * @param {*} position
     * @param {*} rotation
     * @param {*} scale
     * @returns
     */
    const generateModelMatrix = (
        position = [0, 0, 0],
        rotation = [0, 0, 0],
        scale = [1, 1, 1]
    ) => {
        const rotationX = Cesium.Matrix4.fromRotationTranslation(
            Cesium.Matrix3.fromRotationX(Cesium.Math.toRadians(rotation[0]))
        );

        const rotationY = Cesium.Matrix4.fromRotationTranslation(
            Cesium.Matrix3.fromRotationY(Cesium.Math.toRadians(rotation[1]))
        );

        const rotationZ = Cesium.Matrix4.fromRotationTranslation(
            Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotation[2]))
        );
        if (!(position instanceof Cesium.Cartesian3)) {
            position = Cesium.Cartesian3.fromDegrees(...position);
        }
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);
        Cesium.Matrix4.multiply(enuMatrix, rotationX, enuMatrix);
        Cesium.Matrix4.multiply(enuMatrix, rotationY, enuMatrix);
        Cesium.Matrix4.multiply(enuMatrix, rotationZ, enuMatrix);
        const scaleMatrix = Cesium.Matrix4.fromScale(
            new Cesium.Cartesian3(...scale)
        );
        const modelMatrix = Cesium.Matrix4.multiply(
            enuMatrix,
            scaleMatrix,
            new Cesium.Matrix4()
        );

        return modelMatrix;
    };

    // 基础shader雾效果
    const atmosphereFs = `
    precision highp float;
    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    uniform vec4 customParam;
    in vec2 v_textureCoordinates;
    const float PI = 3.14159265359;
    const float TWO_PI = PI * 2.0;
    const float FOUR_PI = PI * 4.0;
    const vec3 betaR = vec3(5.5e-6, 13.0e-6, 22.4e-6); 
    const vec3 betaM = vec3(21e-6);
    const float hR = 10e3;
    const float hM = 3.8e3;
    const int num_samples = 16;
    const int num_samples_light = 4;
    #ifdef GL_ES
        #define _in(T) const in T
        #define _inout(T) inout T
        #define _out(T) out T
        #define _begin(type) type (
        #define _end )
        #define mul(a, b) (a) * (b)
    #endif
    struct ray_t {
        vec3 origin;
        vec3 direction;
    };
    struct sphere_t {
        vec3 origin;
        float radius;
        int material;
    };
    struct plane_t {
        vec3 direction;
        float distance;
        int material;
    };
    plane_t plane;
    mat3 rotate_around_x(_in(float) angle_degrees) {
        float angle = radians(angle_degrees);
        float _sin = sin(angle);
        float _cos = cos(angle);
        return mat3(1, 0, 0, 0, _cos, -_sin, 0, _sin, _cos);
    }
    bool isect_sphere(_in(ray_t) ray, _in(sphere_t) sphere, _inout(float) t0, _inout(float) t1) {
        vec3 rc = sphere.origin - ray.origin;
        float radius2 = sphere.radius * sphere.radius;
        float tca = dot(rc, ray.direction);
        float d2 = dot(rc, rc) - tca * tca;
        if (d2 > radius2) return false;
        float thc = sqrt(radius2 - d2);
        t0 = tca - thc;
        t1 = tca + thc;
        return true;
    }
    float rayleigh_phase_func(float mu) {
        return
        3. * (1. + mu*mu)
        / 
        (16. * PI);
    }
    const float g = 0.76;
    float henyey_greenstein_phase_func(float mu) {
        return
        (1. - g*g)
        / 
        ((4. * PI) * pow(1. + g*g - 2.*g*mu, 1.5));
    }
    const float k = 1.55*g - 0.55 * (g*g*g);
    float schlick_phase_func(float mu) {
        return
        (1. - k*k)
        / 
        (4. * PI * (1. + k*mu) * (1. + k*mu));
    }
    const sphere_t atmosphere = _begin(sphere_t)
    vec3(0, 0, 0), 6420e3, 0
    _end;
    bool get_sun_light(
    _in(ray_t) ray, _inout(float) optical_depthR, _inout(float) optical_depthM
    ) {
        float t0, t1;
        isect_sphere(ray, atmosphere, t0, t1);
        float march_pos = 0.;
        float march_step = t1 / float(num_samples_light);
        for (int i = 0; i < num_samples_light; i++) {
            vec3 s = ray.origin +
            ray.direction * (march_pos + 0.5 * march_step);
            float height = length(s) - 6360e3;
            if (height < 0.)
            return false;
            optical_depthR += exp(-height / hR) * march_step;
            optical_depthM += exp(-height / hM) * march_step;
            march_pos += march_step;
        }
        return true;
    }
    // 基于屏幕空间的Ray Marching球面近似大气散射
    vec4 get_incident_light(_in(ray_t) ray) {
        vec3 dir = ray.direction;
        vec3 start = ray.origin;
        float a = dot( dir, dir);
        float b = 2.0 * dot(dir, start);
        float radius2 = atmosphere.radius * atmosphere.radius;
        float c = dot(start, start) - radius2;
        float d = (b * b) - 4.0 * a * c;
        if (d < 0.0) return vec4(0.0);
        float squaredD = sqrt(d);
        vec2 ray_length = vec2(
        max((-b - squaredD) / (2.0 * a), 0.0), min((-b + squaredD) / (2.0 * a), plane.distance)
        );
        if (ray_length.x > ray_length.y) return vec4(0.0);
        float march_step = (ray_length.y - ray_length.x) / float(num_samples);
        float mu = dot(ray.direction, normalize(czm_sunPositionWC));
        float phaseR = rayleigh_phase_func(mu);
        float phaseM = 
        #if 1
            henyey_greenstein_phase_func(mu);
        #else
            schlick_phase_func(mu);
        #endif
        
        float optical_depthR = 0.;
        float optical_depthM = 0.;
        vec3 sumR = vec3(0);
        vec3 sumM = vec3(0);
        float march_pos = 0.;
        for (int i = 0; i < num_samples; i++) {
            vec3 s = ray.origin +
            ray.direction * (march_pos + 0.5 * march_step);
            float height = length(s) - 6360e3;
            float hr = exp(-height / hR) * march_step;
            float hm = exp(-height / hM) * march_step;
            optical_depthR += hr;
            optical_depthM += hm;
            ray_t light_ray = _begin(ray_t)
            s, normalize(czm_sunPositionWC)
            _end;
            float optical_depth_lightR = 0.;
            float optical_depth_lightM = 0.;
            bool overground = get_sun_light(
                light_ray,
                optical_depth_lightR,
                optical_depth_lightM);

            if (overground) {
                vec3 tau =
                    betaR * (optical_depthR + optical_depth_lightR) +
                    betaM * 1.1 * (optical_depthM + optical_depth_lightM);
                vec3 attenuation = exp(-tau);

                sumR += hr * attenuation;
                sumM += hm * attenuation;
            }

            march_pos += march_step;
        }
        float attenuation = length(exp(-((betaM * optical_depthM)
        + (betaR * optical_depthR)) * 4.));
        return vec4(
        23. *
        (sumR * phaseR * betaR +
        sumM * phaseM * betaM), 1.0-attenuation);
    }
    
    void main() {
        vec4 rawColor = texture(colorTexture, v_textureCoordinates);
        float depth = czm_unpackDepth(texture(depthTexture, v_textureCoordinates));
        vec4 positionEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        vec4 positionWC = czm_inverseView * positionEC;
        positionWC.xyz = positionWC.xyz / positionWC.w;
        vec3 lVector = positionWC.xyz - czm_viewerPositionWC;
        ray_t ray;
        ray.origin = czm_viewerPositionWC;
        ray.direction =  normalize(lVector);
        plane.distance = length(lVector);
        vec4 atmosphereColor = get_incident_light(ray);
        rawColor = atmosphereColor + rawColor * (1.0 - atmosphereColor.a);
        rawColor = vec4(1.0 - exp(-2.2 * rawColor));
        out_FragColor = rawColor;
    }      
    `;

    /**
     * 基础大气雾
     * @returns
     */
    function createSkyEffect() {
        return new Cesium.PostProcessStage({
            fragmentShader: atmosphereFs,
        });
    }

    return {
        FluidRenderer,
        createSkyEffect,
    };
}
