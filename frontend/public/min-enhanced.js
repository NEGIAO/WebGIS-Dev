/* --------------------------
   说明：51.la 统计脚本
   V3.7.1 网络瘦身：已下线MapMyVisitors 与 Google Analytics（国内不可达挂起 30s且不常用），
   释放网络并发槽位与控制台报错。
-------------------------- */
(function load51LaStats() {
    try {
        // 51.la SDK
        (function () {
            var s = document.createElement('script');
            s.id = 'LA_COLLECT';
            s.src = '//sdk.51.la/js-sdk-pro.min.js';
            s.async = true;
            s.onload = function () {
                s.type = 'text/javascript';
                try {
                    if (window.LA && typeof LA.init === 'function') {
                        LA.init({
                            id: '3OVJu4iCpXi3wE8k',
                            ck: '3OVJu4iCpXi3wE8k',
                            autoTrack: true,
                            hashMode: true,
                            screenRecord: true,
                        });
                        console.log('51.la SDK 已加载并初始化。');
                    } else {
                        console.log('51.la SDK 已加载，但 LA.init 不可用。');
                    }
                } catch (e) {
                    console.log('初始化 51.la 时出错：', e);
                }
            };
            s.onerror = function (e) {
                console.log('加载 51.la脚本失败：', e);
            };
            document.head.appendChild(s);
        })();
    } catch (err) {
        console.log('加载 51.la 统计脚本时出错：', err);
    }
})();

/* --------------------------
   说明：51.la 应用性能监控（LingQue.Monitor，V3.7.4 新增）
   与上方流量统计（js-sdk-pro）是不同产品、不同应用 ID，互不冲突：
   - 流量统计：UV / PV 基础流量
   - 应用监控：异常、性能、资源加载、外链、可疑脚本（本段）
   动态创建 script（async + crossorigin）而非在 index.html 直接插 <script>：
   ① 保持 defer 非阻塞链路，不把 SDK 放进首屏关键路径；
   ② 统计逻辑集中在 min-enhanced.js 单一入口，便于统一维护 / 下线。
-------------------------- */
(function loadLingQuePerfMonitor() {
    try {
        // 幂等守卫：脚本被意外重复注入时不重复加载
        if (document.getElementById('LINGQUE_PERF_SDK')) return;
        if (typeof window.LingQue === 'object' && window.LingQue !== null) return;

        var s = document.createElement('script');
        s.id = 'LINGQUE_PERF_SDK';
        s.src = 'https://sdk.51.la/perf/js-sdk-perf.min.js';
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.onload = function () {
            try {
                if (typeof window.LingQue === 'undefined' || !window.LingQue.Monitor) {
                    console.warn('[统计] 51.la perf SDK 已加载但 LingQue.Monitor 不可用');
                    return;
                }
                new window.LingQue.Monitor().init({
                    id: '3RqgbbZKGnrTOJ2i',
                    sendSuspicious: true,
                    // 本站为 hash 路由 SPA（createWebHashHistory）：开启后路由切换才上报 PV
                    sendSpaPv: true,
                });
                console.log('[统计] 51.la 应用监控已初始化');
            } catch (e) {
                console.warn('[统计] 初始化 51.la 应用监控失败：', e);
            }
        };
        s.onerror = function (e) {
            console.warn('[统计] 加载 51.la 应用监控 SDK 失败：', e);
        };
        (document.head || document.body).appendChild(s);
    } catch (err) {
        console.warn('[统计] 注册 51.la 应用监控时出错：', err);
    }
})();

/* --------------------------
   说明：延迟加载第三方统计脚本（V3.7.1 瘦身：已下线不可达的海外统计服务）
-------------------------- */
function registerDelayedStatsLoader() {
    // 预留扩展桩，所有海外阻塞死链已于 V3.7.1 清理完毕
}
registerDelayedStatsLoader();
