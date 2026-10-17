<template>
    <div class="legal-container">
        <!-- 页面装饰层：GIS 网格 + 角落光斑（与 LandingView hero-bg 同一视觉语言） -->
        <div
            class="legal-bg"
            aria-hidden="true"
        >
            <div class="legal-bg__grid"></div>
            <div class="legal-bg__blob legal-bg__blob--1"></div>
            <div class="legal-bg__blob legal-bg__blob--2"></div>
        </div>
        <div class="legal-card fade-in">
            <div class="legal-header">
                <h1><i class="fas fa-file-contract"></i> 服务条款</h1>
                <p class="legal-updated">最后更新日期：2026 年 6 月 3 日</p>
            </div>

            <div class="legal-body">
                <div class="back-link">
                    <router-link to="/">
                        <i class="fas fa-home"></i> 返回首页
                    </router-link>
                    <span class="back-link-sep">|</span>
                    <router-link to="/register">
                        <i class="fas fa-arrow-left"></i> 返回登录页面
                    </router-link>
                </div>

                <section class="legal-section">
                    <h2>第一条 总则</h2>
                    <p>
                        欢迎使用 NEGIAO's WebGIS 平台（以下简称"本平台"）。在使用本平台提供的各项服务之前，请您仔细阅读并充分理解本服务条款（以下简称"本条款"）的全部内容。
                    </p>
                    <p>
                        本平台是由 NEGIAO 团队开发和运营的 Web 地理信息系统，提供地图浏览、空间分析、图层管理等 GIS 功能。通过注册、登录或以任何方式使用本平台，即表示您同意受本条款的约束。
                    </p>
                    <p>
                        如果您不同意本条款的任何内容，请立即停止使用本平台。
                    </p>
                </section>

                <section class="legal-section">
                    <h2>第二条 账号注册与管理</h2>
                    <ol>
                        <li>您在注册账号时应提供真实、准确、完整的个人信息，并在信息发生变更时及时更新。</li>
                        <li>用户名由 3-24 个字符组成，仅允许使用字母、数字和下划线。<code>user</code> 和 <code>admin</code> 为系统保留用户名，不可注册。</li>
                        <li>密码长度应为 6-64 个字符，且必须同时包含字母和数字。</li>
                        <li>您应妥善保管账号和密码，因您个人原因导致的账号安全问题，由您自行承担。</li>
                        <li>您不应将账号转让、出借给他人使用。如发现未经授权使用您的账号，应立即通知本平台。</li>
                        <li>本平台有权对违反本条款的账号采取限制、暂停或终止使用的措施。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第三条 用户行为规范</h2>
                    <p>您在使用本平台时，应遵守以下行为规范：</p>
                    <ol>
                        <li>遵守中华人民共和国相关法律法规及本条款的各项规定。</li>
                        <li>不得利用本平台从事任何违法违规活动，包括但不限于：
                            <ul>
                                <li>上传、存储或传播违反国家法律法规的内容；</li>
                                <li>侵犯他人知识产权、商业秘密或其他合法权益；</li>
                                <li>对本平台进行反向工程、反编译或反汇编；</li>
                                <li>干扰或破坏本平台的正常运行；</li>
                                <li>利用自动化工具恶意访问或滥用本平台接口。</li>
                            </ul>
                        </li>
                        <li>您通过本平台上传、创建或分享的地理数据和标注内容，应保证拥有合法权利。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第四条 服务内容与变更</h2>
                    <ol>
                        <li>本平台提供的服务包括但不限于：地图浏览、图层管理、空间分析、标绘绘图、测量工具等 GIS 功能。</li>
                        <li>本平台有权根据实际情况对服务内容进行调整、升级或优化，并会在合理时间内通知用户。</li>
                        <li>本平台可能因系统维护、升级或其他不可抗力原因暂停服务，届时会尽可能提前通知。</li>
                        <li>本平台提供的地图数据和分析结果仅供参考，不作为专业测绘或法律依据。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第五条 知识产权</h2>
                    <ol>
                        <li>本平台的软件代码、界面设计、图标、文档等知识产权归 NEGIAO 团队所有。</li>
                        <li>本平台使用的第三方地图瓦片服务（如 Google Maps、OpenStreetMap 等）的知识产权归各自权利人所有。</li>
                        <li>您在本平台上创建和上传的内容，其知识产权归您所有。您授予本平台在提供服务所必需范围内使用这些内容的非独占许可。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第六条 免责声明</h2>
                    <ol>
                        <li>本平台按"现状"提供服务，不对服务的准确性、完整性、可靠性作任何明示或暗示的保证。</li>
                        <li>因网络状况、通信线路等不可抗力因素导致的服务中断或数据丢失，本平台不承担责任。</li>
                        <li>您因使用本平台服务而产生的任何直接、间接、偶然、特殊或后果性的损害，本平台不承担责任。</li>
                        <li>本平台不对用户上传的地理数据的准确性、合法性承担责任。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第七条 条款变更</h2>
                    <ol>
                        <li>本平台有权根据需要不时修改本条款，修改后的条款将在平台上公布。</li>
                        <li>如您在条款变更后继续使用本平台，即视为同意修改后的条款。</li>
                        <li>如您不同意修改后的条款，应停止使用本平台并注销账号。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第八条 适用法律与争议解决</h2>
                    <ol>
                        <li>本条款的签订、履行和解释均适用中华人民共和国法律。</li>
                        <li>因本条款引起的或与本条款有关的任何争议，双方应友好协商解决。协商不成的，任何一方均可向本平台运营方所在地有管辖权的人民法院提起诉讼。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第九条 联系方式</h2>
                    <p>
                        如果您对本条款有任何疑问或建议，请通过以下方式联系我们：
                    </p>
                    <ul>
                        <li>平台反馈：登录后通过系统内置反馈功能提交</li>
                        <li>邮箱：<a href="mailto:1482918576@qq.com">1482918576@qq.com</a> / <a href="mailto:yaonaigao@gmail.com">yaonaigao@gmail.com</a></li>
                        <li>GitHub：<a href="https://github.com/negiao" target="_blank" rel="noopener">github.com/negiao</a></li>
                    </ul>
                </section>
            </div>

            <div class="legal-footer">
                <router-link to="/register">
                    <i class="fas fa-arrow-left"></i> 返回登录页面
                </router-link>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

