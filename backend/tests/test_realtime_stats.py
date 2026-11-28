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
    tracker.mark_connection("alice", client_id="c_alice_fallback")

    tracker.mark_heartbeat("alice", client_id="c_alice_fallback")
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
    tracker.mark_connection("g:guest_abc", client_id="c_guest_abc")
    tracker.mark_heartbeat("g:guest_abc", client_id="c_guest_abc")
    tracker.mark_connection("u:alice", client_id="c_alice_1")
    tracker.mark_heartbeat("u:alice", client_id="c_alice_1")

    assert tracker.get_online_count() == 2
    assert set(tracker.get_online_users()) == {"g:guest_abc", "u:alice"}


def test_ephemeral_presence_not_counted(monkeypatch):
    """无 device_id 的临时脚本身份（e: 前缀）不计入在线人数。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("e:deadbeef")
    tracker.mark_heartbeat("e:cafebabe")
    tracker.mark_connection("u:alice", client_id="c_alice_2")
    tracker.mark_heartbeat("u:alice", client_id="c_alice_2")

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


def test_private_gateway_ip_with_nonstandard_device_is_not_countable():
    """V3.7.13 Plan B：私网网关 IP + 非标准 device_id（测试残留）不可数；
    标准 gd_ device_id（含 clone 用户私网直连）与公网用户一律保持可数。"""
    from api.auth.constants import is_private_client_ip, is_standard_guest_device_id

    # 判据本身
    assert is_private_client_ip("10.16.26.165")
    assert is_private_client_ip("172.19.0.1")
    assert not is_private_client_ip("8.8.8.8")
    assert is_standard_guest_device_id("gd_6f1a7aee6a74ff25327d42d98fa6896b")
    assert is_standard_guest_device_id("gd_device_aaaa")  # 历史短值兼容
    assert not is_standard_guest_device_id("vt-test-device")
    assert not is_standard_guest_device_id("guest_4dabd01a794dc19c")

    # 测试残留：私网 + 非标准 → 不可数 e:
    residual = realtime_stats.presence_id_from_fields(
        role="guest", guest_device_id="vt-test-device", client_ip="10.16.26.165"
    )
    assert residual.startswith("e:")

    # clone 用户本地直连：私网 + 标准 gd_ → 仍可数 g:
    clone = realtime_stats.presence_id_from_fields(
        role="guest",
        guest_device_id="gd_6f1a7aee6a74ff25327d42d98fa6896b",
        client_ip="10.16.26.165",
    )
    assert clone.startswith("g:")

    # 历史真实用户公网 IP + 非标准 device_id → 仍可数 g:（不误伤）
    legacy = realtime_stats.presence_id_from_fields(
        role="guest", guest_device_id="vt-test-device", client_ip="8.8.8.8"
    )
    assert legacy.startswith("g:")

    # 注册用户不受影响
    assert realtime_stats.presence_id_from_fields(
        username="alice", role="registered", client_ip="10.16.26.165"
    ) == "u:alice"


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
    tracker.mark_connection("g:guest_xyz", client_id="c_guest_xyz")
    tracker.drop_connection("g:guest_xyz")
    tracker.mark_connection("u:alice", client_id="c_alice_3")
    tracker.mark_heartbeat("u:alice", client_id="c_alice_3")

    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["u:alice"]


def test_get_online_count_prunes_stale_connections_on_read(monkeypatch):
    """后台扫描延迟时，读计数自身也必须剔除过期 SSE 幽灵连接。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    tracker.mark_connection("u:ghost")
    with tracker._lock:
        tracker._conn_seen["u:ghost"] = _time.monotonic() - 9999

    assert tracker.get_online_count() == 0
    assert tracker.get_online_users() == []


