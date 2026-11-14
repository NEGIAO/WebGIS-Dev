import { atmosphereFs } from './atmosphereShader';

export function createFluidRenderPrimitives(Cesium: any) {
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

    function createSkyEffect() {
        return new Cesium.PostProcessStage({
            fragmentShader: atmosphereFs,
        });
    }

    function createOrthographicHeightCamera(scene: any, config: any) {
        const camera = new Cesium.Camera(scene);
        camera.frustum = new Cesium.OrthographicOffCenterFrustum();

        const [lon, lat] = config.lonLat;
        const center = Cesium.Cartesian3.fromDegrees(lon, lat, config.baseHeight);
        const enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(center);

        const frustum = camera.frustum;
        frustum.near = 0.01;
        frustum.far = Math.max(
            config.dimensions.z * 2,
            (config.heightRange.max - config.heightRange.min) + config.dimensions.z
        );
        frustum.left = -config.dimensions.x / 2;
        frustum.right = config.dimensions.x / 2;
        frustum.bottom = -config.dimensions.y / 2;
        frustum.top = config.dimensions.y / 2;

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

    function modifyHeightMapFragmentShader(originalFS: any) {
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

    function getDerivedHeightMapShaderProgram(context: any, baseShaderProgram: any, passName: any) {
        let derivedProgram = context.shaderCache.getDerivedShaderProgram(
            baseShaderProgram,
            passName
        );

        if (!Cesium.defined(derivedProgram)) {
            const newFS = modifyHeightMapFragmentShader(
                baseShaderProgram.fragmentShaderSource
            );
            derivedProgram = context.shaderCache.createDerivedShaderProgram(
                baseShaderProgram,
                passName,
                {
                    vertexShaderSource: baseShaderProgram.vertexShaderSource,
                    fragmentShaderSource: newFS,
                    attributeLocations: baseShaderProgram._attributeLocations,
                }
            );
        }

        return derivedProgram;
    }

    return {
        getSceneView,
        getScenePassState,
        getFrustumCommandsList,
        CustomPrimitive,
        RenderUtil,
        generateModelMatrix,
        createSkyEffect,
        createOrthographicHeightCamera,
        getDerivedHeightMapShaderProgram,
    };
}
