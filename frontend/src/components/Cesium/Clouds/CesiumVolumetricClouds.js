import { CLOUD_FRAGMENT_SHADER, CLOUD_VERTEX_SHADER } from './cloudShaders';
import CloudShadowResources from './cloudShadowResources';
import {
    createCloudUniformScratch,
    normalizeCloudParams,
    updateCloudUniformScratch,
} from './cloudMath';

const QUAD_POSITIONS = new Float32Array([-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]);
const QUAD_TEXCOORDS = new Float32Array([0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0]);
const QUAD_INDICES = new Uint16Array([0, 1, 2, 0, 2, 3]);

export default class CesiumVolumetricClouds {
    constructor(viewer, options = {}) {
        if (!viewer?.scene?.context) {
            throw new Error('CesiumVolumetricClouds requires a valid Cesium Viewer instance.');
        }

        this._viewer = viewer;
        this._scene = viewer.scene;
        this._context = this._scene.context;
        this._Cesium = options.cesium || globalThis.Cesium;

        if (!this._Cesium) {
            throw new Error('CesiumVolumetricClouds requires Cesium runtime.');
        }
        if (!this._context.webgl2) {
            throw new Error('体积云需要 WebGL2 支持。');
        }

        this.show = options.enabled !== false;
        this._params = normalizeCloudParams(options);
        this._uniformScratch = createCloudUniformScratch(this._Cesium);
        this._startTime = performance.now();
        this._isDestroyed = false;
        this._quadVertexArray = null;
        this._shaderProgram = null;
        this._drawCommand = null;
        this._shadowResources = null;

        this._buildResources();
    }

    setEnabled(enabled) {
        this.show = !!enabled;
        this._params = normalizeCloudParams({ ...this._params, enabled: this.show });
        this._scene.requestRender?.();
    }

    setParam(name, value) {
        this.setParams({ [name]: value });
    }

    setParams(partialParams = {}) {
        this._params = normalizeCloudParams({ ...this._params, ...partialParams });
        this.show = this._params.enabled !== false;
        this._scene.requestRender?.();
    }

    reset(params = {}) {
        this._params = normalizeCloudParams(params);
        this.show = !!this._params.enabled;
        this._startTime = performance.now();
        this._scene.requestRender?.();
    }

    update(frameState) {
        if (this._isDestroyed || !this.show || !frameState?.commandList) return;
        if (!this._drawCommand) this._buildResources();
        if (!this._drawCommand) return;

        this._updateShadowResources(frameState);
        frameState.commandList.push(this._drawCommand);
    }

    destroy() {
        if (this._isDestroyed) return;

        this._drawCommand = null;
        if (this._shaderProgram) {
            this._shaderProgram.destroy();
            this._shaderProgram = null;
        }
        if (this._quadVertexArray) {
            this._quadVertexArray.destroy();
            this._quadVertexArray = null;
        }
        if (this._shadowResources) {
            this._shadowResources.destroy();
            this._shadowResources = null;
        }
        this._isDestroyed = true;
    }

    isDestroyed() {
        return this._isDestroyed;
    }

    _buildResources() {
        if (this._drawCommand) return;
        this._buildQuadVertexArray();
        this._buildShaderProgram();
        this._buildShadowResources();
        this._buildDrawCommand();
    }

    _buildShadowResources() {
        if (this._shadowResources || this._params.shadowMode !== true) return;

        try {
            this._shadowResources = new CloudShadowResources(this._viewer, {
                cesium: this._Cesium,
                enabled: true,
                far: this._params.maxDistance,
                resolution: this._params.shadowResolution || 256,
            });
        } catch (error) {
            console.warn('Cesium volumetric cloud shadow resources disabled:', error);
            this._shadowResources = null;
        }
    }

    _updateShadowResources(frameState) {
        if (!this._shadowResources) return;

        const sunDirection = this._scene.context?.uniformState?.sunDirectionWC;
        const uniforms = this._updateUniforms();
        this._shadowResources.update({
            camera: this._viewer.camera,
            sunDirection,
            maxDistance: this._params.maxDistance,
            density: this._params.densityMultiplier * 0.000085,
            coverage: this._params.coverage,
            bottomRadius: uniforms.radii.x,
            topRadius: uniforms.radii.y,
            timeSeconds: uniforms.noise.w,
            frameState,
        });
    }

    _buildQuadVertexArray() {
        if (this._quadVertexArray) return;

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

    _buildShaderProgram() {
        if (this._shaderProgram) return;

        this._shaderProgram = this._Cesium.ShaderProgram.fromCache({
            context: this._context,
            vertexShaderSource: CLOUD_VERTEX_SHADER,
            fragmentShaderSource: CLOUD_FRAGMENT_SHADER,
            attributeLocations: {
                position: 0,
                textureCoordinates: 1,
            },
        });
    }

    _buildDrawCommand() {
        const Cesium = this._Cesium;
        this._drawCommand = new Cesium.DrawCommand({
            owner: this,
            primitiveType: Cesium.PrimitiveType.TRIANGLES,
            vertexArray: this._quadVertexArray,
            shaderProgram: this._shaderProgram,
            renderState: Cesium.RenderState.fromCache({
                depthTest: { enabled: false },
                depthMask: false,
                blending: Cesium.BlendingState.ALPHA_BLEND,
            }),
            uniformMap: this._getUniformMap(),
            pass: Cesium.Pass.TRANSLUCENT,
        });
    }

    _getUniformMap() {
        return {
            u_cloudRadii: () => this._updateUniforms().radii,
            u_cloudParams: () => this._uniformScratch.params,
            u_lighting: () => this._uniformScratch.lighting,
            u_noise: () => this._uniformScratch.noise,
            u_windDirection: () => this._uniformScratch.wind,
            u_cameraPositionWC: () => {
                this._Cesium.Cartesian3.clone(
                    this._viewer.camera.positionWC || this._viewer.camera.position,
                    this._uniformScratch.camera,
                );
                return this._uniformScratch.camera;
            },
        };
    }

    _updateUniforms() {
        const elapsedSeconds = (performance.now() - this._startTime) / 1000;
        updateCloudUniformScratch({
            Cesium: this._Cesium,
            scratch: this._uniformScratch,
            params: this._params,
            ellipsoid: this._scene.globe?.ellipsoid,
            elapsedSeconds,
        });
        return this._uniformScratch;
    }
}
