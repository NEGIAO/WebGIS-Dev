// useFluid.js
import { ref, onUnmounted } from 'vue';

export function useFluid(canvasRef, props) {
  let ctx, offscreenCanvas, offscreenCtx, imageData, data;
  let width, height, cols, rows;
  const CELL_SIZE = 11; // 物理网格大小，越小越精细但开销越大
  const ITERATIONS = 5; // 泊松方程迭代次数，决定流体不可压缩的精确度

  // TypedArrays
  let u, v, u_prev, v_prev, dens, dens_prev, hue;
  
  let animationId = null;
  let colorTable = new Uint8Array(360 * 3);
  let globalHue = 0;
  
  let mouse = { x: 0, y: 0, vx: 0, vy: 0, isDown: false, active: false };
  let lastMouse = { x: 0, y: 0 };

  // 1. 预计算颜色查找表 (极速渲染核心)
  function initColorTable() {
    for (let i = 0; i < 360; i++) {
      let s = 1.0, l = 0.6;
      let c = (1 - Math.abs(2 * l - 1)) * s;
      let x = c * (1 - Math.abs((i / 60) % 2 - 1));
      let m = l - c / 2;
      let r, g, b;
      if (i < 60) { r = c; g = x; b = 0; }
      else if (i < 120) { r = x; g = c; b = 0; }
      else if (i < 180) { r = 0; g = c; b = x; }
      else if (i < 240) { r = 0; g = x; b = c; }
      else if (i < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      colorTable[i * 3] = Math.round((r + m) * 255);
      colorTable[i * 3 + 1] = Math.round((g + m) * 255);
      colorTable[i * 3 + 2] = Math.round((b + m) * 255);
    }
  }

  // 2. 初始化网格数据
  function initGrid() {
    if (!canvasRef.value) return;
    
    width = window.innerWidth;
    height = window.innerHeight;
    canvasRef.value.width = width;
    canvasRef.value.height = height;
    ctx = canvasRef.value.getContext('2d');
    
    // 初始化离屏渲染画布
    cols = Math.floor(width / CELL_SIZE);
    rows = Math.floor(height / CELL_SIZE);
    offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = cols;
    offscreenCanvas.height = rows;
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    imageData = offscreenCtx.createImageData(cols, rows);
    data = imageData.data;

    let size = cols * rows;
    u = new Float32Array(size);
    v = new Float32Array(size);
    u_prev = new Float32Array(size);
    v_prev = new Float32Array(size);
    dens = new Float32Array(size);
    dens_prev = new Float32Array(size);
    hue = new Float32Array(size);
  }

  // 3. 核心物理：对流 (Advection)
  function advect(b, d, d0, u, v, dt) {
    let i0, j0, i1, j1, x, y, s0, t0, s1, t1;
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        let idx = i + j * cols;
        x = i - dt * u[idx];
        y = j - dt * v[idx];
        if (x < 0.5) x = 0.5; if (x > cols - 1.5) x = cols - 1.5;
        i0 = Math.floor(x); i1 = i0 + 1;
        if (y < 0.5) y = 0.5; if (y > rows - 1.5) y = rows - 1.5;
        j0 = Math.floor(y); j1 = j0 + 1;
        s1 = x - i0; s0 = 1.0 - s1;
        t1 = y - j0; t0 = 1.0 - t1;
        
        d[idx] = s0 * (t0 * d0[i0 + j0 * cols] + t1 * d0[i0 + j1 * cols]) +
                 s1 * (t0 * d0[i1 + j0 * cols] + t1 * d0[i1 + j1 * cols]);
      }
    }
  }

  // 4. 核心物理：投影/质量守恒 (Projection)
  function project(u, v, p, div) {
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        let idx = i + j * cols;
        div[idx] = -0.5 * (u[i + 1 + j * cols] - u[i - 1 + j * cols] + v[i + (j + 1) * cols] - v[i + (j - 1) * cols]);
        p[idx] = 0;
      }
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (let j = 1; j < rows - 1; j++) {
        for (let i = 1; i < cols - 1; i++) {
          let idx = i + j * cols;
          p[idx] = (div[idx] + p[i - 1 + j * cols] + p[i + 1 + j * cols] + p[i + (j - 1) * cols] + p[i + (j + 1) * cols]) / 4;
        }
      }
    }
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        let idx = i + j * cols;
        u[idx] -= 0.5 * (p[i + 1 + j * cols] - p[i - 1 + j * cols]);
        v[idx] -= 0.5 * (p[i + (j + 1) * cols] - p[i + (j - 1) * cols]);
      }
    }
  }

  // 5. 交互注入 (交互增强核心)
  function applyForces() {
    if (!mouse.active) return;
    
    let cx = Math.floor(mouse.x / CELL_SIZE);
    let cy = Math.floor(mouse.y / CELL_SIZE);
    let r = 3; // 笔刷半径
    let speed = Math.hypot(mouse.vx, mouse.vy);

    // 悬停向心吸附力 vs 快速滑动湍流
    const isHover = speed < 2;

    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        let nx = cx + i;
        let ny = cy + j;
        if (nx >= 1 && nx < cols - 1 && ny >= 1 && ny < rows - 1) {
          let idx = nx + ny * cols;
          let dist = Math.sqrt(i * i + j * j);
          if (dist <= r) {
            let falloff = 1 - (dist / r);
            
            // 注入浓度和颜色
            dens[idx] += 100 * falloff;
            hue[idx] = globalHue;

            // 注入速度场 (交互灵魂)
            if (isHover) {
              // 悬停时：流体向中心微小汇聚 (Gravity Pull)
              u[idx] += (cx - nx) * 0.1 * falloff;
              v[idx] += (cy - ny) * 0.1 * falloff;
            } else if (speed > 40) {
              // 快速滑动：产生明显的湍流拉伸 (Turbulence Noise)
              u[idx] += mouse.vx * 0.15 * falloff + (Math.random() - 0.5) * speed * 0.2;
              v[idx] += mouse.vy * 0.15 * falloff + (Math.random() - 0.5) * speed * 0.2;
            } else {
              // 正常滑动：粘性跟随
              u[idx] += mouse.vx * 0.1 * falloff;
              v[idx] += mouse.vy * 0.1 * falloff;
            }
          }
        }
      }
    }
    mouse.vx = 0; mouse.vy = 0; // 重置
  }

  // 6. 渲染循环
  function step() {
   if (!props.active) {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      return;
    }

    if (animationId) {
      cancelAnimationFrame(animationId);
    }

     let dt = 1.0;
    u_prev.set(u); v_prev.set(v);

    applyForces();

    applyForces();

    // 速度场求解
    u_prev.set(u); v_prev.set(v);
    advect(1, u, u_prev, u_prev, v_prev, dt);
    advect(2, v, v_prev, u_prev, v_prev, dt);
    project(u, v, u_prev, v_prev);
    
    // 浓度与颜色对流
    dens_prev.set(dens);
    advect(0, dens, dens_prev, u, v, dt);
    advect(0, hue, hue.slice(), u, v, dt); // 颜色跟随流体运动

    // 衰减系数 (Dissipation)
    const decay = props.dissipation || 0.95;

    // 极速映射到 ImageData
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let idx = i + j * cols;
        dens[idx] *= decay; // 烟雾消散
        
        let d = dens[idx];
        let px = idx * 4;
        
        if (d > 0.5) { // 阈值优化
          let h = Math.floor(hue[idx]) % 360;
          if (h < 0) h += 360;
          
          let hIdx = h * 3;
          data[px] = colorTable[hIdx];         // R
          data[px + 1] = colorTable[hIdx + 1]; // G
          data[px + 2] = colorTable[hIdx + 2]; // B
          data[px + 3] = Math.min(d * 30, 255); // A (发光强度映射)
        } else {
          dens[idx] = 0;
          data[px + 3] = 0;
        }
      }
    }

    offscreenCtx.putImageData(imageData, 0, 0);

    // 硬件加速双线性插值放大 + 混合模式实现 Glow 发光效果
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offscreenCanvas, 0, 0, width, height);

    globalHue += 0.5; // 色相流转
    if (globalHue >= 360) globalHue = 0;

    animationId = requestAnimationFrame(step);
  }

  function handleMouseMove(e) {
    if (!props.active) return;
    mouse.active = true;
    mouse.vx = e.clientX - lastMouse.x;
    mouse.vy = e.clientY - lastMouse.y;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    lastMouse.x = mouse.x;
    lastMouse.y = mouse.y;
  }

  function handleMouseLeave() {
    mouse.active = false;
  }

  function handleResize() {
    initGrid();
  }

  function init() {
    initColorTable();
    initGrid();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);
    step();
  }

  function destroy() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('resize', handleResize);
    if (animationId) cancelAnimationFrame(animationId);
  }

  return { init, destroy, step };
}