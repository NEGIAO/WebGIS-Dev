/**
 * 单波段 GeoTIFF → 高程网格（从 useCesiumDataImport 拆出）
 *
 * 把缓存的栅格重采样成三角网 Primitive，并替换原影像层；
 * 只依赖注入的 rasterCache / loadedDataSources 与 Cesium 访问器。
 */

import { toRaw } from 'vue';
import { revokeBlobUrl } from './loaders/utils';

/** 最大高程网格尺寸（超过此尺寸自动降采样） */
const MAX_MESH_SIZE = 200;

export interface RasterHeightDeps {
    getCesium: () => any;
    getViewer: () => any;
    message: any;
    loadedDataSources: { value: any[] };
    rasterCache: Map<string, any>;
}

/**
 * 创建「拉伸栅格到高程」函数
 * @param deps 依赖注入（见 RasterHeightDeps）
 * @returns stretchRasterToHeight(id, options)
 */
export function createRasterHeightMeshBuilder({
    getCesium,
    getViewer,
    message,
    loadedDataSources,
    rasterCache,
}: RasterHeightDeps) {
    async function stretchRasterToHeight(id: string, options: { exaggeration?: number } = {}) {
        const cache = rasterCache.get(id);
        if (!cache) {
            message.warning('该数据不是单波段 GeoTIFF，无法拉伸到高程');
            return false;
        }
        if (cache.heightMesh) {
            message.info('已拉伸到高程，如需调整请移除后重新拉伸');
            return false;
        }

        const Cesium = getCesium();
        const viewer = getViewer();
        if (!Cesium || !viewer) return false;

        const { data, width, height, bbox, canvas } = cache;
        const exaggeration = options.exaggeration ?? 1.0;
        const gridW = Math.min(width, MAX_MESH_SIZE);
        const gridH = Math.min(height, MAX_MESH_SIZE);
        const stepX = Math.max(1, Math.floor(width / gridW));
        const stepY = Math.max(1, Math.floor(height / gridH));
        const cols = Math.ceil(width / stepX);
        const rows = Math.ceil(height / stepY);

        let dataMin = Infinity, dataMax = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (Number.isFinite(data[i])) {
                if (data[i] < dataMin) dataMin = data[i];
                if (data[i] > dataMax) dataMax = data[i];
            }
        }

        const { west, south, east, north } = bbox;
        const lngStep = (east - west) / (cols - 1);
        const latStep = (north - south) / (rows - 1);

        const numVerts = rows * cols;
        const positions = new Float64Array(numVerts * 3);
        const indices = [];

        for (let row = 0; row < rows; row++) {
            const srcY = Math.min(row * stepY, height - 1);
            for (let col = 0; col < cols; col++) {
                const srcX = Math.min(col * stepX, width - 1);
                const rawVal = data[srcY * width + srcX];
                const h = Number.isFinite(rawVal) ? rawVal * exaggeration : 0;
                const lng = west + col * lngStep;
                const lat = south + row * latStep;
                const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat, h);
                const vi = (row * cols + col) * 3;
                positions[vi] = cartesian.x;
                positions[vi + 1] = cartesian.y;
                positions[vi + 2] = cartesian.z;
            }
        }

        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const i = row * cols + col;
                indices.push(i, i + 1, i + cols);
                indices.push(i + 1, i + cols + 1, i + cols);
            }
        }

        const uvs = new Float32Array(numVerts * 2);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const vi = (row * cols + col) * 2;
                uvs[vi] = col / (cols - 1);
                uvs[vi + 1] = row / (rows - 1);
            }
        }

        const geometry = new Cesium.Geometry({
            attributes: {
                position: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                    componentsPerAttribute: 3,
                    values: positions,
                }),
                st: new Cesium.GeometryAttribute({
                    componentDatatype: Cesium.ComponentDatatype.FLOAT,
                    componentsPerAttribute: 2,
                    values: uvs,
                }),
            },
            indices: new Uint16Array(indices),
            primitiveType: Cesium.PrimitiveType.TRIANGLES,
            boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
        });

        const appearance = canvas
            ? new Cesium.MaterialAppearance({
                material: Cesium.Material.fromType('Image', { image: canvas }),
                translucent: false,
                closed: false,
            })
            : new Cesium.MaterialAppearance({
                material: Cesium.Material.fromType('Color', {
                    color: new Cesium.Color(0.8, 0.85, 0.9, 0.85),
                }),
                translucent: true,
                closed: false,
            });

        const primitive = new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({ geometry }),
            appearance,
            asynchronous: false,
        });

        viewer.scene.primitives.add(primitive);
        cache.heightMesh = primitive;

        // 移除平铺影像层，用纹理网格替代
        const record = loadedDataSources.value.find((r) => r.id === id);
        if (record) {
            const rawEntity = toRaw(record.entity);
            if (rawEntity instanceof Cesium.ImageryLayer) {
                viewer.imageryLayers.remove(rawEntity);
            }
            if (record.blobUrl) {
                revokeBlobUrl(record.blobUrl);
                record.blobUrl = null;
            }
            record.entity = primitive;
        }

        const rect = Cesium.Rectangle.fromDegrees(west, south, east, north);
        viewer.camera.flyTo({ destination: rect, duration: 2 });

        message.success(
            `高程网格已生成（${cols}×${rows}，高度范围 ${(dataMin * exaggeration).toFixed(1)}m ~ ${(dataMax * exaggeration).toFixed(1)}m）`
            + (canvas ? '，影像已贴合网格' : ''),
        );
        return true;
    }
    return { stretchRasterToHeight };
}
