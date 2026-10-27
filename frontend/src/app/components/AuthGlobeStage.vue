<template>
    <!-- 线框地球舞台（V3.6.29 起挂在注册页）：
         动效语言借鉴外部二次开发站点（原 `gis-stage`），但按本页形态重构 ——
         对方是「深色底 + 左栏品牌舞台 + 白线 0.13~0.35 alpha」；
         本页是「浅色底 + 单列 440px 居中卡片」，白线在 --bg-secondary 上等于不可见，
         故线稿全部改用品牌色 alpha（--brand-primary-rgb），金色只留给卫星一点。

         与 AuthDecorBackground 的分工：那个组件负责"整页底纹"（经纬网 / 等高线 /
         散点 / 天光 / 双轨），本组件只负责"一颗会转的球"——单一视觉主体，
         悬在宇航员脚下，读作"人悬于星球之上"。

         整层 pointer-events: none + aria-hidden，纯装饰；层级 z-index: 0，
         低于表单卡片（.container z-index: 1） -->
    <div
        class="globe-stage"
        aria-hidden="true"
    >
        <div class="globe-stage__planet">
            <!-- 大气层：让球从背后的双轨线里"浮"出来，是区分前后景的关键 -->
            <div class="globe-stage__halo"></div>

            <!-- 扫掠光：conic-gradient 画一个扇形，再用环形 mask 只留
                 62%~66% 那一圈 —— 比再画一条椭圆便宜，且天然是"扫描面" -->
            <div class="globe-stage__sweep"></div>

            <!-- 线框球体。经线 = rx 递减的椭圆（rx/R ≈ cos 经度），
                 整组旋转即伪 3D 自转，不需要 WebGL 或纹理；
                 纬线**不转只摆**（±5° 交替），这一动一静才是"球"成立的原因 ——
                 两者同速旋转会被读成一块旋转的网格布 -->
            <svg
                class="globe-stage__mesh"
                viewBox="0 0 200 200"
            >
                <circle
                    class="globe-stage__outline"
                    cx="100"
                    cy="100"
                    r="96"
                />
                <g class="globe-stage__meridians">
                    <ellipse cx="100" cy="100" rx="94" ry="94" />
                    <ellipse cx="100" cy="100" rx="62" ry="94" />
                    <ellipse cx="100" cy="100" rx="30" ry="94" />
                </g>
                <g class="globe-stage__parallels">
                    <ellipse cx="100" cy="100" rx="94" ry="62" />
                    <ellipse cx="100" cy="100" rx="94" ry="30" />
                </g>
            </svg>

            <!-- 三层脉冲环：由内向外扩散，错峰 1/3 周期 -->
            <span class="globe-stage__ring"></span>
            <span class="globe-stage__ring globe-stage__ring--2"></span>
            <span class="globe-stage__ring globe-stage__ring--3"></span>

            <!-- 轨道：倾角与自转必须分属两层（动画的 transform 会整体覆盖静态 rotate）；
                 虚线环与卫星再拆两层，否则两者刚性绑定、永远同速，卫星像"焊"在环上 -->
            <div class="globe-stage__orbit">
                <div class="globe-stage__orbit-spin"></div>
                <div class="globe-stage__orbit-sat">
                    <span class="globe-stage__sat"></span>
                </div>
            </div>
        </div>

        <!-- 流星：九道错峰掠过，分「近 / 中 / 远」三档粗细与亮度。
             每道只在自己周期的前 15% 可见，其余 85% 完全不可见 ——
             流星的本质是"绝大多数时间什么都没有"，常驻亮线会退化成装饰条纹 -->
        <div class="globe-stage__meteors">
            <span class="globe-stage__meteor globe-stage__meteor--1"></span>
            <span class="globe-stage__meteor globe-stage__meteor--2"></span>
            <span class="globe-stage__meteor globe-stage__meteor--3"></span>
            <span class="globe-stage__meteor globe-stage__meteor--4"></span>
            <span class="globe-stage__meteor globe-stage__meteor--5"></span>
            <span class="globe-stage__meteor globe-stage__meteor--6"></span>
            <span class="globe-stage__meteor globe-stage__meteor--7"></span>
            <span class="globe-stage__meteor globe-stage__meteor--8"></span>
            <span class="globe-stage__meteor globe-stage__meteor--9"></span>
        </div>
    </div>
</template>

