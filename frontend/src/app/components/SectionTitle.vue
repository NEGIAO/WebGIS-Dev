<template>
    <div
        class="section-head"
        :class="{
            'section-head--left': align === 'left',
            'section-head--compact': compact,
            'section-head--no-watermark': !watermark,
        }"
    >
        <p
            v-if="eyebrow"
            class="section-eyebrow"
        >{{ eyebrow }}</p>
        <h3 class="section-title">{{ title }}</h3>
        <p
            v-if="desc"
            class="section-desc"
        >{{ desc }}</p>
        <!-- 额外内容插槽（如 OSS 区的项目渊源说明） -->
        <slot />
    </div>
</template>

<script lang="ts" src="./SectionTitle.ts"></script>

<style scoped>
.section-head {
    text-align: center;
    margin-bottom: 3rem;
    position: relative;
}

.section-head--compact {
    margin-bottom: 1.5rem;
}

.section-head--left {
    text-align: left;
}

/* 节区印章：外圈虚线 + 内圈实线 + 中心金点，是 Hero 三环的微缩版。
   四节复用同一枚，把"圆"从背景装饰升格为可识别的版面标识符。
   纯 CSS 生成（三重 radial-gradient + 虚线 border），不发图 */
.section-head::before {
    content: '';
    display: block;
    width: 54px;
    height: 54px;
    margin: 0 auto 0.9rem;
    border-radius: 50%;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.32);
    background:
        radial-gradient(circle closest-side, var(--brand-gold) 0 2.5px, transparent 2.6px),
        radial-gradient(
            circle closest-side,
            transparent 0 15px,
            rgba(var(--brand-primary-rgb), 0.3) 15px 16px,
            transparent 16.1px
        );
}

.section-head--left::before {
    margin-left: 0;
}

/* 南师的环 hover 才缓旋（ani_turn 15s/30s）：印章平时静止，
   光标落在节头上时虚线外圈以 60s 一圈极缓开转，
   reduced-motion 环境保持静止 */
@media (prefers-reduced-motion: no-preference) {
    .section-head:hover::before {
        animation: seal-turn 60s linear infinite;
    }
}

@keyframes seal-turn {
    to {
        transform: rotate(360deg);
    }
}

/* 节标题水印底纹（借鉴南师大 .tit-bg 的浅色底纹）：
   以纯 CSS 画一枚极淡的"经纬 / 罗盘"徽记垫在标题之后，
   品牌色 6% 透明，绿/蓝主题随令牌联动；z-index:-1 落在内容之下、
   section-bg 之上（本节 isolation 建栈，负层不外溢） */
.section-head::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -20px;
    width: 168px;
    height: 168px;
    transform: translateX(-50%);
    z-index: -1;
    border-radius: 50%;
    pointer-events: none;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.06);
    background:
        radial-gradient(
            circle closest-side,
            transparent 0 58px,
            rgba(var(--brand-primary-rgb), 0.05) 58px 59px,
            transparent 59.5px
        ),
        repeating-conic-gradient(
            from 0deg,
            rgba(var(--brand-primary-rgb), 0.05) 0deg 1deg,
            transparent 1deg 30deg
        );
    -webkit-mask-image: radial-gradient(circle closest-side, #000 40%, transparent 92%);
    mask-image: radial-gradient(circle closest-side, #000 40%, transparent 92%);
}

.section-head--no-watermark::after {
    display: none;
}

.section-eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--brand-primary);
}

.section-title {
    margin: 0 0 0.75rem;
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    /* 字体双轨（借鉴南师大：标题用衬线宋体、正文用无衬线，形成"编辑感"对比）。
       中文落 Noto Serif SC / Songti SC / SimSun，英文落 Cinzel / Cormorant */
    font-family: var(--font-serif);
}

.section-desc {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-secondary);
}

@media (max-width: 768px) {
    .section-title {
        font-size: 1.6rem;
    }
}
</style>
