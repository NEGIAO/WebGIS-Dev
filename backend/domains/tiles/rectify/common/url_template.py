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
    path: str  # 原始路径字符串（path 模式按字符区间重建用）
    spans: Dict[str, Tuple[int, int]]  # key(x/y/z) → 路径内数字字符区间 (start, end)
    cache_key: str
    template_id: str


def parse_tile_url(url: str) -> Tuple[TileUrlTemplate, TileXYZ]:
    """Parse a tile URL into a template and XYZ coordinates."""
    parsed = urlparse(url)
    
    # 优先方案：原封不动的查找 x/y/z 或是 WMTS 标准的 tilecol/tilerow/tilematrix
    # 这样能兼容没有 "?" 的 URL，并且防止对特殊字符发生意料之外的 urlencode 编码
    x_match = re.search(r"\b(?:x|tilecol|col)=(\d+)", url, re.IGNORECASE)
    y_match = re.search(r"\b(?:y|tilerow|row)=(\d+)", url, re.IGNORECASE)
    z_match = re.search(r"\b(?:z|tilematrix|zoom|level)=(\d+)", url, re.IGNORECASE)
    
    if x_match and y_match and z_match:
        x_val = int(x_match.group(1))
        y_val = int(y_match.group(1))
        z_val = int(z_match.group(1))
        
        if _is_valid_xyz(z_val, x_val, y_val):
            template_str = url
            # 为了防止索引偏移，我们从后向前(倒序)进行替换
            matches =[
                ("x", x_match.start(1), x_match.end(1)),
                ("y", y_match.start(1), y_match.end(1)),
                ("z", z_match.start(1), z_match.end(1)),
            ]
            matches.sort(key=lambda m: m[1], reverse=True)
            for key, start, end in matches:
                template_str = template_str[:start] + f"{{{key}}}" + template_str[end:]
                
            template_id = template_str
            return (
                TileUrlTemplate(
                    scheme=parsed.scheme,
                    netloc=parsed.netloc,
                    path_segments=(),
                    query_pairs=(),
                    mode="format",   # 新增 format 模式，直接一律原封不动组装
                    indices={},
                    affixes={},
                    query_keys={},
                    params="",
                    fragment="",
                    path=parsed.path,
                    spans={},
                    cache_key=_hash_template(template_id),
                    template_id=template_id,
                ),
                TileXYZ(x=x_val, y=y_val, z=z_val),
            )

    # 备选方案1：标准查询参数解析 (同样引入对 WMTS 等别名的支持)
    query_pairs = tuple(parse_qsl(parsed.query, keep_blank_values=True))
    lower_key_map = {key.lower(): key for key, _ in query_pairs}

    x_aliases = ("x", "tilecol", "col")
    y_aliases = ("y", "tilerow", "row")
    z_aliases = ("z", "tilematrix", "zoom", "level")

    x_key = next((lower_key_map[k] for k in x_aliases if k in lower_key_map), None)
    y_key = next((lower_key_map[k] for k in y_aliases if k in lower_key_map), None)
    z_key = next((lower_key_map[k] for k in z_aliases if k in lower_key_map), None)

    if x_key and y_key and z_key:
        x_val = _parse_int(_get_query_value(query_pairs, x_key), "x")
        y_val = _parse_int(_get_query_value(query_pairs, y_key), "y")
        z_val = _parse_int(_get_query_value(query_pairs, z_key), "z")
        template_id = _build_query_template_id(parsed, query_pairs, x_key, y_key, z_key)
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
                path=parsed.path,
                spans={},
                cache_key=_hash_template(template_id),
                template_id=template_id,
            ),
            TileXYZ(x=x_val, y=y_val, z=z_val),
        )

    # 备选方案2：路径数字 token 全量扫描（通用解析，不针对任何特定服务）
    # 对整条路径做全量数字扫描（不再只取每段第一个数字），枚举全部有序三元组
    # (i<j<k)，zxy 序优先、其次 xyz 序做合法性校验（z≤30 且 x,y ≤ 2^z-1），
    # 在合法候选中取 x+y 最大者——真实瓦片坐标的数值量级必然大于样式/版本等
    # 尾随参数数字。该判据可同时兼容常规 /z/x/y 切片与单路径段内嵌多坐标的
    # URL（如 Google maps/vt 的 pb=!1m4!1m3!1i10!2i500!3i800!2m1!1e6：
    # 其 !1i/!2i/!3i 前缀自带数字 1/2/3 混入 token 流，真实三元组
    # (10,500,800) 并非相邻 token，故必须枚举全部三元组而非仅连续三连）。
    path_tokens = [
        (match.start(), match.end(), int(match.group(0)))
        for match in re.finditer(r"\d+", parsed.path)
    ]
    if len(path_tokens) < 3:
        raise ValueError("unable to locate x/y/z in tile path")

    best_xyz = None
    best_spans: Dict[str, Tuple[int, int]] = {}
    best_sum = -1
    for k in range(2, len(path_tokens)):
        (start_c, end_c, val_c) = path_tokens[k]
        for j in range(1, k):
            (start_b, end_b, val_b) = path_tokens[j]
            for i in range(0, j):
                (start_a, end_a, val_a) = path_tokens[i]
                if _is_valid_xyz(val_a, val_b, val_c):      # zxy 序
                    candidate_sum = val_b + val_c
                    if candidate_sum > best_sum:
                        best_sum = candidate_sum
                        best_xyz = TileXYZ(x=val_b, y=val_c, z=val_a)
                        best_spans = {"z": (start_a, end_a), "x": (start_b, end_b), "y": (start_c, end_c)}
                if _is_valid_xyz(val_c, val_a, val_b):      # xyz 序
                    candidate_sum = val_a + val_b
                    if candidate_sum > best_sum:
                        best_sum = candidate_sum
                        best_xyz = TileXYZ(x=val_a, y=val_b, z=val_c)
                        best_spans = {"x": (start_a, end_a), "y": (start_b, end_b), "z": (start_c, end_c)}
    if best_xyz is None:
        raise ValueError("unable to infer tile xyz order from path")

    template_id = _build_path_template_id(parsed, best_spans)
    return (
        TileUrlTemplate(
            scheme=parsed.scheme,
            netloc=parsed.netloc,
            path_segments=tuple(_split_path(parsed.path)),
            query_pairs=query_pairs,
            mode="path",
            indices={},
            affixes={},
            query_keys={},
            params=parsed.params,
            fragment=parsed.fragment,
            path=parsed.path,
            spans=best_spans,
            cache_key=_hash_template(template_id),
            template_id=template_id,
        ),
        best_xyz,
    )


