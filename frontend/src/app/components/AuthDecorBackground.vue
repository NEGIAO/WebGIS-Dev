<template>
    <!-- 认证页装饰层（注册 / 登录共用）：刻意与 Landing 首屏的「同心圆靶心」区分 ——
         主角是**两个错位轨道**：环心分居卡片两侧、环径不等、倾角相反、旋转方向相对逆向。
         卡片正好落在两轨交会处，读作"两条轨道在此交汇"。

         层次（由后至前）：底纹渐变 → 经纬网 → 等高线 → 散点/点位 → 天光 → 双轨 → 光斑。
         整层 pointer-events: none，纯视觉；层级低于表单卡片（.container z-index: 1） -->
    <div
        class="auth-decor"
        aria-hidden="true"
    >
        <div class="auth-decor__wash"></div>
        <div class="auth-decor__grid"></div>

        <!-- 等高线：GIS 最直白的视觉母题（地形图的那圈圈）。两组各据一角，
             用 repeating-radial-gradient 画线 + 径向 mask 让外缘自然消隐，
             纯 CSS 无图、无 JS -->
        <div class="auth-decor__contours auth-decor__contours--a"></div>
        <div class="auth-decor__contours auth-decor__contours--b"></div>

        <!-- 散点 + 空心点位：填满中上部大片留白，读作"地图上的点位"而非装饰雪花 -->
        <div class="auth-decor__stars"></div>

        <!-- 右上角超大半透明光晕（与 Landing .hero-bg__sun 同参数，略加强） -->
        <div class="auth-decor__sun"></div>

        <!-- 双轨：A 顺时针、B 逆时针；环径 780 / 700，倾角 -13° / +11°，
             环心 33%/52% 与 67%/46% 错位，既不共心也不镜像。
             每轨内部再套三环（外 / 中 / 核），三环共用同一张 PNG 纹样，
             但 background-size 分别 124% / 96% / 90% —— 花边因此落在三个
             不同半径上，叠成"外圈花边贴边、中圈花边内收、核心环收紧"的
             综合圆环，这正是 Landing 三环的做法（见该文件环几何注释） -->
        <div class="auth-decor__orbits">
            <div class="auth-decor__orbit auth-decor__orbit--a">
                <div class="auth-decor__ring auth-decor__ring--outer">
                    <span class="auth-decor__satellite auth-decor__satellite--1"></span>
                    <span class="auth-decor__satellite auth-decor__satellite--2"></span>
                </div>
                <div class="auth-decor__ring auth-decor__ring--mid"></div>
                <div class="auth-decor__ring auth-decor__ring--core"></div>
            </div>
            <div class="auth-decor__orbit auth-decor__orbit--b">
                <div class="auth-decor__ring auth-decor__ring--outer">
                    <span class="auth-decor__satellite auth-decor__satellite--3"></span>
                    <span class="auth-decor__satellite auth-decor__satellite--4"></span>
                </div>
                <div class="auth-decor__ring auth-decor__ring--mid"></div>
                <div class="auth-decor__ring auth-decor__ring--core"></div>
            </div>
        </div>

        <div class="auth-decor__blob auth-decor__blob--1"></div>
        <div class="auth-decor__blob auth-decor__blob--2"></div>
        <div class="auth-decor__blob auth-decor__blob--3"></div>

        <!-- 动态 SVG 层：虚线沿弧流动 + 定位点脉冲。
             全部是 transform / stroke-dashoffset 动画，无 JS、无第三方库；
             轨迹用 viewBox 1440×900 等比铺满（slice 裁切），只做氛围不承载信息 -->
        <svg
            class="auth-decor__svg"
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
            focusable="false"
        >
            <!-- 数据流轨迹：左上向右、右下向左，两条方向相反 -->
            <path
                class="auth-decor__flow auth-decor__flow--a"
                d="M -50 300 C 150 150, 380 110, 610 40"
            />
            <path
                class="auth-decor__flow auth-decor__flow--b"
                d="M 830 890 C 1040 850, 1280 760, 1500 600"
            />

            <!-- 定位脉冲：实心点 + 两圈扩散环（错峰），读作"地图上正在上报的点位" -->
            <g class="auth-decor__ping-group">
                <circle
                    class="auth-decor__ping-dot"
                    cx="170"
                    cy="250"
                    r="2.4"
                />
                <circle
                    class="auth-decor__ping"
                    cx="170"
                    cy="250"
                    r="4"
                />
                <circle
                    class="auth-decor__ping auth-decor__ping--late"
                    cx="170"
                    cy="250"
                    r="4"
                />
            </g>
            <g class="auth-decor__ping-group">
                <circle
                    class="auth-decor__ping-dot auth-decor__ping-dot--gold"
                    cx="1300"
                    cy="470"
                    r="2.4"
                />
                <circle
                    class="auth-decor__ping auth-decor__ping--gold"
                    cx="1300"
                    cy="470"
                    r="4"
                />
                <circle
                    class="auth-decor__ping auth-decor__ping--gold auth-decor__ping--late"
                    cx="1300"
                    cy="470"
                    r="4"
                />
            </g>
            <g class="auth-decor__ping-group">
                <circle
                    class="auth-decor__ping-dot"
                    cx="1010"
                    cy="800"
                    r="2.4"
                />
                <circle
                    class="auth-decor__ping"
                    cx="1010"
                    cy="800"
                    r="4"
                />
                <circle
                    class="auth-decor__ping auth-decor__ping--late"
                    cx="1010"
                    cy="800"
                    r="4"
                />
            </g>

            <!-- 星座：线段自绘（pathLength=1 + dashoffset 1→0）+ 节点呼吸。
                 隐喻"把散落的点连成意义"——宇宙里没有线，是人把星连成了形状 -->
            <g class="auth-decor__constellation">
                <path
                    class="auth-decor__const-line"
                    pathLength="1"
                    d="M 92 182 L 166 130 L 238 172 L 296 106"
                />
                <path
                    class="auth-decor__const-line auth-decor__const-line--2"
                    pathLength="1"
                    d="M 166 130 L 204 74"
                />
                <path
                    class="auth-decor__const-line auth-decor__const-line--3"
                    pathLength="1"
                    d="M 238 172 L 270 222"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--1"
                    cx="92"
                    cy="182"
                    r="2.4"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--2"
                    cx="166"
                    cy="130"
                    r="3"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--3"
                    cx="238"
                    cy="172"
                    r="2.2"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--4"
                    cx="296"
                    cy="106"
                    r="2.8"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--5"
                    cx="204"
                    cy="74"
                    r="2"
                />
                <circle
                    class="auth-decor__const-node auth-decor__const-node--6"
                    cx="270"
                    cy="222"
                    r="2"
                />
            </g>

            <!-- 宇航员：线稿 + 白色描边，缓慢漂浮（位移 + 轻微自转），
                 系绳从背包甩向画外。宇宙里"有人在看"——这是整层里唯一的主体，
                 其余都是环境 -->
            <g transform="translate(118 586) scale(1.08)">
                <g class="auth-decor__astronaut">
                    <!-- 绘制顺序即遮挡顺序：四肢 → 躯干 → 头盔。
                         四肢先画，肩/髋处的根部被躯干的白填充盖住，
                         露出来的只有躯干外侧那一段 —— 否则手臂会像"画在身体上" -->

                    <!-- 左臂：以肩点 (0,0) 为轴 ±10° 摆动。
                         关节旋转必须用 SMIL：CSS rotate() 的 transform-origin
                         对嵌套 SVG 组不可靠（fill-box 以 bbox 左上角为基准、
                         view-box 以视口原点为基准，两者都不是"肩点"）；
                         animateTransform 的 rotate 可直接给 cx cy -->
                    <g transform="translate(33 64)">
                        <g>
                            <path
                                class="auth-decor__limb"
                                d="M 0 0 C -10 8, -13 20, -10 28"
                            />
                            <circle
                                class="auth-decor__glove"
                                cx="-10"
                                cy="30"
                                r="3.6"
                            />
                            <animateTransform
                                v-if="motionEnabled"
                                attributeName="transform"
                                type="rotate"
                                values="4 0 0; -12 0 0; 4 0 0"
                                dur="5.2s"
                                repeatCount="indefinite"
                            />
                        </g>
                    </g>
                    <!-- 右臂：反相位，5.8s -->
                    <g transform="translate(67 64)">
                        <g>
                            <path
                                class="auth-decor__limb"
                                d="M 0 0 C 10 8, 13 20, 10 28"
                            />
                            <circle
                                class="auth-decor__glove"
                                cx="10"
                                cy="30"
                                r="3.6"
                            />
                            <animateTransform
                                v-if="motionEnabled"
                                attributeName="transform"
                                type="rotate"
                                values="-4 0 0; 10 0 0; -4 0 0"
                                dur="5.8s"
                                repeatCount="indefinite"
                            />
                        </g>
                    </g>

                    <!-- 左腿：以髋点 (0,0) 为轴 ±8° -->
                    <g transform="translate(43 100)">
                        <g>
                            <path
                                class="auth-decor__limb"
                                d="M 0 0 C -2 10, -3 18, -4 26"
                            />
                            <path
                                class="auth-decor__limb"
                                d="M -11 26 L 1 26"
                            />
                            <animateTransform
                                v-if="motionEnabled"
                                attributeName="transform"
                                type="rotate"
                                values="3 0 0; -8 0 0; 3 0 0"
                                dur="6.4s"
                                repeatCount="indefinite"
                            />
                        </g>
                    </g>
                    <!-- 右腿：反相位，7.1s -->
                    <g transform="translate(57 100)">
                        <g>
                            <path
                                class="auth-decor__limb"
                                d="M 0 0 C 2 10, 3 18, 4 26"
                            />
                            <path
                                class="auth-decor__limb"
                                d="M -1 26 L 11 26"
                            />
                            <animateTransform
                                v-if="motionEnabled"
                                attributeName="transform"
                                type="rotate"
                                values="-3 0 0; 8 0 0; -3 0 0"
                                dur="7.1s"
                                repeatCount="indefinite"
                            />
                        </g>
                    </g>

                    <!-- 躯干 + 控制面板 -->
                    <rect
                        class="auth-decor__suit"
                        x="30"
                        y="58"
                        width="40"
                        height="44"
                        rx="15"
                    />
                    <rect
                        class="auth-decor__panel"
                        x="41"
                        y="66"
                        width="17"
                        height="13"
                        rx="2"
                    />

                    <!-- 头盔：外圈 + 内圈玻璃环 + 宽面罩。
                         面罩必须"宽而扁"——圆形面罩会被读成单眼（第一版就栽在这） -->
                    <circle
                        class="auth-decor__suit"
                        cx="50"
                        cy="34"
                        r="21"
                    />
                    <circle
                        class="auth-decor__helmet-ring"
                        cx="50"
                        cy="34"
                        r="16.5"
                    />
                    <rect
                        class="auth-decor__visor"
                        x="37.5"
                        y="24"
                        width="26"
                        height="19"
                        rx="9.5"
                    />
                    <rect
                        class="auth-decor__visor-glow"
                        x="41"
                        y="27"
                        width="9"
                        height="4.6"
                        rx="2.3"
                        transform="rotate(-22 45.5 29.3)"
                    />
                </g>
            </g>
        </svg>
    </div>