<style scoped>
/* 整层透明度收敛到单一变量：球体所有线稿都是"品牌色 + 低 alpha"，
   再叠一层整体 opacity 比逐条改 alpha 更省事，也便于整层微调。
   取值区间参考：0.5 若隐若现 / 0.7 当前 / 1 全强度 */
.globe-stage {
    --globe-opacity: 0.7;

    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    opacity: var(--globe-opacity);
}

/* 球心钉在 12% / 96%：读作"宇航员脚下的行星"。
   AuthDecorBackground 的宇航员画在 viewBox (118,586)（1440×900 slice 铺满），
   脚底落在约 77% 高度、水平约 10% 宽；球心取 12%/96% 时，
   球顶刚好压在脚底之下，两者构成"人悬于星球之上"的关系。
   球体大半沉在视口下沿，只露上半球 —— 既不再与卡片抢面积，
   也让扫掠光的顶弧成为画面里唯一的高光 */
/* 定位用 bottom 锚定球底，横向仍靠 translateX(-50%) 让球心落在 left 指定的竖线上。
   坑：这里**不能**写 translate(-50%, -50%) —— bottom 先把元素底边贴到容器底，
   再被 -50% 向上推半个球径，结果"bottom: 0"却离底 115px（230px 球径的一半）。
   若想改成"球心落在屏幕底边、只露上半球"，把下面这行换成 translate(-50%, 50%) */
.globe-stage__planet {
    position: absolute;
    left: 9%;
    bottom: 1%;
    width: min(230px, 24vw, 40vh);
    aspect-ratio: 1;
    transform: translateX(-50%);
}

.globe-stage__halo {
    position: absolute;
    inset: -12%;
    border-radius: 50%;
    background: radial-gradient(
        circle at 50% 44%,
        rgba(var(--brand-primary-rgb), 0.1),
        rgba(var(--brand-primary-rgb), 0) 66%
    );
}

.globe-stage__sweep {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
        from 0deg,
        rgba(var(--brand-primary-rgb), 0.38) 0deg,
        rgba(var(--brand-primary-rgb), 0.08) 42deg,
        transparent 96deg,
        transparent 360deg
    );
    -webkit-mask-image: radial-gradient(circle, #000 62%, transparent 66%);
    mask-image: radial-gradient(circle, #000 62%, transparent 66%);
}

.globe-stage__mesh {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    /* 描边压在 r=96 上，不留 overflow 会被 200 视口裁掉半像素 */
    overflow: visible;
}

.globe-stage__outline {
    fill: rgba(var(--brand-primary-rgb), 0.04);
    stroke: rgba(var(--brand-primary-rgb), 0.26);
    stroke-width: 1;
}

/* fill-box + center：SVG 的 <g> 默认绕视口原点 (0,0) 转，
   不加这两行整颗球会被甩出画面 */
.globe-stage__meridians,
.globe-stage__parallels {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.18);
    stroke-width: 0.8;
    transform-box: fill-box;
    transform-origin: center;
}

.globe-stage__parallels {
    stroke: rgba(var(--brand-primary-rgb), 0.12);
}

.globe-stage__ring {
    position: absolute;
    inset: 0;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.28);
    border-radius: 50%;
    /* 静态态不显示：动效关闭时整层不应留三个死环 */
    opacity: 0;
}

.globe-stage__orbit {
    position: absolute;
    /* inset -31% → 直径 = 球的 1.62 倍 */
    inset: -31%;
    border-radius: 50%;
    /* 只负责静态倾角；虚线本身画在自转层上（见下） */
    transform: rotate(-16deg);
}

.globe-stage__orbit-spin {
    position: absolute;
    inset: 0;
}

/* 卫星独立一层：周期取 13s，刻意短于虚线环的 20s。
   两者角速度不同（20s 一圈 vs 13s 一圈），卫星会持续超越虚线，
   才读得出"在轨道上运行"而不是"焊在环上跟着转" */
.globe-stage__orbit-sat {
    position: absolute;
    inset: 0;
}

/* 虚线必须画在**自转层**上：父级 .globe-stage__orbit 只有静态倾角、从不旋转，
   虚线若写成父级的 border，无论内层怎么转，环本身都不会动。
   另外不能用 border: 1px dashed —— 绕这个直径约 280 段，
   20s 一圈时高频图案产生频闪混叠，肉眼读作静止。改成 36 段
   （10° 一个周期、3.2° 实线），单段位移可辨，旋转才成立。
   掩膜用 closest-side 卡出 1.3px 环带，视觉上等效 1px 描边 */