def test_stale_connection_ttl_removes_ghosts(monkeypatch):
    """超过 TTL 无活动的 SSE 连接应被剔除，避免在线数卡死。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    tracker.mark_connection("u:ghost", client_id="c_ghost")
    with tracker._lock:
        tracker._conn_seen["u:ghost"] = _time.monotonic() - 9999
    tracker.mark_connection("u:alive", client_id="c_alive")
    tracker.mark_heartbeat("u:alive", client_id="c_alive")

    assert tracker.prune_stale_connections(ttl=60) is True
    assert tracker.get_online_users() == ["u:alive"]


def test_client_heartbeat_refreshes_sse_connection(monkeypatch):
    """显式 presence ping 必须刷新 SSE last_seen；写出事件不再承担该职责。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    cid = tracker.mark_connection("u:alice", client_id="client-alice")
    with tracker._lock:
        tracker._connections[cid]["last_seen"] = _time.monotonic() - 60
        aged = tracker._connections[cid]["last_seen"]

    tracker.mark_heartbeat("u:alice", client_id="client-alice")

    with tracker._lock:
        assert tracker._connections[cid]["last_seen"] > aged
    assert "u:alice" in tracker.get_online_users()


def test_bare_sse_connection_without_heartbeat_is_not_online(monkeypatch):
    """幽灵只重建 SSE、不发心跳时不得计入在线人数。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("g:guest_ghost", client_id="c_ghost_reconnect")
    tracker.mark_connection("u:admin", client_id="c_admin_tab")

    assert tracker.snapshot_debug()["sse_conn_count_total"] == 2
    assert tracker.get_online_users() == []


def test_anonymous_activity_does_not_refresh_guest_sse(monkeypatch):
    """无 client_id 的匿名请求不得保活 visitor SSE，否则诊断请求会制造幽灵在线。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    cid = tracker.mark_connection("g:guest_x", client_id="tab-guest-x")
    with tracker._lock:
        tracker._connections[cid]["last_seen"] = _time.monotonic() - 61
        aged = tracker._connections[cid]["last_seen"]

    tracker.mark_authenticated_activity("g:guest_x")
    tracker.mark_heartbeat("g:guest_x")

    with tracker._lock:
        assert tracker._connections[cid]["last_seen"] == aged
    assert tracker.prune_stale_connections(ttl=60) is True
    assert "g:guest_x" not in tracker.get_online_users()


def test_presence_ping_rejects_anonymous_guest_injection(monkeypatch):
    """裸 device_id 无会话 token 不得铸造可数的 g: 在线身份。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    tracker = _tracker(monkeypatch)
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)

    test_app = FastAPI()
    test_app.include_router(realtime_stats.router)
    with TestClient(test_app) as client:
        resp = client.post(
            "/api/statistics/presence/ping",
            headers={
                "X-Guest-Device-Id": "gd_anonymous_injection",
                "X-Presence-Client-Id": "c_anonymous_injection",
            },
        )

    assert resp.status_code == 200
    assert tracker.get_online_count() == 0


def test_presence_ping_counts_verified_guest(monkeypatch):
    """已验签 guest token 应计入在线，并按 guest 归类（与是否游客无关）。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    tracker = _tracker(monkeypatch)
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)
    monkeypatch.setattr(
        "api.auth.guest_token.verify_guest_token_active",
        lambda token: "guest_verified_01" if token == "gt1_verified" else None,
    )

    test_app = FastAPI()
    test_app.include_router(realtime_stats.router)
    with TestClient(test_app) as client:
        resp = client.post(
            "/api/statistics/presence/ping",
            headers={
                "X-Guest-Token": "gt1_verified",
                "X-Guest-Device-Id": "gd_verified_guest",
                "X-Presence-Client-Id": "c_verified_guest",
            },
        )

    body = resp.json()
    assert resp.status_code == 200
    assert body["presence_id"].startswith("g:")
    assert body["online"] == 1
    _, _, by_role = tracker.snapshot_online_with_roles()
    assert by_role == {"admin": 0, "registered": 0, "guest": 1}


