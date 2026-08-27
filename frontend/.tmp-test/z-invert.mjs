import assert from 'node:assert';
const m = await import('../src/domains/common/utils/viewScaleConverter.js');
const SCALE = { centerLat: 35, viewportHeight: 900 };

function cesiumZFromOlZoom(zoomStr) {
    const zoom = Number(zoomStr);
    const h = m.olZoomToCesiumHeight({ zoom, ...SCALE });
    return h.toFixed(6);
}
function olZoomFromCesiumZ(hStr) {
    return m.cesiumHeightToOlZoom({ height: Number(hStr), ...SCALE });
}

for (const z of ['0.00','2.50','4.00','5.32','8.13','12.07','14.99','18.42','21.00']) {
    const h = cesiumZFromOlZoom(z);
    const back = olZoomFromCesiumZ(h).toFixed(2);
    assert.strictEqual(back, z, `${z} -> ${h} -> ${back}`);
    assert.strictEqual(m.olZoomToCesiumHeight({ zoom: Number(back), ...SCALE }).toFixed(6), h);
    console.log(`OK ${z}  <->  ${Number(h).toFixed(3)} m`);
}
console.log(`9 spot pairs pass`);

for (let zi = 0; zi <= 2200; zi++) {
    const zStr = (zi/100).toFixed(2);
    const h = cesiumZFromOlZoom(zStr);
    assert.strictEqual(Number(olZoomFromCesiumZ(h)).toFixed(2), zStr, `grid fail at ${zStr}`);
}
console.log('OK full grid 2201 points string-level inverse');
process.exit(0);