.globe-stage__orbit-spin::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-conic-gradient(
        from 0deg,
        rgba(var(--brand-primary-rgb), 0.5) 0deg 3.2deg,
        transparent 3.2deg 10deg
    );
    -webkit-mask-image: radial-gradient(closest-side, transparent calc(100% - 1.3px), #000 calc(100% - 1.3px));
    mask-image: radial-gradient(closest-side, transparent calc(100% - 1.3px), #000 calc(100% - 1.3px));
}

.globe-stage__sat {
    position: absolute;
    top: -5px;
    left: 50%;
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    background: var(--brand-gold);
    box-shadow:
        0 0 0 4px rgba(var(--brand-gold-rgb), 0.16),
        0 0 12px 2px rgba(var(--brand-gold-rgb), 0.34);
}

/* ============ 流星 ============
   九道短线，按「近 / 中 / 远」三档分粗细、长度与亮度：
     · 近：1.7px、最长、最亮、周期最长（走得慢）
     · 中：1.2~1.4px
     · 远：1px、最短、最淡、周期最短（走得快）
   同屏出现两三道时才有景深差，否则九道一样的平行线比三道更假。

   "随机"靠三个维度同时变化，缺一个就会露出规律：
     ① 起点 top/left 全不同，且横跨整幅（穿过卡片的部分被表单卡自然遮住）；
     ② 角度 23°~45°、长度 62~168px；
     ③ **周期 3.8s~6.7s 两两不等**，再叠不规则的 delay ——
        统一周期会被眼睛识别出节拍，这是"假随机"最常见的原因。

   节奏仍是关键：每道只在自己周期的前 15% 可见，其余 85% 全不可见。
   位移走 translate3d 合成层，不碰 left/top，避免逐帧重排 */
.globe-stage__meteors {
    position: absolute;
    inset: 0;
}

.globe-stage__meteor {
    position: absolute;
    width: var(--len, 120px);
    height: var(--thick, 1.3px);
    border-radius: 999px;
    background: linear-gradient(
        90deg,
        rgba(var(--brand-primary-rgb), 0) 0%,
        rgba(var(--brand-primary-rgb), var(--tail, 0.18)) 38%,
        rgba(var(--brand-primary-rgb), var(--mid, 0.5)) 82%,
        rgba(var(--brand-gold-rgb), var(--head, 0.85)) 100%
    );
    /* 静态态不可见：动效关闭时不留九道死线 */
    opacity: 0;
    /* 周期与延迟做成变量，动画名只在 no-preference 内挂载 */
    animation-duration: var(--dur, 10s);
    animation-delay: var(--delay, 0s);
}

/* ── 近 ── */
.globe-stage__meteor--1 {
    top: 8%;
    left: 6%;
    --len: 168px;
    --thick: 1.7px;
    --angle: 34deg;
    --dx: 215px;
    --dy: 145px;
    --dur: 6.7s;
    --delay: 0.2s;
}

.globe-stage__meteor--5 {
    top: 13%;
    left: 61%;
    --len: 152px;
    --thick: 1.7px;
    --angle: 37deg;
    --dx: 196px;
    --dy: 148px;
    --dur: 6.4s;
    --delay: 3.4s;
}

/* ── 中 ── */
.globe-stage__meteor--2 {
    top: 24%;
    left: 19%;
    --len: 96px;
    --angle: 27deg;
    --dx: 120px;
    --dy: 61px;
    --dur: 4.85s;
    --delay: 1.45s;
}

.globe-stage__meteor--3 {
    top: 3%;
    left: 33%;
    --len: 132px;
    --thick: 1.4px;
    --angle: 40deg;
    --dx: 176px;
    --dy: 148px;
    --dur: 5.65s;
    --delay: 2.8s;
}

.globe-stage__meteor--6 {
    top: 44%;
    left: 74%;
    --len: 86px;
    --thick: 1.2px;
    --angle: 30deg;
    --dx: 108px;
    --dy: 62px;
    --dur: 5.05s;
    --delay: 1.7s;
}

.globe-stage__meteor--7 {
    top: 57%;
    left: 12%;
    --len: 118px;
    --angle: 32deg;
    --dx: 150px;
    --dy: 94px;
    --dur: 5.95s;
    --delay: 4.15s;
}

/* ── 远 ── */
.globe-stage__meteor--4 {
    top: 37%;
    left: 47%;
    --len: 70px;
    --thick: 1px;
    --angle: 23deg;
    --dx: 88px;
    --dy: 37px;
    --tail: 0.12;
    --mid: 0.32;
    --head: 0.6;
    --dur: 3.8s;
    --delay: 0.85s;
}

.globe-stage__meteor--8 {
    top: 62%;
    left: 86%;
    --len: 62px;
    --thick: 1px;
    --angle: 25deg;
    --dx: 80px;
    --dy: 37px;
    --tail: 0.12;
    --mid: 0.32;
    --head: 0.6;
    --dur: 4.1s;
    --delay: 2.45s;
}

.globe-stage__meteor--9 {
    top: 7%;
    left: 88%;
    --len: 104px;
    --thick: 1.4px;
    --angle: 45deg;
    --dx: 152px;
    --dy: 152px;
    --dur: 6.05s;
    --delay: 4.9s;
}

/* ============ 动画 ============
   全部包在 no-preference 内：用户开了"减少动态效果"时整层静态，
   不残留任何 keyframes 覆盖 */
@media (prefers-reduced-motion: no-preference) {
    /* 经线 32s：与轨道环的 20s 拉开 60% 的差速。
       原来 24s 与 20s 只差 20%，肉眼分辨不出，看起来像"球和轨道同速转" */
    .globe-stage__meridians {
        animation: globe-spin 32s linear infinite;
    }

    /* 纬线慢摆：周期取经线的 1.25 倍、方向交替，避免与经线形成"整体同转" */
    .globe-stage__parallels {
        animation: globe-tilt 30s ease-in-out infinite alternate;
    }

    /* 扫掠光比经线快 4 倍 —— 快慢差是体积感的来源 */
    .globe-stage__sweep {
        animation: globe-spin 6s linear infinite;
    }

    .globe-stage__ring {
        animation: globe-ring-pulse 5s ease-out infinite;
    }

    .globe-stage__ring--2 {
        animation-delay: 1.66s;
    }

    .globe-stage__ring--3 {
        animation-delay: 3.33s;
    }

    .globe-stage__orbit-spin {
        animation: globe-spin 20s linear infinite;
    }

    /* 卫星比虚线环快 20/13 ≈ 1.54 倍角速度 */
    .globe-stage__orbit-sat {
        animation: globe-spin 13s linear infinite;
    }

    /* 只用长写属性挂载动画名：`animation` 简写会把 duration / delay 一并重置，
       抹掉各道自己的 --dur / --delay，九道就又变成同一节拍 */
    .globe-stage__meteor {
        animation-name: globe-meteor;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
    }
}

@keyframes globe-spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes globe-tilt {
    0% {
        transform: rotate(-5deg);
    }

    to {
        transform: rotate(5deg);
    }
}

@keyframes globe-ring-pulse {
    0% {
        transform: scale(0.72);
        opacity: 0.5;
    }

    70% {
        opacity: 0.06;
    }

    to {
        transform: scale(1.32);
        opacity: 0;
    }
}

/* 0%~15% 走完位移并淡出，15%~100% 保持不可见 —— 这段"空场"才是流星感的关键 */
@keyframes globe-meteor {
    0% {
        transform: translate3d(0, 0, 0) rotate(var(--angle));
        opacity: 0;
    }

    4% {
        opacity: 1;
    }

    15% {
        transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--angle));
        opacity: 0;
    }

    100% {
        transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--angle));
        opacity: 0;
    }
}

/* 窄屏：沿用同一套 left/bottom 锚点，只按宽度与高度收一档。
   必须与主档同一种定位方式 —— 否则跨 1100px 时球会从"贴底"跳成"沉底且变大" */
@media (max-width: 1100px) {
    .globe-stage__planet {
        left: 9%;
        bottom: 0%;
        width: min(200px, 26vw, 34vh);
    }
}

/* ≤768px 与 AuthDecorBackground 同一判据：此时卡片已全屏（padding:0 /
   max-width:100% / min-height:100dvh），不透明卡片会 100% 覆盖本层，
   留着只剩合成开销。判据是"卡片是否全屏"的布局问题，与输入设备无关 */
@media (max-width: 768px) {
    .globe-stage {
        display: none;
    }
}
</style>
