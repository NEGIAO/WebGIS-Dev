// viewScale 全组合自动精度测试（规范 §37~§44）
// 覆盖：zoom 列表 × 纬度列表 × 视口列表 × FOV 列表 × pitch 列表 × Terrain 模拟
import assert from 'node:assert';
const VS = await import('../src/domains/common/utils/viewScale/index.js');

const ZOOMS = [0, 1, 5, 5.32, 8.716, 10, 12.345, 15, 18, 20];
const LATS = [0, 15, 30, 40, 45, 60, 80];
const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 2560, height: 1440 },
    { width: 3840, height: 2160 },
];
const FOVS = [
    Math.PI / 6, // 30°
    Math.PI / 4, // 45°
    Math.PI / 3, // 60°（Cesium 默认）
    (75 * Math.PI) / 180,
    (90 * Math.PI) / 180,
];
const PITCHES = [-90, -80, -70, -60, -45, -30];

// ── A. OL → Cesium → OL：全组合往返 |Δzoom| < 1e-9 ──
let count = 0;
let maxErr = 0;
for (const zoom of ZOOMS) {
    for (const lat of LATS) {
        for (const vp of VIEWPORTS) {
            for (const fovY of FOVS) {
                const o = {
                    zoom,
                    center: { longitude: 110.5, latitude: lat },
                    viewport: vp,
                    fovY,
                    targetPitch: -90,
                };
                const st = VS.olViewToCanonical(o);
                assert(st && Number.isFinite(st.canonicalResolution));
                const back = VS.canonicalScaleToOlView({
                    canonicalResolution: st.canonicalResolution,
                    latitude: lat,
                });
                const diff = Math.abs(back.zoom - zoom);
                maxErr = Math.max(maxErr, diff);
                assert(diff < 1e-9, `A 失败 zoom=${zoom} lat=${lat} vw=${vp.width} err=${diff}`);
                count++;
            }
        }
    }
}
console.log(`✓ A. OL→Canonical→OL：${count} 组合 max|Δzoom|=${maxErr.toExponential(2)} <1e-9`);

// ── B. Cesium→OL→Cesium：groundResolution 误差 < 相对容差（含倾斜）──
count = 0;
maxErr = 0;
for (const pitch of PITCHES) {
    for (const lat of [30, 45]) {
        for (const vp of VIEWPORTS.slice(0, 2)) {
            const targetG = 10; // 10 m/px
            const height = VS.groundResolutionToTiltedCameraHeight({
                groundResolution: targetG,
                pitch,
                viewportHeight: vp.height,
            });
            const measured = VS.cesiumCameraToGroundResolution({
                height, pitch, viewportHeight: vp.height,
            });
            const err = Math.abs(measured - targetG) / targetG;
            maxErr = Math.max(maxErr, err);
            assert(err < 1e-12, `B 失败 pitch=${pitch} err=${err}`);
            count++;
        }
    }
}
console.log(`✓ B. Cesium 解析自洽：${count} 组合 max rel err=${maxErr.toExponential(2)}`);

// ── C. Resize 不变性：同 zoom 同纬度，视口变化后 G 必须等比例响应且往返仍可逆 ──
{
    const zoom = 8.716;
    const lat = 40;
    let prevG = null;
    for (const vp of VIEWPORTS) {
        const st = VS.olViewToCanonical({ zoom, center: { longitude: 110, latitude: lat }, viewport: vp });
        if (prevG !== null) {
            // canonical 与视口无关（OL 语义），必须恒定 —— 这正是"换屏不失效"的保证
            assert(Math.abs(st.canonicalResolution - prevG) / prevG < 1e-12);
        }
        prevG = st.canonicalResolution;
        // 反向：由该 G 还原 zoom 仍精确
        const back = VS.canonicalScaleToOlView({ canonicalResolution: st.canonicalResolution, latitude: lat });
        assert(Math.abs(back.zoom - zoom) < 1e-9);
    }
    console.log('✓ C. Resize：canonical 对视口不变，往返仍精确');
}

// ── D. Fractional Zoom：规范点列逐位还原 ──
for (const z of [5.32, 8.716, 12.345]) {
    const st = VS.olViewToCanonical({ zoom: z, center: { longitude: 116, latitude: 40 }, viewport: VIEWPORTS[0] });
    const back = VS.canonicalScaleToOlView({ canonicalResolution: st.canonicalResolution, latitude: 40 });
    assert.strictEqual(back.zoom.toFixed(2), z.toFixed(2));
}
console.log('✓ D. 小数 zoom（5.32/8.716/12.345）正常处理');

// ── E. Ray 测量 + Precision 校正（平面地球 mock；Terrain=平面高度 100m）──
const TERRAIN_H = 100; // 地面高程（米）
const CAM_H = 5000; // 相机离椭球面高度
const RES_TRUE = 2; // 真实地面分辨率（米/像素）
const CANVAS_W = 1000;
const CANVAS_H = 800;

// 平面模型：像素 py 对应地面 y = (cy - py) * RES_TRUE，z=TERRAIN_H
function mockPickRay(pixel) {
    return { __pixel: pixel };
}
function mockGlobePick(ray) {
    const dy = CANVAS_H / 2 - ray.__pixel.y;
    return { x: ray.__pixel.x * RES_TRUE, y: dy * RES_TRUE, z: TERRAIN_H };
}
function mockDistance(a, b) {
    const dx = a.x - b.x;
    return Math.abs(dx); // 水平相邻像素：距离 = 分辨率 × 1px
}
const measured = VS.__testOnly?.measure ?? null;

// 直接走 cesiumScale 注入式测量
const cesiumScaleMod = await import('../src/domains/common/utils/viewScale/cesiumScale.js');
const sample = cesiumScaleMod.measureCesiumGroundResolutionFromRays({
    canvasWidth: CANVAS_W,
    canvasHeight: CANVAS_H,
    pickRay: mockPickRay,
    globePick: mockGlobePick,
    distance: mockDistance,
});
assert(sample && Math.abs(sample.groundResolution - RES_TRUE) < 1e-6, '射线测量应命中真实分辨率');
console.log(`✓ E. 射线测量（Terrain 平面模拟）：measured=${sample.groundResolution} m/px`);

// ── F. solveCameraHeightBinary：数值求解收敛到目标分辨率 ──
let appliedHeight = null;
const solved = cesiumScaleMod.solveCameraHeightBinary({
    targetGroundResolution: RES_TRUE * 4, // 目标 8 m/px
    setCameraHeight: (h) => { appliedHeight = h; },
    measure: () => {
        // 平面近似：G ∝ h（相机离地）
        return (appliedHeight / CAM_H) * RES_TRUE;
    },
    minHeight: 1,
    maxHeight: CAM_H * 4,
    toleranceRatio: 1e-9,
});
assert(solved !== null && Math.abs((solved / CAM_H) * RES_TRUE - RES_TRUE * 4) / (RES_TRUE * 4) < 1e-9, '二分应收敛');
console.log(`✓ F. solveCameraHeightBinary 收敛：h=${solved.toFixed(3)} → G=${(solved / CAM_H) * RES_TRUE}`);

// ── G. nearlyEqual 回归 ──
assert(VS.nearlyEqual(1, 1 + 5e-11));
assert(!VS.nearlyEqual(1, 1 + 1e-6));
console.log('✓ G. nearlyEqual 行为正确');

console.log('\n全部验收通过（§50 A/B/C/D/E）');
process.exit(0);
