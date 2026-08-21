from services.historical_imagery import _normalize_entries


def test_normalize_wayback_entries_sorts_and_builds_xyz_urls():
    entries = _normalize_entries([
        {"Name": "World Imagery (Wayback 2024-01-10)", "M": 12, "ID": "WB_2024_R01"},
        {"Name": "World Imagery (Wayback 2025-02-20)", "M": 18, "ID": "WB_2025_R01"},
    ])
    assert [entry["date"] for entry in entries] == ["2025-02-20", "2024-01-10"]
    assert entries[0]["layer_id"] == "18"
    assert entries[0]["xyz_url"].endswith("/tile/18/{z}/{y}/{x}")


def test_normalize_wayback_entries_ignores_invalid_and_duplicate_layers():
    entries = _normalize_entries([
        {"Name": "World Imagery (Wayback invalid)", "M": 1, "ID": "bad"},
        {"Name": "World Imagery (Wayback 2025-01-01)", "M": 2, "ID": "ok"},
        {"Name": "World Imagery (Wayback 2024-01-01)", "M": 2, "ID": "dup"},
    ])
    assert len(entries) == 1
    assert entries[0]["date"] == "2025-01-01"
