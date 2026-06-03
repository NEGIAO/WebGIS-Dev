/**
 * useRingExplosion.js
 * Apple Watch 风格圆环粒子迸溅特效
 *
 * 参考 Three.js Shader 效果，用 Canvas 2D 实现：
 * - 圆环朦胧渐变（smoothstep）
 * - 粒子颜色渐变（白→黄→橙→粉）
 * - 粒子轨迹弧形偏转（旋转感）
 */

const POOL_SIZE = 500;
const TWO_PI = Math.PI * 2;

// 圆环配置
const RING_RADIUS = 120;
const RING_WIDTH = 25; // 朦胧宽度
const RING_ROTATE_SPEED = 1.5; // 圆环旋转角速度 (rad/s)

// 粒子配置
const PARTICLES_PER_FRAME = 5;
const LIFE_SPAN = 1.8; // 粒子寿命
const RADIAL_SPEED_MIN = 80; // 径向速度
const RADIAL_SPEED_MAX = 200;
const GRAVITY = 60;

export function useRingExplosion(canvasRef, props) {
    let ctx = null;
    let width = 0;
    let height = 0;
    let animationId = null;
    let time = 0;

    // 鼠标交互状态
    const mouse = {
        x: 0,
        y: 0,
        targetX: 0,
        targetY: 0,
        isDown: false,
        isHovering: false,
        hoverFactor: 0, // 悬停渐变因子 [0, 1]
        clickTime: 0,
        dragAngle: 0,
        prevAngle: 0,
        angularVelocity: 0,
    };

    // 粒子池
    const px = new Float32Array(POOL_SIZE);
    const py = new Float32Array(POOL_SIZE);
    const vx = new Float32Array(POOL_SIZE);
    const vy = new Float32Array(POOL_SIZE);
    const birthTime = new Float32Array(POOL_SIZE); // 出生时间
    const active = new Uint8Array(POOL_SIZE);

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    // 生成粒子（螺旋轨迹：径向向外 + 切向旋转）
    function spawnParticle(burst = false) {
        let idx = -1;
        for (let i = 0; i < POOL_SIZE; i++) {
            if (!active[i]) { idx = i; break; }
        }
        if (idx === -1) return;

        const angle = Math.random() * TWO_PI;
        const cx = mouse.x;
        const cy = mouse.y;

        // 初始位置：圆环表面
        px[idx] = cx + Math.cos(angle) * RING_RADIUS;
        py[idx] = cy + Math.sin(angle) * RING_RADIUS;

        // 径向速度（向外）- 点击爆发时速度加倍
        const speedMultiplier = burst ? 2.5 : 1.0;
        const radialSpeed = rand(RADIAL_SPEED_MIN, RADIAL_SPEED_MAX) * speedMultiplier;

        // 切向速度（继承圆环旋转 + 鼠标拖拽角速度）
        const totalAngularSpeed = RING_ROTATE_SPEED + mouse.angularVelocity * 0.5;
        const tangentSpeed = totalAngularSpeed * RING_RADIUS;

        // 合成速度 = 径向 + 切向（垂直于半径方向）
        vx[idx] = Math.cos(angle) * radialSpeed + Math.cos(angle + Math.PI / 2) * tangentSpeed;
        vy[idx] = Math.sin(angle) * radialSpeed + Math.sin(angle + Math.PI / 2) * tangentSpeed;

        // 点击爆发时添加随机扰动
        if (burst) {
            vx[idx] += rand(-50, 50);
            vy[idx] += rand(-80, -20); // 向上偏移
        }

        birthTime[idx] = time;
        active[idx] = 1;
    }

    // 绘制朦胧圆环
    function drawRing(cx, cy) {
        // 悬停增强系数（基于渐变因子平滑插值）
        const hoverBoost = 1.0 + mouse.hoverFactor * 0.4; // 1.0 → 1.4
        // 点击脉冲效果
        const clickPulse = mouse.isDown ? 1.0 + Math.sin(time * 15) * 0.3 : 1.0;
        const intensity = hoverBoost * clickPulse;

        // 颜色插值：粉色(340°) → 蓝色(200°)
        const hue = 340 - mouse.hoverFactor * 140; // 340 → 200
        const saturation = 60 + mouse.hoverFactor * 20; // 60 → 80
        const lightness = 70 + mouse.hoverFactor * 5; // 70 → 75

        // 旋转光纹速度插值
        const rotateSpeed = 3 + mouse.hoverFactor * 2; // 3 → 5

        // 多层渐变实现朦胧感
        const layers = 20;
        for (let i = 0; i < layers; i++) {
            const t = i / layers; // [0, 1]
            const radius = RING_RADIUS - RING_WIDTH * 0.5 + t * RING_WIDTH;

            // smoothstep 透明度：中心最亮，边缘渐隐
            const dist = Math.abs(t - 0.5) * 2; // [0, 1]，0.5 是中心
            const alpha = 1.0 - smoothstep(0.0, 1.0, dist);
            const finalAlpha = alpha * alpha * 0.4 * intensity;

            // 旋转光纹
            const pattern = Math.sin(t * 20 + time * rotateSpeed) * 0.15 + 0.85;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, TWO_PI);
            ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${finalAlpha * pattern})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 核心高亮环 - 颜色渐变
        ctx.beginPath();
        ctx.arc(cx, cy, RING_RADIUS, 0, TWO_PI);
        const coreGradient = ctx.createRadialGradient(
            cx, cy, RING_RADIUS - 3,
            cx, cy, RING_RADIUS + 3
        );
        const coreAlpha = 0.6 * intensity;
        // 核心颜色也跟随渐变：粉白 → 蓝白
        const coreR = Math.round(255 - mouse.hoverFactor * 55); // 255 → 200
        const coreG = Math.round(240 - mouse.hoverFactor * 20); // 240 → 220
        const coreB = Math.round(250 + mouse.hoverFactor * 5);  // 250 → 255
        coreGradient.addColorStop(0, `rgba(${coreR}, ${coreG}, ${coreB}, 0)`);
        coreGradient.addColorStop(0.5, `rgba(${coreR}, ${coreG}, ${coreB}, ${coreAlpha})`);
        coreGradient.addColorStop(1, `rgba(${coreR}, ${coreG}, ${coreB}, 0)`);
        ctx.strokeStyle = coreGradient;
        ctx.lineWidth = 6 * (mouse.isDown ? 1.3 : 1.0);
        ctx.stroke();

        // 外圈光晕（基于渐变因子，非突变）
        if (mouse.hoverFactor > 0.01) {
            ctx.beginPath();
            ctx.arc(cx, cy, RING_RADIUS + 15, 0, TWO_PI);
            const outerGlow = ctx.createRadialGradient(
                cx, cy, RING_RADIUS,
                cx, cy, RING_RADIUS + 30
            );
            const glowAlpha = 0.3 * mouse.hoverFactor;
            outerGlow.addColorStop(0, `rgba(100, 180, 255, ${glowAlpha})`);
            outerGlow.addColorStop(1, 'rgba(100, 180, 255, 0)');
            ctx.strokeStyle = outerGlow;
            ctx.lineWidth = 15 * mouse.hoverFactor;
            ctx.stroke();
        }
    }

    // smoothstep 函数
    function smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // 获取粒子颜色（根据生命周期渐变）
    function getParticleColor(t) {
        // 白 → 黄 → 橙 → 粉
        let r, g, b;

        if (t < 0.1) {
            // 白 → 黄
            const s = t / 0.1;
            r = 1.0;
            g = 1.0 - s * 0.1; // 1.0 → 0.9
            b = 0.9 - s * 0.7; // 0.9 → 0.2
        } else if (t < 0.4) {
            // 黄 → 橙
            const s = (t - 0.1) / 0.3;
            r = 1.0;
            g = 0.9 - s * 0.3; // 0.9 → 0.6
            b = 0.2 - s * 0.2; // 0.2 → 0.0
        } else {
            // 橙 → 粉
            const s = (t - 0.4) / 0.6;
            r = 1.0;
            g = 0.6 - s * 0.4; // 0.6 → 0.2
            b = s * 0.5;       // 0.0 → 0.5
        }

        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    // 绘制粒子
    function drawParticle(i) {
        const age = time - birthTime[i];
        const t = age / LIFE_SPAN; // 归一化时间 [0, 1]

        if (t > 1) {
            active[i] = 0;
            return;
        }

        // 透明度：逐渐消失
        const alpha = 1.0 - t * t * t; // 立方衰减

        // 大小：逐渐变小
        const size = mix(4, 0, t * t);

        // 颜色渐变
        const color = getParticleColor(t);

        // 光晕
        const haloSize = size * 4;
        ctx.beginPath();
        ctx.arc(px[i], py[i], haloSize, 0, TWO_PI);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.15})`;
        ctx.fill();

        // 核心光点
        ctx.beginPath();
        ctx.arc(px[i], py[i], size, 0, TWO_PI);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
        ctx.fill();

        // 拉伸线条（速度方向）
        const speed = Math.hypot(vx[i], vy[i]);
        const streakLen = Math.min(speed * 0.04, 12) * (1 - t);
        const norm = speed || 1;
        const nx = vx[i] / norm;
        const ny = vy[i] / norm;

        ctx.beginPath();
        ctx.moveTo(px[i] - nx * streakLen, py[i] - ny * streakLen);
        ctx.lineTo(px[i], py[i]);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.8})`;
        ctx.lineWidth = size * 0.8;
        ctx.lineCap = 'round';
        ctx.stroke();
    }

    // mix 函数
    function mix(a, b, t) {
        return a + (b - a) * t;
    }

    // 主循环
    function step() {
        if (!props.active || !ctx) {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            return;
        }

        if (animationId) cancelAnimationFrame(animationId);

        const dt = 0.016; // 固定时间步长
        time += dt;

        // 鼠标平滑跟随（缓动插值）
        const followSpeed = 0.08;
        mouse.x += (mouse.targetX - mouse.x) * followSpeed;
        mouse.y += (mouse.targetY - mouse.y) * followSpeed;

        // 悬停渐变因子平滑过渡
        const hoverTarget = mouse.isHovering ? 1 : 0;
        const hoverSpeed = mouse.isHovering ? 0.06 : 0.04; // 进入快，退出慢
        mouse.hoverFactor += (hoverTarget - mouse.hoverFactor) * hoverSpeed;
        // 钳位避免浮点误差
        if (mouse.hoverFactor < 0.01) mouse.hoverFactor = 0;
        if (mouse.hoverFactor > 0.99) mouse.hoverFactor = 1;

        // 计算鼠标拖拽角速度
        const currentAngle = Math.atan2(mouse.y - height / 2, mouse.x - width / 2);
        if (mouse.isDown) {
            let angleDiff = currentAngle - mouse.prevAngle;
            // 处理角度跨越 ±PI 的情况
            if (angleDiff > Math.PI) angleDiff -= TWO_PI;
            if (angleDiff < -Math.PI) angleDiff += TWO_PI;
            mouse.angularVelocity = angleDiff / dt;
        } else {
            mouse.angularVelocity *= 0.95; // 衰减
        }
        mouse.prevAngle = currentAngle;

        // 残影衰减
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(0, 0, width, height);

        // 发光叠加
        ctx.globalCompositeOperation = 'lighter';

        // 绘制圆环
        drawRing(mouse.x, mouse.y);

        // 生成新粒子
        const particlesPerFrame = mouse.isDown ? PARTICLES_PER_FRAME * 3 : PARTICLES_PER_FRAME;
        for (let i = 0; i < particlesPerFrame; i++) {
            spawnParticle(mouse.isDown);
        }

        // 更新并绘制粒子
        for (let i = 0; i < POOL_SIZE; i++) {
            if (!active[i]) continue;

            // 重力
            vy[i] += GRAVITY * dt;

            // 位置更新（螺旋轨迹由初始切向速度自然形成）
            px[i] += vx[i] * dt;
            py[i] += vy[i] * dt;

            drawParticle(i);
        }

        animationId = requestAnimationFrame(step);
    }

    // Canvas 管理
    function initCanvas() {
        const canvas = canvasRef.value;
        if (!canvas) return;
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext('2d', { alpha: true });

        // 初始化鼠标位置到中心
        mouse.x = width / 2;
        mouse.y = height / 2;
        mouse.targetX = width / 2;
        mouse.targetY = height / 2;
    }

    // 鼠标事件处理
    function handleMouseMove(e) {
        mouse.targetX = e.clientX;
        mouse.targetY = e.clientY;

        // 检测是否悬停在圆环上
        const dx = e.clientX - mouse.x;
        const dy = e.clientY - mouse.y;
        const dist = Math.hypot(dx, dy);
        mouse.isHovering = dist < RING_RADIUS + 30;
    }

    function handleMouseDown() {
        mouse.isDown = true;
        mouse.clickTime = time;

        // 点击时爆发粒子
        const burstCount = 30;
        for (let i = 0; i < burstCount; i++) {
            spawnParticle(true);
        }
    }

    function handleMouseUp() {
        mouse.isDown = false;
    }

    function handleResize() {
        initCanvas();
    }

    // 生命周期
    function init() {
        initCanvas();

        // 注册事件监听
        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);

        time = 0;
        active.fill(0);
        step();
    }

    function destroy() {
        // 移除事件监听
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);

        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        ctx = null;
        active.fill(0);
    }

    return { init, destroy, step, mouse };
}
