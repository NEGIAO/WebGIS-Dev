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
                    style="cursor: pointer"
                    @click="handleLatticeClick(latticeIndex, layerIndex)"
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
                        :fill="
                            Array.isArray(layer.textColor)
                                ? layer.textColor[textIndex]
                                : layer.textColor
                        "
                        :font-size="m.autoFontSize ? baseFontSize : layer.fontSize"
                        text-anchor="middle"
                        dominant-baseline="middle"
                        font-family="楷书"
                        style="cursor: pointer"
                        @click="handleLatticeClick(textIndex, layerIndex)"
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
                            style="cursor: pointer"
                            @click="handleLatticeClick(textIndex, layerIndex)"
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
                <g
                    v-for="i in 360"
                    :key="`scale-${i}`"
                >
                    <line
                        :x1="getScaleStartX(i)"
                        :y1="getScaleStartY(i)"
                        :x2="getScaleEndX(i)"
                        :y2="getScaleEndY(i)"
                        :stroke="i % 10 === 0 ? m.line.scaleHighlightColor : m.line.scaleColor"
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

<script lang="ts" src="./feng-shui-compass-svg.ts"></script>

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
    animation: layerFadeIn v-bind('(m.animation?.duration || 0) + "ms"') ease-out forwards;
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

