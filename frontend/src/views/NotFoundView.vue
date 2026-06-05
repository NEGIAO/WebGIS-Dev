<template>
  <div class="space-container">
    <!-- 空间背景：绿能网格 & 极光绿光晕 -->
    <div class="cyber-grid"></div>
    <div class="scan-line"></div>
    <div class="neon-glow forest-glow"></div>
    <div class="neon-glow mint-glow"></div>

    <!-- 动态微小粒子 -->
    <div class="particles">
      <span v-for="n in 25" :key="n" :class="`particle-${n}`"></span>
    </div>

    <!-- 磨砂玻璃容器 -->
    <div class="glass-card">
      <div class="card-header">
        <span class="system-status">SYSTEM_ERROR_404</span>
        <span class="status-dot"></span>
        <span class="radar-ping"></span>
      </div>

      <!-- 数据装饰行 -->
      <div class="data-decor">
        <span class="data-tag">ERR_CODE: 404</span>
        <span class="data-tag">PATH: {{ currentPath }}</span>
      </div>

      <!-- 绿色系赛博抖动效果的 404 -->
      <div class="glitch-wrapper">
        <div class="glitch" data-text="404">404</div>
      </div>

      <h1 class="error-title">目标星轨丢失</h1>
      <p class="error-message">
        抱歉，您请求的宇宙坐标未注册，或已被虫洞吞噬。
      </p>

      <!-- 环形倒计时进度 -->
      <div class="countdown-wrapper">
        <svg class="progress-ring" width="120" height="120">
          <circle
            class="progress-ring__bg"
            stroke="rgba(0, 255, 102, 0.05)"
            stroke-width="4"
            fill="transparent"
            r="52"
            cx="60"
            cy="60"
          />
          <circle
            class="progress-ring__bar"
            :style="{ strokeDashoffset: strokeDashoffset }"
            stroke="url(#cyberGradient)"
            stroke-width="4"
            fill="transparent"
            r="52"
            cx="60"
            cy="60"
          />
          <!-- 装饰性外圈 -->
          <circle
            class="progress-ring__outer"
            stroke="rgba(0, 255, 102, 0.1)"
            stroke-width="1"
            fill="transparent"
            r="58"
            cx="60"
            cy="60"
            stroke-dasharray="4 8"
          />
          <defs>
            <linearGradient id="cyberGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00ff66" />
              <stop offset="100%" stop-color="#059669" />
            </linearGradient>
          </defs>
        </svg>
        <div class="countdown-inner">
          <span class="countdown-num">{{ countdown }}</span>
          <span class="countdown-label">SEC</span>
        </div>
      </div>
      <div class="auto-redirect-tip">
        <span class="tip-icon">◈</span>
        系统将在倒计时结束后重构星际链接
      </div>

      <!-- 绿色高科技操控按钮 -->
      <button class="back-button" @click="goHome">
        <span class="btn-text">立即折跃回首页</span>
        <span class="btn-glow"></span>
      </button>

      <!-- 底部数据流装饰 -->
      <div class="data-stream">
        <span v-for="n in 8" :key="n" class="stream-bit">{{ Math.random() > 0.5 ? '1' : '0' }}</span>
      </div>
    </div>

    <!-- 角落装饰元素 -->
    <div class="corner-decor top-left">
      <span class="corner-line"></span>
      <span class="corner-line"></span>
    </div>
    <div class="corner-decor top-right">
      <span class="corner-line"></span>
      <span class="corner-line"></span>
    </div>
    <div class="corner-decor bottom-left">
      <span class="corner-line"></span>
      <span class="corner-line"></span>
    </div>
    <div class="corner-decor bottom-right">
      <span class="corner-line"></span>
      <span class="corner-line"></span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
const countdown = ref(5);
const totalCountdown = 5;
let timer = null;

// 获取当前路径用于显示
const currentPath = computed(() => route.fullPath || '/unknown');

// 计算 SVG 环形进度条的 stroke-dashoffset
// 半径 r = 52, 周长 = 2 * Math.PI * 52 ≈ 326.73
const circumference = 2 * Math.PI * 52;

const strokeDashoffset = computed(() => {
  const ratio = countdown.value / totalCountdown;
  return circumference * (1 - ratio);
});

// 返回首页
function goHome() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  router.push('/');
}

// 启动倒计时
onMounted(() => {
  timer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(timer);
      timer = null;
      router.push('/');
    }
  }, 1000);
});

// 清理定时器
onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<style scoped>
/* 核心容器 */
.space-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #030804; /* 更偏向黑绿色的暗底 */
  font-family: 'Consolas', 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
  position: relative;
  color: #fff;
}

