/**
 * gltfLoader.js
 * GLTF/GLB 三维模型加载器
 *
 * 功能：加载 GLTF/GLB 到 Cesium，提取嵌入坐标，自动放置无坐标模型。
 */

import { getExtension, createBlobUrl, revokeBlobUrl } from './utils.js';

/**
 * 加载 GLTF/GLB 三维模型到 Cesium
 *
 * 流程：
 * 1. 读取文件转为 Blob URL
 * 2. 尝试从模型中提取嵌入坐标（CESIUM_RTC 扩展或 asset.extras）
 * 3. 如无嵌入坐标 → 尝试自动放置到相机视野中心 + 地形采样
 * 4. 自动放置失败 → 返回 { needsCoordInput: true }，由调用方弹窗收集坐标
 *
 * @param {Object} ctx
 * @param {File} ctx.file
 * @param {Function} ctx.getCesium
 * @param {Function} ctx.getViewer
 * @param {Object} ctx.message
 * @param {import('vue').Ref} ctx.loadedDataSources
 * @param {{ current: number }} ctx.nextId
 * @param {Object} [ctx.heightSampler] - 地形高度采样器
 * @returns {Promise<Object>} record 或 { needsCoordInput: true, file, blobUrl }
 */
export async function loadGLTF({ file, getCesium, getViewer, message, loadedDataSources, nextId, heightSampler }) {
    const Cesium = getCesium();
    const viewer = getViewer();
    if (!Cesium || !viewer) throw new Error('Cesium 未初始化');

    const blobUrl = createBlobUrl(file);

    let embeddedCoords = null;
    try {
        embeddedCoords = await extractGlbEmbeddedCoords(file, getCesium);
    } catch (e) {
        console.warn('[CesiumDataImport] GLTF 坐标提取失败:', e);
    }

    let coords;
    if (embeddedCoords) {
        coords = embeddedCoords;
    } else {
        coords = await getAutoPlaceCoords(viewer, Cesium, heightSampler);
        if (!coords) {
            return { needsCoordInput: true, file, blobUrl };
        }
    }

    try {
        const model = await loadGltfWithCoords(Cesium, viewer, blobUrl, file.name, coords);
        const id = `gltf_${++nextId.current}`;

        const record = {
            id,
            name: file.name,
            type: 'gltf',
            entity: model,
            blobUrl,
            position: { ...coords },
        };
        loadedDataSources.value = [...loadedDataSources.value, record];

        if (!embeddedCoords) {
            message.success(
                `3D 模型 "${file.name}" 已放置在相机视野中心 (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}, 海拔 ${coords.height.toFixed(1)}m)`,
            );
        } else {
            message.success(
                `3D 模型 "${file.name}" 加载成功 (${coords.lng.toFixed(4)}, ${coords.lat.toFixed(4)}, ${coords.height.toFixed(1)}m)`,
            );
        }
        return record;
    } catch (error) {
        revokeBlobUrl(blobUrl);
        throw error;
    }
}

/**
 * 根据坐标创建 modelMatrix 并加载 GLTF 模型
 * @param {Cesium} Cesium
 * @param {Cesium.Viewer} viewer
 * @param {string} blobUrl - 模型的 Blob URL
 * @param {string} name - 文件名
 * @param {{ lng: number, lat: number, height: number }} coords - 坐标
 * @returns {Promise<Cesium.Model>}
 */
export async function loadGltfWithCoords(Cesium, viewer, blobUrl, name, coords) {
    const { lng, lat, height } = coords;

    const center = Cesium.Cartesian3.fromDegrees(lng, lat, height);
    const headingPitchRoll = new Cesium.HeadingPitchRoll(0, 0, 0);

    const model = await Cesium.Model.fromGltfAsync({
        url: blobUrl,
        modelMatrix: Cesium.Transforms.headingPitchRollToFixedFrame(
            center,
            headingPitchRoll,
            Cesium.Ellipsoid.WGS84,
            Cesium.Transforms.localFrameToFixedFrameGenerator('north', 'west'),
        ),
        scale: 1.0,
        show: true,
    });

    model.name = name;
    viewer.scene.primitives.add(model);

    return model;
}

/**
 * 从 GLTF/GLB 文件中提取嵌入的地理坐标
 *
 * 支持的坐标来源（按优先级）：
 * 1. CESIUM_RTC 扩展
 * 2. asset.extras 自定义坐标
 * 3. 首个 node 的 matrix 平移分量（地固坐标）
 *
 * @param {File} file - GLTF/GLB 文件
 * @param {Function} getCesium
 * @returns {Promise<{lng: number, lat: number, height: number}|null>}
 */
