<template>
  <canvas ref="canvas" class="magic-cursor-canvas" :class="{ active: active }"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  }
});

const canvas = ref(null);
let ctx = null;
let particles = [];
let animationId = null;
let mouse = { x: 0, y: 0 };

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = Math.random() * 5 + 1;
    this.speedX = Math.random() * 3 - 1.5;
    this.speedY = Math.random() * 3 - 1.5;
    this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (this.size > 0.2) this.size -= 0.1;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function handleMouseMove(e) {
  if (!props.active) return;
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  for (let i = 0; i < 5; i++) {
    particles.push(new Particle(mouse.x, mouse.y));
  }
}

function animate() {
  if (!ctx || !canvas.value) return;
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  
  for (let i = 0; i < particles.length; i++) {
    particles[i].update();
    particles[i].draw();
    
    if (particles[i].size <= 0.2) {
      particles.splice(i, 1);
      i--;
    }
  }
  
  if (props.active || particles.length > 0) {
    animationId = requestAnimationFrame(animate);
  }
}

function resize() {
  if (canvas.value) {
    canvas.value.width = window.innerWidth;
    canvas.value.height = window.innerHeight;
  }
}

watch(() => props.active, (newVal) => {
  if (newVal) {
    resize();
    animate();
  }
});

onMounted(() => {
  if (canvas.value) {
    ctx = canvas.value.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    
    if (props.active) {
      animate();
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  window.removeEventListener('mousemove', handleMouseMove);
  cancelAnimationFrame(animationId);
});
</script>

<style scoped>
.magic-cursor-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 9999;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.magic-cursor-canvas.active {
  opacity: 1;
}
</style>
