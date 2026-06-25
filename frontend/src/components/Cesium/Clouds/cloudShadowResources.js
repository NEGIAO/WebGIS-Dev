import { CLOUD_SHADOW_FRAGMENT_SHADER, CLOUD_SHADOW_VERTEX_SHADER } from './cloudShadowShaders';

const DEFAULT_OPTIONS = {
    cascadeCount: 3,
    resolution: 256,
    splitLambda: 0.58,
    near: 1500,
    far: 720000,
    useFloatTexture: false,
};

export default class CloudShadowResources {
    constructor(viewer, options = {}) {
        if (!viewer?.scene?.context) {
            throw new Error('CloudShadowResources requires a valid Cesium Viewer instance.');
        }

        this.viewer = viewer;
        this.scene = viewer.scene;
        this.context = viewer.scene.context;
        this.Cesium = options.cesium || globalThis.Cesium;
        this.options = normalizeOptions(options);
        this.enabled = options.enabled !== false;
        this.status = {
            ready: false,
            frameNumber: -1,
            width: 0,
            height: 0,
            pixelDatatype: 'UNSIGNED_BYTE',
        };

        this.cascadeSplits = new Float32Array(this.options.cascadeCount);
        this.cascadeMatrices = Array.from(
            { length: this.options.cascadeCount },
            () => new this.Cesium.Matrix4(),
        );
        this.inverseCascadeMatrices = Array.from(
            { length: this.options.cascadeCount },
            () => new this.Cesium.Matrix4(),
        );

        this._textures = [null, null];
        this._framebuffers = [null, null];
        this._clearCommand = null;
        this._drawCommand = null;
        this._shaderProgram = null;
        this._quadVertexArray = null;
        this._viewport = null;
        this._activeIndex = 0;
        this._destroyed = false;
        this._lastCameraPosition = new this.Cesium.Cartesian3();
        this._lastSunDirection = new this.Cesium.Cartesian3();
        this._uniformScratch = {
            atlas: new this.Cesium.Cartesian4(),
            params: new this.Cesium.Cartesian4(),
            sun: new this.Cesium.Cartesian3(),
            inverseMatrices: Array.from({ length: 4 }, () => new this.Cesium.Matrix4()),
        };

        this._createTargets();
        this._createCommands();
        this.status.ready = true;
    }

    get texture() {
        return this._textures[this._activeIndex];
    }

    get historyTexture() {
        return this._textures[1 - this._activeIndex];
    }

    get framebuffer() {
        return this._framebuffers[this._activeIndex];
    }

    get width() {
        return this.options.resolution * this.options.cascadeCount;
    }

    get height() {
        return this.options.resolution;
    }

    get viewport() {
        if (!this._viewport) {
            this._viewport = new this.Cesium.BoundingRectangle(0, 0, this.width, this.height);
        }
        this._viewport.width = this.width;
        this._viewport.height = this.height;
        return this._viewport;
    }

    resize(resolution) {
        const nextResolution = clampInteger(resolution, 64, 2048);
        if (nextResolution === this.options.resolution) return;
        this.options.resolution = nextResolution;
        this._destroyTargets();
        this._createTargets();
        this.status.ready = true;
        if (this._drawCommand) {
            this._drawCommand.framebuffer = this.framebuffer;
            this._drawCommand.renderState = this.Cesium.RenderState.fromCache({
                viewport: this.viewport,
                depthTest: { enabled: false },
                depthMask: false,
            });
        }
        this.scene.requestRender?.();
    }

