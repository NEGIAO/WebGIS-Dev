from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from config import load as config_load


class ConfigEnvLoadingTests(unittest.TestCase):
    def test_flattened_subtree_layout_loads_env_from_app_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            container_root = Path(temp_dir) / "container-root"
            app_dir = Path(temp_dir) / "app"
            container_root.mkdir()
            app_dir.mkdir()
            (app_dir / ".env").write_text(
                "GUEST_PASSWORD=from-flat-env\n", encoding="utf-8"
            )

            with (
                patch.dict(os.environ, {}, clear=True),
                patch.object(config_load, "PROJECT_ROOT", container_root),
                patch.object(config_load, "BACKEND_DIR", app_dir),
            ):
                config_load.load_project_env()
                self.assertEqual(os.environ.get("GUEST_PASSWORD"), "from-flat-env")

    def test_local_compose_layout_loads_root_env_local(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            container_root = Path(temp_dir) / "container-root"
            app_dir = Path(temp_dir) / "app"
            container_root.mkdir()
            app_dir.mkdir()
            (container_root / ".env.local").write_text(
                "GUEST_PASSWORD=from-local-env\n", encoding="utf-8"
            )

            with (
                patch.dict(os.environ, {"APP_ENV": "development"}, clear=True),
                patch.object(config_load, "PROJECT_ROOT", container_root),
                patch.object(config_load, "BACKEND_DIR", app_dir),
            ):
                config_load.load_project_env()
                self.assertEqual(os.environ.get("GUEST_PASSWORD"), "from-local-env")

    def test_explicit_backend_env_file_takes_priority(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            explicit_env = root / "deployment.env"
            explicit_env.write_text(
                "GUEST_PASSWORD=from-explicit-env\n", encoding="utf-8"
            )

            with (
                patch.dict(
                    os.environ,
                    {"BACKEND_ENV_FILE": str(explicit_env)},
                    clear=True,
                ),
                patch.object(config_load, "PROJECT_ROOT", root / "project"),
                patch.object(config_load, "BACKEND_DIR", root / "backend"),
            ):
                config_load.load_project_env()
                self.assertEqual(
                    os.environ.get("GUEST_PASSWORD"), "from-explicit-env"
                )

    def test_process_environment_is_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env_file = root / ".env"
            env_file.write_text("GUEST_PASSWORD=from-file\n", encoding="utf-8")

            with (
                patch.dict(
                    os.environ,
                    {
                        "BACKEND_ENV_FILE": str(env_file),
                        "GUEST_PASSWORD": "from-secret",
                    },
                    clear=True,
                ),
                patch.object(config_load, "PROJECT_ROOT", root / "project"),
                patch.object(config_load, "BACKEND_DIR", root / "backend"),
            ):
                config_load.load_project_env()
                self.assertEqual(os.environ.get("GUEST_PASSWORD"), "from-secret")


if __name__ == "__main__":
    unittest.main()
