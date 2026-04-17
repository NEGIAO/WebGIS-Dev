// useSingularity.js

/**
 * 高级物理引擎：引力奇点与元球流体 (Gravitational Singularity & Metaball Fluid)
 * 包含光学流拖尾、纳维-斯托克斯涡流网格、以及自举注入的 GPU 级 SVG 滤镜
 */
export function useSingularity(canvasRef, options = {}) {
  // --- 配置项聚合 ---
  const config = {
    active: options.active !== undefined ? options.active : true,
    gravityForce: options.gravityForce || 2000,
    friction: options.friction || 0.92,
  };

  let mainCtx, offCanvas, offCtx;
  let width, height;
  let animationId = null;

  // --- 1. 粒子系统 (DoD 数据驱动设计) ---
  const NUM_PARTICLES = 450;
  let px = new Float32Array(NUM_PARTICLES);
  let py = new Float32Array(NUM_PARTICLES);
  let vx = new Float32Array(NUM_PARTICLES);
  let vy = new Float32Array(NUM_PARTICLES);
  let mass = new Float32Array(NUM_PARTICLES);

  // --- 2. 空间流体网格 (Vortex Field) ---
  const GRID_SIZE = 40;
  let cols, rows;
  let fieldX, fieldY;

  // --- 3. 交互状态 ---
  let mouse = { x: -1000, y: -1000, active: false };
  let lastMouse = { x: -1000, y: -1000 };
  let smoothMouseVx = 0;
  let smoothMouseVy = 0;

  // ==========================================
  // 黑科技：动态自举注入 SVG 融合滤镜 (免去 HTML 模板依赖)
  // ==========================================
  function injectMetaballFilter() {
    if (document.getElementById('metaball-goo-filter')) return;
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.pointerEvents = 'none';
    
    // 显式 Alpha 色彩矩阵：产生水滴/流体的液态黏连感
    svg.innerHTML = `
      <defs>
        <filter id="metaball-goo-filter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 35 -15" result="goo" />
          <feBlend in="SourceGraphic" in2="goo" mode="screen" />
        </filter>
      </defs>
    `;
    document.body.appendChild(svg);
  }

  function initSystem() {
    // 兼容 Vue 的 ref (.value) 或是原生的 DOM 节点
    const canvas = canvasRef.value || canvasRef;
    if (!canvas) return;

    width = window.innerWidth;
    height = window.innerHeight;
    
    canvas.width = width;
    canvas.height = height;
    mainCtx = canvas.getContext('2d', { alpha: true }); // 开启透明通道
    
    // 不再填充不透明背景
    mainCtx.clearRect(0, 0, width, height);

    // 离屏画布：纯粹用于元球光斑的绘制
    offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    offCtx = offCanvas.getContext('2d');

    // 初始化流体网格场
    cols = Math.ceil(width / GRID_SIZE);
    rows = Math.ceil(height / GRID_SIZE);
    fieldX = new Float32Array(cols * rows);
    fieldY = new Float32Array(cols * rows);

    // 播撒暗物质粒子
    for (let i = 0; i < NUM_PARTICLES; i++) {
      px[i] = Math.random() * width;
      py[i] = Math.random() * height;
      vx[i] = (Math.random() - 0.5) * 2;
      vy[i] = (Math.random() - 0.5) * 2;
      mass[i] = Math.random() * 2 + 1; // 质量映射到引力与大小
    }
  }

  // 空间网格扰动运算：将鼠标矢量转化为漩涡
  function updateVortexField() {
    // 介质粘滞阻尼衰减
    for (let i = 0; i < fieldX.length; i++) {
      fieldX[i] *= 0.90;
      fieldY[i] *= 0.90;
    }

    if (!mouse.active) return;

    let gx = Math.floor(mouse.x / GRID_SIZE);
    let gy = Math.floor(mouse.y / GRID_SIZE);
    let r = 4; // 影响网格半径
    let speed = Math.hypot(smoothMouseVx, smoothMouseVy);

    for (let y = gy - r; y <= gy + r; y++) {
      for (let x = gx - r; x <= gx + r; x++) {
        if (x >= 0 && x < cols && y >= 0 && y < rows) {
          let idx = x + y * cols;
          let cellX = x * GRID_SIZE + GRID_SIZE / 2;
          let cellY = y * GRID_SIZE + GRID_SIZE / 2;
          let dx = mouse.x - cellX;
          let dy = mouse.y - cellY;
          let distSq = dx * dx + dy * dy;
          let dist = Math.sqrt(distSq) || 1;
          
          if (dist < r * GRID_SIZE) {
            let falloff = 1 - dist / (r * GRID_SIZE);
            // 向量叉乘构造涡流切线
            let swirlForce = 0.5 * speed * falloff;
            fieldX[idx] += (-dy / dist) * swirlForce;
            fieldY[idx] += (dx / dist) * swirlForce;
            // 直线拖拽力
            fieldX[idx] += smoothMouseVx * 0.1 * falloff;
            fieldY[idx] += smoothMouseVy * 0.1 * falloff;
          }
        }
      }
    }
  }

  function step() {
    if (!config.active) {
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
      return;
    }
    if (animationId) cancelAnimationFrame(animationId);

    // 1. 光学流残影 (透明背景下的鬼影清理)
    mainCtx.globalCompositeOperation = 'destination-out';
    mainCtx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // 减去上一帧的透明度，控制残影长度
    mainCtx.fillRect(0, 0, width, height);

    mainCtx.globalCompositeOperation = 'lighter';

    // 清理离屏画布
    offCtx.clearRect(0, 0, width, height);
    offCtx.globalCompositeOperation = 'source-over';

    // 鼠标速度平滑 (Lerp)
    smoothMouseVx += ((mouse.x - lastMouse.x) - smoothMouseVx) * 0.15;
    smoothMouseVy += ((mouse.y - lastMouse.y) - smoothMouseVy) * 0.15;
    lastMouse.x = mouse.x;
    lastMouse.y = mouse.y;

    updateVortexField();

    let targetX = mouse.active ? mouse.x : width / 2;
    let targetY = mouse.active ? mouse.y : height / 2;

    // 2. 物理求解与元球光晕绘制
    for (let i = 0; i < NUM_PARTICLES; i++) {
      let dx = targetX - px[i];
      let dy = targetY - py[i];
      let distSq = dx * dx + dy * dy;
      let dist = Math.sqrt(distSq);

      // A. 万有引力 (Softened Gravity)
      let gravity = (config.gravityForce * mass[i]) / (distSq + 2500);
      vx[i] += (dx / dist) * gravity;
      vy[i] += (dy / dist) * gravity;

      // B. 星系盘旋力 (切向公转)
      let orbit = gravity * 0.6;
      vx[i] += (-dy / dist) * orbit;
      vy[i] += (dx / dist) * orbit;

      // C. 流体网格场干涉
      let gx = Math.floor(px[i] / GRID_SIZE);
      let gy = Math.floor(py[i] / GRID_SIZE);
      if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
        let idx = gx + gy * cols;
        vx[i] += fieldX[idx] * 0.1;
        vy[i] += fieldY[idx] * 0.1;
      }

      // D. 宇宙摩擦力
      vx[i] *= config.friction;
      vy[i] *= config.friction;
      
      px[i] += vx[i];
      py[i] += vy[i];

      // 边缘无缝穿梭映射
      if (px[i] < -100) px[i] = width + 100;
      if (px[i] > width + 100) px[i] = -100;
      if (py[i] < -100) py[i] = height + 100;
      if (py[i] > height + 100) py[i] = -100;

      // --- 视觉映射 (Thermodynamic Coloring) ---
      let speed = Math.hypot(vx[i], vy[i]);
      let hue = 270 - Math.max(0, 90 * (1 - dist / (width * 0.4))) + speed * 1.5;
      let lightness = Math.min(90, 30 + speed * 3 + Math.max(0, 50 * (1 - dist / 200)));

      offCtx.fillStyle = `hsl(${hue}, 100%, ${lightness}%)`;
      offCtx.beginPath();
      offCtx.arc(px[i], py[i], mass[i] * 3.5, 0, Math.PI * 2);
      offCtx.fill();
    }

    // 3. GPU 滤色叠加与液态融合 (Screen + Metaball)
    mainCtx.globalCompositeOperation = 'screen';
    mainCtx.filter = 'url(#metaball-goo-filter)';
    mainCtx.drawImage(offCanvas, 0, 0);
    mainCtx.filter = 'none';

    animationId = requestAnimationFrame(step);
  }

  // --- 事件监听 ---
  function handleMouseMove(e) {
    config.active = true;
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }
  function handleMouseLeave() { mouse.active = false; }
  function handleResize() { initSystem(); }

  // 暴露 API
  return {
    init: () => {
      injectMetaballFilter();
      initSystem();
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseleave', handleMouseLeave);
      window.addEventListener('resize', handleResize);
      step();
    },
    destroy: () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
      if (animationId) cancelAnimationFrame(animationId);
    },
    step: () => step(),
    // 允许外部动态更新配置
    updateConfig: (newConfig) => {
      Object.assign(config, newConfig);
      if (config.active && !animationId) step();
    }
  };
}