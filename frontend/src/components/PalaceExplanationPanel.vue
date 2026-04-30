<template>
  <transition name="panel-fade">
    <div v-if="selectedPalace && explanationData" class="palace-panel-wrapper">
      <!-- 背景装饰 -->
      <div class="panel-background">
        <div class="bg-corner top-left"></div>
        <div class="bg-corner top-right"></div>
        <div class="bg-corner bottom-left"></div>
        <div class="bg-corner bottom-right"></div>
      </div>

      <!-- 主容器 -->
      <div class="palace-explanation-panel">
        <!-- 头部：宫位名称和基础信息 -->
        <div class="panel-header">
          <div class="header-top">
            <button class="btn-close" @click="handleClose" title="关闭">✕</button>
            <h2 class="palace-name">{{ palaceName }}</h2>
            <div class="layer-badge">第 {{ selectedPalace.layerIndex + 1 }} 层</div>
          </div>
          <div class="header-divider"></div>
        </div>

        <!-- 内容区：根据不同主题展示不同的解释结构 -->
        <div class="panel-content">
          <!-- Polygon 主题特殊展示 -->
          <template v-if="themeId === 'polygon'">
            <div v-if="polygonExplanation" class="explanation-section">
              <div class="section-header">
                <span class="section-icon">◇</span>
                <h3>{{ polygonExplanation.category }}</h3>
              </div>
              <div class="section-content">
                <p class="explanation-text">{{ polygonExplanation.title }}</p>
                <p class="explanation-desc">{{ polygonExplanation.meaning }}</p>
              </div>
            </div>
          </template>

          <!-- Compass 主题展示 -->
          <template v-else-if="themeId === 'compass'">
            <div v-if="compassExplanation" class="explanation-section">
              <div class="section-header">
                <span class="section-icon">◆</span>
                <h3>{{ compassExplanation.category }}</h3>
              </div>
              <div class="section-content">
                <p class="explanation-text">{{ compassExplanation.title }}</p>
                <p class="explanation-desc">{{ compassExplanation.meaning }}</p>
              </div>
            </div>
          </template>

          <!-- Circle 主题展示 -->
          <template v-else-if="themeId === 'circle'">
            <div v-if="circleExplanation" class="explanation-section">
              <div class="section-header">
                <span class="section-icon">●</span>
                <h3>{{ circleExplanation.category }}</h3>
              </div>
              <div class="section-content">
                <p class="explanation-text">{{ circleExplanation.title }}</p>
                <p class="explanation-desc">{{ circleExplanation.meaning }}</p>
              </div>
            </div>
          </template>

          <!-- Dark 主题展示 -->
          <template v-else-if="themeId === 'dark'">
            <div v-if="darkExplanation" class="explanation-section">
              <div class="section-header">
                <span class="section-icon">⬛</span>
                <h3>{{ darkExplanation.category }}</h3>
              </div>
              <div class="section-content">
                <p class="explanation-text">{{ darkExplanation.title }}</p>
                <p class="explanation-desc">{{ darkExplanation.meaning }}</p>
              </div>
            </div>
          </template>

          <!-- Simple 主题展示 -->
          <template v-else-if="themeId === 'simple'">
            <div v-if="simpleExplanation" class="explanation-section">
              <div class="section-header">
                <span class="section-icon">▪</span>
                <h3>{{ simpleExplanation.category }}</h3>
              </div>
              <div class="section-content">
                <p class="explanation-text">{{ simpleExplanation.title }}</p>
                <p class="explanation-desc">{{ simpleExplanation.meaning }}</p>
              </div>
            </div>
          </template>
        </div>

        <!-- 底部：风水要点 -->
        <div class="panel-footer">
          <div class="footer-divider"></div>
          <div class="feng-shui-tips">
            <span class="tip-icon">✦</span>
            <span class="tip-text">点击宫位查看详细的风水解释和运势指导</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SelectedPalace } from '../stores/useCompassStore';
import { getThemeExplanationByConfig } from '../utils/themeExplanationMapper';
import { ExplanationLookup, type ExplanationResult } from '../utils/explanationLookup';

// Props
interface Props {
  selectedPalace: SelectedPalace | null;
  themeConfig?: any;
}

const props = withDefaults(defineProps<Props>(), {
  themeConfig: undefined
});

const emit = defineEmits<{
  close: [];
}>();

// 获取当前主题的解释数据
const currentThemeConfig = computed(() => {
  return getThemeExplanationByConfig(props.themeConfig);
});

