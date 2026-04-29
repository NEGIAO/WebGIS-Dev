<template>
  <div
    class="feng-shui-compass-svg"
    :style="{
      width: m.compassSize.width + 'px',
      height: m.compassSize.height + 'px',
    }"
  >
    <!-- 罗盘主体 -->
    <svg
      :width="m.compassSize.width"
      :height="m.compassSize.height"
      :viewBox="`0 0 ${m.compassSize.width} ${m.compassSize.height}`"
      :style="{
        transform: `rotate(${m.rotate}deg)`,
      }"
    >
      <!-- 天池圆圈 -->
      <circle
        :cx="centerPoint.x"
        :cy="centerPoint.y"
        :r="tianChiRadius"
        :stroke="m.line.borderColor"
        :stroke-width="borderWidth"
        fill="none"
      />
      <!-- 各层圆环 -->
      <g
        v-for="(layer, layerIndex) in m.data"
        :key="`${layerIndex}-${m.info.id || ''}`"
        :class="{ 'layer-animate': shouldEnableAnimation }"
        :style="{
          animationDelay: shouldEnableAnimation
            ? `${layerIndex * (m.animation?.delay || 1)}ms`
            : '0s',
        }"
      >
        <!-- 层边框 -->
        <template v-if="layer?.shape === 'circle' || !layer.shape">
          <circle
            :cx="centerPoint.x || 0"
            :cy="centerPoint.y || 0"
            :r="getLayerRadius(layerIndex + 1)"
            :stroke="m.line.borderColor"
            :stroke-width="borderWidth"
            fill="none"
          />
        </template>
        <template v-else>
          <path
            :d="getLayerBorderPath(layerIndex)"
            :stroke="m.line.borderColor"
            :stroke-width="borderWidth"
            fill="none"
          />
        </template>
        <!-- 层填充 -->
        <!-- <path
          v-if="hasLayerFill(layerIndex)"
          :d="getLayerPath(layerIndex)"
          :fill="getLayerFillColor(layerIndex)"
        /> -->

        <!-- 宫格填充 -->
        <path
          v-for="(_, latticeIndex) in layer.data"
          :key="`lattice-${layerIndex}-${latticeIndex}`"
          :d="getLatticePath(latticeIndex, layerIndex)"
          :fill="
            hasLatticeFill(latticeIndex, layerIndex)
              ? getLatticeFillColor(latticeIndex, layerIndex)
              : 'transparent'
          "
          @click="handleLatticeClick(latticeIndex, layerIndex)"
          style="cursor: pointer"
        />
        <!-- 层文字 -->
        <g
          v-for="(text, textIndex) in layer.data"
          :key="`text-${layerIndex}-${textIndex}`"
        >
          <text
            v-if="!Array.isArray(text)"
            :x="getTextX(layerIndex, textIndex, layer)"
            :y="getTextY(layerIndex, textIndex, layer)"
            :transform="getTextTransform(layerIndex, textIndex, layer)"
            :fill="Array.isArray(layer.textColor) ? layer.textColor[textIndex] : layer.textColor"
            :font-size="m.autoFontSize ? baseFontSize : layer.fontSize"
            text-anchor="middle"
            dominant-baseline="middle"
            font-family="楷书"
            @click="handleLatticeClick(textIndex, layerIndex)"
            style="cursor: pointer"
          >
            {{ text }}
          </text>

          <!-- 同宫文字处理 -->
          <g v-else>
            <text
              v-for="(subText, subIndex) in text"
              :key="`subtext-${layerIndex}-${textIndex}-${subIndex}`"
              :x="getTogetherTextX(layerIndex, textIndex, subIndex, layer)"
              :y="getTogetherTextY(layerIndex, textIndex, subIndex, layer)"
              :transform="
                getTogetherTextTransform(layerIndex, textIndex, subIndex, layer)
              "
              :fill="
                Array.isArray(layer.textColor)
                  ? layer.textColor[subIndex]
                  : layer.textColor
              "
              :font-size="m.autoFontSize ? baseFontSize : layer.fontSize"
              text-anchor="middle"
              dominant-baseline="middle"
              font-family="楷书"
              @click="handleLatticeClick(textIndex, layerIndex)"
              style="cursor: pointer"
            >
              {{ subText }}
            </text>
          </g>
        </g>

        <!-- 分隔线 -->
        <line
          v-for="i in layer.data.length"
          :key="`divider-${layerIndex}-${i}`"
          :x1="getDividerStartX(layerIndex, i - 1)"
          :y1="getDividerStartY(layerIndex, i - 1)"
          :x2="getDividerEndX(layerIndex, i - 1)"
          :y2="getDividerEndY(layerIndex, i - 1)"
          :stroke="m.line.borderColor"
          :stroke-width="borderWidth"
        />
      </g>

      <!-- 刻度 -->
      <g
        v-if="m.scaclStyle && m.isShowScale"
        :key="m.info.id"
        :class="{ 'layer-animate': shouldEnableAnimation }"
        :style="{
          animationDelay: shouldEnableAnimation
            ? `${m.data.length * (m.animation?.delay || 1)}ms`
            : '0s',
        }"
      >
        <g v-for="i in 360" :key="`scale-${i}`">
          <line
            :x1="getScaleStartX(i)"
            :y1="getScaleStartY(i)"
            :x2="getScaleEndX(i)"
            :y2="getScaleEndY(i)"
            :stroke="
              i % 10 === 0 ? m.line.scaleHighlightColor : m.line.scaleColor
            "
            :stroke-width="borderWidth"
          />
          <text
            v-if="i % 10 === 0"
            :x="getScaleTextX(i)"
            :y="getScaleTextY(i)"
            :transform="getScaleTextTransform(i)"
            :fill="m.line.scaleHighlightColor"
            :font-size="getScaleFontSize()"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ i }}
          </text>
        </g>
      </g>
    </svg>
    <!-- 天心十字 -->
    <svg
      v-if="m.isShowTianxinCross"
      class="tianxin-cross"
      :width="m.compassSize.width"
      :height="m.compassSize.height"
      :viewBox="`0 0 ${m.compassSize.width} ${m.compassSize.height}`"
    >
      <line
        :x1="centerPoint.x - tianxinCrossHalfLength"
        :y1="centerPoint.y"
        :x2="centerPoint.x + tianxinCrossHalfLength"
        :y2="centerPoint.y"
        :stroke="m.tianxinCrossColor"
        :stroke-width="m.tianxinCrossWidth"
      />
      <line
        :x1="centerPoint.x"
        :y1="centerPoint.y - tianxinCrossHalfLength"
        :x2="centerPoint.x"
        :y2="centerPoint.y + tianxinCrossHalfLength"
        :stroke="m.tianxinCrossColor"
        :stroke-width="m.tianxinCrossWidth"
      />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import type { FengShuiCompassConfig, Layer } from "./types";

