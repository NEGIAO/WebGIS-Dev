from __future__ import annotations

from dataclasses import dataclass
import hashlib
import re
from typing import Dict, List, Tuple
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

MAX_ZOOM = 30


@dataclass
class TileXYZ:
    x: int
    y: int
    z: int


@dataclass
class TileUrlTemplate:
    scheme: str
    netloc: str
    path_segments: Tuple[str, ...]
    query_pairs: Tuple[Tuple[str, str], ...]
    mode: str
    indices: Dict[str, int]
    affixes: Dict[str, Tuple[str, str]]
    query_keys: Dict[str, str]
    params: str
    fragment: str
    cache_key: str
    template_id: str


def parse_tile_url(url: str) -> Tuple[TileUrlTemplate, TileXYZ]:
    """Parse a tile URL into a template and XYZ coordinates."""
    parsed = urlparse(url)
    query_pairs = tuple(parse_qsl(parsed.query, keep_blank_values=True))
    lower_key_map = {key.lower(): key for key, _ in query_pairs}

    if all(key in lower_key_map for key in ("x", "y", "z")):
        x_key = lower_key_map["x"]
        y_key = lower_key_map["y"]
        z_key = lower_key_map["z"]
        x_val = _parse_int(_get_query_value(query_pairs, x_key), "x")
        y_val = _parse_int(_get_query_value(query_pairs, y_key), "y")
        z_val = _parse_int(_get_query_value(query_pairs, z_key), "z")
        template_id = _build_query_template_id(parsed, query_pairs)
        return (
            TileUrlTemplate(
                scheme=parsed.scheme,
                netloc=parsed.netloc,
                path_segments=tuple(_split_path(parsed.path)),
                query_pairs=query_pairs,
                mode="query",
                indices={},
                affixes={},
                query_keys={"x": x_key, "y": y_key, "z": z_key},
                params=parsed.params,
                fragment=parsed.fragment,
                cache_key=_hash_template(template_id),
                template_id=template_id,
            ),
            TileXYZ(x=x_val, y=y_val, z=z_val),
        )

    path_segments = _split_path(parsed.path)
    numeric_segments = _extract_numeric_segments(path_segments)
    if len(numeric_segments) < 3:
        raise ValueError("unable to locate x/y/z in tile path")

    candidates = numeric_segments[-3:]
    (idx_a, val_a, pre_a, suf_a) = candidates[0]
    (idx_b, val_b, pre_b, suf_b) = candidates[1]
    (idx_c, val_c, pre_c, suf_c) = candidates[2]

    zxy_valid = _is_valid_xyz(val_a, val_b, val_c)
    xyz_valid = _is_valid_xyz(val_c, val_a, val_b)

    if zxy_valid:
        indices = {"z": idx_a, "x": idx_b, "y": idx_c}
        affixes = {
            "z": (pre_a, suf_a),
            "x": (pre_b, suf_b),
            "y": (pre_c, suf_c),
        }
        xyz = TileXYZ(x=val_b, y=val_c, z=val_a)
    elif xyz_valid:
        indices = {"x": idx_a, "y": idx_b, "z": idx_c}
        affixes = {
            "x": (pre_a, suf_a),
            "y": (pre_b, suf_b),
            "z": (pre_c, suf_c),
        }
        xyz = TileXYZ(x=val_a, y=val_b, z=val_c)
    else:
        raise ValueError("unable to infer tile xyz order from path")

    template_id = _build_path_template_id(parsed, path_segments, indices, affixes)
    return (
        TileUrlTemplate(
            scheme=parsed.scheme,
            netloc=parsed.netloc,
            path_segments=tuple(path_segments),
            query_pairs=query_pairs,
            mode="path",
            indices=indices,
            affixes=affixes,
            query_keys={},
            params=parsed.params,
            fragment=parsed.fragment,
            cache_key=_hash_template(template_id),
            template_id=template_id,
        ),
        xyz,
    )


