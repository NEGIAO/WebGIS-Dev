import { Matrix4 } from "cesium";
import { load, parse } from "@loaders.gl/core";
import { GLTFLoader, postProcessGLTF } from "@loaders.gl/gltf";
import type { GLTFPostprocessed, GLTFNodePostprocessed } from "@loaders.gl/gltf";

export interface MergedGeometry {
    positions: Float32Array; // xyz...,模型局部空间(米)
    indices: Uint32Array;
}

// 从 URL 加载并解析 glTF/glb，返回合并后的三角网(模型局部空间,米)
export async function loadGltfGeometry(url: string): Promise<MergedGeometry> {
    // decompressMeshes 默认 true → Draco/Meshopt 自动解码;loadImages 关掉省带宽。
    const gltfWithBuffers = await load(url, GLTFLoader, {
        gltf: { loadBuffers: true, loadImages: false, decompressMeshes: true },
    });
    return extractGeometry(postProcessGLTF(gltfWithBuffers), url);
}

// 计算节点本地变换 4x4(matrix 优先，否则 TRS 组装)
function nodeLocalMatrix(node: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }): Matrix4 {
    if (node.matrix) {
        return Matrix4.fromColumnMajorArray(node.matrix, new Matrix4());
    }
    const t = node.translation ?? [0, 0, 0];
    const r = node.rotation ?? [0, 0, 0, 1]; // 四元数 xyzw
    const s = node.scale ?? [1, 1, 1];
    return Matrix4.fromTranslationQuaternionRotationScale(
        { x: t[0], y: t[1], z: t[2] } as any,
        { x: r[0], y: r[1], z: r[2], w: r[3] } as any,
        { x: s[0], y: s[1], z: s[2] } as any,
        new Matrix4(),
    );
}

// 遍历节点层级，对每个带几何的 primitive 回调(world 矩阵 + primitive)
function traverseMeshes(gltf: GLTFPostprocessed, cb: (world: Matrix4, prim: any) => void) {
    const rootNodes: GLTFNodePostprocessed[] =
        gltf.scene?.nodes ?? gltf.scenes?.[0]?.nodes ?? gltf.nodes ?? [];

    const visit = (node: GLTFNodePostprocessed, parentMatrix: Matrix4) => {
        // 世界矩阵 = 父矩阵 × 本节点局部矩阵(层级累乘)
        const world = Matrix4.multiply(parentMatrix, nodeLocalMatrix(node), new Matrix4());
        if (node.mesh) {
            for (const prim of node.mesh.primitives) cb(world, prim);
        }
        if (node.children) for (const child of node.children) visit(child, world); // 递归子节点,传下世界矩阵
    };
    // 从根节点出发,初始父矩阵为单位阵
    for (const n of rootNodes) visit(n, Matrix4.clone(Matrix4.IDENTITY, new Matrix4()));
}

// 提取并合并所有 mesh 三角网(应用世界变换)
function extractGeometry(gltf: GLTFPostprocessed, url: string): MergedGeometry {
    const allPositions: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    traverseMeshes(gltf, (world, prim) => {
        const posAcc = prim.attributes?.POSITION;
        if (!posAcc) return;
        const pos = posAcc.value; // Float32Array(xyz...)

        // 每个顶点 × world(取矩阵平移列 12/13/14),变换到模型局部空间
        for (let i = 0; i < pos.length; i += 3) {
            const x = pos[i], y = pos[i + 1], z = pos[i + 2];
            allPositions.push(
                world[0] * x + world[4] * y + world[8] * z + world[12],
                world[1] * x + world[5] * y + world[9] * z + world[13],
                world[2] * x + world[6] * y + world[10] * z + world[14],
            );
        }

        const vertCount = pos.length / 3;
        // 索引整体偏移 vertexOffset(因为多个 mesh 顶点拼进同一个数组)
        if (prim.indices) {
            const idx = prim.indices.value;
            for (let i = 0; i < idx.length; i++) allIndices.push(idx[i] + vertexOffset);
        } else {
            // 无索引:顺序三角面
            for (let i = 0; i < vertCount; i++) allIndices.push(i + vertexOffset);
        }
        vertexOffset += vertCount;
    });

    if (!allPositions.length) throw new Error(`模型 ${url} 未提取到任何几何`);
    return {
        positions: new Float32Array(allPositions),
        indices: new Uint32Array(allIndices),
    };
}

// 算模型 AABB 尺寸 {x,y,z}
export async function getGltfBboxSize(buf: ArrayBuffer, url = ""): Promise<{ x: number; y: number; z: number }> {
    // 只解析 JSON(loadBuffers:false，不下载/解码顶点)，min/max 即来自 accessor JSON
    const gltf = postProcessGLTF(await parse(buf, GLTFLoader, {
        gltf: { loadBuffers: false, loadImages: false },
    }));
    const min = [Infinity, Infinity, Infinity]; // 整体 AABB 下界
    const max = [-Infinity, -Infinity, -Infinity]; // 整体 AABB 上界

    traverseMeshes(gltf, (world, prim) => {
        const acc = prim.attributes?.POSITION;
        if (!acc?.min || !acc?.max) return; // 无 min/max 的 primitive 跳过
        // 取该 primitive 局部 AABB 的 8 个角点(c 的三位分别选 min/max),经世界变换后并入整体
        for (let c = 0; c < 8; c++) {
            const px = (c & 1) ? acc.max[0] : acc.min[0];
            const py = (c & 2) ? acc.max[1] : acc.min[1];
            const pz = (c & 4) ? acc.max[2] : acc.min[2];
            // 角点 × world(取矩阵平移列 12/13/14)
            const wx = world[0] * px + world[4] * py + world[8] * pz + world[12];
            const wy = world[1] * px + world[5] * py + world[9] * pz + world[13];
            const wz = world[2] * px + world[6] * py + world[10] * pz + world[14];
            // 扩张整体包围盒
            if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
            if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
            if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
        }
    });

    // 没有任何带 min/max 的几何，无法估尺寸，报错(否则会返回 Infinity)
    if (!Number.isFinite(min[1])) throw new Error(`模型 ${url} 无 POSITION min/max,无法算包围盒`);
    return { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] }; // 上界 - 下界 = 尺寸
}