// 当前主题的解释数据（JSON）
const explanationData = computed(() => {
  return currentThemeConfig.value.data;
});

// 主题标识 (用于 UI 展示)
const themeId = computed(() => {
  return currentThemeConfig.value.cid;
});

// 主题的实际 data 层（用于定位当前层级名称）
const themeDataLayers = computed(() => {
  if (props.themeConfig && Array.isArray(props.themeConfig.data)) {
    return props.themeConfig.data;
  }
  return [];
});

// 根据主题获取相应的解释
const polygonExplanation = computed(() => {
  if (!props.selectedPalace || themeId.value !== 'polygon') return null;
  return getExplanationByPalace(props.selectedPalace, themeDataLayers.value, explanationData.value);
});

const compassExplanation = computed(() => {
  if (!props.selectedPalace || themeId.value !== 'compass') return null;
  return getExplanationByPalace(props.selectedPalace, themeDataLayers.value, explanationData.value);
});

const circleExplanation = computed(() => {
  if (!props.selectedPalace || themeId.value !== 'circle') return null;
  return getExplanationByPalace(props.selectedPalace, themeDataLayers.value, explanationData.value);
});

const darkExplanation = computed(() => {
  if (!props.selectedPalace || themeId.value !== 'dark') return null;
  return getExplanationByPalace(props.selectedPalace, themeDataLayers.value, explanationData.value);
});

const simpleExplanation = computed(() => {
  if (!props.selectedPalace || themeId.value !== 'simple') return null;
  return getExplanationByPalace(props.selectedPalace, themeDataLayers.value, explanationData.value);
});

// 获取宫位名称
const palaceName = computed(() => {
  if (!props.selectedPalace) return '';
  if (typeof props.selectedPalace.data === 'string') {
    return props.selectedPalace.data;
  }
  if (Array.isArray(props.selectedPalace.data)) {
    return props.selectedPalace.data.filter(Boolean).join('') || '';
  }
  return '';
});

/**
 * 根据宫位信息从解释数据中查找对应的解释
 */
function getExplanationByPalace(palace: SelectedPalace, themeLayers: any, explanationJson: any) {
  if (!palace || !themeLayers) return null;

  const { layerIndex, segmentIndex, data } = palace;
  const palaceName = typeof data === 'string' ? data : (Array.isArray(data) ? data.filter(Boolean).join('') : '');
  const exactResult = ExplanationLookup.lookupThemeLayer(
    themeLayers,
    explanationJson,
    {
      layerIndex,
      segmentIndex,
      palaceName
    }
  );

  if (exactResult) {
    return exactResult;
  }

  return generateDefaultExplanation(palaceName, themeId.value, layerIndex);
}

/**
 * 生成默认的解释内容
 */
function generateDefaultExplanation(
  palaceName: string,
  theme: string,
  layerIndex: number
): ExplanationResult | null {
  if (!palaceName) return null;
  
  const themeDesc: Record<string, string> = {
    polygon: '多边形罗盘',
    compass: '地理专业版',
    circle: '圆规尺版',
    dark: '暗黑科技版',
    simple: '简洁版'
  };
  
  return {
    category: `${themeDesc[theme] || '未知'}-第${layerIndex + 1}层`,
    title: palaceName,
    meaning: `${palaceName}是风水罗盘的重要宫位。在${themeDesc[theme] || '当前'}中代表特定的方位和能量属性。`
  };
}


function handleClose() {
  emit('close');
}
</script>

<style scoped lang="scss">
// 颜色定义
$feng-shui-gold: #d4af37;
$feng-shui-dark: #1a1a2e;
$feng-shui-light: #f5f5dc;
$feng-shui-red: #8b0000;
$feng-shui-green: #2d5016;

// 过渡动画
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateX(100px) scale(0.95);
}

// 主容器
.palace-panel-wrapper {
  position: absolute;   /* 关键：fixed → absolute */
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  z-index: 5;
  width: 380px;
  max-height: 85vh;
  overflow: hidden;
}

// 背景装饰
.panel-background {
  position: absolute;
  inset: 0;
  pointer-events: none;

  .bg-corner {
    position: absolute;
    width: 25px;
    height: 25px;
    border: 2px solid $feng-shui-gold;

    &.top-left {
      top: 0;
      left: 0;
      border-right: none;
      border-bottom: none;
      border-radius: 8px 0 0 0;
    }

    &.top-right {
      top: 0;
      right: 0;
      border-left: none;
      border-bottom: none;
      border-radius: 0 8px 0 0;
    }

    &.bottom-left {
      bottom: 0;
      left: 0;
      border-right: none;
      border-top: none;
      border-radius: 0 0 0 8px;
    }

    &.bottom-right {
      bottom: 0;
      right: 0;
      border-left: none;
      border-top: none;
      border-radius: 0 0 8px 0;
    }
  }
}