const emit = defineEmits(["latticeClick"]);

const CORRECTION_ANGLE = -90;

// 默认配置
const defaultConfig: FengShuiCompassConfig = {
  info: { id: "" },
  compassSize: { width: 800, height: 800 },
  data: [],
  line: {
    borderColor: "#666",
    scaleColor: "#666",
    scaleHighlightColor: "#999",
  },
  rotate: 0,
  latticeFill: [],
  isShowTianxinCross: false,
  isShowScale: true,
  scaclStyle: {
    maxLineHeight: 20,
    midLineHeight: 15,
    minLineHeight: 10,
  },
  autoFontSize: true,
  animation: {
    enable: false,
    duration: 500,
    delay: 300,
  },
  tianxinCrossWidth: 2,
  tianxinCrossColor: "#FF0000",
  tianxinCrossLengthRatio: 1 / 3,
};

const props = defineProps<{
  config?: Partial<FengShuiCompassConfig>;
}>();

// 合并默认配置和传入的配置
const m = computed(() => ({
  ...defaultConfig,
  ...props.config,
  line: {
    ...defaultConfig.line,
    ...props.config?.line,
  },
  scaclStyle: {
    ...defaultConfig.scaclStyle,
    ...props.config?.scaclStyle,
  },
  compassSize: {
    ...defaultConfig.compassSize,
    ...props.config?.compassSize,
  },
  // 确保 data 始终是数组类型
  data: Array.isArray(props.config?.data || defaultConfig.data)
    ? ((props.config?.data || defaultConfig.data) as Layer[])
    : [(props.config?.data || defaultConfig.data) as Layer],
}));

