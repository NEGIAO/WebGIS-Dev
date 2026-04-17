// useDelaunay.js
export function useDelaunay(canvasRef, props) {
  let ctx, width, height, animationId;
  
  // 空间节点 (Vertices)
  const POINT_COUNT = 60; // 节点数量 (足够形成唯美网格，且保证毫秒级计算)
  let points =[];
  
  // 数据涟漪 (Ripples) - 用于交互式空间畸变
  let ripples =[];

  // 动态引力点/鼠标节点 (The Dynamic Vertex)
  let mouse = { x: -1000, y: -1000, id: 'mouse', active: false };

  function initGrid() {
    if (!canvasRef.value) return;
    width = window.innerWidth;
    height = window.innerHeight;
    canvasRef.value.width = width;
    canvasRef.value.height = height;
    ctx = canvasRef.value.getContext('2d', { alpha: true });
  }

  // 初始化带有 GIS 伪高程 (Z-index) 的空间节点
  function initPoints() {
    points =[];
    for (let i = 0; i < POINT_COUNT; i++) {
      points.push({
        id: i,
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8, // 极其缓慢的漂移
        vy: (Math.random() - 0.5) * 0.8,
        z: Math.random() * 100 // 伪高程属性：用于计算插值颜色 (TIN Elevation)
      });
    }
  }

  // ==========================================
  // 核心算法 1：计算外接圆 (Circumcircle)
  // GIS基础：Delaunay三角网必须满足"空圆特性"(任何三角形的外接圆内不能包含其他顶点)
  // ==========================================
  function circumcircle(a, b, c) {
    const A = b.x - a.x, B = b.y - a.y;
    const C = c.x - a.x, D = c.y - a.y;
    const E = A * (a.x + b.x) + B * (a.y + b.y);
    const F = C * (a.x + c.x) + D * (a.y + c.y);
    const G = 2 * (A * (c.y - a.y) - B * (c.x - a.x));
    
    // 防止三点共线导致的除零灾难
    if (Math.abs(G) < 0.000001) return null; 
    
    const cx = (D * E - B * F) / G;
    const cy = (A * F - C * E) / G;
    const dx = cx - a.x;
    const dy = cy - a.y;
    
    return { x: cx, y: cy, rSq: dx * dx + dy * dy };
  }

  // ==========================================
  // 核心算法 2：Bowyer-Watson 实时三角剖分
  // ==========================================
  function triangulate(vertices) {
    let triangles =[];
    
    // 1. 创建超级三角形 (Super-triangle) 覆盖整个屏幕空间
    const st_p1 = { id: 'st1', x: -width * 10, y: -height * 10 };
    const st_p2 = { id: 'st2', x: width * 10, y: -height * 10 };
    const st_p3 = { id: 'st3', x: 0, y: height * 10 };
    triangles.push([st_p1, st_p2, st_p3]);

    // 2. 逐一插入顶点，动态更新网格
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i];
      let badTriangles =[];
      
      // 找出外接圆包含当前插入点的“坏三角形”
      for (let j = 0; j < triangles.length; j++) {
        const t = triangles[j];
        const cc = circumcircle(t[0], t[1], t[2]);
        if (!cc) continue;
        
        const distSq = (p.x - cc.x) * (p.x - cc.x) + (p.y - cc.y) * (p.y - cc.y);
        if (distSq < cc.rSq) {
          badTriangles.push(t);
        }
      }

      // 寻找多边形空洞的边界边 (Boundary Edges)
      let polygon = new Map();
      for (let j = 0; j < badTriangles.length; j++) {
        const t = badTriangles[j];
        const edges = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]
        ];
        
        for (let k = 0; k < 3; k++) {
          const e = edges[k];
          const edgeKey = e[0].id < e[1].id ? `${e[0].id}-${e[1].id}` : `${e[1].id}-${e[0].id}`;
          // 如果边缘共享，则它不是多边形边界，将其消除
          if (polygon.has(edgeKey)) {
            polygon.delete(edgeKey);
          } else {
            polygon.set(edgeKey, e);
          }
        }
      }

      // 移除坏三角形
      triangles = triangles.filter(t => !badTriangles.includes(t));

      // 将新节点与多边形空洞的边缘重新连接，形成新的三角形
      polygon.forEach(edge => {
        triangles.push([edge[0], edge[1], p]);
      });
    }

    // 3. 剔除包含超级三角形顶点的所有三角形
    return triangles.filter(t => {
      return t[0].id !== 'st1' && t[0].id !== 'st2' && t[0].id !== 'st3' &&
             t[1].id !== 'st1' && t[1].id !== 'st2' && t[1].id !== 'st3' &&
             t[2].id !== 'st1' && t[2].id !== 'st2' && t[2].id !== 'st3';
    });
  }

  // 渲染循环
  let time = 0;
  function step() {
    if (!props.active) {
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
      return;
    }
    time += 0.02; // 时间变量：驱动网格三维起伏
    ctx.clearRect(0, 0, width, height);

    // 更新节点位置
    for (let i = 0; i < points.length; i++) {
      let p = points[i];
      p.x += p.vx;
      p.y += p.vy;
      // 空间折叠/边缘反弹
      if (p.x < -50 || p.x > width + 50) p.vx *= -1;
      if (p.y < -50 || p.y > height + 50) p.vy *= -1;
    }

    // 将鼠标作为极其活跃的动态顶点注入空间
    let currentVertices = [...points];
    if (mouse.active) currentVertices.push(mouse);

    // 实时三角剖分 (每秒计算 60 次网格拓扑)
    const triangles = triangulate(currentVertices);

    // 绘制 Low-poly 网格
    for (let i = 0; i < triangles.length; i++) {
      const [p1, p2, p3] = triangles[i];
      
      // GIS 插值思想：根据重心坐标和伪高程 Z 计算面的颜色深度
      const cx = (p1.x + p2.x + p3.x) / 3;
      const cy = (p1.y + p2.y + p3.y) / 3;
      
      // 距离计算：判断三角形距鼠标有多远，产生畸变和高亮感
      let distToMouse = mouse.active ? Math.hypot(cx - mouse.x, cy - mouse.y) : 1000;
      let hoverGlow = Math.max(0, 1 - distToMouse / 250); // 鼠标周围 250px 泛光

      // 叠加数据涟漪 (Data Ripples) 影响
      let rippleIntensity = 0;
      for (let r = 0; r < ripples.length; r++) {
        let rp = ripples[r];
        let d = Math.hypot(cx - rp.x, cy - rp.y);
        // 波环效应 (Wave ring)
        if (Math.abs(d - rp.radius) < 40) {
          rippleIntensity += rp.alpha * (1 - Math.abs(d - rp.radius) / 40);
        }
      }

      // 时间驱动的呼吸感与 Z 轴伪深度映射
      let zBase = ((p1.z || 0) + (p2.z || 0) + (p3.z || 0)) / 3;
      let wave = Math.sin(time + cx * 0.01 + cy * 0.01) * 15;
      let lightness = 8 + wave + hoverGlow * 20 + rippleIntensity * 40; 
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      
      // 极客感填充与描边 (降低透明度，避免遮挡主要内容)
      ctx.fillStyle = `hsla(190, 80%, 50%, ${0.05 + lightness * 0.002})`; // 动态低透明度
      ctx.fill();
      
      ctx.strokeStyle = `hsla(180, 100%, 60%, ${0.1 + hoverGlow * 0.2})`; // 发光网格线
      ctx.lineWidth = 0.5 + hoverGlow * 1.5;
      ctx.stroke();
    }

    // 更新和渲染数据涟漪
    for (let i = ripples.length - 1; i >= 0; i--) {
      let r = ripples[i];
      r.radius += 8; // 扩散速度
      r.alpha -= 0.015; // 衰减
      if (r.alpha <= 0) {
        ripples.splice(i, 1);
      }
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

  function handleClick(e) {
    // 触发数据涟漪 (Data Ripple)
    ripples.push({
      x: e.clientX,
      y: e.clientY,
      radius: 0,
      alpha: 1.0
    });
  }

  function handleResize() {
    initGrid();
  }

  function init() {
    initGrid();
    initPoints();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('click', handleClick);
    window.addEventListener('resize', handleResize);
    step();
  }

  function destroy() {
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseleave', handleMouseLeave);
    window.removeEventListener('click', handleClick);
    window.removeEventListener('resize', handleResize);
    if (animationId) cancelAnimationFrame(animationId);
  }

  return { init, destroy, step };
}