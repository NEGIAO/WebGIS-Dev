/* --------------------------
   说明：51.la 统计脚本（国内节点，轻量无阻塞）
   V3.7.1 网络瘦身：已下线 51.la 国际 SDK（403/503 异常）、MapMyVisitors 与 Google Analytics（国内不可达挂起 30s），
   释放网络并发槽位与控制台报错。
-------------------------- */
(function load51LaStats() {
    try {
        // 51.la 国内
        (function () {
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = '//js.users.51.la/22001747.js';
            s.async = true;
            s.onload = function () {
                console.log('51.la (国内) 脚本已加载。');
            };
            s.onerror = function (e) {
                console.log('51.la (国内) 脚本加载失败：', e);
            };
            (document.body || document.head).appendChild(s);
        })();
    } catch (err) {
        console.log('加载 51.la 统计脚本时出错：', err);
    }
})();

/* --------------------------
   说明：延迟加载第三方统计脚本（V3.7.1 瘦身：已下线不可达的海外统计服务）
-------------------------- */
function registerDelayedStatsLoader() {
    // 预留扩展桩，所有海外阻塞死链已于 V3.7.1 清理完毕
}
registerDelayedStatsLoader();

