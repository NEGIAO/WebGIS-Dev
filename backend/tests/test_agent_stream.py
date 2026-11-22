"""
Agent 流式改造单测（V3.7.7 批次 E）：delta 提取、tool_calls 流式拼装、SSE 事件帧、IP 定位缓存。
V3.7.12 增补：候选锁定外层 break、传输异常整轮重试（mock httpx.AsyncClient）。
"""

import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.agent_chat.upstream import (  # noqa: E402
    _assemble_stream_tool_calls,
    _ip_location_cache_get,
    _ip_location_cache_put,
    _merge_stream_tool_calls,
    _sse_event,
    _stream_extract_delta,
)


class StreamExtractDeltaTests(unittest.TestCase):
    def test_normal_delta(self):
        chunk = {"choices": [{"delta": {"content": "你好"}}]}
        self.assertEqual(_stream_extract_delta(chunk), "你好")

    def test_missing_content_returns_empty(self):
        self.assertEqual(_stream_extract_delta({"choices": [{"delta": {}}]}), "")
        self.assertEqual(_stream_extract_delta({"choices": []}), "")
        self.assertEqual(_stream_extract_delta({}), "")
        self.assertEqual(_stream_extract_delta({"choices": [{"delta": None}]}), "")

    def test_malformed_structure_returns_empty(self):
        self.assertEqual(_stream_extract_delta({"choices": [{"delta": "not-a-dict"}]}), "")
        self.assertEqual(_stream_extract_delta(None), "")


class StreamToolCallAssemblyTests(unittest.TestCase):
    def test_multi_chunk_arguments_concatenated(self):
        acc: dict = {}
        _merge_stream_tool_calls(acc, [
            {"index": 0, "id": "call_1", "function": {"name": "flyTo", "arguments": '{"lon":'}}
        ])
        _merge_stream_tool_calls(acc, [
            {"index": 0, "function": {"arguments": " 121.5}"}}
        ])
        assembled = _assemble_stream_tool_calls(acc)
        self.assertEqual(len(assembled), 1)
        self.assertEqual(assembled[0]["id"], "call_1")
        self.assertEqual(assembled[0]["function"]["name"], "flyTo")
        self.assertEqual(assembled[0]["function"]["arguments"], '{"lon": 121.5}')

    def test_multiple_indexes_ordered(self):
        acc: dict = {}
        _merge_stream_tool_calls(acc, [{"index": 2, "id": "c", "function": {"name": "c"}}])
        _merge_stream_tool_calls(acc, [{"index": 0, "id": "a", "function": {"name": "a"}}])
        assembled = _assemble_stream_tool_calls(acc)
        self.assertEqual([t["function"]["name"] for t in assembled], ["a", "c"])

    def test_empty_and_garbage_ignored(self):
        acc: dict = {}
        _merge_stream_tool_calls(acc, [])
        _merge_stream_tool_calls(acc, ["garbage", None, {}])
        self.assertEqual(_assemble_stream_tool_calls(acc), [])


class SseEventTests(unittest.TestCase):
    def test_event_format(self):
        evt = _sse_event({"type": "delta", "delta": "中文"})
        self.assertTrue(evt.startswith("data: "))
        self.assertTrue(evt.endswith("\n\n"))
        self.assertIn("中文", evt)  # ensure_ascii=False 保留中文

    def test_roundtrip(self):
        import json
        payload = {"type": "final", "reply": "ok"}
        parsed = json.loads(_sse_event(payload)[6:-2])
        self.assertEqual(parsed, payload)


class StreamFinalDataShapeTests(unittest.TestCase):
    """final.rawData 形状契约：与非流式 data 逐字段一致（V3.7.9 回归）。"""

    def _extract(self, content_text, tool_acc=None, model="m1", usage=None):
        from api.agent_chat import upstream
        message: dict = {"role": "assistant", "content": content_text}
        if tool_acc:
            message["tool_calls"] = upstream._assemble_stream_tool_calls(tool_acc)
        return upstream._extract_reply_and_tools(
            {"choices": [{"message": message}], "model": model, "usage": usage}
        )

    def _build(self, content_text, tool_acc, model="m1", usage=None):
        from api.agent_chat import upstream
        with mock.patch.object(upstream, "_extract_reply_and_tools",
                               wraps=upstream._extract_reply_and_tools):
            return upstream, upstream._extract_reply_and_tools(
                {
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": content_text,
                                **({"tool_calls": upstream._assemble_stream_tool_calls(tool_acc)} if tool_acc else {}),
                            }
                        }
                    ],
                    "model": model,
                    "usage": usage,
                }
            )

    def test_text_protocol_block_omits_native_tool_calls(self):
        # 文本协议（```tool_call 块）+ 无原生调用 → raw_data 不得携带空 tool_calls 数组
        nl = chr(10)
        content = "```tool_call" + nl + '{"name": "set_map_view", "arguments": {"view": "cesium"}}' + nl + "```"
        reply, tool_calls = self._extract(content)
        self.assertIn("set_map_view", reply)
        self.assertIsNone(tool_calls)  # 无原生调用 → None（前端降级文本解析可命中）

    def test_native_tool_calls_normalized(self):
        from api.agent_chat.upstream import _merge_stream_tool_calls
        acc = {}
        _merge_stream_tool_calls(acc, [
            {"index": 0, "id": "c1", "function": {"name": "set_map_view", "arguments": '{"view": "cesium"}'}}
        ])
        reply, tool_calls = self._extract("", tool_acc=acc)
        self.assertEqual(len(tool_calls), 1)
        self.assertEqual(tool_calls[0]["function"]["name"], "set_map_view")