export async function extractGlbEmbeddedCoords(file, getCesium) {
    const ext = getExtension(file.name);
    let json;

    if (ext === 'gltf') {
        const text = await file.text();
        json = JSON.parse(text);
    } else {
        const buffer = await file.arrayBuffer();
        json = parseGlbJsonChunk(buffer);
    }

    if (!json) return null;

    // 1) CESIUM_RTC 扩展
    if (json.extensionsUsed?.includes('CESIUM_RTC') && json.extensions?.CESIUM_RTC?.center) {
        const center = json.extensions.CESIUM_RTC.center;
        if (center.length >= 3) {
            const Cesium = getCesium();
            if (Cesium) {
                const cartesian = new Cesium.Cartesian3(center[0], center[1], center[2]);
                const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                return {
                    lng: Cesium.Math.toDegrees(cartographic.longitude),
                    lat: Cesium.Math.toDegrees(cartographic.latitude),
                    height: cartographic.height,
                };
            }
        }
    }

    // 2) asset.extras 自定义坐标
    const extras = json.asset?.extras;
    if (extras) {
        const lng = extras.longitude ?? extras.lng;
        const lat = extras.latitude ?? extras.lat;
        const height = extras.height ?? extras.altitude ?? extras.alt ?? 0;

        if (lng != null && lat != null) {
            return { lng: Number(lng), lat: Number(lat), height: Number(height) };
        }
    }

    // 3) node matrix 平移分量（地固坐标）
    if (json.nodes?.length > 0 && json.nodes[0].matrix) {
        const matrix = json.nodes[0].matrix;
        if (matrix.length >= 16) {
            const tx = matrix[12];
            const ty = matrix[13];
            const tz = matrix[14];

            if (Math.abs(tx) > 100000 || Math.abs(ty) > 100000) {
                const Cesium = getCesium();
                if (Cesium) {
                    try {
                        const cartesian = new Cesium.Cartesian3(tx, ty, tz);
                        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
                        return {
                            lng: Cesium.Math.toDegrees(cartographic.longitude),
                            lat: Cesium.Math.toDegrees(cartographic.latitude),
                            height: cartographic.height,
                        };
                    } catch { /* 转换失败，忽略 */ }
                }
            }
        }
    }

    return null;
}

/**
 * 解析 GLB 二进制文件的 JSON chunk
 * GLB 格式：12 字节头 | JSON chunk（长度 + 类型 + 数据）| 可选 BIN chunk
 *
 * @param {ArrayBuffer} buffer - GLB 文件二进制数据
 * @returns {Object|null} 解析后的 JSON 对象
 */
export function parseGlbJsonChunk(buffer) {
    if (buffer.byteLength < 20) return null;

    const headerView = new DataView(buffer);
    if (headerView.getUint32(0, true) !== 0x46546c67) return null;

    const jsonChunkLength = headerView.getUint32(12, true);
    if (headerView.getUint32(16, true) !== 0x4e4f534a) return null;

    const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
    const jsonText = new TextDecoder().decode(jsonBytes);

    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * 自动获取相机视野中心的地面位置（含地形高度）
 * 用于 GLTF 无嵌入坐标时的自动放置
 *
 * @param {Cesium.Viewer} viewer
 * @param {Cesium} Cesium
 * @param {Object} [heightSampler] - 地形高度采样器
 * @returns {Promise<{lng: number, lat: number, height: number}|null>}
 */
export async function getAutoPlaceCoords(viewer, Cesium, heightSampler) {
    try {
        const center = new Cesium.Cartesian2(
            viewer.canvas.clientWidth / 2,
            viewer.canvas.clientHeight / 2,
        );

        let cartesian;
        if (viewer.scene.pickPositionSupported) {
            cartesian = viewer.scene.pickPosition(center);
        }
        if (!cartesian) {
            cartesian = viewer.camera.pickEllipsoid(center, viewer.scene.globe.ellipsoid);
        }
        if (!cartesian) {
            const camCarto = Cesium.Cartographic.fromCartesian(viewer.camera.positionWC);
            cartesian = Cesium.Cartesian3.fromRadians(camCarto.longitude, camCarto.latitude, 0);
        }

        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lng = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);

        let height = 0;
        try {
            if (heightSampler?.sampleHeight) {
                const result = heightSampler.sampleHeight({ lng, lat });
                if (result?.height !== undefined) {
                    height = result.height;
                }
            } else {
                const samplePos = Cesium.Cartographic.fromDegrees(lng, lat);
                const sampled = Cesium.sampleTerrain(viewer.terrainProvider, 0, [samplePos]);
                const resolved = sampled instanceof Promise ? await sampled : sampled;
                if (resolved?.[0]?.height !== undefined) {
                    height = resolved[0].height;
                }
            }
        } catch { /* 采样失败，使用默认高度 0 */ }

        return { lng, lat, height: Math.max(0, height) };
    } catch (e) {
        console.warn('[CesiumDataImport] 自动定位失败:', e);
        return null;
    }
}