def build_tile_url(template: TileUrlTemplate, x: int, y: int, z: int) -> str:
    """Build a tile URL from a parsed template and XYZ coordinates."""
    
    # 触发 format 模式时，原封不动的把坐标塞回去，不去拆解和重组 URL
    if template.mode == "format":
        url = template.template_id
        url = url.replace("{x}", str(x))
        url = url.replace("{y}", str(y))
        url = url.replace("{z}", str(z))
        return url
        
    elif template.mode == "query":
        pairs = list(template.query_pairs)
        pairs = _replace_query_value(pairs, template.query_keys["x"], str(x))
        pairs = _replace_query_value(pairs, template.query_keys["y"], str(y))
        pairs = _replace_query_value(pairs, template.query_keys["z"], str(z))
        query = urlencode(pairs, doseq=True)
        path = _join_path(list(template.path_segments))
    else:
        # path 模式：按字符区间倒序替换（先替换靠后的区间，防止长度变化导致偏移错位）
        path = template.path
        for key, value in sorted(
            (("x", x), ("y", y), ("z", z)),
            key=lambda kv: template.spans[kv[0]][0],
            reverse=True,
        ):
            start, end = template.spans[key]
            path = path[:start] + str(value) + path[end:]
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
    new_pairs: List[Tuple[str, str]] =[]
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
    x_key: str,
    y_key: str,
    z_key: str,
) -> str:
    template_pairs =[]
    for key, value in query_pairs:
        if key == x_key:
            template_pairs.append((key, "{x}"))
        elif key == y_key:
            template_pairs.append((key, "{y}"))
        elif key == z_key:
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


def _build_path_template_id(parsed, spans: Dict[str, Tuple[int, int]]) -> str:
    """按字符区间把路径中的 x/y/z 数字替换为占位符（倒序替换防止区间偏移）"""
    path = parsed.path
    for key, (start, end) in sorted(spans.items(), key=lambda item: item[1][0], reverse=True):
        path = path[:start] + "{" + key + "}" + path[end:]
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        )
    )


def _hash_template(template_id: str) -> str:
    digest = hashlib.sha1(template_id.encode("utf-8")).hexdigest()
    return digest[:16]