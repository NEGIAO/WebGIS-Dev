"""HF Webhook 接收与告警辅助函数单元测试（不依赖完整 app 启动）。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starlette.datastructures import Headers

from api.webhook import (
    FAILURE_STAGES,
    _configured_space_id,
    _event_summary,
    _extract_stage,
    _provided_secret,
    _watch_space_id,
    _webhook_secret,
    _SPACE_ID_RE,
    shutdown_webhook_watches,
)


class _FakeReq:
    def __init__(self, headers):
        self.headers = Headers(headers)


def test_webhook_secret_type():
    assert isinstance(_webhook_secret(), str)


def test_provided_secret_from_headers_and_bearer():
    assert _provided_secret(_FakeReq({"x-webhook-secret": "abc"})) == "abc"
    assert _provided_secret(_FakeReq({"x-huggingface-secret": "abc"})) == "abc"
    assert _provided_secret(_FakeReq({"authorization": "Bearer abc"})) == "abc"
    assert _provided_secret(_FakeReq({})) == ""


def test_event_summary_hf_repo_shape():
    summary = _event_summary(
        {
            "event": {
                "action": "update",
                "scope": "repo",
                "repo": {"type": "space", "name": "NEGIAO/WebGIS"},
            }
        }
    )
    assert "action=update" in summary
    assert "NEGIAO/WebGIS" in summary


def test_watch_space_id_ignores_payload_repo():
    """监视目标只读配置，不信任 payload 中的 repo 名。"""
    payload = {
        "event": {
            "action": "update",
            "repo": {"type": "space", "name": "Someone/OtherSpace"},
        }
    }
    assert _watch_space_id(payload) == _configured_space_id()
    assert _watch_space_id(None) == _configured_space_id()
    assert "/" in _watch_space_id(None)
    assert _SPACE_ID_RE.match(_watch_space_id(None))


def test_space_id_regex_rejects_injection():
    assert not _SPACE_ID_RE.match('"><img src=x onerror=alert(1)>')
    assert not _SPACE_ID_RE.match("foo/bar/../etc")
    assert _SPACE_ID_RE.match("NEGIAO/WebGIS")


def test_extract_stage_and_failure_set():
    assert _extract_stage({"runtime": {"stage": "BUILD_ERROR"}}) == "BUILD_ERROR"
    assert _extract_stage({"stage": "RUNNING"}) == "RUNNING"
    assert _extract_stage({}) == ""
    assert "BUILD_ERROR" in FAILURE_STAGES
    assert "RUNTIME_ERROR" in FAILURE_STAGES
    assert "RUNNING" not in FAILURE_STAGES


async def test_shutdown_webhook_watches_noop_when_idle():
    """关闭钩子在无任务时应安全返回。"""
    await shutdown_webhook_watches()


if __name__ == "__main__":
    import asyncio

    test_webhook_secret_type()
    test_provided_secret_from_headers_and_bearer()
    test_event_summary_hf_repo_shape()
    test_watch_space_id_ignores_payload_repo()
    test_space_id_regex_rejects_injection()
    test_extract_stage_and_failure_set()
    asyncio.run(test_shutdown_webhook_watches_noop_when_idle())
    print("webhook unit checks OK")
