import { BufferA, BufferB, BufferC, BufferD, Command, renderShaderSource } from './fluid/fluidShaders';
import { createFluidRenderPrimitives } from './fluid/fluidRenderPrimitives';

export function createFluidRuntime(Cesium: any) {
    if (!Cesium) {
        throw new Error('Cesium runtime is required for FluidRenderer.');
    }

    const {
        getSceneView,
        getScenePassState,
        getFrustumCommandsList,
        CustomPrimitive,
        RenderUtil,
        generateModelMatrix,
        createSkyEffect,
        createOrthographicHeightCamera,
        getDerivedHeightMapShaderProgram,
    } = createFluidRenderPrimitives(Cesium);

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
            return createOrthographicHeightCamera(this.viewer.scene, this.config);
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

            this.heightMapCamera = null;

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

            const originalFramebuffer = passState.framebuffer;
            passState.framebuffer = targetFBO;
            drawCommand.execute(context, passState);
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
                    command.heightMap_ShaderProgram = getDerivedHeightMapShaderProgram(
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

    return {
        FluidRenderer,
        createSkyEffect,
    };
}
