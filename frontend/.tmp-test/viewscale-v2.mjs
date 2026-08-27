import assert from 'node:assert';
const m = await import('../src/domains/common/utils/viewScaleConverter.js');
for (const lat of [0, 20, 35, 50, 70]) {
    for (let z = 0; z <= 22; z += 0.5) {
        const o = { zoom: z, centerLat: lat, viewportHeight: 900 };
        const h = m.olZoomToCesiumHeight(o);
        const back = m.cesiumHeightToOlZoom({ ...o, height: h });
        assert(Math.abs(back - z) < 1e-9, `lat${lat} z${z} drift ${back}`);
    }
}
console.log('OK core inverse 110 roundtrips zero-drift');
const h4 = m.olZoomToCesiumHeight({ zoom: 4, centerLat: 35 });
assert(h4 > 3e6 && h4 < 8e6);
const cam90 = { lng: 110.5, lat: 39.2, height: m.olZoomToCesiumHeight({ zoom: 14, centerLat: 39.2, viewportHeight: 900 }), heading: 0, pitch: -90, roll: 0 };
const v90 = m.cesiumCameraToOlView(cam90, { viewportHeight: 900 });
const b90 = m.olViewToCesiumCamera(v90, { pitch: -90 }, { viewportHeight: 900 });
assert(Math.abs(b90.height - cam90.height) / cam90.height < 1e-6);
console.log('OK nadir camera exact roundtrip');
const tilt = { lng: 110.5, lat: 39.2, height: 3000, heading: 30, pitch: -45 };
const vT = m.cesiumCameraToOlView(tilt, { viewportHeight: 900 });
const bT = m.olViewToCesiumCamera(vT, { heading: 30, pitch: -45 }, { viewportHeight: 900 });
assert(Math.abs(bT.height - 3000) / 3000 < 0.02);
const vT2 = m.cesiumCameraToOlView(bT, { viewportHeight: 900 });
assert(Math.abs(vT2.lng - vT.lng) < 1e-4 && Math.abs(vT2.lat - vT.lat) < 1e-4);
console.log('OK tilted camera roundtrip + visual-center stable');
process.exit(0);