</template>

<script setup lang="ts">
import { useRingPatternStyle } from '../composables/useRingPatternStyle';

// 纹样 PNG 的 url() 必须由文档级样式表解析（相对路径写在 scoped CSS 里
// 会按打包产物 /assets/ 解析而 404），注入实现与 Landing 共用同一份；
// 本组件只负责几何与动画，不重复维护图源路径。
useRingPatternStyle({
    styleId: 'auth-decor-ring-pattern-style',
    scope: '.auth-decor__orbits',
    ringClass: 'auth-decor__ring',
});

// 宇航员的四肢摆动用 SMIL（rotate 可直接指定关节坐标），但 SMIL 不响应
// prefers-reduced-motion —— 在 setup 期读一次系统偏好，关闭动效时干脆
// 不渲染 <animateTransform>，保住"减少动态效果即整层静态"的承诺
const motionEnabled =
    typeof window === 'undefined' ||
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<style scoped>
.auth-decor {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
}

/* 底纹渐变：顶部品牌绿微光 + 右下暖金微光。
   作用是让整页不再是"一张纯白纸"，同时把注意力往中央卡片收 */
.auth-decor__wash {
    position: absolute;
    inset: 0;
    background:
        radial-gradient(ellipse 120% 70% at 50% -8%, rgba(var(--brand-primary-rgb), 0.07), transparent 62%),
        radial-gradient(ellipse 90% 65% at 92% 108%, rgba(var(--brand-gold-rgb), 0.05), transparent 60%);
}

