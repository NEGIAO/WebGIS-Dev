<template>
    <div class="legal-container">
        <div class="legal-card fade-in">
            <div class="legal-header">
                <h1><i class="fas fa-shield-alt"></i> 隐私政策</h1>
                <p class="legal-updated">最后更新日期：2026 年 6 月 3 日</p>
            </div>

            <div class="legal-body">
                <div class="back-link">
                    <router-link to="/register">
                        <i class="fas fa-arrow-left"></i> 返回登录页面
                    </router-link>
                </div>

                <section class="legal-section">
                    <h2>第一条 引言</h2>
                    <p>
                        欢迎使用 NEGIAO's WebGIS 平台（以下简称"本平台"）。我们非常重视您的个人隐私。本隐私政策旨在向您说明我们如何收集、使用、存储、共享和保护您的个人信息。
                    </p>
                    <p>
                        请在使用本平台前仔细阅读本隐私政策。使用本平台即表示您同意本隐私政策中描述的数据处理方式。
                    </p>
                </section>

                <section class="legal-section">
                    <h2>第二条 我们收集的信息</h2>
                    <h3>2.1 您主动提供的信息</h3>
                    <ul>
                        <li><strong>注册信息</strong>：用户名、密码（加密存储）、电子邮箱地址。</li>
                        <li><strong>头像选择</strong>：您在注册时选择的系统预设头像索引。</li>
                        <li><strong>邮箱验证码</strong>：用于邮箱验证和密码重置的一次性验证码。</li>
                    </ul>

                    <h3>2.2 自动收集的信息</h3>
                    <ul>
                        <li><strong>设备标识</strong>：系统生成的匿名设备 ID（UUID），用于访客身份识别，不关联任何硬件信息。</li>
                        <li><strong>访问日志</strong>：IP 地址、访问时间、请求路径，用于安全审计和服务质量优化。</li>
                        <li><strong>位置偏好</strong>：您在地图上浏览的位置坐标和缩放级别，仅存储在本地浏览器中。</li>
                    </ul>

                    <h3>2.3 我们不收集的信息</h3>
                    <ul>
                        <li>精确的地理位置（GPS）信息。</li>
                        <li>通讯录、相册或其他设备敏感数据。</li>
                        <li>第三方网站的 Cookie 或追踪数据。</li>
                    </ul>
                </section>

                <section class="legal-section">
                    <h2>第三条 信息使用目的</h2>
                    <p>我们收集的信息将用于以下目的：</p>
                    <ol>
                        <li><strong>账号管理</strong>：创建和维护您的用户账号，验证身份，提供密码重置服务。</li>
                        <li><strong>服务提供</strong>：为您加载地图数据、保存图层配置、提供空间分析功能。</li>
                        <li><strong>安全保障</strong>：检测和防范欺诈、滥用等安全风险，维护平台安全。</li>
                        <li><strong>服务优化</strong>：分析使用趋势，改进产品功能和用户体验。</li>
                        <li><strong>合规义务</strong>：遵守适用的法律法规要求。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第四条 信息存储与安全</h2>
                    <ol>
                        <li><strong>存储方式</strong>：您的账号信息存储在本平台自建的 SQLite 数据库中，部署于自有服务器。</li>
                        <li><strong>密码安全</strong>：您的密码使用 bcrypt 算法进行单向加密存储，我们无法获取您的原始密码。</li>
                        <li><strong>邮箱安全</strong>：邮箱验证码为一次性使用，有效期 5 分钟，过期自动失效。</li>
                        <li><strong>本地存储</strong>：地图浏览偏好、图层配置等数据存储在您浏览器的 LocalStorage 中，不会上传至服务器。</li>
                        <li><strong>传输安全</strong>：建议通过 HTTPS 协议访问本平台，以确保数据传输安全。</li>
                        <li><strong>数据保留</strong>：您的账号数据将在账号存续期间保留。账号注销后，我们将在合理时间内删除或匿名化处理您的个人信息。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第五条 信息共享与披露</h2>
                    <p>我们承诺严格保护您的个人信息，不会主动出售或与第三方共享。仅在以下情况下，我们可能会披露您的信息：</p>
                    <ol>
                        <li><strong>法律要求</strong>：根据法律法规、法律程序或政府主管部门的强制性要求。</li>
                        <li><strong>权利保护</strong>：为保护本平台、用户或公众的合法权益。</li>
                        <li><strong>合并或收购</strong>：在平台发生合并、收购或资产出售的情况下，您的信息可能作为资产被转让，但我们会继续受本隐私政策的约束。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第六条 第三方服务</h2>
                    <p>本平台集成了以下第三方地图瓦片服务：</p>
                    <ul>
                        <li><strong>Google Maps</strong>：地图瓦片由 Google 提供，受 Google 隐私政策约束。</li>
                        <li><strong>OpenStreetMap</strong>：开源地图数据，受 ODbL 许可协议约束。</li>
                        <li><strong>高德地图 / 天地图</strong>：国内地图服务，受各自服务条款约束。</li>
                    </ul>
                    <p>
                        当您浏览地图时，您的浏览器会直接向上述第三方服务请求瓦片图片。这些请求可能包含您的 IP 地址和浏览器信息。我们无法控制第三方的数据收集行为，建议您查阅其各自的隐私政策。
                    </p>
                </section>

                <section class="legal-section">
                    <h2>第七条 您的权利</h2>
                    <p>您对您的个人信息享有以下权利：</p>
                    <ol>
                        <li><strong>查阅权</strong>：登录后可查看您的账号信息和活动记录。</li>
                        <li><strong>更正权</strong>：可修改您的邮箱绑定信息。</li>
                        <li><strong>删除权</strong>：可申请注销账号，我们将删除您的个人信息。</li>
                        <li><strong>撤回同意</strong>：您有权撤回对本隐私政策的同意，但这可能导致无法继续使用部分或全部服务。</li>
                        <li><strong>数据导出</strong>：可申请导出您的账号数据副本。</li>
                    </ol>
                    <p>
                        如需行使上述权利，请通过平台内置反馈功能联系我们。
                    </p>
                </section>

                <section class="legal-section">
                    <h2>第八条 Cookie 与本地存储</h2>
                    <ol>
                        <li>本平台不使用传统 Cookie 进行用户追踪。</li>
                        <li>我们使用浏览器的 LocalStorage 存储以下信息：
                            <ul>
                                <li>认证令牌（JWT Token）：用于维持登录状态。</li>
                                <li>地图偏好：缩放级别、中心点、图层配置等。</li>
                                <li>设备标识：匿名 UUID，用于访客身份识别。</li>
                                <li>位置码：用于推广来源追踪，可随时清除。</li>
                            </ul>
                        </li>
                        <li>您可以通过浏览器设置清除 LocalStorage，但清除后需要重新登录并重新配置偏好设置。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第九条 未成年人保护</h2>
                    <p>
                        本平台不面向 14 岁以下未成年人提供服务。如果我们发现在未获得可验证的监护人同意的情况下收集了 14 岁以下未成年人的个人信息，我们将尽快删除相关数据。如果您认为我们可能持有未成年人的信息，请联系我们。
                    </p>
                </section>

                <section class="legal-section">
                    <h2>第十条 隐私政策变更</h2>
                    <ol>
                        <li>我们可能会不时更新本隐私政策。更新后的政策将在平台上公布，并注明生效日期。</li>
                        <li>对于重大变更，我们将通过平台通知或其他合理方式告知您。</li>
                        <li>继续使用本平台即表示您同意更新后的隐私政策。</li>
                    </ol>
                </section>

                <section class="legal-section">
                    <h2>第十一条 联系我们</h2>
                    <p>
                        如果您对本隐私政策有任何疑问、意见或建议，请通过以下方式联系我们：
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

onMounted(() => {
    document.title = '隐私政策 - NEGIAO\'s WebGIS';
});
</script>

<style scoped>
.legal-container {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.8;
    color: var(--text-primary);
    background-color: var(--bg-secondary);
    display: flex;
    justify-content: center;
    padding: clamp(10px, 2.6vw, 20px);
    min-height: 100dvh;
    width: 100%;
    box-sizing: border-box;
}

.legal-card {
    background: var(--bg-primary);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
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
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: var(--text-on-brand);
    padding: 28px 32px;
    text-align: center;
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
}

.back-link a {
    color: var(--brand-primary);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s;
}

.back-link a:hover {
    color: var(--brand-primary-dark);
    text-decoration: underline;
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

.legal-section h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 16px 0 8px;
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

.legal-section strong {
    color: var(--text-primary);
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
    background-color: var(--bg-secondary);
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