const shouldEnableAnimation = ref(m.value.animation?.enable || false);

// 使用计算属性获取需要的值
const centerPoint = computed(() => ({
  x: m.value.compassSize.width / 2,
  y: m.value.compassSize.height / 2,
}));

const tianxinCrossHalfLength = computed(() => {
  const ratioRaw = Number(m.value.tianxinCrossLengthRatio ?? 1 / 3);
  const ratio = Number.isFinite(ratioRaw) ? Math.max(0.1, Math.min(1, ratioRaw)) : 1 / 3;
  return radius.value * ratio;
});

// 基础配置
const radius = computed(() => {
  // 预留刻度线和文字的空间
  const maxScaleSpace = m.value.scaclStyle
    ? m.value.scaclStyle.maxLineHeight * 3
    : 0; // 包括文字空间
  const availableSpace =
    Math.min(m.value.compassSize.width, m.value.compassSize.height) / 2 -
    maxScaleSpace;
  return Math.max(availableSpace, 0); // 确保半径不为负
});
const tianChiRadius = computed(() => {
  // 如果配置中指定了 tianChiRadius，则使用配置值
  if (m.value.compassSize.tianChiRadius !== undefined) {
    return m.value.compassSize.tianChiRadius;
  }
  // 否则使用默认计算方式：半径的 10%
  return radius.value * 0.1;
});
const borderWidth = 1;

// 计算每层高度
const layerHeight = computed(() => {
  const availableHeight =
    (radius.value - tianChiRadius.value) / m.value.data.length;
  return new Array(m.value.data.length).fill(availableHeight);
});

// 获取指定层的半径
function getLayerRadius(index: number) {
  let r = tianChiRadius.value;
  for (let i = 0; i < index; i++) {
    r += layerHeight.value[i];
  }
  return r;
}

// 角度转弧度
function rads(degrees: number) {
  return (Math.PI * (degrees + CORRECTION_ANGLE)) / 180;
}

// 检查层填充
// function hasLayerFill(layerIndex) {
//   return props.layerFilt.some(fill => fill[0] === layerIndex);
// }

// 获取层填充颜色
// function getLayerFillColor(layerIndex) {
//   const fill = props.layerFilt.find(fill => fill[0] === layerIndex);
//   return fill ? fill[1] : 'none';
// }

// 获取层路径
// 缓存计算结果
const cachedResults = new Map();

// 缓存计算函数
// function memoize(fn) {
//   return function (...args) {
//     const key = JSON.stringify(args);
//     if (!cachedResults.has(key)) {
//       cachedResults.set(key, fn.apply(this, args));
//     }
//     return cachedResults.get(key);
//   };
// }

// 优化计算密集型函数
// const getLayerPath = memoize((layerIndex) => {
//   const innerRadius = getLayerRadius(layerIndex);
//   const outerRadius = getLayerRadius(layerIndex + 1);
//   const layerShape = props.compassData[layerIndex].shape || 'circle';

//   if (layerShape === 'circle') {
//     return `
//       M ${centerPoint.value.x + innerRadius * Math.cos(0)} ${centerPoint.value.y + innerRadius * Math.sin(0)}
//       A ${innerRadius} ${innerRadius} 0 1 1 ${centerPoint.value.x + innerRadius * Math.cos(2 * Math.PI)} ${centerPoint.value.y + innerRadius * Math.sin(2 * Math.PI)}
//       L ${centerPoint.value.x + outerRadius * Math.cos(2 * Math.PI)} ${centerPoint.value.y + outerRadius * Math.sin(2 * Math.PI)}
//       A ${outerRadius} ${outerRadius} 0 1 0 ${centerPoint.value.x + outerRadius * Math.cos(0)} ${centerPoint.value.y + outerRadius * Math.sin(0)}
//       Z
//     `.trim();
//   } else {
//     const sides = props.compassData[layerIndex].data.length;
//     let path = [];

//     for (let i = 0; i <= sides; i++) {
//       const angle = (i * 2 * Math.PI) / sides;
//       const x1 = centerPoint.value.x + innerRadius * Math.cos(angle);
//       const y1 = centerPoint.value.y + innerRadius * Math.sin(angle);
//       const x2 = centerPoint.value.x + outerRadius * Math.cos(angle);
//       const y2 = centerPoint.value.y + outerRadius * Math.sin(angle);