/* 经纬网：沿用认证页原有 28px（比 Landing 的 42px 更细，表单页不抢读），
   透明度提到 0.07、mask 从"只露顶部"改为"顶部浓、向下渐隐"，
   让整页都有可感知的技术底纹。
   刻意不加 Landing 的 background-position 漂移 —— 该属性不可合成，
   等于每帧重绘整层，表单页不引入这项开销 */
.auth-decor__grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(var(--brand-primary-rgb), 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.07) 1px, transparent 1px);
    background-size: 28px 28px;
    -webkit-mask-image: radial-gradient(ellipse 95% 85% at 50% 8%, #000 10%, transparent 82%);
    mask-image: radial-gradient(ellipse 95% 85% at 50% 8%, #000 10%, transparent 82%);
}

/* ============ 等高线 ============
   1px 线、28/32px 步长，密集但不抢眼；mask 从角点向外淡出，
   让线组读作"地图的一角"而不是满屏纹理。
   两个角分别是左下（品牌绿）与右上（暖金），与天光同色系 */
.auth-decor__contours {
    position: absolute;
    inset: 0;
}

.auth-decor__contours--a {
    background: repeating-radial-gradient(
        ellipse 120% 105% at 4% 100%,
        rgba(var(--brand-primary-rgb), 0.14) 0 1px,
        transparent 1px 28px
    );
    -webkit-mask-image: radial-gradient(ellipse 52% 48% at 4% 100%, #000 0%, transparent 74%);
    mask-image: radial-gradient(ellipse 52% 48% at 4% 100%, #000 0%, transparent 74%);
}

.auth-decor__contours--b {
    background: repeating-radial-gradient(
        ellipse 110% 100% at 98% 0%,
        rgba(var(--brand-gold-rgb), 0.13) 0 1px,
        transparent 1px 32px
    );
    -webkit-mask-image: radial-gradient(ellipse 46% 44% at 98% 0%, #000 0%, transparent 72%);
    mask-image: radial-gradient(ellipse 46% 44% at 98% 0%, #000 0%, transparent 72%);
}

/* ============ 散点 / 点位 ============
   13 枚 1~2px 实心点 + 3 枚空心环，位置刻意避开中央卡片区（x 32%~68%）。
   用多层 radial-gradient 一次画完，不用 DOM 堆点、也不用图片 */
.auth-decor__stars {
    position: absolute;
    inset: 0;
    background-image:
        radial-gradient(circle 1.5px at 12% 18%, rgba(var(--brand-primary-rgb), 0.38) 0 1.5px, transparent 1.5px),
        radial-gradient(circle 1px at 21% 41%, rgba(var(--brand-primary-rgb), 0.3) 0 1px, transparent 1px),
        radial-gradient(circle 2px at 27% 72%, rgba(var(--brand-primary-rgb), 0.26) 0 2px, transparent 2px),
        radial-gradient(circle 1px at 16% 86%, rgba(var(--brand-gold-rgb), 0.34) 0 1px, transparent 1px),
        radial-gradient(circle 1.5px at 8% 55%, rgba(var(--brand-primary-rgb), 0.3) 0 1.5px, transparent 1.5px),
        radial-gradient(circle 1px at 30% 26%, rgba(var(--brand-gold-rgb), 0.32) 0 1px, transparent 1px),
        radial-gradient(circle 1.5px at 24% 93%, rgba(var(--brand-primary-rgb), 0.28) 0 1.5px, transparent 1.5px),
        radial-gradient(circle 1px at 88% 16%, rgba(var(--brand-primary-rgb), 0.34) 0 1px, transparent 1px),
        radial-gradient(circle 2px at 78% 62%, rgba(var(--brand-primary-rgb), 0.24) 0 2px, transparent 2px),
        radial-gradient(circle 1px at 92% 45%, rgba(var(--brand-gold-rgb), 0.32) 0 1px, transparent 1px),
        radial-gradient(circle 1.5px at 84% 78%, rgba(var(--brand-primary-rgb), 0.28) 0 1.5px, transparent 1.5px),
        radial-gradient(circle 1px at 72% 22%, rgba(var(--brand-primary-rgb), 0.3) 0 1px, transparent 1px),
        radial-gradient(circle 1.5px at 94% 88%, rgba(var(--brand-gold-rgb), 0.28) 0 1.5px, transparent 1.5px),
        /* 空心点位：读作地图上的 POI，与实心点形成大小/虚实对比 */
        radial-gradient(circle 6px at 20% 60%, transparent 4.4px, rgba(var(--brand-primary-rgb), 0.3) 4.4px 6px, transparent 6px),
        radial-gradient(circle 5px at 86% 34%, transparent 3.6px, rgba(var(--brand-gold-rgb), 0.34) 3.6px 5px, transparent 5px),
        radial-gradient(circle 7px at 76% 90%, transparent 5.2px, rgba(var(--brand-primary-rgb), 0.24) 5.2px 7px, transparent 7px);
}

/* 天光：约 46vw 见方、探出右上角，overflow:hidden 把探出部分裁成弧顶。
   低透明度，只做纵深不抢表单 */
.auth-decor__sun {
    position: absolute;
    top: -13vw;
    right: -11vw;
    width: 46vw;
    height: 46vw;
    background:
        radial-gradient(circle at 50% 50%, rgba(var(--brand-gold-rgb), 0.2), rgba(var(--brand-gold-rgb), 0) 58%),
        repeating-conic-gradient(
            from 0deg at 50% 50%,
            rgba(var(--brand-primary-rgb), 0.07) 0deg 5deg,
            rgba(var(--brand-primary-rgb), 0) 5deg 11deg
        );
    -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 64%);
    mask-image: radial-gradient(circle at 50% 50%, #000 0%, transparent 64%);
    opacity: 0.9;
}

/* ============ 双轨（与 Landing 同心圆的核心差异） ============
   每个轨道是一个"静态倾角外壳 + 内部旋转环"的两层结构：
     · 外壳负责 translate 定位与 rotate/scaleY 压扁成椭圆（倾角 = 透视感）；
     · 内环负责自转（动画写在外壳上会被 @keyframes 的 transform 覆盖，
       所以倾角与自转必须分属两层）。
   两轨环径**不相等**（780 / 640）：等径 + 对称会被读成"镜像副本"，
   一大一小才像两条各自独立的轨道。
   环径用 min(px, vw, vh)：窄屏按宽度收、矮屏按高度收，
   保证两圈始终完整成椭圆而不会被裁成几段弧 */
.auth-decor__orbits {
    --orbit-size-a: min(780px, 64vw, 84vh);
    --orbit-size-b: min(700px, 56vw, 74vh);

    position: absolute;
    inset: 0;
}

.auth-decor__orbit {
    position: absolute;
    /* 以 left/top 指定的点为环心：先按自身尺寸回退半个身位，
       再叠加倾角与纵向压扁（transform 从右往左生效：先压扁、再倾斜、最后平移） */
    transform: translate(-50%, -50%) rotate(-13deg) scaleY(0.88);
}

/* A 轨（大）：卡片左侧，环心略低于中线（52%），顺时针 */
.auth-decor__orbit--a {
    width: var(--orbit-size-a);
    height: var(--orbit-size-a);
    left: 33%;
    top: 52%;
}

/* B 轨（小）：卡片右侧，环心略高于中线（46%），逆时针、倾角反向。
   与 A 的上下错位是有意的 —— 完全镜像会被读成"同一条轨道的镜像副本" */
.auth-decor__orbit--b {
    width: var(--orbit-size-b);
    height: var(--orbit-size-b);
    left: 67%;
    top: 46%;
    transform: translate(-50%, -50%) rotate(11deg) scaleY(0.88);
}

/* ============ 三环综合圆环（外 / 中 / 核） ============
   每轨内部三环同心，尺寸比例直接沿用 Landing（960 : 680 : 420 ≈
   100% : 70.8% : 43.75%），用 inset 定位实现 —— inset 让环心自动对齐
   父级中心，自身 transform 可整体交给旋转动画，不会出现"动画覆盖定位"
   导致的偏移。
   三环共用同一张 PNG，但 background-size 分别是 124% / 96% / 90%：
   花边因此落在三个不同半径上（外环贴边、中环内收、核心环收紧），
   叠起来才是一个"综合圆环"，而不是同一条线复制三份。
   这也是 Landing 三环的关键做法，本页沿用同一套比例语言 */
.auth-decor__ring {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
}

.auth-decor__ring--outer {
    inset: 0;
}

/* 中环 70.8%（inset 14.6%）、核心环 43.75%（inset 28.1%） */
.auth-decor__ring--mid {
    inset: 14.6%;
}

.auth-decor__ring--core {
    inset: 28.1%;
}

/* A 轨：外虚线 → 中点线 → 核点线（线型由重到轻，读作同一系统的三层）
   两个坑叠加，才让"内两环不转"：
     ① 正圆的**实线**边框旋转在视觉上等于静止 —— 圆周完全对称，没有可追踪的特征点；
        纹样 PNG 又是高阶对称花边，130s 一圈更读不出来。故内两环统一用 dotted。
     ② 点线覆盖率只有实线的一半，alpha 再压到 0.2 就近乎不可见，
        "点在滑动"同样看不出来 —— 看起来还是不转。
   故三环 alpha 整体提到与右侧 B 轨同一档（具体值见下方 border），
   外环因虚线墨量偏少而略高于 B 轨外环 */
.auth-decor__orbit--a .auth-decor__ring--outer {
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.58);
}

.auth-decor__orbit--a .auth-decor__ring--mid {
    border: 1px dotted rgba(var(--brand-primary-rgb), 0.42);
}

.auth-decor__orbit--a .auth-decor__ring--core {
    border: 1px dotted rgba(var(--brand-primary-rgb), 0.36);
}

/* B 轨：外实线 → 中虚线金 → 核点线金（与 A 的线型顺序刻意相反） */
.auth-decor__orbit--b .auth-decor__ring--outer {
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.5);
}

.auth-decor__orbit--b .auth-decor__ring--mid {
    border: 1px dashed rgba(var(--brand-gold-rgb), 0.42);
}

.auth-decor__orbit--b .auth-decor__ring--core {
    border: 1px dotted rgba(var(--brand-gold-rgb), 0.36);
}

/* 纹样层：background-image 由 useRingPatternStyle 注入（不用 mask —— iOS
   Safari 在持续 transform 旋转的父元素内会把遮罩层栅格化成黑环）。
   三环只改 background-size，不改图源：同一张 PNG 通过缩放落在不同半径，
   这是"综合圆环"的成因，也是 Landing 三环的实现方式 */
.auth-decor__ring::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background-repeat: no-repeat;
    background-position: center;
}

/* 外环 124%：花边顶到环线内侧（实测花纹半径 ≈ 0.966 × 环半径） */
.auth-decor__ring--outer::before {
    background-size: 124% 124%;
    opacity: 0.85;
}

/* 中环 96%：缩放变小后 alpha 被面积平均稀释，故 opacity 略提；
   花边落到约 0.75 × 环半径，形成"环内再一圈花边"的层次 */
.auth-decor__ring--mid::before {
    background-size: 96% 96%;
    opacity: 0.85;
}

/* 核心环 90%：环最小、稀释最重，压到 0.7 让花边只作质感底纹 */
.auth-decor__ring--core::before {
    background-size: 90% 90%;
    opacity: 0.7;
}

/* 公转点：载体是铺满整环的透明层，点画在 12 点方向 ——
   "点绕环公转"退化成"整层绕自身圆心旋转"，旋转原点天然是环心，
   不必随环径（vw/vh 联动）去改 transform-origin。
   只挂在外环上：三环各挂一个点会读成"三套独立系统"，
   与"同一系统的三层"相悖。A 轨空心、B 轨实心 */
.auth-decor__orbit--a .auth-decor__ring--outer::after {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    background: radial-gradient(
        circle 7px at 50% 7px,
        transparent 5.5px,
        var(--brand-gold) 5.5px 7px,
        transparent 7px
    );
}

.auth-decor__orbit--b .auth-decor__ring--outer::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: radial-gradient(
        circle 4px at 50% 4px,
        var(--brand-gold) 4px,
        transparent 4px
    );
}

/* 卫星小环：每轨两枚，钉在环上随环自转（环的子节点），
   与公转点形成"一大一小、一实一空"的层次。
   位置按角度换算：θ=40° → (88.3%, 82.1%)，θ=210° → (6.7%, 25%) 等 */
.auth-decor__satellite {
    position: absolute;
    width: 6px;
    height: 6px;
    margin: -3px 0 0 -3px;
    border-radius: 50%;
    border: 1px solid rgba(var(--brand-primary-rgb), 0.4);
}

.auth-decor__satellite--1 {
    left: 88.3%;
    top: 82.1%;
}

.auth-decor__satellite--2 {
    left: 6.7%;
    top: 25%;
}

.auth-decor__orbit--b .auth-decor__satellite {
    width: 5px;
    height: 5px;
    margin: -2.5px 0 0 -2.5px;
    border-color: rgba(var(--brand-gold-rgb), 0.45);
}

.auth-decor__satellite--3 {
    left: 25%;
    top: 93.3%;
}

.auth-decor__satellite--4 {
    left: 75%;
    top: 6.7%;
}

/* ============ 动态 SVG 层 ============
   两条虚线轨迹（方向相反）+ 三处定位脉冲。
   轨迹靠 stroke-dashoffset 流动、脉冲靠 transform/opacity 扩散 ——
   都是合成友好属性，不触发整层重排；无 JS、无第三方库、无外部请求 */
.auth-decor__svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
}

