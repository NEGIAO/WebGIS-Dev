<template>
  <div class="space-container">
    <!-- 空间背景：绿能网格 & 极光绿光晕 -->
    <div class="cyber-grid"></div>
    <div class="neon-glow forest-glow"></div>
    <div class="neon-glow mint-glow"></div>

    <!-- 动态微小粒子 -->
    <div class="particles">
      <span v-for="n in 15" :key="n" :class="`particle-${n}`"></span>
    </div>

    <!-- 磨砂玻璃容器 -->
    <div class="glass-card">
      <div class="card-header">
        <span class="system-status">SYSTEM_ERROR_404</span>
        <span class="radar-ping"></span>
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
        <svg class="progress-ring" width="100" height="100">
          <circle
            class="progress-ring__bg"
            stroke="rgba(0, 255, 102, 0.05)"
            stroke-width="5"
            fill="transparent"
            r="42"
            cx="50"
            cy="50"
          />
          <circle
            class="progress-ring__bar"
            :style="{ strokeDashoffset: strokeDashoffset }"
            stroke="url(#cyberGradient)"
            stroke-width="5"
            fill="transparent"
            r="42"
            cx="50"
            cy="50"
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
          <span class="countdown-label">S</span>
        </div>
      </div>
      <div class="auto-redirect-tip">系统将在倒计时结束后重构星际链接</div>

      <!-- 绿色高科技操控按钮 -->
      <button class="back-button" @click="goHome">
        <span class="btn-text">立即折跃回首页</span>
        <span class="btn-border"></span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const countdown = ref(5);
const totalCountdown = 5;
let timer = null;

// 计算 SVG 环形进度条的 stroke-dashoffset
// 半径 r = 42, 周长 = 2 * Math.PI * 42 ≈ 263.89
const circumference = 2 * Math.PI * 42;

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
}

.mint-glow {
  width: 450px;
  height: 450px;
  background: #00ff66; /* 亮荧光绿 */
  bottom: -100px;
  right: -50px;
}

/* 玻璃卡片 */
.glass-card {
  position: relative;
  text-align: center;
  z-index: 10;
  background: rgba(8, 18, 11, 0.75); /* 微绿透明背景 */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  padding: 3.5rem 3rem;
  border-radius: 24px;
  border: 1px solid rgba(25, 137, 70, 0.685); /* 绿色边框线 */
  box-shadow: 
    0 25px 50px -12px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  max-width: 480px;
  width: 90%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 状态页眉 */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 1.5rem;
}

.system-status {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: #00ff66;
  text-shadow: 0 0 10px rgba(0, 255, 102, 0.4);
}

.radar-ping {
  width: 8px;
  height: 8px;
  background-color: #00ff66;
  border-radius: 50%;
  box-shadow: 0 0 0 0 rgba(0, 255, 102, 0.7);
  animation: ping 1.5s infinite ease-in-out;
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
  width: 100px;
  height: 100px;
  margin-bottom: 0.8rem;
}

.progress-ring {
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

.progress-ring__bar {
  stroke-dasharray: 263.89; /* 2 * PI * r */
  transition: stroke-dashoffset 1s linear;
  filter: drop-shadow(0 0 5px rgba(0, 255, 102, 0.6));
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
  font-size: 2rem;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}

.countdown-label {
  font-size: 0.65rem;
  color: rgba(0, 255, 102, 0.6);
  font-weight: 700;
  letter-spacing: 1px;
  margin-top: 2px;
}

.auto-redirect-tip {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 2.5rem;
  letter-spacing: 0.5px;
}

/* 操控按钮 */
.back-button {
  position: relative;
  padding: 14px 40px;
  background: transparent;
  border: none;
  cursor: pointer;
  outline: none;
  overflow: hidden;
  border-radius: 8px;
  transition: all 0.3s;
}

.btn-text {
  position: relative;
  z-index: 2;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  transition: color 0.3s;
}

/* 利用绿色渐变外壳 */
.back-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #00ff66 0%, #059669 100%);
  z-index: 1;
  transition: opacity 0.3s;
  border-radius: 8px;
}

.back-button::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  right: 1px;
  bottom: 1px;
  background: #08120b; /* 内嵌深绿黑色底 */
  z-index: 1;
  border-radius: 7px;
  transition: background 0.3s;
}

/* 悬停与激活状态 */
.back-button:hover::before {
  opacity: 0.9;
}

.back-button:hover::after {
  background: rgba(0, 255, 102, 0.05);
}

.back-button:hover {
  box-shadow: 0 0 25px rgba(0, 255, 102, 0.4);
  transform: translateY(-2px);
}

.back-button:active {
  transform: translateY(0);
}

/* 漂移绿色微尘 */
.particles span {
  position: absolute;
  background: rgba(0, 255, 102, 0.15);
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.particle-1  { width: 4px; height: 4px; left: 10%; top: 20%; animation: floatUp 8s infinite linear; }
.particle-2  { width: 6px; height: 6px; left: 25%; top: 80%; animation: floatUp 12s infinite linear; background: rgba(0, 255, 102, 0.2); }
.particle-3  { width: 3px; height: 3px; left: 85%; top: 15%; animation: floatUp 10s infinite linear; }
.particle-4  { width: 5px; height: 5px; left: 70%; top: 75%; animation: floatUp 15s infinite linear; background: rgba(5, 150, 105, 0.2); }
.particle-5  { width: 2px; height: 2px; left: 50%; top: 40%; animation: floatUp 7s infinite linear; }
.particle-6  { width: 4px; height: 4px; left: 35%; top: 10%; animation: floatUp 9s infinite linear; }
.particle-7  { width: 5px; height: 5px; left: 90%; top: 60%; animation: floatUp 14s infinite linear; }
.particle-8  { width: 3px; height: 3px; left: 15%; top: 50%; animation: floatUp 11s infinite linear; }
.particle-9  { width: 6px; height: 6px; left: 45%; top: 85%; animation: floatUp 13s infinite linear; background: rgba(0, 255, 102, 0.15); }
.particle-10 { width: 2px; height: 2px; left: 60%; top: 25%; animation: floatUp 6s infinite linear; }
.particle-11 { width: 4px; height: 4px; left: 80%; top: 45%; animation: floatUp 10s infinite linear; }
.particle-12 { width: 5px; height: 5px; left: 5%;  top: 90%; animation: floatUp 12s infinite linear; background: rgba(5, 150, 105, 0.15); }
.particle-13 { width: 3px; height: 3px; left: 95%; top: 30%; animation: floatUp 8s infinite linear; }
.particle-14 { width: 4px; height: 4px; left: 55%; top: 65%; animation: floatUp 14s infinite linear; }
.particle-15 { width: 2px; height: 2px; left: 30%; top: 55%; animation: floatUp 7s infinite linear; }

/* 动画定义 */
@keyframes ping {
  75%, 100% {
    transform: scale(3);
    opacity: 0;
  }
}

@keyframes floatUp {
  0% {
    transform: translateY(0) rotate(0deg);
    opacity: 0;
  }
  10% {
    opacity: 0.8;
  }
  90% {
    opacity: 0.8;
  }
  100% {
    transform: translateY(-100px) rotate(360deg);
    opacity: 0;
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
    padding: 2.5rem 1.5rem;
  }

  .glitch {
    font-size: 5rem;
  }

  .error-title {
    font-size: 1.3rem;
  }

  .error-message {
    font-size: 0.85rem;
    margin-bottom: 2rem;
  }

  .back-button {
    padding: 12px 30px;
    font-size: 0.85rem;
  }
}
</style>