useRouter();

onMounted(() => {
    document.title = '服务条款 - NEGIAO\'s WebGIS';
});
</script>

<style scoped>
.legal-container {
    position: relative;
    font-family: var(--font-base, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
    line-height: 1.8;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
    display: flex;
    justify-content: center;
    padding: clamp(10px, 2.6vw, 20px);
    min-height: 100dvh;
    width: 100%;
    box-sizing: border-box;
    /* 裁掉装饰层溢出的光斑，避免出现无谓的滚动空间 */
    overflow: hidden;
}

/* ─── 页面装饰层：GIS 网格 + 角落光斑 ─── */
.legal-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.legal-bg__grid {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(var(--brand-primary-rgb), 0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.06) 1px, transparent 1px);
    background-size: 42px 42px;
    -webkit-mask-image: radial-gradient(ellipse 90% 90% at 50% 0%, #000 20%, transparent 100%);
    mask-image: radial-gradient(ellipse 90% 90% at 50% 0%, #000 20%, transparent 100%);
}

.legal-bg__blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.32;
}

.legal-bg__blob--1 {
    width: 400px;
    height: 400px;
    top: -160px;
    left: -140px;
    background: rgba(var(--brand-primary-rgb), 0.22);
}

.legal-bg__blob--2 {
    width: 360px;
    height: 360px;
    bottom: -140px;
    right: -120px;
    background: rgba(var(--brand-accent-rgb, 87, 184, 97), 0.16);
}

.legal-card {
    position: relative;
    z-index: 1;
    /* 框体规格对齐 LayerPropertiesDialog 模板（与注册卡同款）：
       中性发丝描边 + ≈1px 白色外缘 + 干净投影 */
    background: var(--bg-primary);
    border: var(--panel-border, 1px solid rgba(0, 0, 0, 0.06));
    border-radius: var(--panel-radius, 12px);
    box-shadow:
        0 0 0 1px #fff,
        var(--panel-shadow, 0 8px 32px rgba(0, 0, 0, 0.15));
    width: 100%;
    max-width: 860px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 40px);
    margin: 20px 0;
}