/* 绿色霓虹背景光晕与网格 */
.cyber-grid {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image:
    linear-gradient(rgba(0, 255, 102, 0.015) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 102, 0.015) 1px, transparent 1px);
  background-size: 50px 50px;
  background-position: center;
  z-index: 1;
}

/* CRT 扫描线效果 */
.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 255, 102, 0.015) 2px,
    rgba(0, 255, 102, 0.015) 4px
  );
  z-index: 2;
  pointer-events: none;
  animation: scanMove 8s linear infinite;
}

.neon-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(140px);
  opacity: 0.25;
  z-index: 1;
  pointer-events: none;
}

.forest-glow {
  width: 500px;
  height: 500px;
  background: #047857; /* 深翠绿 */
  top: -100px;
  left: -50px;
  animation: glowPulse 4s ease-in-out infinite alternate;
}

.mint-glow {
  width: 450px;
  height: 450px;
  background: #00ff66; /* 亮荧光绿 */
  bottom: -100px;
  right: -50px;
  animation: glowPulse 5s ease-in-out infinite alternate-reverse;
}

/* 玻璃卡片 */
.glass-card {
  position: relative;
  text-align: center;
  z-index: 10;
  background: rgba(8, 18, 11, 0.85); /* 微绿透明背景 */
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 3rem 2.5rem;
  border-radius: 20px;
  border: 1px solid rgba(25, 137, 70, 0.5); /* 绿色边框线 */
  box-shadow:
    0 25px 50px -12px rgba(0, 0, 0, 0.7),
    0 0 80px rgba(0, 255, 102, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  max-width: 460px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 状态页眉 */
.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 1.2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(0, 255, 102, 0.1);
  width: 100%;
  justify-content: center;
}

.system-status {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 3px;
  color: #00ff66;
  text-shadow: 0 0 10px rgba(0, 255, 102, 0.4);
}

.status-dot {
  width: 6px;
  height: 6px;
  background: #00ff66;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 255, 102, 0.6);
}

.radar-ping {
  width: 8px;
  height: 8px;
  background-color: #00ff66;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(0, 255, 102, 0.7);
  animation: ping 1.5s infinite ease-in-out;
}

/* 数据装饰行 */
.data-decor {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.data-tag {
  font-size: 0.65rem;
  color: rgba(0, 255, 102, 0.5);
  background: rgba(0, 255, 102, 0.05);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(0, 255, 102, 0.1);
  letter-spacing: 1px;
  font-family: 'Consolas', monospace;
}

/* 绿色抖动字体特效 */
.glitch-wrapper {
  margin-bottom: 1rem;
}

.glitch {
  font-size: 6.5rem;
  font-weight: 900;
  line-height: 1;
  position: relative;
  letter-spacing: -2px;
  color: #fff;
  /* 使用绿色、青色、青柠色做色差阴影 */
  text-shadow: 0.05em 0 0 rgba(0, 255, 102, 0.75),
    -0.025em -0.05em 0 rgba(5, 150, 105, 0.75),
    0.025em 0.05em 0 rgba(204, 255, 0, 0.75);
  animation: glitch-anim 2.5s infinite;
}

.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.8;
}

.glitch::before {
  animation: glitch-skew 1.5s infinite linear alternate-reverse;
  clip-path: polygon(0 0, 100% 0, 100% 43%, 0 43%);
  text-shadow: -3px 0 #00ff66;
}

.glitch::after {
  animation: glitch-skew 2s infinite linear alternate-reverse;
  clip-path: polygon(0 50%, 100% 50%, 100% 100%, 0 100%);
  text-shadow: 3px 0 #059669;
}

.error-title {
  font-size: 1.6rem;
  color: #fff;
  margin-bottom: 0.8rem;
  font-weight: 600;
  letter-spacing: 1px;
}

.error-message {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 2.5rem;
  line-height: 1.6;
}

/* 环形倒计时 */
.countdown-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  margin-bottom: 1rem;
}