    update({ camera, sunDirection, maxDistance, density, coverage, bottomRadius, topRadius, timeSeconds, frameState } = {}) {
        if (this._destroyed || !this.enabled) return;
        const activeCamera = camera || this.viewer.camera;
        const activeSun = sunDirection || this.scene.context?.uniformState?.sunDirectionWC;
        if (!activeCamera || !activeSun) return;

        this._updateCascadeSplits(maxDistance);
        this._updateMatrices(activeCamera, activeSun);
        this._updateUniforms({
            sunDirection: activeSun,
            density,
            coverage,
            bottomRadius,
            topRadius,
            timeSeconds,
        });
        this.Cesium.Cartesian3.clone(activeCamera.positionWC || activeCamera.position, this._lastCameraPosition);
        this.Cesium.Cartesian3.clone(activeSun, this._lastSunDirection);

        if (frameState?.commandList && this._drawCommand) {
            this.enqueueClear(frameState);
            this._drawCommand.framebuffer = this.framebuffer;
            this.status.frameNumber = Number(frameState.frameNumber ?? this.status.frameNumber + 1);
            frameState.commandList.push(this._drawCommand);
        }
    }

    swap() {
        this._activeIndex = 1 - this._activeIndex;
    }

    enqueueClear(frameState) {
        if (!frameState?.commandList || !this.framebuffer) return;
        if (!this._clearCommand) {
            this._clearCommand = new this.Cesium.ClearCommand({
                color: new this.Cesium.Color(0.0, 0.0, 0.0, 0.0),
                owner: this,
                pass: this.Cesium.Pass.OPAQUE,
            });
        }

        this._clearCommand.framebuffer = this.framebuffer;
        this._clearCommand.renderState = this.Cesium.RenderState.fromCache({
            viewport: this.viewport,
        });
        frameState.commandList.push(this._clearCommand);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyTargets();
        this._destroyCommandResources();
        this._destroyed = true;
    }

    isDestroyed() {
        return this._destroyed;
    }

    _createTargets() {
        const Cesium = this.Cesium;
        const resolution = this.options.resolution;
        const width = this.width;
        const height = this.height;
        const pixelCount = width * height;
        const useFloat = !!this.options.useFloatTexture && !!this.context.floatingPointTexture;
        const pixelDatatype = useFloat ? Cesium.PixelDatatype.FLOAT : Cesium.PixelDatatype.UNSIGNED_BYTE;

        this.status.width = width;
        this.status.height = height;
        this.status.pixelDatatype = useFloat ? 'FLOAT' : 'UNSIGNED_BYTE';

        for (let i = 0; i < 2; i += 1) {
            this._textures[i] = new Cesium.Texture({
                context: this.context,
                width,
                height,
                pixelFormat: Cesium.PixelFormat.RGBA,
                pixelDatatype,
                source: {
                    width,
                    height,
                    arrayBufferView: useFloat
                        ? new Float32Array(pixelCount * 4)
                        : new Uint8Array(pixelCount * 4),
                },
                sampler: new Cesium.Sampler({
                    minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
                    magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
                    wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
                    wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE,
                }),
            });

            this._framebuffers[i] = new Cesium.Framebuffer({
                context: this.context,
                colorTextures: [this._textures[i]],
                destroyAttachments: false,
            });
        }
    }

    _createCommands() {
        this._destroyCommandResources();
        this._createQuadVertexArray();
        this._shaderProgram = this.Cesium.ShaderProgram.fromCache({
            context: this.context,
            vertexShaderSource: CLOUD_SHADOW_VERTEX_SHADER,
            fragmentShaderSource: CLOUD_SHADOW_FRAGMENT_SHADER,
            attributeLocations: {
                position: 0,
            },
        });
        this._drawCommand = new this.Cesium.DrawCommand({
            owner: this,
            primitiveType: this.Cesium.PrimitiveType.TRIANGLES,
            vertexArray: this._quadVertexArray,
            shaderProgram: this._shaderProgram,
            renderState: this.Cesium.RenderState.fromCache({
                viewport: this.viewport,
                depthTest: { enabled: false },
                depthMask: false,
            }),
            framebuffer: this.framebuffer,
            uniformMap: this._getUniformMap(),
            pass: this.Cesium.Pass.OPAQUE,
        });
    }