.auth-decor__flow {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.42);
    stroke-width: 1.3;
    stroke-linecap: round;
    /* 1.5 实 + 11 空 = 12.5 一个周期；dashoffset 走满一个周期即无缝循环 */
    stroke-dasharray: 1.5 11;
}

.auth-decor__flow--b {
    stroke: rgba(var(--brand-gold-rgb), 0.48);
}

.auth-decor__ping-dot {
    fill: rgba(var(--brand-primary-rgb), 0.55);
}

.auth-decor__ping-dot--gold {
    fill: rgba(var(--brand-gold-rgb), 0.6);
}

.auth-decor__ping {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.5);
    stroke-width: 1;
    /* fill-box：以圆自身包围盒为基准缩放，圆心即缩放原点。
       不写则按视口原点缩放，扩散环会被甩出画面 */
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
}

.auth-decor__ping--gold {
    stroke: rgba(var(--brand-gold-rgb), 0.55);
}

/* ============ 星座 ============
   线段用 pathLength="1" 归一化：dasharray 1 即"整条线一段"，
   dashoffset 1 → 0 就是"从起点画到终点"，不必测量实际路径长度 */

/* 纵向位置补偿（防顶部被裁）。
   本层 SVG 用 viewBox 1440×900 + preserveAspectRatio="slice" 铺满：
   视口比 1.6 更宽时，上下各被裁掉 (900 - 720 / 宽高比) / 2 个 viewBox 单位。
   星座最上面的节点在 y=74，宽屏上会被推到屏幕顶部之外 —— 例如 21:9
   裁掉 141 单位，74 直接变负。故按宽高比分档下移，保证顶部始终留白。
   数值 ≈ 该档的裁切量 + 46（目标顶部留白），三档分别对应 16:9 / 2:1 / 5:2 */