def build_tile_url(template: TileUrlTemplate, x: int, y: int, z: int) -> str:
    """Build a tile URL from a parsed template and XYZ coordinates."""
    if template.mode == "query":
        pairs = list(template.query_pairs)
        pairs = _replace_query_value(pairs, template.query_keys["x"], str(x))
        pairs = _replace_query_value(pairs, template.query_keys["y"], str(y))
        pairs = _replace_query_value(pairs, template.query_keys["z"], str(z))
        query = urlencode(pairs, doseq=True)
        path = _join_path(list(template.path_segments))
    else:
        segments = list(template.path_segments)
        for key, value in (("x", x), ("y", y), ("z", z)):
            idx = template.indices[key]
            prefix, suffix = template.affixes[key]
            segments[idx] = f"{prefix}{value}{suffix}"
        path = _join_path(segments)
        query = urlencode(template.query_pairs, doseq=True)

    return urlunparse(
        (
            template.scheme,
            template.netloc,
            path,
            template.params,
            query,
            template.fragment,
        )
    )


def _split_path(path: str) -> List[str]:
    return [segment for segment in path.split("/") if segment]


def _join_path(segments: List[str]) -> str:
    if not segments:
        return "/"
    return "/" + "/".join(segments)


def _extract_numeric_segments(segments: List[str]) -> List[Tuple[int, int, str, str]]:
    numeric_segments = []
    for idx, segment in enumerate(segments):
        match = re.search(r"(\d+)", segment)
        if not match:
            continue
        value = int(match.group(1))
        prefix = segment[: match.start(1)]
        suffix = segment[match.end(1) :]
        numeric_segments.append((idx, value, prefix, suffix))
    return numeric_segments


def _is_valid_xyz(z: int, x: int, y: int) -> bool:
    if z < 0 or z > MAX_ZOOM:
        return False
    limit = 2**z - 1
    return 0 <= x <= limit and 0 <= y <= limit


def _parse_int(raw: str, label: str) -> int:
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"invalid {label} value: {raw}") from exc


def _get_query_value(pairs: Tuple[Tuple[str, str], ...], key: str) -> str:
    for k, v in reversed(pairs):
        if k == key:
            return v
    raise ValueError(f"missing query param: {key}")


def _replace_query_value(
    pairs: List[Tuple[str, str]],
    key: str,
    value: str,
) -> List[Tuple[str, str]]:
    replaced = False
    new_pairs: List[Tuple[str, str]] = []
    for k, v in pairs:
        if k == key:
            new_pairs.append((k, value))
            replaced = True
        else:
            new_pairs.append((k, v))
    if not replaced:
        new_pairs.append((key, value))
    return new_pairs


def _build_query_template_id(
    parsed,
    query_pairs: Tuple[Tuple[str, str], ...],
) -> str:
    template_pairs = []
    for key, value in query_pairs:
        lower = key.lower()
        if lower == "x":
            template_pairs.append((key, "{x}"))
        elif lower == "y":
            template_pairs.append((key, "{y}"))
        elif lower == "z":
            template_pairs.append((key, "{z}"))
        else:
            template_pairs.append((key, value))
    template_query = urlencode(template_pairs, doseq=True)
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            template_query,
            parsed.fragment,
        )
    )


def _build_path_template_id(
    parsed,
    path_segments: List[str],
    indices: Dict[str, int],
    affixes: Dict[str, Tuple[str, str]],
) -> str:
    segments = list(path_segments)
    for key in ("x", "y", "z"):
        idx = indices[key]
        prefix, suffix = affixes[key]
        segments[idx] = f"{prefix}{{{key}}}{suffix}"
    template_path = _join_path(segments)
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            template_path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )


def _hash_template(template_id: str) -> str:
    digest = hashlib.sha1(template_id.encode("utf-8")).hexdigest()
    return digest[:16]
