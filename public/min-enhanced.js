/* --------------------------
   说明：51.la 统计脚本（立即加载，性能影响小）
-------------------------- */
(function load51LaStats() {
    try {
        // 51.la 国内
        (function () {
            var s = document.createElement('script');
            s.type = 'text/javascript';
            s.src = '//js.users.51.la/22001747.js';
            s.async = true;
            s.onload = function () { console.log('51.la (国内) 脚本已加载。'); };
            s.onerror = function (e) { console.log('51.la (国内) 脚本加载失败：', e); };
            (document.body || document.head).appendChild(s);
        })();

        // 51.la 国际 SDK
        (function () {
            var s = document.createElement('script');
            s.charset = 'UTF-8';
            s.id = 'LA_COLLECT';
            s.type = 'text/javascript';
            s.src = '//sdk.51.la/js-sdk-pro.min.js';
            s.async = true;
            s.onload = function () {
                try {
                    if (window.LA && typeof LA.init === 'function') {
                        LA.init({
                            id: '3OVJu4iCpXi3wE8k',
                            ck: '3OVJu4iCpXi3wE8k',
                            autoTrack: true,
                            hashMode: true,
                            screenRecord: true
                        });
                        console.log('51.la (国际) SDK 已加载并初始化。');
                    } else {
                        console.log('51.la SDK 已加载，但 LA.init 不可用。');
                    }
                } catch (e) {
                    console.log('初始化 51.la (国际) 时出错：', e);
                }
            };
            s.onerror = function (e) { console.log('加载 51.la (国际) 脚本失败：', e); };
            document.head.appendChild(s);
        })();
    } catch (err) {
        console.log('加载 51.la 统计脚本时出错：', err);
    }
})();

/* --------------------------
   说明：延迟加载其他第三方统计/展示脚本（Supabase、MapMyVisitors、GA）
-------------------------- */
function registerDelayedStatsLoader() {
    try {
        window.addEventListener('load', function () {
            setTimeout(function () {
                // Supabase
                try {
                    const supabaseScript = document.createElement('script');
                    supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
                    supabaseScript.onload = function () {
                        try {
                            const SB_URL = 'https://zifovhnylhlwnviiilbo.supabase.co';
                            const SB_KEY = 'sb_publishable_oMMXVnMuHW0JCYASt4hpcQ_X8d65i0l';
                            const _client = supabase.createClient(SB_URL, SB_KEY);
                            async function startTracking() {
                                try {
                                    let userIP = null;
                                    try { const ipRes = await fetch('https://api.ipify.org?format=json'); const ipJson = await ipRes.json(); userIP = ipJson.ip; } catch (e) { console.log('无法获取公网IP，Supabase 统计将缺少 IP：', e); }
                                    const path = window.location.pathname; await _client.from('page_views').insert([{ page_url: path, visitor_ip: userIP }]);
                                    const today = new Date(); today.setHours(0, 0, 0, 0); const todayISO = today.toISOString();
                                    const [totalCount, todayCount] = await Promise.all([
                                        _client.from('page_views').select('*', { count: 'exact', head: true }).eq('page_url', path),
                                        userIP ? _client.from('page_views').select('*', { count: 'exact', head: true }).eq('page_url', path).eq('visitor_ip', userIP).gte('created_at', todayISO) : Promise.resolve({ count: 0 })
                                    ]);
                                    const totalEl = document.getElementById('total-pv-val'); const todayEl = document.getElementById('today-personal-val'); if (totalEl) totalEl.innerText = (totalCount && totalCount.count) || 0; if (todayEl) todayEl.innerText = (todayCount && todayCount.count) || 0;
                                } catch (err) { console.log('Supabase startTracking 错误：', err); }
                            }
                            startTracking(); console.log('Supabase 统计已初始化（延迟加载，来自 main-enhanced.js）。');
                        } catch (e) { console.log('Supabase 初始化内部错误：', e); }
                    };
                    supabaseScript.onerror = function (e) { console.log('加载 Supabase SDK 失败：', e); };
                    document.head.appendChild(supabaseScript);
                } catch (err) { console.log('插入 Supabase 脚本出错：', err); }

                // MapMyVisitors
                try {
                    const mapContainer = document.getElementById('mapmyvisitors-container');
                    if (mapContainer && !document.getElementById('mapmyvisitors')) {
                        const script = document.createElement('script'); script.type = 'text/javascript'; script.id = 'mapmyvisitors'; script.async = true; script.src = 'https://mapmyvisitors.com/map.js?cl=ffffff&w=300&t=tt&d=n-HXgq2Mge1cHPJX6y2jM_UZP-Kfb5kUxv6fYpxnLJ8&co=2d78ad&ct=ffffff&cmo=3acc3a&cmn=ff5353'; script.onerror = function () { console.log('MapMyVisitors 无法加载（国内可能无法访问）。'); }; mapContainer.appendChild(script); console.log('MapMyVisitors script 加载请求已发送（延迟，来自 main-enhanced.js）。');
                    }
                } catch (err) { console.log('插入 MapMyVisitors 脚本出错：', err); }

                // Google Analytics
                try {
                    const gaScript = document.createElement('script'); gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-KYJ7Y4LE2N'; gaScript.async = true; gaScript.onerror = function () { console.log('Google Analytics 加载失败或被阻止。'); }; document.head.appendChild(gaScript);
                    window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); } gtag('js', new Date()); gtag('config', 'G-KYJ7Y4LE2N'); console.log('Google Analytics 已延迟初始化（来自 main-enhanced.js）。');
                } catch (err) { console.log('插入 GA 脚本出错：', err); }

            }, 3000);
        });
    } catch (e) { console.log('注册延迟加载统计脚本时出错：', e); }
}
registerDelayedStatsLoader();