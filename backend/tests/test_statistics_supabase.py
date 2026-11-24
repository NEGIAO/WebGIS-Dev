import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from api.statistics import _build_supabase_visit_payload


class BuildSupabaseVisitPayloadTests(unittest.TestCase):
    def test_event_id_maps_from_local_id(self):
        payload = _build_supabase_visit_payload({"id": 42, "username": "guest-1"})

        self.assertEqual(payload["event_id"], 42)
        self.assertNotIn("id", payload)
        self.assertNotIn("supabase_sync_status", payload)
        self.assertNotIn("supabase_sync_error", payload)
        self.assertNotIn("supabase_synced_at", payload)

    def test_defaults_for_empty_row(self):
        payload = _build_supabase_visit_payload({})

        self.assertEqual(payload["event_id"], 0)
        self.assertEqual(payload["username"], "unknown")
        self.assertEqual(payload["role"], "guest")
        self.assertEqual(payload["guest_uid"], "")
        self.assertEqual(payload["ip"], "unknown")
        self.assertEqual(payload["ip_city"], "Unknown")
        self.assertEqual(payload["ip_region"], "Unknown")
        self.assertEqual(payload["ip_country"], "Unknown")
        self.assertEqual(payload["encoded_pos"], "0")

    def test_geo_fields_pass_through(self):
        payload = _build_supabase_visit_payload(
            {
                "id": 7,
                "latitude": 34.82,
                "longitude": 114.3,
                "gps_accuracy": 12.5,
                "coord_source": "gps",
                "geo_permission": "granted",
            }
        )

        self.assertEqual(payload["latitude"], 34.82)
        self.assertEqual(payload["longitude"], 114.3)
        self.assertEqual(payload["gps_accuracy"], 12.5)
        self.assertEqual(payload["coord_source"], "gps")
        self.assertEqual(payload["geo_permission"], "granted")

    def test_geo_fields_may_be_none(self):
        payload = _build_supabase_visit_payload({"id": 8})

        self.assertIsNone(payload["latitude"])
        self.assertIsNone(payload["longitude"])
        self.assertIsNone(payload["gps_accuracy"])

    def test_quota_subject_falls_back_to_username(self):
        payload = _build_supabase_visit_payload({"id": 9, "username": "alice"})

        self.assertEqual(payload["quota_subject"], "alice")

        payload = _build_supabase_visit_payload(
            {"id": 10, "username": "bob", "quota_subject": "bob-subject"}
        )

        self.assertEqual(payload["quota_subject"], "bob-subject")


if __name__ == "__main__":
    unittest.main()
