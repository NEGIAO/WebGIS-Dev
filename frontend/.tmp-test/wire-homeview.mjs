// HomeView 接线：切换到 canonical 高层转换接口
import fs from 'node:fs';
const FILE = 'src/app/HomeView.vue';
let s = fs.readFileSync(FILE, 'utf8');

s = s.replace(
    "import { olZoomToCesiumHeight, cesiumHeightToOlZoom } from '@common/utils/viewScaleConverter';",
    `import {
    convertOlViewToCesium,
    convertCesiumViewToOl,
    canonicalScaleToOlView,
} from '@common/utils/viewScale';`,
);

const forwardOld = `    const height = olZoomToCesiumHeight({
        view: state.view,
        zoom: state.zoom,
        mapSize: state.size,
        centerLat: state.lat,
    });`;
const forwardNew = `    // Canonical 链路：zoom → resolution → G → 相机高度（规范 §34）
    const converted = convertOlViewToCesium({
        zoom: state.zoom,
        resolution: state.resolution,
        center: { longitude: state.lng, latitude: state.lat },
        viewport: state.size ? { width: state.size[0], height: state.size[1] } : undefined,
        targetPitch: -90,
        targetHeading: 0,
        targetRoll: 0,
    });
    const height = converted ? converted.cesium.height : null;`;

if (!s.includes(forwardOld)) {
    console.error('forward anchor miss');
    process.exit(1);
}
s = s.replace(forwardOld, forwardNew);

// 反向：syncOlFromCesiumPayload 中 cesiumHeightToOlZoom → canonical 射线实测优先
const inverseOld = `        const zoom = cesiumHeightToOlZoom({
            view: olView,
            height: camera.height,
            mapSize: mapContainerRef.value?.getMapSize?.(),
            centerLat: camera.lat,
        });
        if (zoom !== null) {
            equivalent = { lng: camera.lng, lat: camera.lat, zoom };
        }`;
const inverseNew = `        // Canonical 链路：射线实测（Precision）优先，解析模型兜底（Realtime）
        const conv = convertCesiumViewToOl({
            height: camera.height,
            pitch: camera.pitch,
            viewport: (() => {
                const size = mapContainerRef.value?.getMapSize?.();
                return Array.isArray(size) && size.length === 2
                    ? { width: size[0], height: size[1] }
                    : undefined;
            })(),
            measureGroundResolution: () =>
                cesiumContainerRef.value?.measureGroundResolution?.()?.groundResolution ?? null,
        });
        if (conv) {
            const olSeg = canonicalScaleToOlView({
                canonicalResolution: conv.canonicalResolution,
                latitude: camera.lat,
            });
            if (olSeg) {
                equivalent = { lng: camera.lng, lat: camera.lat, zoom: olSeg.zoom };
            }
        }`;

if (!s.includes(inverseOld)) {
    console.error('inverse anchor miss');
    process.exit(1);
}
s = s.replace(inverseOld, inverseNew);

fs.writeFileSync(FILE, s);
console.log('HomeView wired to canonical conversion');