def test_snapshot_online_with_roles_uses_real_role(monkeypatch):
    """角色分布按身份真实 role 统计，不再用 u:admin 字符串硬编码猜管理员。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_heartbeat("u:alice", client_id="c_role_01", role="registered")
    tracker.mark_heartbeat("u:root", client_id="c_role_02", role="registered")
    tracker.mark_heartbeat("g:guest_a", client_id="c_role_03", role="guest")

    count, ids, by_role = tracker.snapshot_online_with_roles()

    assert count == 3
    assert "u:root" in ids
    assert by_role == {"admin": 0, "registered": 2, "guest": 1}


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


def test_multi_tab_close_only_drops_closed_tab(monkeypatch):
    """同账号开两标签页，关闭其一时只撤销该标签页信号，另一标签页保持在线。"""
    tracker = _tracker(monkeypatch)
    c1 = tracker.mark_connection("u:alice", client_id="c_tab_one_123456")
    c2 = tracker.mark_connection("u:alice", client_id="c_tab_two_123456")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_one_123456")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_two_123456")

    assert c1 != c2
    assert tracker.get_online_count() == 1
    assert tracker.snapshot_debug()["sse_conn_count_total"] == 2

    tracker.drop_presence("u:alice", client_id="c_tab_one_123456")
    assert tracker.get_online_count() == 1
    assert tracker.snapshot_debug()["sse_conn_count_total"] == 1

    tracker.drop_presence("u:alice", client_id="c_tab_two_123456")
    assert tracker.get_online_count() == 0
    assert tracker.snapshot_debug()["sse_conn_count_total"] == 0


def test_same_tab_identity_switch_supersedes_previous_connection(monkeypatch):
    """同一标签页从游客切换为登录态时，旧游客连接与心跳必须被原子接管，避免双计。"""
    evicted = []
    monkeypatch.setattr(realtime_stats, "request_evict_conn_ids", lambda ids: evicted.extend(ids))
    tracker = _tracker(monkeypatch)

    c_guest = tracker.mark_connection("g:guest_abc123", client_id="c_tab_switch_1234")
    tracker.mark_heartbeat("g:guest_abc123", client_id="c_tab_switch_1234")
    assert tracker.get_online_users() == ["g:guest_abc123"]

    tracker.mark_connection("u:alice", client_id="c_tab_switch_1234")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_switch_1234")
    assert c_guest in evicted
    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["u:alice"]


def test_same_browser_logged_in_suppresses_duplicate_guest_tab(monkeypatch):
    """同一浏览器同时存在已登录标签与未登录游客标签时，合并计为 1 人；注销后游客立即显露。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection(
        "u:alice",
        client_id="c_tab_logged_in_1234",
        device_presence_id="g:guest_shared_browser",
    )
    tracker.mark_heartbeat(
        "u:alice",
        client_id="c_tab_logged_in_1234",
        device_presence_id="g:guest_shared_browser",
    )
    tracker.mark_connection("g:guest_shared_browser", client_id="c_tab_guest_2345")
    tracker.mark_heartbeat("g:guest_shared_browser", client_id="c_tab_guest_2345")
    tracker.mark_connection("g:guest_other_browser", client_id="c_tab_other_3456")
    tracker.mark_heartbeat("g:guest_other_browser", client_id="c_tab_other_3456")

    assert tracker.get_online_count() == 2
    assert set(tracker.get_online_users()) == {"u:alice", "g:guest_other_browser"}
    assert tracker.snapshot_debug()["suppressed_guest_ids"] == ["g:guest_shared_browser"]

    tracker.drop_presence("u:alice", client_id="c_tab_logged_in_1234")
    assert tracker.get_online_count() == 2
    assert set(tracker.get_online_users()) == {"g:guest_shared_browser", "g:guest_other_browser"}


def test_drop_presence_by_session_sig_only_evicts_target_session(monkeypatch):
    """单端注销只撤销当前 session_sig，不影响该账号在其他设备上的登录会话。"""
    tracker = _tracker(monkeypatch)
    tracker.mark_connection("u:alice", client_id="c_desktop_111111", session_sig="sig_desktop")
    tracker.mark_heartbeat("u:alice", client_id="c_desktop_111111", session_sig="sig_desktop")
    tracker.mark_connection("u:alice", client_id="c_phone_222222", session_sig="sig_phone")
    tracker.mark_heartbeat("u:alice", client_id="c_phone_222222", session_sig="sig_phone")

    evicted = tracker.drop_presence("", session_sig="sig_desktop")
    assert len(evicted) == 1
    assert tracker.get_online_count() == 1
    assert tracker.snapshot_debug()["sse_conn_count_total"] == 1