    _createQuadVertexArray() {
        const Cesium = this.Cesium;
        const positionBuffer = Cesium.Buffer.createVertexBuffer({
            context: this.context,
            typedArray: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
            usage: Cesium.BufferUsage.STATIC_DRAW,
        });
        const indexBuffer = Cesium.Buffer.createIndexBuffer({
            context: this.context,
            typedArray: new Uint16Array([0, 1, 2, 0, 2, 3]),
            usage: Cesium.BufferUsage.STATIC_DRAW,
            indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
        });

        this._quadVertexArray = new Cesium.VertexArray({
            context: this.context,
            attributes: [
                {
                    index: 0,
                    vertexBuffer: positionBuffer,
                    componentsPerAttribute: 2,
                },
            ],
            indexBuffer,
        });
    }

    _destroyCommandResources() {
        this._drawCommand = null;
        this._clearCommand = null;
        if (this._shaderProgram) {
            this._shaderProgram.destroy();
            this._shaderProgram = null;
        }
        if (this._quadVertexArray) {
            this._quadVertexArray.destroy();
            this._quadVertexArray = null;
        }
    }

    _getUniformMap() {
        return {
            u_shadowAtlas: () => this._uniformScratch.atlas,
            u_shadowParams: () => this._uniformScratch.params,
            u_sunDirectionWC: () => this._uniformScratch.sun,
            u_inverseCascadeMatrices: () => this._uniformScratch.inverseMatrices,
        };
    }

    _updateUniforms({
        sunDirection,
        density = 0.00009,
        coverage = 0.52,
        bottomRadius,
        topRadius,
        timeSeconds = 0,
    }) {
        this._uniformScratch.atlas.x = this.options.cascadeCount;
        this._uniformScratch.atlas.y = this.options.resolution;
        this._uniformScratch.atlas.z = bottomRadius || 6378137.0 + 1500.0;
        this._uniformScratch.atlas.w = topRadius || 6378137.0 + 8500.0;
        this._uniformScratch.params.x = density;
        this._uniformScratch.params.y = coverage;
        this._uniformScratch.params.z = 24;
        this._uniformScratch.params.w = timeSeconds;

        this.Cesium.Cartesian3.clone(sunDirection, this._uniformScratch.sun);
        for (let i = 0; i < 4; i += 1) {
            this.Cesium.Matrix4.clone(
                this.inverseCascadeMatrices[i] || this.Cesium.Matrix4.IDENTITY,
                this._uniformScratch.inverseMatrices[i],
            );
        }
    }

    _destroyTargets() {
        this.status.ready = false;
        for (let i = 0; i < 2; i += 1) {
            if (this._framebuffers[i]) {
                this._framebuffers[i].destroy();
                this._framebuffers[i] = null;
            }
            if (this._textures[i]) {
                this._textures[i].destroy();
                this._textures[i] = null;
            }
        }
    }

    _updateCascadeSplits(maxDistance) {
        const near = this.options.near;
        const far = Math.max(near + 1, Number(maxDistance) || this.options.far);
        const lambda = this.options.splitLambda;
        const count = this.options.cascadeCount;

        for (let i = 1; i <= count; i += 1) {
            const p = i / count;
            const logSplit = near * Math.pow(far / near, p);
            const uniformSplit = near + (far - near) * p;
            this.cascadeSplits[i - 1] = logSplit * lambda + uniformSplit * (1 - lambda);
        }
    }

    _updateMatrices(camera, sunDirection) {
        const Cesium = this.Cesium;
        const normalizedSun = Cesium.Cartesian3.normalize(sunDirection, scratchSunDirection);
        const eye = camera.positionWC || camera.position;
        const up = camera.upWC || camera.up;
        const right = camera.rightWC || camera.right;
        const direction = camera.directionWC || camera.direction;

        let previousSplit = this.options.near;
        for (let i = 0; i < this.options.cascadeCount; i += 1) {
            const split = this.cascadeSplits[i];
            computeCascadeLightMatrix({
                Cesium,
                eye,
                up,
                right,
                direction,
                sunDirection: normalizedSun,
                near: previousSplit,
                far: split,
                resolution: this.options.resolution,
                result: this.cascadeMatrices[i],
                inverseResult: this.inverseCascadeMatrices[i],
            });
            previousSplit = split;
        }
    }
}