//       if (i === 0) {
//         path.push(`M ${x1} ${y1}`);
//         path.push(`L ${x2} ${y2}`);
//       } else {
//         path.push(`L ${x2} ${y2}`);
//       }
//     }

//     path.push('Z');
//     return path.join(' ');
//   }
// });

// 清理缓存
onMounted(() => {
  // 初始化时清理缓存
  cachedResults.clear();
});

onUnmounted(() => {
  // 组件卸载时清理缓存
  cachedResults.clear();
});

// 检查宫格填充
function hasLatticeFill(latticeIndex: number, layerIndex: number) {
  return m.value.latticeFill.some(
    (fill) => fill[0] === latticeIndex && fill[1] === layerIndex
  );
}

// 获取宫格填充颜色
function getLatticeFillColor(latticeIndex: number, layerIndex: number) {
  const fill = m.value.latticeFill.find(
    (fill) => fill[0] === latticeIndex && fill[1] === layerIndex
  );
  return fill ? fill[2] : "none";
}

// 获取宫格路径
function getLatticePath(latticeIndex: number, layerIndex: number) {
  const layer = m.value.data[layerIndex];
  const count = layer.data.length;
  const startAngle = rads((360 / count) * latticeIndex);
  const endAngle = rads((360 / count) * (latticeIndex + 1));
  const innerRadius = getLayerRadius(layerIndex);
  const outerRadius = getLayerRadius(layerIndex + 1);
  const layerShape = layer.shape || "circle";

  if (layerShape === "circle") {
    const x1 = centerPoint.value.x + innerRadius * Math.cos(startAngle);
    const y1 = centerPoint.value.y + innerRadius * Math.sin(startAngle);
    const x2 = centerPoint.value.x + outerRadius * Math.cos(startAngle);
    const y2 = centerPoint.value.y + outerRadius * Math.sin(startAngle);
    const x3 = centerPoint.value.x + outerRadius * Math.cos(endAngle);
    const y3 = centerPoint.value.y + outerRadius * Math.sin(endAngle);
    const x4 = centerPoint.value.x + innerRadius * Math.cos(endAngle);
    const y4 = centerPoint.value.y + innerRadius * Math.sin(endAngle);

    return `
      M ${x1} ${y1}
      L ${x2} ${y2}
      A ${outerRadius} ${outerRadius} 0 0 1 ${x3} ${y3}
      L ${x4} ${y4}
      A ${innerRadius} ${innerRadius} 0 0 0 ${x1} ${y1}
      Z
    `.trim();
  } else {
    // const sides = count;
    // const sideAngle = (2 * Math.PI) / sides;
    const startAngle = rads((360 / count) * latticeIndex);
    const endAngle = rads((360 / count) * (latticeIndex + 1));

    let path = [];
    // 绘制外圈路径
    const x1 = centerPoint.value.x + outerRadius * Math.cos(startAngle);
    const y1 = centerPoint.value.y + outerRadius * Math.sin(startAngle);
    const x2 = centerPoint.value.x + outerRadius * Math.cos(endAngle);
    const y2 = centerPoint.value.y + outerRadius * Math.sin(endAngle);

    path.push(`M ${x1} ${y1}`);
    path.push(`L ${x2} ${y2}`);

    // 绘制内圈路径
    const x3 = centerPoint.value.x + innerRadius * Math.cos(endAngle);
    const y3 = centerPoint.value.y + innerRadius * Math.sin(endAngle);
    const x4 = centerPoint.value.x + innerRadius * Math.cos(startAngle);
    const y4 = centerPoint.value.y + innerRadius * Math.sin(startAngle);

    path.push(`L ${x3} ${y3}`);
    path.push(`L ${x4} ${y4}`);
    path.push("Z");

    return path.join(" ");
  }
}