def test_stale_connection_prunes_per_conn_independently(monkeypatch):
    """同一用户的两条 SSE 连接各自独立计时，单条超时剔除不误杀健康连接。"""
    import time as _time

    tracker = _tracker(monkeypatch)
    stale_cid = tracker.mark_connection("u:alice", client_id="c_stale_111111")
    fresh_cid = tracker.mark_connection("u:alice", client_id="c_fresh_222222")
    tracker.mark_heartbeat("u:alice", client_id="c_fresh_222222")

    with tracker._lock:
        tracker._connections[stale_cid]["last_seen"] = _time.monotonic() - 9999

    pruned = tracker.prune_stale_connections_with_ids(ttl=60)
    assert pruned == [stale_cid]
    assert tracker.get_online_count() == 1
    assert fresh_cid in tracker._connections


def test_sse_stream_awaits_is_disconnected_and_sends_keepalive(monkeypatch):
    """regression：SSE 超时分支必须 await request.is_disconnected()，保持长连接保活并在真断开时退出。"""
    import asyncio
    from types import SimpleNamespace

    tracker = _tracker(monkeypatch)
    broadcaster = realtime_stats.StatsBroadcaster()
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)
    monkeypatch.setattr(realtime_stats, "get_broadcaster", lambda: broadcaster)
    monkeypatch.setattr(realtime_stats, "SSE_KEEPALIVE_SECONDS", 0.02)

    async def _noop_broadcast():
        return None

    monkeypatch.setattr(realtime_stats, "_compute_and_broadcast_once", _noop_broadcast)

    checks = {"n": 0}

    async def _is_disconnected():
        checks["n"] += 1
        return checks["n"] >= 3

    fake_request = SimpleNamespace(is_disconnected=_is_disconnected)
    ticket = realtime_stats.create_stream_ticket(
        "alice",
        presence_id="u:alice",
        client_id="c_sse_keepalive_test",
    )

    async def _run():
        resp = await realtime_stats.statistics_stream(fake_request, ticket=ticket)
        chunks = []
        async for chunk in resp.body_iterator:
            chunks.append(chunk)
        return chunks

    chunks = asyncio.run(_run())
    # 前两次 is_disconnected 返回 False，应至少发送 2 次 keep-alive（旧 bug 无 await 会 0 次退出）
    assert chunks.count(": keep-alive\n\n") == 2
    assert tracker.get_online_count() == 0
    assert broadcaster.client_count == 0


