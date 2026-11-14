"""CORS 中间件顺序与预检可用性的回归测试（stdlib unittest，无需 pytest）。

背景（V3.6.58 修复的线上缺陷）：
    https://webgis.negiao.cn 关闭页面时向 `/api/statistics/presence/offline`
    发 `fetch(credentials: 'include')` beacon，触发跨源预检。浏览器报
    「preflight 未通过 CORS 校验：Access-Control-Allow-Credentials 为 ''」，
    真实原因是后端处于降级模式时 `check_startup_state` 直接返回 503，
    而该中间件当时位于 CORS 层之外，503 不带任何 `Access-Control-*` 头。

    两条约束因此必须被测试固定住：
    1. 预检（OPTIONS）不得依赖数据库可用性；
    2. 任何在 CORS 层之外产生的响应（降级 503 / 兜底 500）必须自带 CORS 头。

运行：
    cd backend && python -m unittest tests.test_cors_middleware -v
"""

import unittest

from fastapi.testclient import TestClient
from starlette.middleware.cors import CORSMiddleware

import app as app_module

ORIGIN = "https://webgis.negiao.cn"
PATH = "/api/statistics/presence/offline"


class CorsMiddlewareOrderTest(unittest.TestCase):
    def setUp(self):
        # 就地改写白名单：CORSMiddleware 持有的是同一个 list 对象引用，
        # 重新赋值模块变量不会影响已注册的中间件实例。
        self._orig_origins = list(app_module._cors_origins)
        app_module._cors_origins[:] = [ORIGIN]
        self._orig_init = app_module.init_auth_storage
        self._orig_startup_error = getattr(app_module.app.state, "startup_error", None)
        app_module.app.middleware_stack = None  # 强制按新白名单重建
        # 不进入 lifespan：避免真实建库，且本测试只关心中间件层行为
        self.client = TestClient(app_module.app, raise_server_exceptions=False)

    def tearDown(self):
        app_module._cors_origins[:] = self._orig_origins
        app_module.init_auth_storage = self._orig_init
        app_module.app.state.startup_error = self._orig_startup_error
        app_module.app.middleware_stack = None

    # ── 断言助手 ──
    def assertCredentialedCors(self, resp, origin=ORIGIN):
        self.assertEqual(resp.headers.get("access-control-allow-origin"), origin)
        self.assertEqual(resp.headers.get("access-control-allow-credentials"), "true")

    def degrade(self):
        async def _boom(*_args, **_kwargs):
            raise RuntimeError("storage down")

        app_module.init_auth_storage = _boom
        app_module.app.state.startup_error = RuntimeError("degraded")

    # ── 用例 ──
    def test_preflight_succeeds_with_credentials(self):
        """正常态：预检必须回显精确 Origin 且允许携带凭据。"""
        resp = self.client.options(
            PATH,
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,authorization",
            },
        )
        self.assertEqual(resp.status_code, 200)
        self.assertCredentialedCors(resp)

    def test_preflight_does_not_depend_on_storage(self):
        """降级态：存储不可用时预检仍须成功（线上缺陷的直接复现）。

        修复前：返回 503 且无任何 CORS 头 → 浏览器报 CORS 失败。
        """
        self.degrade()
        resp = self.client.options(
            PATH,
            headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertCredentialedCors(resp)

    def test_degraded_response_still_carries_cors_headers(self):
        """降级态的 503 必须带 CORS 头，否则前端只看到 CORS 报错而看不到 503。"""
        self.degrade()
        resp = self.client.post(PATH, json={}, headers={"Origin": ORIGIN})
        self.assertEqual(resp.status_code, 503)
        self.assertCredentialedCors(resp)

    def test_unlisted_origin_is_not_echoed_and_is_logged(self):
        """白名单外的来源不得被回显（防凭据泄漏），且在服务端留下告警。"""
        app_module._warned_unknown_origins.discard("https://evil.example")
        with self.assertLogs(app_module.logger, level="WARNING") as captured:
            resp = self.client.options(
                PATH,
                headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
            )
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn("access-control-allow-origin", resp.headers)
        self.assertTrue(
            any("evil.example" in line for line in captured.output),
            "预检被拒必须在服务端留痕，否则线上只能看到浏览器控制台的 CORS 报错",
        )

    def test_catch_all_500_carries_cors_headers(self):
        """兜底 500 由 ServerErrorMiddleware 产生（CORS 层之外），须自行补头。"""
        if not any(getattr(r, "path", None) == "/__cors_probe_boom" for r in app_module.app.routes):

            @app_module.app.get("/__cors_probe_boom")
            async def _boom_route():  # pragma: no cover - 仅用于触发异常
                raise RuntimeError("boom")

            app_module.app.middleware_stack = None

        resp = self.client.get("/__cors_probe_boom", headers={"Origin": ORIGIN})
        self.assertEqual(resp.status_code, 500)
        self.assertCredentialedCors(resp)

    def test_cors_middleware_is_outermost(self):
        """顺序契约：CORS 必须是 user_middleware 的第一项（= 最外层）。

        Starlette 的 `add_middleware` 是 `insert(0, ...)`；若把 CORS 注册挪到
        check_startup_state 之前，降级 503 会重新绕过 CORS，缺陷复现。
        """
        user_middleware = app_module.app.user_middleware
        self.assertTrue(user_middleware, "未注册任何用户中间件")
        self.assertTrue(
            issubclass(user_middleware[0].cls, CORSMiddleware),
            "CORS 必须最后注册（insert(0) → 最外层），否则错误响应会丢失 CORS 头",
        )


if __name__ == "__main__":
    unittest.main()