@media (min-aspect-ratio: 16 / 9) {
    .auth-decor__constellation {
        transform: translateY(5px);
    }
}

@media (min-aspect-ratio: 2 / 1) {
    .auth-decor__constellation {
        transform: translateY(70px);
    }
}

@media (min-aspect-ratio: 5 / 2) {
    .auth-decor__constellation {
        transform: translateY(220px);
    }
}

.auth-decor__const-line {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.42);
    stroke-width: 1;
    stroke-linecap: round;
    stroke-dasharray: 1;
    /* 默认画完：开了"减少动态效果"的用户直接看到完整星座，
       不会因为动画被禁用而留下一片空白（见媒体查询里的反向覆盖） */
    stroke-dashoffset: 0;
}

.auth-decor__const-node {
    fill: rgba(var(--brand-gold-rgb), 0.6);
    opacity: 0.9;
}

/* ============ 宇航员 ============
   纯白填充 + 绿描边：宇航员脚下新增了线框地球（AuthGlobeStage），
   半透明白在浅底上会与球体的低 alpha 线稿糊成一片，故改为不透明 #fff，
   靠"实心白 vs 线框"的材质差把它从地球上分离出来。
   四肢是开放路径（fill:none），靠 .auth-decor__astronaut 的白色
   drop-shadow 包边获得同样的实体感，不必复制一份路径做描边层。
   系绳用虚线，读作"连着飞船的缆"，不是装饰线 */
