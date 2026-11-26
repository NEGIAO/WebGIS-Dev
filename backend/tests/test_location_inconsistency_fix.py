"""V3.7.14：位置统计修复的行为回归测试（替换原有源码字符串断言）。"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api import location as location_module
from api import statistics as stats_module
from services.request_geo import RequestGeo


class _FakeBody:
    user_agent = "UA-TEST"
    referrer = "https://example.com"


def _fake_request():
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))


def test_track_visit_event_record_shape():
    """track_visit 写入同源 IP、服务端时间，且 coord_source 与坐标一致。"""
    geo = RequestGeo(
        ip="8.8.8.8", city="Nanjing", region="Jiangsu", country="CN",
        latitude=32.0, longitude=118.0, source="amap", resolved=True,
    )
    with mock.patch("services.request_geo.get_request_geo", new=mock.AsyncMock(return_value=geo)), \
         mock.patch("api.statistics._insert_visit_tracking_event_sync") as insert, \
         mock.patch.object(location_module, "datetime") as fake_dt:
        fake_dt.now.return_value.isoformat.return_value = "2026-11-26T12:00:00+08:00"
        result = asyncio.run(location_module.track_visit(_FakeBody(), _fake_request(), current_user=None))

    assert result["code"] == 200 and result["data"]["tracked"] is True
    record = insert.call_args.args[0]
    assert record["ip"] == "8.8.8.8"          # 与地理信息同源，不再混用 XFF 首跳
    assert record["ip_city"] == "Nanjing"
    assert record["coord_source"] == "ip"
    assert record["visit_time"] == "2026-11-26T12:00:00+08:00"
    assert record["gps_timestamp"] == ""


def test_track_visit_unresolved_geo_keeps_ip_but_no_success_claim():
    """私网/失败：保留审计 IP，但不谎报 IP 坐标成功。"""
    geo = RequestGeo.empty("10.0.0.1")  # resolved=False, ip 保留
    with mock.patch("services.request_geo.get_request_geo", new=mock.AsyncMock(return_value=geo)), \
         mock.patch("api.statistics._insert_visit_tracking_event_sync") as insert:
        result = asyncio.run(location_module.track_visit(_FakeBody(), _fake_request(), current_user=None))

    record = insert.call_args.args[0]
    assert result["data"]["tracked"] is True
    assert record["ip"] == "10.0.0.1"
    assert record["ip_city"] == "Unknown"
    assert record["coord_source"] == "unknown"
    assert record["latitude"] is None


def test_ip_locate_rejects_unresolved_private_ip():
    """私网 IP 不再被 ip-locate 误判为定位成功。"""
    result = asyncio.run(
        location_module.ip_locate(
            location_module.IpLocateRequest(ip="10.0.0.1"),
            _fake_request(),
            current_user=None,
        )
    )
    assert result["code"] == 400
    assert result["data"]["ok"] is False


def test_fetch_geolocation_rejects_unresolved_geo():
    """外部服务失败时 fetch_geolocation 返回 None，而非带 IP 的空字典。"""
    empty = RequestGeo(ip="8.8.8.8")  # resolved=False
    with mock.patch("services.request_geo.resolve_ip_geo", new=mock.AsyncMock(return_value=empty)):
        assert asyncio.run(stats_module.fetch_geolocation("8.8.8.8")) is None


def test_online_mirror_coord_source_follows_event_coords():
    """在线表：城市来自 sessions，坐标来自 GPS 事件时不得标成 ip。"""
    user_row = {
        "username": "alice", "role": "user", "guest_uid": "", "guest_device_id": "",
        "ip": "8.8.8.8", "user_agent": "UA", "created_at": "", "last_seen_at": "",
    }
    session_geo_row = {"ip_city": "Nanjing", "ip_region": "Jiangsu", "ip_country": "CN"}
    event_row = {
        "ip_city": "", "ip_region": "", "ip_country": "",
        "latitude": 32.1, "longitude": 118.9, "coord_source": "gps",
    }

    def fake_execute(sql, *_args):
        if "FROM users" in sql:
            row = None
        elif "FROM sessions" in sql and "ip_city" in sql:
            row = session_geo_row
        elif "FROM sessions" in sql:
            row = user_row
        elif "FROM visit_tracking_events" in sql:
            row = event_row
        else:
            row = None
        return SimpleNamespace(fetchone=lambda: row)

    conn = SimpleNamespace(execute=fake_execute)
    info = stats_module._mirror_identity_from_db_sync(conn, "u:alice")

    assert info["ip_city"] == "Nanjing"          # 城市来自 sessions
    assert info["latitude"] == 32.1              # 坐标来自访问事件
    assert info["coord_source"] == "gps"         # 来源跟随坐标，而非城市