// 计算基础字体大小
const baseFontSize = computed(() => {
  // 根据罗盘半径计算合适的字体大小
  // 取罗盘半径的1/20作为基准字体大小
  const baseFontSize = radius.value / 20;
  // 限制最小和最大字体大小
  if (m.value.autoFontSize || !Boolean(m.value.autoFontSize))
    return Math.min(Math.max(baseFontSize, 12), 40);
  // 根据罗盘半径和每层高度计算合适的字体大小
  const layerIndex = m.value.data.length - 1;
  const layerData = m.value.data[layerIndex];
  const count = layerData.data.length;
  const singleAngle = 360 / count;
  const arcLength =
    (2 * Math.PI * getLayerRadius(layerIndex + 1) * singleAngle) / 360;
  // 取弧长的1/4作为最大字体大小
  const maxFontSize = arcLength / 4;
  // 如果用户设置了字体大小，则以用户设置的大小为基准，但不超过最大字体大小
  const userFontSize =
    layerData.fontSize ||
    Math.min(m.value.compassSize.width, m.value.compassSize.height) / 20;
  return Math.min(userFontSize, maxFontSize);
});

// 获取文字位置和变换
function getTextPosition(layerIndex: number, textIndex: number, layer: Layer) {
  const count = layer.data.length;
  const angle = rads(
    (360 / count) * textIndex + 360 / count / 2 + (layer.startAngle || 0)
  );
  const r = getLayerRadius(layerIndex) + layerHeight.value[layerIndex] / 2;

  return {
    x: centerPoint.value.x + r * Math.cos(angle),
    y: centerPoint.value.y + r * Math.sin(angle),
    angle: (angle * 180) / Math.PI + 90,
  };
}

function getTextX(layerIndex: number, textIndex: number, layer: Layer) {
  return getTextPosition(layerIndex, textIndex, layer).x;
}

function getTextY(layerIndex: number, textIndex: number, layer: Layer) {
  return getTextPosition(layerIndex, textIndex, layer).y;
}

function getTextTransform(layerIndex: number, textIndex: number, layer: Layer) {
  const pos = getTextPosition(layerIndex, textIndex, layer);
  let rotation = 0;
  
  if (layer.vertical) {
    // Radial mode: text perpendicular to center (+90° offset)
    rotation = pos.angle + 90;
  } else {
    // Parallel mode: text tangent to circle, always readable
    // For angles 90-270° (left side), add 180° to prevent upside-down text
    if (pos.angle > 90 && pos.angle < 270) {
      rotation = pos.angle + 180;
    } else {
      rotation = pos.angle;
    }
  }
  
  return `rotate(${rotation} ${pos.x} ${pos.y})`;
}
  
// 获取同宫文字位置和变换
function getTogetherTextPosition(
  layerIndex: number,
  textIndex: number,
  subIndex: number,
  layer: Layer
) {
  const count = layer.data.length; // 宫格数量
  const singleAngle = 360 / count; // 每个宫格的角度
  const baseAngle = singleAngle * textIndex + (layer.startAngle || 0); // 当前宫格的起始角度

  // 获取当前宫格内的文字数量
  const currentLatticeTexts = layer.data[textIndex];
  const textsCount = currentLatticeTexts.length;

  // 计算当前宫格内文字的分布角度
  const textSpacing = singleAngle / (textsCount + 1);
  const textAngle = baseAngle + textSpacing * (subIndex + 1);

  const angle = rads(textAngle);
  const r = getLayerRadius(layerIndex) + layerHeight.value[layerIndex] / 2;

  return {
    x: centerPoint.value.x + r * Math.cos(angle),
    y: centerPoint.value.y + r * Math.sin(angle),
    angle: (angle * 180) / Math.PI + 90,
  };
}

function getTogetherTextX(
  layerIndex: number,
  textIndex: number,
  subIndex: number,
  layer: Layer
) {
  return getTogetherTextPosition(layerIndex, textIndex, subIndex, layer).x;
}

function getTogetherTextY(
  layerIndex: number,
  textIndex: number,
  subIndex: number,
  layer: Layer
) {
  return getTogetherTextPosition(layerIndex, textIndex, subIndex, layer).y;
}

