// useWave.js
export function useWave(canvasRef, props) {
  let ctx;
  let width, height;
  let animationId = null;

  const WAVES_COUNT = 5;
  const SEGS_COUNT = 100;
  
  let waves = [];
  let mouse = { x: -1000, y: -1000, active: false };
  let time = 0;

  function initWaves() {
    waves = [];
    for (let i = 0; i < WAVES_COUNT; i++) {
      waves.push({
        yOffset: (Math.random() - 0.5) * 80,
        amplitude: Math.random() * 30 + 10,
        speed: Math.random() * 0.03 + 0.01,
        frequency: Math.random() * 0.008 + 0.002,
        color: `hsla(${Math.random() * 60 + 120}, 100%, 60%, 0.6)`, // 量子青绿色系
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function initGrid() {
    if (!canvasRef.value) return;
    width = window.innerWidth;
    height = window.innerHeight;
    canvasRef.value.width = width;
    canvasRef.value.height = height;
    ctx = canvasRef.value.getContext('2d', { alpha: true });
  }

  function step() {
    if (!props.active || !ctx) {
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
      return;
    }
    
    // 量子拖尾残影
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, 0, width, height);
    
    ctx.globalCompositeOperation = 'lighter';
    time += 0.5; // 减缓时间使其更玄幻

    // 如果鼠标不活跃，让基准线回到中间下偏
    let targetBaseY = mouse.active ? mouse.y : height / 2;
    let targetBaseX = mouse.active ? mouse.x : width / 2;

    for (let i = 0; i < WAVES_COUNT; i++) {
        let wave = waves[i];
        
        ctx.beginPath();
        ctx.lineWidth = 1.5 + (i * 0.5);
        ctx.strokeStyle = wave.color;
        
        for (let j = 0; j <= SEGS_COUNT; j++) {
            let xPos = (j / SEGS_COUNT) * width;
            
            let dx = targetBaseX - xPos;
            let dist = Math.abs(dx);
            
            // 鼠标附近振幅增大 (量子干涉)
            let mouseInfluence = mouse.active ? Math.max(0, 400 - dist) / 400 : 0.1;
            let currentAmp = wave.amplitude * (1 + mouseInfluence * 3);
            
            // 波函数公式 
            let phaseBase = xPos * wave.frequency + time * wave.speed + wave.phase;
            let yPosOffset = Math.sin(phaseBase) * currentAmp + 
                             Math.cos(phaseBase * 1.5 - time * 0.02) * (currentAmp * 0.5);
                             
            let yPos = targetBaseY + wave.yOffset * (1 - mouseInfluence) + yPosOffset;

            if (j === 0) {
                ctx.moveTo(xPos, yPos);
            } else {
                ctx.lineTo(xPos, yPos);
            }
        }
        ctx.stroke();
    }

    // 中心光晕 (量子纠缠点)
    if (mouse.active) {
        let gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 80);
        gradient.addColorStop(0, 'rgba(0, 255, 128, 0.4)');
        gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(0, 255, 128, 0)');
        
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(mouse.x, mouse.y, 80, 0, Math.PI * 2);
        ctx.fill();
    }

    animationId = requestAnimationFrame(step);
  }

  function handleMouseMove(e) {
    mouse.active = true;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  }

  function handleMouseLeave() {
    mouse.active = false;
  }

  function handleResize() {
    initGrid();
  }

  function init() {
    initGrid();
    initWaves();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('resize', handleResize);
    step();
  }

  function destroy() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('resize', handleResize);
    if (animationId) window.cancelAnimationFrame(animationId);
  }

  return { init, destroy, step };
}