// 主面板
.palace-explanation-panel {
  position: relative;
  z-index: 1;
  background: linear-gradient(135deg, rgba(26, 26, 46, 0.95) 0%, rgba(26, 26, 46, 0.98) 100%);
  border: 2px solid $feng-shui-gold;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5),
    inset 0 0 20px rgba(212, 175, 55, 0.1),
    0 0 40px rgba(212, 175, 55, 0.2);
  backdrop-filter: blur(10px);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

// 头部
.panel-header {
  padding: 20px 20px 15px;
  border-bottom: 1px solid rgba($feng-shui-gold, 0.3);

  .header-top {
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
    margin-bottom: 12px;
  }

  .btn-close {
    position: absolute;
    right: 0;
    top: 0;
    background: none;
    border: none;
    color: $feng-shui-gold;
    font-size: 24px;
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.3s ease;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      opacity: 1;
      transform: scale(1.2) rotate(90deg);
      color: #ffd700;
    }
  }

  .palace-name {
    flex: 1;
    margin: 0;
    font-size: 24px;
    font-weight: bold;
    color: $feng-shui-gold;
    text-shadow: 0 0 10px rgba($feng-shui-gold, 0.5);
    font-family: 'SimSun', serif;
    letter-spacing: 2px;
  }

  .layer-badge {
    background: linear-gradient(135deg, rgba($feng-shui-gold, 0.2) 0%, rgba($feng-shui-gold, 0.1) 100%);
    color: $feng-shui-gold;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid rgba($feng-shui-gold, 0.4);
        margin-right: 40px; /* 👈 只加这一行！数值可以自己调（20/30/40px） */
  }

  .header-divider {
    height: 1px;
    background: linear-gradient(90deg, rgba($feng-shui-gold, 0.3) 0%, transparent 50%, rgba($feng-shui-gold, 0.3) 100%);
  }
}

// 内容区
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba($feng-shui-gold, 0.1);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: $feng-shui-gold;
    border-radius: 3px;

    &:hover {
      background: #ffd700;
    }
  }
}

// 解释区块
.explanation-section {
  margin-bottom: 18px;
  padding: 14px;
  background: rgba($feng-shui-gold, 0.05);
  border-left: 3px solid $feng-shui-gold;
  border-radius: 6px;
  transition: all 0.3s ease;

  &:hover {
    background: rgba($feng-shui-gold, 0.08);
    box-shadow: inset 0 0 15px rgba($feng-shui-gold, 0.05);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;

    .section-icon {
      color: $feng-shui-gold;
      font-size: 14px;
      animation: pulse 2s infinite;
    }

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: $feng-shui-gold;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-family: 'SimSun', serif;
    }
  }

  .section-content {
    .explanation-text {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: $feng-shui-light;
      font-family: 'SimSun', serif;
    }

    .explanation-desc {
      margin: 0;
      font-size: 12px;
      color: rgba($feng-shui-light, 0.75);
      line-height: 1.6;
      text-align: justify;
    }
  }
}

// 底部
.panel-footer {
  padding: 15px 20px 18px;
  border-top: 1px solid rgba($feng-shui-gold, 0.3);
  background: rgba($feng-shui-gold, 0.03);

  .footer-divider {
    height: 1px;
    background: linear-gradient(90deg, rgba($feng-shui-gold, 0.3) 0%, transparent 50%, rgba($feng-shui-gold, 0.3) 100%);
    margin-bottom: 12px;
  }

  .feng-shui-tips {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: rgba($feng-shui-gold, 0.8);

    .tip-icon {
      font-size: 14px;
      animation: twinkle 1.5s infinite;
    }

    .tip-text {
      font-style: italic;
    }
  }
}

// 动画
@keyframes pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

@keyframes twinkle {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

// 响应式
@media (max-width: 768px) {
  .palace-panel-wrapper {
    position: absolute;
    // top: 50%;
    right: 10px;
    left: 10px;
    // bottom: 1px;
    transform: translateY(-50%);
    width: auto;
    max-width: none;
  }

  .palace-explanation-panel {
    max-height: 70vh;
  }

  .panel-header {
    .palace-name {
      font-size: 20px;
    }
  }
}
</style>
