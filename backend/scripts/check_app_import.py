#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全量 import app 门禁（目录搬迁强制项）。

背景（此前 P0）：瓦片域收拢时只验证了 tiles 路由子集，漏改的
`api/location.py` 旧 import 直到 Docker 启动才爆炸。本脚本保证：
任何包移动/改名后，`import app` 在**缺三方依赖的环境也能完整执行**
（三方缺件自动桩，第一方缺件则 loud 失败），并断言路由表不变量。

用法（backend/ 目录下）：
    python scripts/check_app_import.py

退出码：0=通过；1=失败（第一方导入失败 / 路由缺失 / 顺序破坏）。
只用标准库；桩名单覆盖 Docker 实有依赖（uv.lock），缺一即补一，
第一方包名（app/api/config/core/domains/services/tests/scripts）永不桩。
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
import sys
import traceback
from pathlib import Path
from unittest.mock import MagicMock

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# 第一方顶层包：出现在 ModuleNotFoundError 里即直接失败，禁止桩化
FIRST_PARTY = {"app", "api", "config", "core", "domains", "services", "tests", "scripts"}

# 三方桩：模块名 -> 需要预置的类级属性（类定义期就会访问的名字）
_STUB_ATTRS: dict[str, list[str]] = {
    "sqlmodel": ["Session"],
    "rasterio.io": ["MemoryFile"],
    "rasterio.transform": ["Affine"],
    "rasterio.windows": ["Window"],
    "apscheduler.schedulers.background": ["BackgroundScheduler"],
    "shapely": ["STRtree", "wkt", "wkb"],
    "shapely.geometry": [
        "shape", "mapping", "Point", "Polygon", "MultiPolygon",
        "box", "LineString", "MultiPoint", "MultiLineString", "GeometryCollection",
    ],
    "shapely.ops": ["unary_union", "transform", "voronoi_diagram", "triangulate", "polygonize"],
    "pyproj": ["Transformer", "CRS"],
}

stubbed: list[str] = []


class _SQLModelBase:
    def __init_subclass__(cls, **kwargs):
        pass


def _ensure_stub(name: str):
    """为缺失的三方模块建空包桩（属性按需自动补 MagicMock）。"""
    if name in sys.modules:
        return sys.modules[name]
    if "." in name:
        parent = _ensure_stub(name.rpartition(".")[0])
    else:
        parent = None
    spec = importlib.machinery.ModuleSpec(name, loader=None, is_package=True)
    mod = importlib.util.module_from_spec(spec)
    mod.__path__ = []
    blanket = MagicMock(name=name)
    for attr in dir(blanket):
        if attr.startswith("__") and attr != "__path__":
            continue
        try:
            if not hasattr(mod, attr):
                setattr(mod, attr, getattr(blanket, attr))
        except Exception:
            pass
    sys.modules[name] = mod
    if parent is not None:
        setattr(parent, name.rpartition(".")[2], mod)
    stubbed.append(name)
    return mod


def _fixups() -> None:
    if "sqlmodel" in sys.modules:
        sm = sys.modules["sqlmodel"]
        sm.SQLModel = _SQLModelBase
        sm.Field = lambda *a, **k: None
        sm.Session = type("Session", (), {})
        sm.create_engine = lambda *a, **k: None
        sm.select = lambda *a, **k: None
    for mod_name, names in _STUB_ATTRS.items():
        if mod_name in sys.modules:
            for attr in names:
                if not hasattr(sys.modules[mod_name], attr):
                    setattr(sys.modules[mod_name], attr, type(attr, (), {}))


def import_app_with_stubs(max_rounds: int = 30):
    """迭代导入：三方缺件桩化重试，第一方缺件立即抛。返回 (app_module, stub_list)。"""
    for _ in range(max_rounds):
        _fixups()
        try:
            import app as app_module

            return app_module, sorted(set(stubbed))
        except ModuleNotFoundError as exc:
            missing = exc.name or ""
            top = missing.split(".")[0]
            if top in FIRST_PARTY:
                raise RuntimeError(
                    f"第一方模块缺失（疑似搬迁漏改 import）：{missing}"
                ) from exc
            _ensure_stub(missing)
    raise RuntimeError("桩迭代超限仍未导入成功，请人工检查")


RECTIFY_PATHS = (
    "/proxy/gcj2wgs/{target_url:path}",
    "/proxy/wgs2gcj/{target_url:path}",
    "/proxy/bd2wgs/{target_url:path}",
    "/proxy/wgs2bd/{target_url:path}",
)
UNIVERSAL_PATH = "/proxy/{target_url:path}"
SHIPS_PATH = "/tiles/ships66/{z}/{x}/{y}.png"


def check_routes(app_module) -> list[str]:
    """断言路由表不变量，返回错误列表（空=通过）。"""
    errors: list[str] = []
    paths = [getattr(route, "path", None) for route in app_module.app.routes]
    for expected in (*RECTIFY_PATHS, UNIVERSAL_PATH, SHIPS_PATH):
        if expected not in paths:
            errors.append(f"路由缺失：{expected}")
    if UNIVERSAL_PATH in paths:
        universal_index = paths.index(UNIVERSAL_PATH)
        for expected in RECTIFY_PATHS:
            if expected in paths and paths.index(expected) > universal_index:
                errors.append(f"顺序破坏：{expected} 排在通配 {UNIVERSAL_PATH} 之后")
    if not any((p or "").startswith("/api/download") for p in paths):
        errors.append("下载路由缺失：/api/download*")
    if len(paths) < 50:
        errors.append(f"路由总数异常偏少：{len(paths)}")
    return errors


def main() -> int:
    try:
        app_module, used_stubs = import_app_with_stubs()
    except Exception:
        print("[FAIL] import app 失败：")
        traceback.print_exc(limit=12)
        return 1
    tops = sorted({s.split(".")[0] for s in used_stubs})
    print(f"[OK] import app 通过（桩三方：{', '.join(tops) or '无'}）")
    errors = check_routes(app_module)
    if errors:
        print("[FAIL] 路由断言失败：")
        for err in errors:
            print(f"  - {err}")
        return 1
    n_routes = len(list(app_module.app.routes))
    print(f"[OK] 路由断言通过（共 {n_routes} 条，纠偏先于通配，下载已挂载）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