def test_offline_beacon_accepts_sendbeacon_json_body(monkeypatch):
    """游客 navigator.sendBeacon 无法发自定义请求头，offline 接口必须从 JSON body 解析设备 ID。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    tracker = _tracker(monkeypatch)
    broadcaster = realtime_stats.StatsBroadcaster()
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)
    monkeypatch.setattr(realtime_stats, "get_broadcaster", lambda: broadcaster)

    test_app = FastAPI()
    test_app.include_router(realtime_stats.router)

    guest_dev = "gd_beacon_test_device_01"
    pid = realtime_stats.presence_id_from_fields(role="guest", guest_device_id=guest_dev)
    tracker.mark_connection(pid, client_id="c_beacon_tab_01")
    tracker.mark_heartbeat(pid, client_id="c_beacon_tab_01")
    assert tracker.get_online_count() == 1

    with TestClient(test_app) as client:
        resp = client.post(
            "/api/statistics/presence/offline",
            json={"client_id": "c_beacon_tab_01", "guest_device_id": guest_dev},
        )
    assert resp.status_code == 200
    assert resp.json()["online"] == 0
    assert tracker.get_online_count() == 0


def test_guest_uid_conflict_normalized_to_device_presence_id(monkeypatch):
    """regression：游客会话自带不一致 guest_uid 且携带设备 ID 时，必须归并到规范化 device_presence_id。"""
    tracker = _tracker(monkeypatch)
    guest_dev = "gd_conflict_device_01"
    canonical = realtime_stats.device_presence_id(guest_dev)

    # 场景 1：旧/随机 guest_uid 与 X-Guest-Device-Id 并存时不再裂成两个 g:
    pid_with_stale_uid = realtime_stats.presence_id_from_fields(
        username="user_9",
        role="guest",
        guest_uid="guest_legacy_random",
        guest_device_id=guest_dev,
    )
    assert pid_with_stale_uid == canonical

    # 场景 2：会话本身无 guest_device_id，但请求透传了 X-Guest-Device-Id
    pid_session_with_header = realtime_stats.presence_id_from_session(
        {"username": "user_9", "role": "guest", "guest_uid": "guest_legacy_random"},
        guest_device_id=guest_dev,
    )
    assert pid_session_with_header == canonical

    # 同浏览器登录账号 u:alice 仅压制规范化的 canonical，上述两个信号均被正确去重为 1 人
    tracker.mark_connection(pid_with_stale_uid, client_id="c_guest_tab_1")
    tracker.mark_heartbeat(pid_with_stale_uid, client_id="c_guest_tab_1")
    tracker.mark_connection("u:alice", client_id="c_admin_tab_2", device_presence_id=canonical)
    tracker.mark_heartbeat("u:alice", client_id="c_admin_tab_2", device_presence_id=canonical)
    assert tracker.get_online_count() == 1
    assert tracker.get_online_users() == ["u:alice"]


def test_default_fallback_beat_cleaned_on_connect_and_drop_presence(monkeypatch):
    """regression：无 client_id 留下的 _default 心跳在建连/切号/下线后不得作为幽灵保活 90s。"""
    tracker = _tracker(monkeypatch)

    # 新口径：无 client_id 的请求不再写 _default，不产生在线
    tracker.mark_authenticated_activity("u:alice", session_sig="sig_alice_1")
    assert tracker.get_online_count() == 0

    # 带 client_id 的 ticket 请求写入有效 liveness；建连不得把它删掉
    tracker.mark_authenticated_activity(
        "u:alice", client_id="c_tab_switch_01", session_sig="sig_alice_1"
    )
    assert tracker.get_online_count() == 1
    conn_alice = tracker.mark_connection(
        "u:alice", client_id="c_tab_switch_01", session_sig="sig_alice_1"
    )
    assert conn_alice
    assert tracker.get_online_count() == 1

    evicted = tracker.drop_presence(
        "u:alice", client_id="c_tab_switch_01", session_sig="sig_alice_1"
    )
    assert evicted == [conn_alice]
    assert tracker.get_online_count() == 0

    # 同一 session 的另一标签页仍在线；关掉其中一页不误杀另一页
    conn_other = tracker.mark_connection("u:alice", client_id="c_tab_keep_02", session_sig="sig_alice_shared")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_keep_02", session_sig="sig_alice_shared")
    tracker.mark_connection("u:alice", client_id="c_tab_close_03", session_sig="sig_alice_shared")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_close_03", session_sig="sig_alice_shared")
    tracker.drop_presence("u:alice", client_id="c_tab_close_03", session_sig="sig_alice_shared")
    assert tracker.get_online_count() == 1
    assert conn_other in tracker._connections


def test_offline_beacon_accepts_text_plain_cors_simple_payload(monkeypatch):
    """regression：跨域卸载 sendBeacon 使用 text/plain 发送 JSON 字符串，后端必须正确解析。"""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    tracker = _tracker(monkeypatch)
    broadcaster = realtime_stats.StatsBroadcaster()
    monkeypatch.setattr(realtime_stats, "_online_tracker", tracker)
    monkeypatch.setattr(realtime_stats, "get_broadcaster", lambda: broadcaster)

    test_app = FastAPI()
    test_app.include_router(realtime_stats.router)

    guest_dev = "gd_text_plain_device_01"
    pid = realtime_stats.presence_id_from_fields(role="guest", guest_device_id=guest_dev)
    tracker.mark_connection(pid, client_id="c_plain_tab_01")
    tracker.mark_heartbeat(pid, client_id="c_plain_tab_01")
    assert tracker.get_online_count() == 1

    with TestClient(test_app) as client:
        resp = client.post(
            "/api/statistics/presence/offline",
            data='{"client_id":"c_plain_tab_01","guest_device_id":"gd_text_plain_device_01"}',
            headers={"Content-Type": "text/plain;charset=UTF-8"},
        )
    assert resp.status_code == 200
    assert resp.json()["online"] == 0
    assert tracker.get_online_count() == 0


def test_late_sse_teardown_does_not_kill_reconnected_tab(monkeypatch):
    """旧 SSE 生成器的迟到 finally 不得撤销同 client_id 新连接的心跳。"""
    tracker = _tracker(monkeypatch)
    old_conn = tracker.mark_connection("u:alice", client_id="c_tab_reconnect_01")
    tracker.mark_heartbeat("u:alice", client_id="c_tab_reconnect_01")

    # 同一标签页重连：新连接接管旧连接，心跳继续有效
    new_conn = tracker.mark_connection("u:alice", client_id="c_tab_reconnect_01")
    assert new_conn != old_conn

    # 旧生成器此刻才退出（HF 代理下迟到的 finally 是常态）
    tracker.drop_stream_connection(
        "u:alice", old_conn, client_id="c_tab_reconnect_01"
    )

    assert new_conn in tracker._connections
    assert tracker.get_online_users() == ["u:alice"]
    assert tracker.get_online_count() == 1


def test_sse_teardown_without_reconnect_drops_tab_liveness(monkeypatch):
    """没有新连接接替时，SSE 退出仍需立即撤销该标签页心跳。"""
    tracker = _tracker(monkeypatch)
    conn = tracker.mark_connection("g:guest_close_01", client_id="c_tab_close_01")
    tracker.mark_heartbeat("g:guest_close_01", client_id="c_tab_close_01")
    assert tracker.get_online_count() == 1

    tracker.drop_stream_connection(
        "g:guest_close_01", conn, client_id="c_tab_close_01"
    )
    assert tracker.get_online_count() == 0


def test_readonly_auth_dependency_does_not_mark_presence(monkeypatch):
    """统计只读端点必须不写在线 tracker，否则诊断/对账请求会制造幽灵在线。"""
    import asyncio
    from types import SimpleNamespace

    from api.auth import dependencies

    calls = []
    monkeypatch.setattr(
        dependencies, "_mark_active_safe", lambda session, request=None: calls.append(session)
    )
    async def _fake_guest_session(request):
        return {"username": "guest_x", "role": "guest", "guest_uid": "guest_x"}

    monkeypatch.setattr(
        dependencies, "_build_temporary_guest_session_async", _fake_guest_session
    )
    fake_request = SimpleNamespace(headers={}, query_params={}, cookies={})
    session = asyncio.run(dependencies.require_api_access_or_guest_readonly(fake_request))
    assert session["username"] == "guest_x"
    assert calls == []

    # 对照：常规只读（非统计）依赖仍应标活，避免回归正常 API 行为
    asyncio.run(dependencies.require_api_access_or_guest_noconsume(fake_request))
    assert len(calls) == 1


def test_admin_online_mirror_only_keeps_current_identities(monkeypatch):
    """管理员在线镜像表只保留当前在线身份，并带出身份/IP/设备等详情。"""
    import sqlite3
    from contextlib import contextmanager

    from api import statistics

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE sessions (
            token TEXT, username TEXT, role TEXT, guest_uid TEXT, guest_device_id TEXT,
            ip TEXT, user_agent TEXT, created_at TEXT, last_seen_at TEXT,
            expires_at TEXT, ip_city TEXT, ip_region TEXT, ip_country TEXT
        );
        CREATE TABLE guest_identity_records (
            id INTEGER, guest_uid TEXT, username TEXT, role TEXT, guest_device_id TEXT,
            ip TEXT, user_agent TEXT, first_seen_at TEXT, last_seen_at TEXT
        );
        CREATE TABLE visit_tracking_events (
            username TEXT, ip_city TEXT, ip_region TEXT, ip_country TEXT,
            latitude REAL, longitude REAL, coord_source TEXT, created_at TEXT
        );
        CREATE TABLE users (
            username TEXT, display_name TEXT
        );
        CREATE TABLE admin_online_presence (
            presence_id TEXT PRIMARY KEY, display_name TEXT, role TEXT,
            identity_type TEXT, guest_uid TEXT, guest_device_id TEXT,
            device_presence_id TEXT, client_ids TEXT, session_count INTEGER,
            sse_connections INTEGER, ip TEXT, ip_city TEXT, ip_region TEXT,
            ip_country TEXT, latitude REAL, longitude REAL, coord_source TEXT,
            user_agent TEXT, first_seen_at TEXT, last_seen_at TEXT,
            last_heartbeat_at TEXT, refreshed_at TEXT, session_token_sig TEXT
        );
        -- id=2055、username 残留旧值 user_1988：验证镜像用 id 而非 username
        INSERT INTO guest_identity_records VALUES (
            2055, 'guest_mirror1', 'user_1988', 'guest', 'gd_mirror1',
            '10.16.26.165', 'UA-GUEST', '2026-11-25 11:00:00', '2026-11-25 12:00:00'
        );
        INSERT INTO visit_tracking_events VALUES (
            'guest_mirror1', 'Nanjing', 'Jiangsu', 'China', 32.06, 118.79,
            'gps', '2026-11-25 12:00:00'
        );
        INSERT INTO users VALUES ('admin', 'Admin Nick');
        """
    )
    # V3.7.16：会话行必须是有效时间窗内的真值，镜像刷新会按 4h 硬截止过滤。
    from datetime import timedelta

    from api.auth.db import _iso as _db_iso, _utc_now as _db_utc_now

    now = _db_utc_now()
    created = _db_iso(now - timedelta(minutes=10))
    expires = _db_iso(now + timedelta(hours=2))
    conn.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "tok-admin", "admin", "admin", "", "", "9.9.9.9", "UA-ADMIN",
            created, created, expires, "", "", "",
        ),
    )
    conn.execute(
        "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "tok-guest", "guest_mirror1", "guest", "guest_mirror1", "gd_mirror1",
            "10.16.26.165", "UA-GUEST", created, created, expires,
            "Nanjing", "Jiangsu", "China",
        ),
    )
    conn.commit()

    @contextmanager
    def _memory_db():
        yield conn

    monkeypatch.setattr(statistics, "_db_connection", _memory_db)
    tracker = _tracker(monkeypatch)
    monkeypatch.setattr(statistics, "get_online_tracker", lambda: tracker)

    tracker.mark_connection("u:admin", client_id="c_admin_mirror")
    tracker.mark_heartbeat("u:admin", client_id="c_admin_mirror")
    tracker.mark_connection("g:guest_mirror1", client_id="c_guest_mirror")
    tracker.mark_heartbeat("g:guest_mirror1", client_id="c_guest_mirror")

    assert statistics._refresh_admin_online_mirror_sync() == 2
    rows = statistics._load_admin_online_mirror_sync()
    assert len(rows) == 2
    admin = next(row for row in rows if row["presence_id"] == "u:admin")
    guest = next(row for row in rows if row["presence_id"] == "g:guest_mirror1")
    assert admin["identity_type"] == "admin" and admin["ip"] == "9.9.9.9"
    # V3.7.13：在线镜像 display_name 与用户中心口径一致（users.display_name 优先）
    assert admin["display_name"] == "Admin Nick"
    # V3.7.13：容器网关内网 IP 在展示层过滤为 unknown；公网 IP 保持原样
    assert guest["ip"] == "unknown" and guest["ip_city"] == "Nanjing"
    assert admin["ip"] == "9.9.9.9"
    # V3.7.13：游客 display_name 用 guest_<id>，与用户中心一致（不受 username 旧值影响）
    assert guest["display_name"] == "guest_2055"
    assert guest["client_ids"] == ["c_guest_mirror"]
    # V3.7.16：镜像行必须可追溯到有效 session 的 token 指纹
    assert admin["session_token_sig"] == statistics._session_token_sig("tok-admin")
    assert guest["session_token_sig"] == statistics._session_token_sig("tok-guest")

    tracker.drop_presence("u:admin", client_id="c_admin_mirror")
    assert statistics._refresh_admin_online_mirror_sync() == 1
    rows = statistics._load_admin_online_mirror_sync()
    assert [row["presence_id"] for row in rows] == ["g:guest_mirror1"]


