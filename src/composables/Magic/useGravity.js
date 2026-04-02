// useGravity.js

export function useGravity(canvasRef, props) {
  // ==========================================
  // 核心配置与物理常量 (集中管理，方便后期微调)
  // ==========================================
  const NUM_PARTICLES = 250;           // 粒子总数
  const FRICTION = 0.94;               // 介质摩擦力 (0~1)
  const INTERACT_RADIUS = 400;         // 鼠标引力作用半径
  const INTERACT_RADIUS_SQ = INTERACT_RADIUS ** 2; 
  const LINE_DIST = 80;                // 连线最大距离
  const LINE_DIST_SQ = LINE_DIST ** 2; // 预计算平方值优化性能
  const TWO_PI = Math.PI * 2;          // 预计算圆周长

  // ==========================================
  // 状态变量与数据驱动内存池 (TypedArrays)
  // ==========================================
  let ctx = null;
  let width = 0;
  let height = 0;
  let animationId = null;

  const x = new Float32Array(NUM_PARTICLES);
  const y = new Float32Array(NUM_PARTICLES);
  const vx = new Float32Array(NUM_PARTICLES);
  const vy = new Float32Array(NUM_PARTICLES);

  const mouse = { x: -1000, y: -1000, active: false };

  // ==========================================
  // 初始化模块
  // ==========================================
  function initCanvas() {
    const canvas = canvasRef.value;
    if (!canvas) return;
    
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { alpha: true });
  }

  function initParticles() {
    for (let i = 0; i < NUM_PARTICLES; i++) {
      x[i] = Math.random() * width;
      y[i] = Math.random() * height;
      vx[i] = (Math.random() - 0.5) * 2;
      vy[i] = (Math.random() - 0.5) * 2;
    }
  }

  // ==========================================
  // 核心渲染与物理步进循环
  // ==========================================
  function step() {
    // 状态拦截与 RAF 防抖
    if (!props.active) {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      return;
    }
    if (animationId) cancelAnimationFrame(animationId);

    // 1. 透明画布的高级残影 (Ghosting)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; 
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter'; // 切换至发光叠加模式
    ctx.lineWidth = 0.5;

    // 2. 物理演算与粒子绘制
    for (let i = 0; i < NUM_PARTICLES; i++) {
      // --- A. 万有引力与离心力注入 ---
      if (mouse.active) {
        const dx = mouse.x - x[i];
        const dy = mouse.y - y[i];
        const distSq = dx * dx + dy * dy;

        if (distSq > 25 && distSq < INTERACT_RADIUS_SQ) {
          const dist = Math.sqrt(distSq);
          const force = 600 / (distSq + 1000); 
          
          const nx = dx / dist; // 归一化 X
          const ny = dy / dist; // 归一化 Y
          
          // 吸引力 (Attraction)
          vx[i] += nx * force;
          vy[i] += ny * force;
          
          // 切向离心力 (Centrifugal swirl)
          vx[i] += -ny * force * 0.8;
          vy[i] += nx * force * 0.8;
        }
      }

      // --- B. 介质阻力与运动步进 ---
      vx[i] *= FRICTION;
      vy[i] *= FRICTION;
      x[i] += vx[i];
      y[i] += vy[i];

      // --- C. 空间折叠 (无缝边缘穿越) ---
      if (x[i] < 0) x[i] = width;
      else if (x[i] > width) x[i] = 0;

      if (y[i] < 0) y[i] = height;
      else if (y[i] > height) y[i] = 0;

      // --- D. 量子态发光绘制 ---
      const speed = Math.hypot(vx[i], vy[i]);
      const hue = Math.max(0, 240 - speed * 12); // 静止冷色 -> 高速暖色
      
      ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.8)`;
      ctx.beginPath();
      ctx.arc(x[i], y[i], 1.5, 0, TWO_PI);
      ctx.fill();
    }

    // 3. 量子纠缠连线 (神经网络绘制)
    for (let i = 0; i < NUM_PARTICLES; i++) {
      for (let j = i + 1; j < NUM_PARTICLES; j++) {
        const dx = x[i] - x[j];
        const dy = y[i] - y[j];
        const distSq = dx * dx + dy * dy;

        if (distSq < LINE_DIST_SQ) { 
          const alpha = 1 - Math.sqrt(distSq) / LINE_DIST; 
          ctx.strokeStyle = `rgba(0, 255, 255, ${alpha * 0.4})`;
          ctx.beginPath();
          ctx.moveTo(x[i], y[i]);
          ctx.lineTo(x[j], y[j]);
          ctx.stroke();
        }
      }
    }

    animationId = requestAnimationFrame(step);
  }

  // ==========================================
  // 事件监听模块
  // ==========================================
  function handleMouseMove(e) {
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function handleMouseLeave() {
    mouse.active = false;
  }

  function handleResize() {
    initCanvas();
  }

  // ==========================================
  // 生命周期 API (暴露给 Vue 组件)
  // ==========================================
  function init() {
    initCanvas();
    initParticles();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);
    step();
  }

  function destroy() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('resize', handleResize);
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  return { init, destroy, step };
}