const scratchSunDirection = {};
const scratchCenter = {};
const scratchAxisX = {};
const scratchAxisY = {};
const scratchAxisZ = {};
const scratchCorner = {};
const scratchTmp = {};

function computeCascadeLightMatrix({
    Cesium,
    eye,
    up,
    right,
    direction,
    sunDirection,
    near,
    far,
    resolution,
    result,
    inverseResult,
}) {
    const centerDistance = (near + far) * 0.5;
    const radius = Math.max((far - near) * 0.62, 1200.0);
    Cesium.Cartesian3.multiplyByScalar(direction, centerDistance, scratchCenter);
    Cesium.Cartesian3.add(eye, scratchCenter, scratchCenter);

    Cesium.Cartesian3.negate(sunDirection, scratchAxisZ);
    Cesium.Cartesian3.cross(up, scratchAxisZ, scratchAxisX);
    if (Cesium.Cartesian3.magnitudeSquared(scratchAxisX) < 0.001) {
        Cesium.Cartesian3.cross(right, scratchAxisZ, scratchAxisX);
    }
    Cesium.Cartesian3.normalize(scratchAxisX, scratchAxisX);
    Cesium.Cartesian3.cross(scratchAxisZ, scratchAxisX, scratchAxisY);
    Cesium.Cartesian3.normalize(scratchAxisY, scratchAxisY);

    const texelSize = (radius * 2) / Math.max(resolution, 1);
    const snappedX = Math.round(Cesium.Cartesian3.dot(scratchCenter, scratchAxisX) / texelSize) * texelSize;
    const snappedY = Math.round(Cesium.Cartesian3.dot(scratchCenter, scratchAxisY) / texelSize) * texelSize;
    const snappedZ = Cesium.Cartesian3.dot(scratchCenter, scratchAxisZ);

    Cesium.Cartesian3.multiplyByScalar(scratchAxisX, snappedX, scratchCorner);
    Cesium.Cartesian3.multiplyByScalar(scratchAxisY, snappedY, scratchTmp);
    Cesium.Cartesian3.add(scratchCorner, scratchTmp, scratchCorner);
    Cesium.Cartesian3.multiplyByScalar(scratchAxisZ, snappedZ, scratchTmp);
    Cesium.Cartesian3.add(scratchCorner, scratchTmp, scratchCenter);

    const view = Cesium.Matrix4.fromArray([
        scratchAxisX.x, scratchAxisX.y, scratchAxisX.z, -Cesium.Cartesian3.dot(scratchAxisX, scratchCenter),
        scratchAxisY.x, scratchAxisY.y, scratchAxisY.z, -Cesium.Cartesian3.dot(scratchAxisY, scratchCenter),
        scratchAxisZ.x, scratchAxisZ.y, scratchAxisZ.z, -Cesium.Cartesian3.dot(scratchAxisZ, scratchCenter),
        0, 0, 0, 1,
    ]);
    const projection = Cesium.Matrix4.computeOrthographicOffCenter(
        -radius,
        radius,
        -radius,
        radius,
        -radius * 3,
        radius * 3,
        scratchProjection,
    );

    Cesium.Matrix4.multiply(projection, view, result);
    Cesium.Matrix4.inverse(result, inverseResult);
}

const scratchProjection = {};

function normalizeOptions(options = {}) {
    return {
        cascadeCount: clampInteger(options.cascadeCount ?? DEFAULT_OPTIONS.cascadeCount, 1, 4),
        resolution: clampInteger(options.resolution ?? DEFAULT_OPTIONS.resolution, 64, 2048),
        splitLambda: clampNumber(options.splitLambda ?? DEFAULT_OPTIONS.splitLambda, 0, 1),
        near: clampNumber(options.near ?? DEFAULT_OPTIONS.near, 1, 100000),
        far: clampNumber(options.far ?? DEFAULT_OPTIONS.far, 10000, 2000000),
        useFloatTexture: options.useFloatTexture === true,
    };
}

function clampInteger(value, min, max) {
    return Math.round(clampNumber(Number(value) || min, min, max));
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
