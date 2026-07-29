/**
 * 程序化纹理生成工具模块
 */

import * as THREE from 'three';

/**
 * 生成可平铺的水面法线贴图
 * @param {number} N - 纹理尺寸
 * @returns {THREE.CanvasTexture} 法线贴图纹理
 */
export function makeWaterNormalMap(N = 256) {
  const rnd = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) rnd[i] = Math.random();

  const blur = (src, r) => {
    const dst = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = 0, c = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)];
            c++;
          }
        }
        dst[y * N + x] = s / c;
      }
    }
    return dst;
  };

  const low = blur(rnd, 4);
  const high = blur(rnd, 1);
  const h = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    h[i] = low[i] * 0.7 + high[i] * 0.3;
  }

  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);

  const H = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  const strength = 3.0;

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const ny = (H(x, y - 1) - H(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1.0);
      const o = (y * N + x) * 4;
      img.data[o]     = (nx / len * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1.0 / len * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * 生成沙地纹理
 * @returns {THREE.CanvasTexture} 沙地纹理
 */
export function makeSandTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');

  g.fillStyle = '#d8c79b';
  g.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 12000; i++) {
    const v = 170 + Math.random() * 70 | 0;
    g.fillStyle = `rgba(${v},${v - 22},${v - 65},0.22)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.6, 1.6);
  }

  for (let i = 0; i < 26; i++) {
    const r = 60 + Math.random() * 40 | 0;
    const gn = 90 + Math.random() * 50 | 0;
    const b = 70 + Math.random() * 40 | 0;
    g.fillStyle = `rgba(${r},${gn},${b},0.30)`;
    g.beginPath();
    g.ellipse(
      Math.random() * 512,
      Math.random() * 512,
      8 + Math.random() * 26,
      6 + Math.random() * 20,
      Math.random() * 6,
      0,
      7
    );
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 生成 3D 噪声纹理
 * @param {number} N - 纹理尺寸
 * @returns {THREE.CanvasTexture} 双通道噪声纹理
 */
export function makeCloudNoiseTex(N = 256) {
  const blur = (src, r) => {
    const dst = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let s = 0, c = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            s += src[((y + dy + N) % N) * N + ((x + dx + N) % N)];
            c++;
          }
        }
        dst[y * N + x] = s / c;
      }
    }
    return dst;
  };

  const gen = () => {
    const rnd = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) rnd[i] = Math.random();

    const a = blur(rnd, 3);
    const b = blur(rnd, 1);
    const out = new Float32Array(N * N);

    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < N * N; i++) {
      out[i] = a[i] * 0.65 + b[i] * 0.35;
      mn = Math.min(mn, out[i]);
      mx = Math.max(mx, out[i]);
    }
    for (let i = 0; i < N * N; i++) {
      out[i] = (out[i] - mn) / (mx - mn);
    }
    return out;
  };

  const R = gen();
  const G = gen();

  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);

  for (let i = 0; i < N * N; i++) {
    const o = i * 4;
    img.data[o]     = R[i] * 255;
    img.data[o + 1] = G[i] * 255;
    img.data[o + 2] = 0;
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}