.progress-ring {
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

.progress-ring__bar {
  stroke-dasharray: 326.73; /* 2 * PI * r */
  transition: stroke-dashoffset 1s linear;
  filter: drop-shadow(0 0 6px rgba(0, 255, 102, 0.5));
}

.progress-ring__outer {
  animation: rotateRing 20s linear infinite;
}

.countdown-inner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.countdown-num {
  font-size: 2.2rem;
  font-weight: 900;
  color: #fff;
  line-height: 1;
  text-shadow: 0 0 20px rgba(0, 255, 102, 0.3);
}

.countdown-label {
  font-size: 0.6rem;
  color: rgba(0, 255, 102, 0.5);
  font-weight: 700;
  letter-spacing: 2px;
  margin-top: 4px;
}

.auto-redirect-tip {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 2rem;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tip-icon {
  color: rgba(0, 255, 102, 0.4);
  font-size: 0.6rem;
}

/* 底部数据流装饰 */
.data-stream {
  display: flex;
  gap: 6px;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 255, 102, 0.08);
  width: 100%;
  justify-content: center;
}

.stream-bit {
  font-size: 0.6rem;
  color: rgba(0, 255, 102, 0.2);
  font-family: 'Consolas', monospace;
  animation: dataFlicker 2s infinite;
}

.stream-bit:nth-child(odd) {
  animation-delay: 0.5s;
}

/* 角落装饰元素 */
.corner-decor {
  position: absolute;
  width: 30px;
  height: 30px;
  z-index: 5;
  pointer-events: none;
}

.corner-decor.top-left {
  top: 20px;
  left: 20px;
}

.corner-decor.top-right {
  top: 20px;
  right: 20px;
  transform: rotate(90deg);
}

.corner-decor.bottom-left {
  bottom: 20px;
  left: 20px;
  transform: rotate(-90deg);
}

.corner-decor.bottom-right {
  bottom: 20px;
  right: 20px;
  transform: rotate(180deg);
}

.corner-line {
  position: absolute;
  background: rgba(0, 255, 102, 0.3);
}

.corner-line:first-child {
  width: 100%;
  height: 1px;
  top: 0;
  left: 0;
}

.corner-line:last-child {
  width: 1px;
  height: 100%;
  top: 0;
  left: 0;
}

/* 操控按钮 */
.back-button {
  position: relative;
  padding: 14px 44px;
  background: transparent;
  border: 1px solid rgba(0, 255, 102, 0.4);
  cursor: pointer;
  outline: none;
  overflow: hidden;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.btn-text {
  position: relative;
  z-index: 2;
  color: #00ff66;
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 2px;
  transition: all 0.3s ease;
}

.btn-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(0, 255, 102, 0.1);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: all 0.4s ease;
  z-index: 1;
}

/* 悬停与激活状态 */
.back-button:hover {
  border-color: rgba(0, 255, 102, 0.8);
  box-shadow: 0 0 30px rgba(0, 255, 102, 0.25), inset 0 0 20px rgba(0, 255, 102, 0.05);
  transform: translateY(-2px);
}

.back-button:hover .btn-text {
  color: #fff;
  text-shadow: 0 0 10px rgba(0, 255, 102, 0.5);
}

.back-button:hover .btn-glow {
  width: 300px;
  height: 300px;
}

.back-button:active {
  transform: translateY(0);
  box-shadow: 0 0 15px rgba(0, 255, 102, 0.3);
}

/* 漂移绿色微尘 */
.particles span {
  position: absolute;
  background: rgba(0, 255, 102, 0.12);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.particle-1  { width: 3px; height: 3px; left: 8%;  top: 15%; animation: floatUp 9s infinite linear; }
.particle-2  { width: 5px; height: 5px; left: 22%; top: 78%; animation: floatUp 13s infinite linear; background: rgba(0, 255, 102, 0.18); }
.particle-3  { width: 2px; height: 2px; left: 88%; top: 12%; animation: floatUp 11s infinite linear; }
.particle-4  { width: 4px; height: 4px; left: 72%; top: 82%; animation: floatUp 16s infinite linear; background: rgba(5, 150, 105, 0.18); }
.particle-5  { width: 2px; height: 2px; left: 48%; top: 38%; animation: floatUp 8s infinite linear; }
.particle-6  { width: 3px; height: 3px; left: 32%; top: 8%;  animation: floatUp 10s infinite linear; }
.particle-7  { width: 4px; height: 4px; left: 92%; top: 58%; animation: floatUp 15s infinite linear; }
.particle-8  { width: 2px; height: 2px; left: 12%; top: 48%; animation: floatUp 12s infinite linear; }
.particle-9  { width: 5px; height: 5px; left: 42%; top: 88%; animation: floatUp 14s infinite linear; background: rgba(0, 255, 102, 0.12); }
.particle-10 { width: 2px; height: 2px; left: 62%; top: 22%; animation: floatUp 7s infinite linear; }
.particle-11 { width: 3px; height: 3px; left: 82%; top: 42%; animation: floatUp 11s infinite linear; }
.particle-12 { width: 4px; height: 4px; left: 3%;  top: 92%; animation: floatUp 13s infinite linear; background: rgba(5, 150, 105, 0.12); }
.particle-13 { width: 2px; height: 2px; left: 96%; top: 28%; animation: floatUp 9s infinite linear; }
.particle-14 { width: 3px; height: 3px; left: 58%; top: 68%; animation: floatUp 15s infinite linear; }
.particle-15 { width: 2px; height: 2px; left: 28%; top: 52%; animation: floatUp 8s infinite linear; }
.particle-16 { width: 4px; height: 4px; left: 75%; top: 5%;  animation: floatUp 12s infinite linear; background: rgba(0, 255, 102, 0.15); }
.particle-17 { width: 2px; height: 2px; left: 18%; top: 72%; animation: floatUp 10s infinite linear; }
.particle-18 { width: 3px; height: 3px; left: 55%; top: 95%; animation: floatUp 14s infinite linear; }
.particle-19 { width: 5px; height: 5px; left: 38%; top: 32%; animation: floatUp 16s infinite linear; background: rgba(5, 150, 105, 0.15); }
.particle-20 { width: 2px; height: 2px; left: 68%; top: 48%; animation: floatUp 7s infinite linear; }
.particle-21 { width: 3px; height: 3px; left: 5%;  top: 62%; animation: floatUp 11s infinite linear; }
.particle-22 { width: 4px; height: 4px; left: 45%; top: 18%; animation: floatUp 13s infinite linear; background: rgba(0, 255, 102, 0.1); }
.particle-23 { width: 2px; height: 2px; left: 85%; top: 75%; animation: floatUp 9s infinite linear; }
.particle-24 { width: 3px; height: 3px; left: 15%; top: 35%; animation: floatUp 15s infinite linear; }
.particle-25 { width: 2px; height: 2px; left: 52%; top: 55%; animation: floatUp 10s infinite linear; }

/* 动画定义 */
@keyframes ping {
  75%, 100% {
    transform: scale(3);
    opacity: 0;
  }
}

@keyframes floatUp {
  0% {
    transform: translateY(0) translateX(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 0.6;
  }
  50% {
    transform: translateY(-50px) translateX(15px) rotate(180deg);
  }
  90% {
    opacity: 0.6;
  }
  100% {
    transform: translateY(-120px) translateX(-10px) rotate(360deg);
    opacity: 0;
  }
}

@keyframes scanMove {
  0% {
    transform: translateY(0);
  }
  100% {
    transform: translateY(4px);
  }
}

@keyframes glowPulse {
  0% {
    opacity: 0.2;
    transform: scale(1);
  }
  100% {
    opacity: 0.3;
    transform: scale(1.05);
  }
}

@keyframes rotateRing {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dataFlicker {
  0%, 100% {
    opacity: 0.2;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes glitch-anim {
  0% {
    text-shadow: 0.05em 0 0 rgba(0, 255, 102, 0.75), -0.05em -0.025em 0 rgba(5, 150, 105, 0.75);
  }
  14% {
    text-shadow: 0.05em 0 0 rgba(0, 255, 102, 0.75), -0.05em -0.025em 0 rgba(5, 150, 105, 0.75);
  }
  15% {
    text-shadow: -0.05em -0.025em 0 rgba(0, 255, 102, 0.75), 0.025em 0.035em 0 rgba(204, 255, 0, 0.75);
  }
  49% {
    text-shadow: -0.05em -0.025em 0 rgba(0, 255, 102, 0.75), 0.025em 0.035em 0 rgba(204, 255, 0, 0.75);
  }
  50% {
    text-shadow: 0.025em 0.05em 0 rgba(0, 255, 102, 0.75), 0.05em 0 0 rgba(5, 150, 105, 0.75);
  }
  99% {
    text-shadow: 0.025em 0.05em 0 rgba(0, 255, 102, 0.75), 0.05em 0 0 rgba(5, 150, 105, 0.75);
  }
  100% {
    text-shadow: -0.025em 0 0 rgba(0, 255, 102, 0.75), -0.025em -0.025em 0 rgba(204, 255, 0, 0.75);
  }
}

@keyframes glitch-skew {
  0% { transform: skew(0deg); }
  10% { transform: skew(1deg); }
  20% { transform: skew(-2deg); }
  30% { transform: skew(3deg); }
  40% { transform: skew(-1deg); }
  50% { transform: skew(0deg); }
  100% { transform: skew(0deg); }
}

/* 移动端适配 */
@media (max-width: 600px) {
  .glass-card {
    padding: 2rem 1.5rem;
    margin: 0 10px;
  }

  .glitch {
    font-size: 4.5rem;
  }

  .error-title {
    font-size: 1.2rem;
  }

  .error-message {
    font-size: 0.82rem;
    margin-bottom: 1.8rem;
  }

  .countdown-wrapper {
    width: 100px;
    height: 100px;
  }

  .countdown-num {
    font-size: 1.8rem;
  }

  .back-button {
    padding: 12px 32px;
  }

  .btn-text {
    font-size: 0.8rem;
    letter-spacing: 1.5px;
  }

  .data-decor {
    flex-direction: column;
    gap: 0.5rem;
  }

  .corner-decor {
    display: none;
  }

  .data-stream {
    display: none;
  }
}
</style>