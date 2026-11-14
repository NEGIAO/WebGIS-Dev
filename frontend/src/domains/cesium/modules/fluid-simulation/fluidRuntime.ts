import { BufferA, BufferB, BufferC, BufferD, Command, renderShaderSource } from './fluid/fluidShaders';
import { atmosphereFs } from './fluid/atmosphereShader';

export function createFluidRuntime(Cesium: any) {
    if (!Cesium) {
        throw new Error('Cesium runtime is required for FluidRenderer.');
    }

    function getSceneView(scene: any) {
        return scene?._view || scene?.view;
    }

    function getScenePassState(scene: any) {
        const view = getSceneView(scene);
        if (!view?.passState) {
            throw new Error('Cesium scene passState is unavailable.');
        }
        return view.passState;
    }

    function getFrustumCommandsList(scene: any) {
        const view = getSceneView(scene);
        return view?.frustumCommandsList || view?._frustumCommandsList || [];
    }


    // 默认主渲染着色器：负责体渲染、地形遮罩、雾化和水体高光


    // 自定义绘制命令封装

    class CustomPrimitive {
        // ---------- 实例状态 ----------
        commandType: any;
        geometry: any;
        attributeLocations: any;
        primitiveType: any;
        uniformMap: any;
        vertexShaderSource: any;
        fragmentShaderSource: any;
        rawRenderState: any;
        framebuffer: any;
        isPostRender: any;
        outputTexture: any;
        autoClear: any;
        preExecute: any;
        modelMatrix: any;
        show: any;
        commandToExecute: any;
        clearCommand: any;

        constructor(options: any) {
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

        createCommand(context: any) {
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

        setGeometry(context: any, geometry: any) {
            this.geometry = geometry;
            const vertexArray = Cesium.VertexArray.fromGeometry({
                context: context,
                geometry: this.geometry,
                attributeLocations: this.attributeLocations,
                bufferUsage: Cesium.BufferUsage.STATIC_DRAW,
            });
            this.commandToExecute.vertexArray = vertexArray;
        }

        update(frameState: any) {
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

    // 渲染工具类

    class RenderUtil {
        constructor() {
        }

        static loadText(filePath: string) {
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

        static createTexture(options: any) {
            if (Cesium.defined(options.arrayBufferView)) {
                // typed array needs to be passed as source option, this is required by Cesium.Texture
                const source: Record<string, any> = {};
                source.arrayBufferView = options.arrayBufferView;
                options.source = source;
                options.flipY = false;
            }

            const texture = new Cesium.Texture(options);
            return texture;
        }

        static createDepthFramebuffer(context: any, width: number, height: number) {
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

        static createFramebuffer(context: any, colorTexture: any, depthTexture: any, destroyAttachments: boolean = false) {
            const options: { context: any; colorTextures: any[]; destroyAttachments: boolean; depthTexture?: any } = {
                context: context,
                colorTextures: [colorTexture],
                destroyAttachments,
            };
            if (depthTexture) {
                options.depthTexture = depthTexture;
            }
            return new Cesium.Framebuffer(options);
        }

        static createRawRenderState(options: any) {
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

    // 流体体渲染

    class FluidRenderer {
        // ---------- 实例状态 ----------
        viewer: any;
        config: any;
        textures: any;
        computePasses: any;
        mainRenderPass: any;
        heightMapCamera: any;
        debugEntity: any;
        postRenderHandler: any;
        _time: any;
        _frameCount: any;
        _isActive: any;
        _heightMap: any;

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

        constructor(viewer: any, options: any = {}) {
            if (!viewer) throw new Error("Cesium Viewer is required");

            this.viewer = viewer;
            this._initConfiguration(options);
            this._initState();
            this._createResources();
            this._setupRenderPipeline();
        }

        // 初始化配置参数
        _initConfiguration(options: any) {
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

        setInitialWaterLevel(normalizedWaterLevel: any) {
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

        _createHeightMapTexture(source: any) {
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
            let copyFBO: any = null;
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
                copyFBO = RenderUtil.createFramebuffer(context, heightMap, undefined, false);
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
        _renderDepthPrepass(passState: any) {
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
        _createComputePass(outputTextureName: any, { uniforms, shaderSource }: { uniforms: any; shaderSource: any }) {
            return new CustomPrimitive({
                commandType: "Compute",
                uniformMap: uniforms,
                fragmentShaderSource: new Cesium.ShaderSource({
                    sources: [Command, shaderSource],
                }),
                geometry: RenderUtil.getFullscreenQuad(),
                outputTexture: this.textures[outputTextureName],
                preExecute: (cmd: any) =>
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

            this.computePasses.forEach((p: any) =>
                this.viewer.scene.primitives.add(p)
            );
            this.viewer.scene.primitives.add(this.mainRenderPass);
        }

        // 屏幕坐标转世界坐标
        _screenToWorld(screenPos: any) {
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
            // 先保存引用再清空数组，确保所有 outputTexture 被释放
            const passesToDispose = [this.mainRenderPass, ...(this.computePasses || [])];
            this.mainRenderPass = null;
            this.computePasses = [];

            if (this.debugEntity) {
                this.viewer.entities.remove(this.debugEntity);
                this.debugEntity = null;
            }

            Object.values(this.textures || {}).forEach((tex: any) => {
                if (tex && !tex.isDestroyed?.()) {
                    tex.destroy();
                }
            });
            this.textures = {};

            if (this._heightMap && !this._heightMap.isDestroyed?.()) {
                this._heightMap.destroy();
                this._heightMap = null;
            }

            // 释放正交相机引用（防止内存泄漏）
            this.heightMapCamera = null;

            // 释放 CustomPrimitive 的 outputTexture（使用预先保存的引用）
            passesToDispose.forEach((p) => {
                if (p?.outputTexture && !p.outputTexture.isDestroyed?.()) {
                    p.outputTexture.destroy();
                }
            });
        }

        // 纹理拷贝方法：将高度图数据复制到目标 framebuffer

        _copyTexture(sourceTexture: any, targetFBO: any) {
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

        // 获取地形深度渲染命令：收集当前视锥下的深度预渲染命令

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

            // 高度图着色器处理：为地形深度预渲染注入逆 ENU 坐标转换

        _processHeightMapShaders() {
            const patchedCommands: any[] = [];
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

        _restoreHeightMapShaders(patchedCommands: any) {
            patchedCommands.forEach((patch: any) => {
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

            // 创建派生着色器程序：在原始 shader 基础上生成高度图专用版本

        _getDerivedShaderProgram(context: any, baseShaderProgram: any, passName: any) {
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

            // 生成高度图专用着色器：替换 main 并注入地形高程写回逻辑

        _createHeightMapShaderProgram(context: any, baseShaderProgram: any, passName: any) {
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

            // 修改片段着色器：保留原始渲染流程，仅追加高度图输出

        _modifyFragmentShader(originalFS: any) {
            const modifiedSources = originalFS.sources.map((source: any) =>
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

            // 创建流体几何体：使用单位盒体作为体渲染包围体

        _createBoxGeometry() {
            return Cesium.BoxGeometry.createGeometry(
                Cesium.BoxGeometry.fromDimensions({
                    vertexFormat: Cesium.VertexFormat.POSITION_AND_ST,
                    dimensions: new Cesium.Cartesian3(1, 1, 1),
                })
            );
        }

            // 获取属性位置映射：根据盒体几何体生成顶点属性索引

        _getAttributeLocations() {
            return Cesium.GeometryPipeline.createAttributeLocations(
                this._createBoxGeometry()
            );
        }

            // 创建渲染状态配置：关闭背面剔除并开启深度测试

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

            // 顶点着色器生成：输出相机位置、视线方向和纹理坐标

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

    // 生成模型矩阵

    const generateModelMatrix = (
        position: number[] = [0, 0, 0],
        rotation: number[] = [0, 0, 0],
        scale: number[] = [1, 1, 1]
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


    // 基础大气雾

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