.fade-in {
    animation: fadeIn 0.5s ease forwards;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ─── Header ─── */
.legal-header {
    position: relative;
    z-index: 0;
    /* 品牌渐变 + 左上柔光：与 TopBar / 面板头部同一视觉语言 */
    background:
        radial-gradient(ellipse 55% 280% at 0% -80%,
            rgba(var(--brand-accent-light-rgb), 0.28) 0%, transparent 58%),
        linear-gradient(160deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
    color: var(--text-on-brand);
    padding: 28px 32px;
    text-align: center;
    /* 底部品牌亮线收边，衔接白色正文区 */
    box-shadow: inset 0 -2px 0 rgba(var(--brand-accent-light-rgb), 0.35);
}

/* 经纬网格纹理：与用户中心 panel-header / 注册页头部同一 DNA
   （单层 24px 白网格 + 自上而下放射渐隐） */
.legal-header::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    background-image:
        linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
    mask-image: radial-gradient(ellipse 95% 120% at 50% 0%, #000 30%, transparent 100%);
}

.legal-header h1 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 700;
}

.legal-header h1 i {
    margin-right: 8px;
}

.legal-updated {
    margin: 0;
    font-size: 14px;
    opacity: 0.85;
}

/* ─── Body ─── */
.legal-body {
    padding: 28px 32px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}

.back-link {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.back-link-sep {
    color: var(--border-light, #d6e2d8);
}

.back-link a {
    display: inline-flex;
    align-items: center;
    padding: 6px 12px;
    border: 1px solid transparent;
    border-radius: 999px;
    color: var(--brand-primary);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.back-link a:hover {
    color: var(--brand-primary-dark);
    background: rgba(var(--brand-primary-rgb), 0.07);
    border-color: rgba(var(--brand-primary-rgb), 0.25);
}

.back-link i {
    margin-right: 4px;
}

/* ─── Sections ─── */
.legal-section {
    margin-bottom: 28px;
}

.legal-section h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--brand-primary-dark);
    margin: 0 0 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--brand-primary-lighter);
}

/* 条目标题前的品牌渐变小方块，分隔线之外的层级点缀 */
.legal-section h2::before {
    content: '';
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 9px;
    border-radius: 3px;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    vertical-align: 1px;
}

.legal-section p {
    margin: 0 0 12px;
    font-size: 15px;
    color: var(--text-secondary);
    text-indent: 2em;
}

.legal-section ol,
.legal-section ul {
    margin: 0 0 12px;
    padding-left: 2em;
    font-size: 15px;
    color: var(--text-secondary);
}

.legal-section li {
    margin-bottom: 8px;
}

.legal-section ul {
    list-style-type: disc;
    margin-top: 8px;
}

.legal-section ul li {
    margin-bottom: 4px;
}

.legal-section code {
    background: var(--bg-brand-light);
    color: var(--brand-primary-dark);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 14px;
    font-family: 'Consolas', 'Monaco', monospace;
}

.legal-section a {
    color: var(--brand-primary);
    text-decoration: none;
}

.legal-section a:hover {
    text-decoration: underline;
}

/* ─── Footer ─── */
.legal-footer {
    padding: 16px 32px;
    text-align: center;
    /* 与用户中心 panel-footer 同款：白底 + 细分隔线 */
    background: var(--bg-primary);
    border-top: 1px solid var(--border-light);
}

.legal-footer a {
    color: var(--brand-primary);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s;
}

.legal-footer a:hover {
    color: var(--brand-primary-dark);
    text-decoration: underline;
}

.legal-footer i {
    margin-right: 4px;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
    .legal-container {
        padding: 8px;
    }

    .legal-card {
        border-radius: 8px;
        margin: 8px 0;
        max-height: calc(100dvh - 16px);
    }

    .legal-header {
        padding: 20px 16px;
    }

    .legal-header h1 {
        font-size: 22px;
    }

    .legal-body {
        padding: 20px 16px;
    }

    .legal-footer {
        padding: 12px 16px;
    }
}
</style>
