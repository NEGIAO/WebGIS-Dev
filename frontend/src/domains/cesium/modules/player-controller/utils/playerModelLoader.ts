import {
    Cartesian3,
    Matrix3,
    Matrix4,
    Model,
    Transforms,
    Math as CMath,
} from "cesium";
import type { Viewer } from "cesium";
import type { LocalFrame } from "./frame";
import { getGltfBboxSize } from "./gltfGeometry";
import type { PlayerModelOptions } from "../types";

export function isMobileDevice(): boolean {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function slerpAngle(from: number, to: number, t: number): number {
    const d = CMath.negativePiToPi(to - from);
    return from + d * t;
}

export function computeHeadWorldPosition(
    posEcef: Cartesian3,
    capsuleHeight: number,
    scale: number,
    yaw: number,
    offset?: [number, number, number],
): Cartesian3 {
    const base = Cartesian3.add(
        posEcef,
        Cartesian3.multiplyByScalar(
            Cartesian3.normalize(posEcef, new Cartesian3()),
            capsuleHeight * 0.5,
            new Cartesian3(),
        ),
        new Cartesian3(),
    );
    const [x, y, z] = offset ?? [0, 0, 0];
    const enu = Transforms.eastNorthUpToFixedFrame(base, undefined, new Matrix4());
    const heading = Matrix4.multiplyByMatrix3(enu, Matrix3.fromRotationZ(-yaw, new Matrix3()), new Matrix4());
    return Matrix4.multiplyByPoint(heading, new Cartesian3(x * scale, y * scale, z * scale), new Cartesian3());
}

function waitForModelReady(model: Model, url: string): Promise<void> {
    if (model.ready) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const offReady = model.readyEvent.addEventListener(() => {
            if (settled) return;
            settled = true;
            offReady();
            offErr();
            resolve();
        });
        const offErr = model.errorEvent.addEventListener(() => {
            if (settled) return;
            settled = true;
            offReady();
            offErr();
            reject(new Error(`玩家模型加载失败: ${url}`));
        });
    });
}

export async function loadAndConfigurePlayerModel({
    viewer,
    frame,
    posEcef,
    yaw,
    playerModelConfig,
    playerCapsuleHeight,
    capsuleHeight,
}: {
    viewer: Viewer;
    frame: LocalFrame;
    posEcef: Cartesian3;
    yaw: number;
    playerModelConfig: PlayerModelOptions;
    playerCapsuleHeight: number;
    capsuleHeight: number;
}): Promise<{ model: Model; modelScale: number }> {
    const modelMatrix = frame.composeModelMatrix(posEcef, yaw);
    const url = playerModelConfig.url;
    const model = await Model.fromGltfAsync({
        url,
        modelMatrix,
        scene: viewer.scene,
    });
    viewer.scene.primitives.add(model);
    await waitForModelReady(model, url);

    let modelScale = 1;
    const bs = model.boundingSphere;
    if (bs && bs.radius > 0) {
        const modelHeight = bs.radius * 2;
        modelScale = playerCapsuleHeight / modelHeight;
    } else {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch 模型失败: ${url} HTTP ${res.status}`);
        const glbBytes = await res.arrayBuffer();
        const size = await getGltfBboxSize(glbBytes, url);
        if (size.y > 0) modelScale = playerCapsuleHeight / size.y;
    }

    const s = playerModelConfig.scale;
    const fwdEN = { e: Math.sin(yaw), n: Math.cos(yaw) };
    frame.composeModelMatrixLookAt(
        posEcef,
        fwdEN,
        modelScale * s,
        model.modelMatrix,
        -capsuleHeight / 2,
        playerModelConfig.facingOffset ?? 0,
    );

    return { model, modelScale };
}