.auth-decor__suit {
    fill: #fff;
    stroke: rgba(var(--brand-primary-rgb), 0.45);
    stroke-width: 1.4;
}

.auth-decor__limb {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.45);
    stroke-width: 1.6;
    stroke-linecap: round;
}

.auth-decor__visor {
    /* 深色面罩：浅底上唯一的重色块，负责把"圆头"读成"头盔" */
    fill: rgba(var(--brand-primary-dark-rgb), 0.55);
    stroke: rgba(var(--brand-gold-rgb), 0.45);
    stroke-width: 1;
}

/* 头盔内圈：一圈极淡的玻璃环，把"圆头"读成"头盔玻璃" */
.auth-decor__helmet-ring {
    fill: none;
    stroke: rgba(var(--brand-primary-rgb), 0.18);
    stroke-width: 1;
}

/* 面罩高光：一枚小椭圆，给玻璃质感，避免整块死黑 */
.auth-decor__visor-glow {
    fill: rgba(255, 255, 255, 0.6);
}

.auth-decor__panel {
    fill: rgba(var(--brand-gold-rgb), 0.24);
    stroke: rgba(var(--brand-gold-rgb), 0.45);
    stroke-width: 0.8;
}

.auth-decor__glove {
    fill: #fff;
    stroke: rgba(var(--brand-primary-rgb), 0.45);
    stroke-width: 1.1;
}

