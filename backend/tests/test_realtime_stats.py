"""Regression tests for the SSE-primary online user tracker."""

from api import realtime_stats


def _tracker(monkeypatch):
    """Build an isolated tracker without scheduling broadcaster side effects."""
    monkeypatch.setattr(realtime_stats, "request_immediate_broadcast", lambda: None)
    return realtime_stats.OnlineUserTracker(window=90)


def test_authenticated_activity_does_not_survive_live_sse_disconnect(monkeypatch):
    """Normal API traffic during healthy SSE must not create a 90-second ghost user."""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("alice")

    tracker.mark_authenticated_activity("alice")
    tracker.drop_connection("alice")

    assert tracker.get_online_count() == 0
    assert tracker.get_online_users() == []


def test_explicit_fallback_heartbeat_survives_stale_connection_drop(monkeypatch):
    """The dedicated fallback signal remains valid while proxy disconnect detection catches up."""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("alice")

    tracker.mark_heartbeat("alice")
    tracker.drop_connection("alice")

    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["alice"]


def test_public_activity_hook_uses_connection_aware_path(monkeypatch):
    """Authentication dependencies must route through the connection-aware activity method."""
    tracker = _tracker(monkeypatch)
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)
    tracker.mark_connection("alice")

    realtime_stats.mark_user_active("alice")
    tracker.drop_connection("alice")

    assert tracker.get_online_count() == 0


def test_prune_expired_reports_and_removes_only_stale_entries(monkeypatch):
    """Expiry pruning removes stale fallback records and reports whether anything changed."""
    tracker = _tracker(monkeypatch)

    # 模拟一条已过期的兜底记录：直接写入窗口之外的时间戳
    import time as _time

    with tracker._lock:
        tracker._users["stale"] = _time.monotonic() - (tracker._active_window + 1)
        tracker._users["fresh"] = _time.monotonic()

    assert tracker.prune_expired() is True
    assert tracker.get_online_users() == ["fresh"]
    assert tracker.prune_expired() is False
