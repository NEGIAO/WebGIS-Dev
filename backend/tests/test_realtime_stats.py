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


def test_presence_id_distinguishes_guest_and_registered(monkeypatch):
    """同一展示名下，游客与登录用户必须是不同的在线身份。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("g:guest_abc")
    tracker.mark_connection("u:alice")

    assert tracker.get_online_count() == 2
    assert set(tracker.get_online_users()) == {"g:guest_abc", "u:alice"}


def test_ephemeral_presence_not_counted(monkeypatch):
    """无 device_id 的临时脚本身份（e: 前缀）不计入在线人数。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("e:deadbeef")
    tracker.mark_heartbeat("e:cafebabe")
    tracker.mark_connection("u:alice")

    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["u:alice"]


def test_guest_device_ids_map_to_stable_presence_ids():
    """有 device_id 的游客 presence_id 稳定且互不相同。"""
    a = realtime_stats.presence_id_from_fields(role="guest", guest_device_id="gd_device_aaaa")
    b = realtime_stats.presence_id_from_fields(role="guest", guest_device_id="gd_device_bbbb")
    a2 = realtime_stats.presence_id_from_fields(role="guest", guest_device_id="gd_device_aaaa")

    assert a == a2
    assert a != b
    assert a.startswith("g:guest_")
    assert b.startswith("g:guest_")


def test_registered_presence_uses_username():
    """登录用户 presence_id 以账号为准。"""
    pid = realtime_stats.presence_id_from_fields(username="alice", role="registered")
    assert pid == "u:alice"


def test_registered_presence_ignores_stale_guest_device_id():
    """注册用户会话若残留 device_id，仍应计为 u: 而非 g:（登录前后不双身份）。"""
    pid = realtime_stats.presence_id_from_fields(
        username="alice",
        role="registered",
        guest_device_id="gd_device_aaaa",
        guest_uid="guest_stale",
    )
    assert pid == "u:alice"


def test_login_after_guest_does_not_double_count_same_person_identity_shape(monkeypatch):
    """登录前后若未换 presence（仍用 username），不应出现 guest+user 双计。"""
    tracker = _tracker(monkeypatch)
    # 修复后：ticket/session 会换成 u:alice；旧 g: 连接应由 disconnect 清掉
    tracker.mark_connection("g:guest_xyz")
    tracker.drop_connection("g:guest_xyz")
    tracker.mark_connection("u:alice")

    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["u:alice"]


def test_stale_connection_ttl_removes_ghosts(monkeypatch):
    """超过 TTL 无活动的 SSE 连接应被剔除，避免在线数卡死。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    tracker.mark_connection("u:ghost")
    with tracker._lock:
        tracker._conn_seen["u:ghost"] = _time.monotonic() - 9999
    tracker.mark_connection("u:alive")

    assert tracker.prune_stale_connections(ttl=60) is True
    assert tracker.get_online_users() == ["u:alive"]


def test_drop_presence_clears_all_signals(monkeypatch):
    """关页 beacon 应同时撤销连接计数与兜底心跳。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("g:guest_1")
    tracker.drop_presence("g:guest_1")
    tracker.mark_heartbeat("g:guest_2")
    tracker.drop_presence("g:guest_2")

    assert tracker.get_online_count() == 0


def test_guest_without_device_id_not_counted():
    """临时游客即使带随机 guest_uid，无 device_id 时也不得计入在线。"""
    pid = realtime_stats.presence_id_from_fields(
        role="guest",
        guest_uid="guest_ffffffffffffffff",
        guest_device_id="",
    )
    assert pid.startswith("e:")
    from api import realtime_stats as rs

    assert rs._is_countable_presence(pid) is False


def test_guest_username_derived_from_uid_is_stable():
    """游客 username 由 guest_uid 派生，不使用会撞名的 MAX(id)+1。"""
    from api.auth.user import _guest_username_from_uid

    uid = "guest_0123456789abcdef"
    name1 = _guest_username_from_uid(uid)
    name2 = _guest_username_from_uid(uid)
    other = _guest_username_from_uid("guest_fedcba9876543210")

    assert name1 == name2
    assert name1 != other
    assert name1 == "guest_0123456789abcdef"[:24]