/* 宇航员整体：白色包边 + 落地投影。
   浅底上纯白填充会与背景糊在一起，靠这两层 filter 把它"抠"出来：
   · 第一层 drop-shadow 无偏移、纯白，等于给所有描边加一道白色包边 ——
     原本只有 stroke 的四肢因此获得与躯干一致的实体感；
   · 第二层带偏移的深色投影，把整个人从下方的线框地球上分离，
     投影同时充当"悬浮高度"的视觉线索 */
.auth-decor__astronaut {
    filter:
        drop-shadow(0 0 1.2px rgba(255, 255, 255, 0.95))
        drop-shadow(0 2px 4px rgba(16, 36, 58, 0.18));
}

/* ============ 动画 ============
   全部包在 prefers-reduced-motion: no-preference 内：用户开了"减少动态效果"
   时整层静态，不留残余动画 */
@media (prefers-reduced-motion: no-preference) {
    .auth-decor__sun {
        animation: auth-sun-spin 96s linear infinite;
    }

    /* 数据流：A 正向、B 反向，速度也不同，两条轨迹不会被看成同一条的复制 */
    .auth-decor__flow--a {
        animation: auth-flow-fwd 2.6s linear infinite;
    }

    .auth-decor__flow--b {
        animation: auth-flow-rev 3.4s linear infinite;
    }

    /* 定位脉冲：4.4s 一轮，--late 错峰 1.6s，两圈交替扩散 */
    .auth-decor__ping {
        animation: auth-ping 4.4s ease-out infinite;
    }

    .auth-decor__ping--late {
        animation-delay: 1.6s;
    }

    /* 星座：三条线依次自绘（0.6s / 1.5s / 1.9s 起笔），画完停在终态；
       节点随后错峰亮起并持续呼吸 */
    .auth-decor__const-line {
        stroke-dashoffset: 1;
        animation: auth-draw 2.2s cubic-bezier(0.4, 0, 0.2, 1) 0.6s forwards;
    }

    .auth-decor__const-line--2 {
        animation-delay: 1.5s;
    }

    .auth-decor__const-line--3 {
        animation-delay: 1.9s;
    }

    .auth-decor__const-node {
        opacity: 0;
        animation: auth-node 5.4s ease-in-out infinite;
    }

    .auth-decor__const-node--1 {
        animation-delay: 1.4s;
    }

    .auth-decor__const-node--2 {
        animation-delay: 1.8s;
    }

    .auth-decor__const-node--3 {
        animation-delay: 2.1s;
    }

    .auth-decor__const-node--4 {
        animation-delay: 2.4s;
    }

    .auth-decor__const-node--5 {
        animation-delay: 2.7s;
    }

    .auth-decor__const-node--6 {
        animation-delay: 3s;
    }

    /* 宇航员：22s 一个来回，位移 8/-16px、自转 ±3°——
       幅度刻意压到"要盯两秒才发现在动"，避免抢走表单注意力 */
    .auth-decor__astronaut {
        animation: auth-float 10s ease-in-out infinite;
        transform-box: fill-box;
        transform-origin: center;
    }

    /* 散点整体呼吸：只动 opacity，可合成，不触发重绘 */
    .auth-decor__stars {
        animation: auth-twinkle 7.5s ease-in-out infinite alternate;
    }

    /* 三环各自异速异向：外环定主方向（A 顺 / B 逆），中环与核心环交替反向，
       三环永不锁死成一个刚体 —— 这是"综合圆环"与"单个圆"的手感差别 */
    .auth-decor__orbit--a .auth-decor__ring--outer {
        animation: auth-orbit-cw 90s linear infinite;
    }

    .auth-decor__orbit--a .auth-decor__ring--mid {
        animation: auth-orbit-ccw 130s linear infinite;
    }

    .auth-decor__orbit--a .auth-decor__ring--core {
        animation: auth-orbit-cw 180s linear infinite;
    }

    .auth-decor__orbit--b .auth-decor__ring--outer {
        animation: auth-orbit-ccw 120s linear infinite;
    }

    .auth-decor__orbit--b .auth-decor__ring--mid {
        animation: auth-orbit-cw 150s linear infinite;
    }

    .auth-decor__orbit--b .auth-decor__ring--core {
        animation: auth-orbit-ccw 210s linear infinite;
    }

    /* 差速公转：点是外环的子节点，实际角速度 = 环角速度 + 点自身角速度。
       A 90s 顺 ⊕ 60s 顺 → 净约 36s 顺；B 120s 逆 ⊕ 50s 逆 → 净约 35s 逆。
       两点净周期接近、方向相反，读作"两颗卫星反向掠过" */
    .auth-decor__orbit--a .auth-decor__ring--outer::after {
        animation: auth-orbit-cw 60s linear infinite;
    }

    .auth-decor__orbit--b .auth-decor__ring--outer::after {
        animation: auth-orbit-ccw 50s linear infinite;
    }
}