class IpLocationCacheTests(unittest.TestCase):
    def setUp(self):
        from api.agent_chat import upstream
        upstream._IP_LOCATION_CACHE.clear()
        self.upstream = upstream

    def test_put_get_roundtrip(self):
        self.upstream._ip_location_cache_put("1.2.3.4", "来源=IP定位", now=100.0)
        hit = self.upstream._ip_location_cache_get("1.2.3.4", now=150.0)
        self.assertEqual(hit, (True, "来源=IP定位"))

    def test_fail_result_short_ttl(self):
        self.upstream._ip_location_cache_put("1.2.3.4", None, now=100.0)
        # 60s 内命中（None）
        hit = self.upstream._ip_location_cache_get("1.2.3.4", now=130.0)
        self.assertEqual(hit, (False, None))
        # 61s 后过期
        expired = self.upstream._ip_location_cache_get("1.2.3.4", now=161.0)
        self.assertIsNone(expired)

    def test_success_result_long_ttl(self):
        self.upstream._ip_location_cache_put("1.2.3.4", "ok", now=100.0)
        self.assertIsNotNone(self.upstream._ip_location_cache_get("1.2.3.4", now=100.0 + 599))
        self.assertIsNone(self.upstream._ip_location_cache_get("1.2.3.4", now=100.0 + 601))


class _FakeResponse:
    """mock 上游流式响应：status_code / aread / aiter_lines 三件套。"""

    def __init__(self, status_code=200, lines=None):
        self.status_code = status_code
        self._lines = lines or []

    async def aread(self):
        return b'{"error":"upstream broken"}'

    async def aiter_lines(self):
        for ln in self._lines:
            yield ln


class _FakeStreamCtx:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self._response

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeAsyncClient:
    """按 plan 顺序返回响应或抛出异常；记录每次 stream() 的 URL。"""

    calls = []
    plan = []

    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method, url, **kwargs):
        _FakeAsyncClient.calls.append(url)
        entry = _FakeAsyncClient.plan.pop(0) if _FakeAsyncClient.plan else _FakeResponse()
        if isinstance(entry, Exception):
            raise entry
        return _FakeStreamCtx(entry)


SUCCESS_LINES = [
    'data: {"choices":[{"delta":{"content":"hello"}}]}',
    'data: {"choices":[{"delta":{"content":" world"}}]}',
    "data: [DONE]",
]


class StreamRotationRegressionTests(unittest.TestCase):
    """V3.7.12：候选锁定后终止外层轮换；传输异常整轮重试一次。"""

    def _run(self, plan, candidates):
        from api.agent_chat import upstream

        _FakeAsyncClient.calls = []
        _FakeAsyncClient.plan = list(plan)

        async def _collect():
            events = []
            gen = upstream._stream_upstream_chat_events(
                mock.Mock(),
                base_url="https://upstream.test/v1",
                api_keys=list(candidates),
                model="m1",
                messages=[{"role": "user", "content": "hi"}],
                timeout_seconds=30,
                max_tokens=64,
                temperature=0.2,
            )
            async for evt in gen:
                events.append(evt)
            return events

        with mock.patch.object(upstream.httpx, "AsyncClient", _FakeAsyncClient):
            events = asyncio.run(_collect())
        return events, list(_FakeAsyncClient.calls)

    def _parsed(self, events):
        out = []
        for e in events:
            if not e.startswith("data: "):
                continue
            body = e[6:].strip()
            out.append("[DONE]" if body == "[DONE]" else json.loads(body))
        return out

    def test_lock_stops_rotation_after_first_success(self):
        events, calls = self._run([_FakeResponse(lines=SUCCESS_LINES)], candidates=("k1", "k2"))
        # P1 回归：首候选成功后不得再请求第二候选
        self.assertEqual(len(calls), 1)
        parsed = self._parsed(events)
        deltas = [p["delta"] for p in parsed if isinstance(p, dict) and p.get("type") == "delta"]
        self.assertEqual(deltas, ["hello", " world"])  # 内容不得成倍重复
        types = [p if p == "[DONE]" else p.get("type") for p in parsed]
        self.assertIn("final", types)
        self.assertEqual(types[-1], "[DONE]")

    def test_transport_error_retries_whole_pass_then_succeeds(self):
        import httpx

        events, calls = self._run(
            [httpx.ConnectError("boom"), _FakeResponse(lines=SUCCESS_LINES)], candidates=("k1",)
        )
        # 单候选传输异常 → 整轮重试一次：共 2 次调用，最终成功
        self.assertEqual(len(calls), 2)
        parsed = self._parsed(events)
        types = [p if p == "[DONE]" else p.get("type") for p in parsed]
        self.assertIn("final", types)
        self.assertEqual(types[-1], "[DONE]")

    def test_http_failure_does_not_transport_retry(self):
        events, calls = self._run([_FakeResponse(status_code=500)], candidates=("k1",))
        # HTTP 确定性失败不整轮重试：仅 1 次调用，以 error 事件收束
        self.assertEqual(len(calls), 1)
        parsed = self._parsed(events)
        types = [p.get("type") for p in parsed if isinstance(p, dict)]
        self.assertIn("error", types)
        self.assertNotIn("final", types)


if __name__ == "__main__":
    unittest.main()