function getTogetherTextTransform(
  layerIndex: number,
  textIndex: number,
  subIndex: number,
  layer: Layer
) {
  const pos = getTogetherTextPosition(layerIndex, textIndex, subIndex, layer);
  let rotation = 0;
  
  if (layer.vertical) {
    // Radial mode: text perpendicular to center (+90° offset)
    rotation = pos.angle + 90;
  } else {
    // Parallel mode: text tangent to circle, always readable
    // For angles 90-270° (left side), add 180° to prevent upside-down text
    if (pos.angle > 90 && pos.angle < 270) {
      rotation = pos.angle + 180;
    } else {
      rotation = pos.angle;
    }
  }
  
  return `rotate(${rotation} ${pos.x} ${pos.y})`;
}

// 获取层边框路径
function getLayerBorderPath(layerIndex: number) {
  const layer = m.value.data[layerIndex];
  const sides = layer.data.length;
  const radius = getLayerRadius(layerIndex + 1);
  let path = [];

  // 检查当前层是否为多边形
  if (layer.shape !== "circle" && layer.shape) {
    // 检查上一层是否为圆形（如果存在）
    const hasCircleAbove =
      layerIndex + 1 < m.value.data.length &&
      (m.value.data[layerIndex + 1].shape === "circle" ||
        !m.value.data[layerIndex + 1].shape);

    // 检查下一层是否为圆形（如果存在）
    const hasCircleBelow =
      layerIndex > 0 &&
      (m.value.data[layerIndex - 1].shape === "circle" ||
        !m.value.data[layerIndex - 1].shape);

    // 绘制多边形路径
    for (let i = 0; i <= sides; i++) {
      const angle = (i * 2 * Math.PI) / sides;
      const x = centerPoint.value.x + radius * Math.cos(angle);
      const y = centerPoint.value.y + radius * Math.sin(angle);

      if (i === 0) {
        path.push(`M ${x} ${y}`);
      } else {
        path.push(`L ${x} ${y}`);
      }
    }

    path.push("Z");

    // 如果上层是圆形，添加外部圆形边界
    if (hasCircleAbove) {
      path.push(`M ${centerPoint.value.x + radius} ${centerPoint.value.y}`);
      path.push(
        `A ${radius} ${radius} 0 1 1 ${centerPoint.value.x - radius} ${
          centerPoint.value.y
        }`
      );
      path.push(
        `A ${radius} ${radius} 0 1 1 ${centerPoint.value.x + radius} ${
          centerPoint.value.y
        }`
      );
    }

    // 如果下层是圆形，添加内部圆形边界
    if (hasCircleBelow) {
      const innerRadius = getLayerRadius(layerIndex);
      path.push(
        `M ${centerPoint.value.x + innerRadius} ${centerPoint.value.y}`
      );
      path.push(
        `A ${innerRadius} ${innerRadius} 0 1 1 ${
          centerPoint.value.x - innerRadius
        } ${centerPoint.value.y}`
      );
      path.push(
        `A ${innerRadius} ${innerRadius} 0 1 1 ${
          centerPoint.value.x + innerRadius
        } ${centerPoint.value.y}`
      );
    }
  } else {
    // 当前层是圆形，使用原来的圆形绘制逻辑
    path.push(`M ${centerPoint.value.x + radius} ${centerPoint.value.y}`);
    path.push(
      `A ${radius} ${radius} 0 1 1 ${centerPoint.value.x - radius} ${
        centerPoint.value.y
      }`
    );
    path.push(
      `A ${radius} ${radius} 0 1 1 ${centerPoint.value.x + radius} ${
        centerPoint.value.y
      }`
    );
  }

  return path.join(" ");
}

// 获取分隔线位置
function getDividerPosition(layerIndex: number, index: number) {
  const layer = m.value.data[layerIndex];
  const count = layer.data.length;
  const angle = rads((360 / count) * index + (layer.startAngle || 0));
  const innerRadius = getLayerRadius(layerIndex);
  const outerRadius = getLayerRadius(layerIndex + 1);

  return {
    start: {
      x: centerPoint.value.x + innerRadius * Math.cos(angle),
      y: centerPoint.value.y + innerRadius * Math.sin(angle),
    },
    end: {
      x: centerPoint.value.x + outerRadius * Math.cos(angle),
      y: centerPoint.value.y + outerRadius * Math.sin(angle),
    },
  };
}

function getDividerStartX(layerIndex: number, index: number) {
  return getDividerPosition(layerIndex, index).start.x;
}