@keyframes auth-sun-spin {
    to {
        transform: rotate(360deg);
    }
}

@keyframes auth-orbit-cw {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

@keyframes auth-orbit-ccw {
    from {
        transform: rotate(360deg);
    }

    to {
        transform: rotate(0deg);
    }
}

/* 虚线流动：位移量恰好等于一个 dasharray 周期（1.5 + 11），
   首尾无缝；正负号决定流动方向 */
@keyframes auth-flow-fwd {
    to {
        stroke-dashoffset: -12.5;
    }
}

@keyframes auth-flow-rev {
    to {
        stroke-dashoffset: 12.5;
    }
}

/* 定位脉冲：从 1 倍扩到 3.8 倍并淡出，后 30% 留空作为间隔 */
@keyframes auth-ping {
    0% {
        transform: scale(1);
        opacity: 0.5;
    }

    70%,
    100% {
        transform: scale(3.8);
        opacity: 0;
    }
}

/* 星座自绘：dashoffset 归零即"画完"，forwards 保证停在完整状态 */
@keyframes auth-draw {
    to {
        stroke-dashoffset: 0;
    }
}

/* 节点呼吸：先亮起（0→12%），再在 0.9 与 0.35 之间缓慢起伏 */
@keyframes auth-node {
    0% {
        opacity: 0;
    }

    12% {
        opacity: 0.9;
    }

    55% {
        opacity: 0.35;
    }

    100% {
        opacity: 0.9;
    }
}

/* 漂浮：位移与自转同时走，回程用同一组关键帧的镜像，
   配合 ease-in-out 读作"在失重里缓慢翻身" */
/* 漂浮：三段式轨迹（起 → 左上 → 回落），位移 12/-20px、自转 -3°~+5°。
   单段往返会读成"上下弹跳"，三段带横向偏移才像失重里被气流推着走 */
@keyframes auth-float {
    0%,
    100% {
        transform: translate(0, 0) rotate(-3deg);
    }

    30% {
        transform: translate(12px, -20px) rotate(2deg);
    }

    60% {
        transform: translate(2px, -8px) rotate(5deg);
    }
}

@keyframes auth-twinkle {
    from {
        opacity: 0.75;
    }

    to {
        opacity: 1;
    }
}

/* ============ 光斑 ============ */
.auth-decor__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.3;
}

/* 左上主光斑：与右上角天光形成对角平衡 */
.auth-decor__blob--1 {
    width: 420px;
    height: 420px;
    top: -120px;
    left: -100px;
    background: rgba(var(--brand-primary-rgb), 0.25);
}

/* 右下副光斑：弱强调色托底 */
.auth-decor__blob--2 {
    width: 380px;
    height: 380px;
    bottom: -80px;
    right: -80px;
    background: rgba(var(--brand-accent-rgb, 87, 184, 97), 0.2);
}

/* 底部中央暖金微光：托住卡片下沿，避免下半屏发空 */
.auth-decor__blob--3 {
    width: 520px;
    height: 260px;
    bottom: -150px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(var(--brand-gold-rgb), 0.16);
    filter: blur(90px);
    opacity: 0.45;
}

/* ============ 移动端：整层关闭 ============
   ≤768px 时 RegisterView 把卡片改成全屏（padding:0 / max-width:100% /
   min-height:100dvh），不透明卡片会 100% 覆盖本层 —— 留着只剩合成开销，
   没有任何像素被看见。故整层 display:none，而不是逐项降级。
   判据用宽度断点而非 pointer:coarse：这是"卡片是否全屏"的布局问题，
   与输入设备能力无关（窄桌面窗口同样成立） */
@media (max-width: 768px) {
    .auth-decor {
        display: none;
    }
}
</style>