def test_online_mirror_drops_presence_without_live_session(monkeypatch):
    """V3.7.16：tracker 有心跳但 sessions 无有效会话的幽灵身份不得写入镜像表。"""
    import sqlite3
    from contextlib import contextmanager

    from api import statistics

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE sessions (
            token TEXT, username TEXT, role TEXT, guest_uid TEXT, guest_device_id TEXT,
            ip TEXT, user_agent TEXT, created_at TEXT, last_seen_at TEXT,
            expires_at TEXT, ip_city TEXT, ip_region TEXT, ip_country TEXT
        );
        CREATE TABLE guest_identity_records (
            id INTEGER, guest_uid TEXT, username TEXT, role TEXT, guest_device_id TEXT,
            ip TEXT, user_agent TEXT, first_seen_at TEXT, last_seen_at TEXT
        );
        CREATE TABLE visit_tracking_events (
            username TEXT, ip_city TEXT, ip_region TEXT, ip_country TEXT,
            latitude REAL, longitude REAL, coord_source TEXT, created_at TEXT
        );
        CREATE TABLE users (username TEXT, display_name TEXT);
        CREATE TABLE admin_online_presence (
            presence_id TEXT PRIMARY KEY, display_name TEXT, role TEXT,
            identity_type TEXT, guest_uid TEXT, guest_device_id TEXT,
            device_presence_id TEXT, client_ids TEXT, session_count INTEGER,
            sse_connections INTEGER, ip TEXT, ip_city TEXT, ip_region TEXT,
            ip_country TEXT, latitude REAL, longitude REAL, coord_source TEXT,
            user_agent TEXT, first_seen_at TEXT, last_seen_at TEXT,
            last_heartbeat_at TEXT, refreshed_at TEXT, session_token_sig TEXT
        );
        INSERT INTO guest_identity_records VALUES (
            2000, 'guest_ghost', 'guest_2000', 'guest', 'gd_ghost',
            '180.137.117.8', 'UA-GHOST', '2026-11-16 20:35:32', '2026-11-24 21:44:39'
        );
        """
    )

    @contextmanager
    def _memory_db():
        yield conn

    monkeypatch.setattr(statistics, "_db_connection", _memory_db)
    tracker = _tracker(monkeypatch)
    monkeypatch.setattr(statistics, "get_online_tracker", lambda: tracker)
    tracker.mark_heartbeat("g:guest_ghost", client_id="c_ghost")

    assert statistics._refresh_admin_online_mirror_sync() == 0
    assert statistics._load_admin_online_mirror_sync() == []


def test_public_ip_for_display_filters_private_gateway_ips():
    """V3.7.13：在线表展示层 IP 过滤——私网/回环/保留显示 unknown，公网原样。"""
    from api import statistics

    cases = {
        "10.16.26.165": "unknown",   # HF 容器网关
        "172.19.0.1": "unknown",     # 本地 Docker 网关
        "127.0.0.1": "unknown",
        "192.168.1.1": "unknown",
        "169.254.1.1": "unknown",
        "224.0.0.1": "unknown",
        "8.8.8.8": "8.8.8.8",
        "1.2.3.4": "1.2.3.4",
        "": "unknown",
        "not-an-ip": "unknown",
    }
    for raw, expected in cases.items():
        assert statistics._public_ip_for_display(raw) == expected, raw