function getDividerStartY(layerIndex: number, index: number) {
  return getDividerPosition(layerIndex, index).start.y;
}

function getDividerEndX(layerIndex: number, index: number) {
  return getDividerPosition(layerIndex, index).end.x;
}

function getDividerEndY(layerIndex: number, index: number) {
  return getDividerPosition(layerIndex, index).end.y;
}

function getScalePosition(index: number) {
  const angle = rads(index);
  const r = getLayerRadius(m.value.data.length);
  const scaleLength =
    index % 10 === 0
      ? m.value.scaclStyle.maxLineHeight
      : index % 5 === 0
      ? m.value.scaclStyle.midLineHeight
      : m.value.scaclStyle.minLineHeight;

  return {
    start: {
      x: centerPoint.value.x + r * Math.cos(angle),
      y: centerPoint.value.y + r * Math.sin(angle),
    },
    end: {
      x: centerPoint.value.x + (r + scaleLength) * Math.cos(angle),
      y: centerPoint.value.y + (r + scaleLength) * Math.sin(angle),
    },
    text: {
      x:
        centerPoint.value.x +
        (r + m.value.scaclStyle.maxLineHeight * 2) * Math.cos(angle),
      y:
        centerPoint.value.y +
        (r + m.value.scaclStyle.maxLineHeight * 2) * Math.sin(angle),
      angle: (angle * 180) / Math.PI + 90,
    },
  };
}

function getScaleStartX(index: number) {
  return getScalePosition(index).start.x;
}

function getScaleStartY(index: number) {
  return getScalePosition(index).start.y;
}

function getScaleEndX(index: number) {
  return getScalePosition(index).end.x;
}

function getScaleEndY(index: number) {
  return getScalePosition(index).end.y;
}

function getScaleTextX(index: number) {
  return getScalePosition(index).text.x;
}

function getScaleTextY(index: number) {
  return getScalePosition(index).text.y;
}

function getScaleTextTransform(index: number) {
  const pos = getScalePosition(index).text;
  return `rotate(${pos.angle} ${pos.x} ${pos.y})`;
}

// 处理宫格点击事件
function handleLatticeClick(latticeIndex: number, layerIndex: number) {
  emit("latticeClick", {
    latticeIndex,
    layerIndex,
    data: m.value.data[layerIndex].data[latticeIndex],
  });
}

// 计算刻度文字大小
function getScaleFontSize() {
  // 如果有设置固定大小，则使用设置的大小
  if (m.value.scaclStyle?.numberFontSize) {
    return m.value.scaclStyle.numberFontSize;
  }

  // 根据罗盘半径计算合适的字体大小
  // 取罗盘半径的1/20作为基准字体大小
  const baseFontSize = radius.value / 20;
  // 限制最小和最大字体大小
  return Math.min(Math.max(baseFontSize, 12), 40);
}

// 监听数据变化
watch(
  () => props.config?.data,
  (newData) => {
    if (!newData) return;

    // 清理缓存
    cachedResults.clear();

    // 检查多边形模式下的startAngle设置
    Array.isArray(newData) &&
      newData.forEach((layer: any, index: number) => {
        if (layer.shape === "polygon" && layer.startAngle) {
          console.warn(
            `警告: 第${
              index + 1
            }层使用了多边形模式，多边形模式不支持startAngle设置。`
          );
          layer.startAngle = 0;
        }
      });
  },
  { deep: true }
);
</script>



<style scoped>
.feng-shui-compass-svg {
  position: relative;
  margin: 0 auto;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.feng-shui-compass-svg svg {
  transform-origin: center center;
  will-change: transform;
  backface-visibility: hidden;
  perspective: 1000;
  transform: translateZ(0);
  transition: transform 0.1s linear;
}

.tianxin-cross {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

.layer-animate {
  opacity: 0;
  transform: scale(0.8);
  transform-origin: center center;
  animation: layerFadeIn v-bind('(m.animation?.duration || 0) + "ms"') ease-out
    forwards;
}

@keyframes layerFadeIn {
  from {
    opacity: 0;
    transform: scale(0.8);
    transform-origin: center center;
  }

  to {
    opacity: 1;
    transform: scale(1);
    transform-origin: center center;
  }
}
</style>