/**
 * 功能名称：浅水场景闪电子系统（随机闪络 + 全屏白光脉冲）
 * 日    期：2026/11/13
 *
 * 从 useShallowWater 拆出：闪电主干/分叉几何生成、打击节奏与曝光脉冲，
 * 通过注入的 uniforms 与渲染器与主场景联动。
 */
import * as THREE from 'three';

/** 闪电运行参数（浅水 currentParams 的子集） */
export interface LightningRuntimeParams {
  lightningEnabled: boolean;
  lightningInterval: number;
}

/** 每帧更新上下文 */
export interface LightningFrameContext {
  renderer: THREE.WebGLRenderer;
  params: LightningRuntimeParams;
  /** 全局时间（秒，uTime.value） */
  time: number;
  /** 闪电白光强度 uniform（系统内直写） */
  flash: { value: number };
  /** 闪电落点 uniform（系统内直写） */
  flashPos: { value: THREE.Vector3 };
}

/**
 * 闪电系统：boltGroup 挂主场景，曝光脉冲直接改 renderer.toneMappingExposure。
 */
export class LightningSystem {


  private boltMat: THREE.MeshBasicMaterial | null = null;
  private boltGroup: THREE.Group | null = null;
  private nextStrikeAt = 3.0;
  private strikeStart = -100;
  private baseExposure: number;

  constructor(baseExposure = 0.62) {
    this.baseExposure = baseExposure;
  }

  /** 闪电主干 Group（refraction 渲染前需临时隐藏） */
  get group(): THREE.Group | null {
    return this.boltGroup;
  }

  /** 初始化材质与分组（原 initLightning） */
  init(scene: THREE.Scene): void {
    this.boltMat = new THREE.MeshBasicMaterial({
      color: 0xdcebff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });

    this.boltGroup = new THREE.Group();
    this.boltGroup.visible = false;
    scene.add(this.boltGroup);
  }

  /** 生成一条随机闪络折线并挂入分组 */
  private addBolt(sx: number, sz: number, top: number, bottom: number, spread: number, radius: number): THREE.Vector3[] {
    const boltGroup = this.boltGroup!;
    const pts: THREE.Vector3[] = [];
    let cx = sx, cz = sz;
    const seg = Math.max(5, Math.floor((top - bottom) / 80));

    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push(new THREE.Vector3(cx, top + (bottom - top) * t, cz));
      cx += (Math.random() - 0.5) * spread;
      cz += (Math.random() - 0.5) * spread;
    }

    const geo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts),
      seg * 4,
      radius,
      5,
      false
    );
    const mesh = new THREE.Mesh(geo, this.boltMat!);
    mesh.renderOrder = 3;
    boltGroup.add(mesh);

    return pts;
  }

  /** 重建一组闪电（1~3 条主干 + 随机分叉），落点写入 uFlashPos */
  private buildBolts(): void {
    const boltGroup = this.boltGroup!;
    for (const c of boltGroup.children) (c as THREE.Mesh).geometry.dispose();
    boltGroup.clear();

    const trunks = 1 + Math.floor(Math.random() * 3);
    let fx = 0, fz = 0;

    for (let k = 0; k < trunks; k++) {
      const x = (Math.random() - 0.5) * 5000;
      const z = -(1000 + Math.random() * 4500);

      if (k === 0) {
        fx = x;
        fz = z;
      }

      const main = this.addBolt(x, z, 1180, 18, 110, 14.0);

      const nb = 2 + Math.floor(Math.random() * 3);
      for (let b = 0; b < nb; b++) {
        const sp = main[2 + Math.floor(Math.random() * (main.length - 4))];
        this.addBolt(sp.x, sp.z, sp.y, sp.y - (160 + Math.random() * 420), 130, 7.0);
      }
    }

    this.strikeFlashPos(fx, 1100, fz);
  }

  private strikeFlashPos(x: number, y: number, z: number): void {
    // 落点由调用方通过 ctx.flashPos 注入；此处经 lastFlashPos 回写
    if (this.lastFlashPos) {
      this.lastFlashPos.value.set(x, y, z);
    }
  }

  private lastFlashPos: { value: THREE.Vector3 } | null = null;

  /** 每帧更新：打击节奏、白光衰减曲线与曝光脉冲（原 updateLightning） */
  update(ctx: LightningFrameContext): void {
    this.lastFlashPos = ctx.flashPos;
    if (!ctx.params.lightningEnabled) {
      ctx.flash.value = 0;
      if (this.boltGroup) this.boltGroup.visible = false;
      ctx.renderer.toneMappingExposure = this.baseExposure;
      return;
    }

    const now = ctx.time;

    if (now >= this.nextStrikeAt) {
      this.strikeStart = now;
      this.buildBolts();
      this.nextStrikeAt = now + ctx.params.lightningInterval * (0.4 + Math.random() * 0.8);
    }

    const tf = now - this.strikeStart;
    let f = 0;
    if (tf >= 0.0 && tf < 0.5) {
      f = Math.max(0, Math.exp(-tf * 5.5) * (0.5 + 0.5 * Math.sin(tf * 60.0)));
    }

    ctx.flash.value = f * 2.4;
    if (this.boltGroup) {
      this.boltGroup.visible = f > 0.1;
      this.boltMat!.opacity = Math.min(1, f * 1.7);
    }

    ctx.renderer.toneMappingExposure = this.baseExposure + f * 0.75;
  }

  /** 释放材质与几何 */
  dispose(): void {
    if (this.boltGroup) {
      for (const c of this.boltGroup.children) (c as THREE.Mesh).geometry?.dispose();
      this.boltGroup.clear();
    }
    this.boltMat?.dispose();
    this.boltMat = null;
    this.boltGroup = null;
  }
}
