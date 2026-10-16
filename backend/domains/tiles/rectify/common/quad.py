# -*- coding: utf-8 -*-
"""精确四角 QUAD 重采样（gcj/bd 双向共用的几何无缝原语）。

内容搬自旧 `gcj_rectify/rectify.py::_quad_warp`，逻辑逐字保留；
调用方必须显式传入重采样核（gcj 用 BILINEAR，bd 用 BICUBIC）。
"""

from __future__ import annotations

import math
from typing import Tuple

from PIL import Image

from domains.tiles.rectify.common.geo import TILE_SIZE


def _quad_warp(
    composite: Image.Image,
    quad: Tuple[
        Tuple[float, float],
        Tuple[float, float],
        Tuple[float, float],
        Tuple[float, float],
    ],
    resample: int,
) -> Image.Image:
    """按精确四角四边形从合成图重采样到 256×256 输出瓦片（QUAD 透视变换）。

    相邻瓦片的共享边端点由同一地理角点经同一函数算出，bit 级一致，
    几何上严格无缝（根因分析见 Docs/TODO/backend-reorg-plan.md）。

    清晰度说明：同网格 1:1（gcj 双向）时位移整数部分为精确窗口定位，
    只有小数部分（∈[0,1)）参与插值；BILINEAR 核半径仅 1，且权重
    (1-fx)(1-fy) 高度偏向最近像素——frac≈0 时退化为拷贝，frac≈0.5
    最坏情况也只是 2×2 加权，柔化远轻于跨网格降采样（如 bd 的 306→256）。

    Args:
        composite: 源网格合成图
        quad: (NW, SW, SE, NE) 合成图像素坐标（float，PIL QUAD 语义：
            输出 (0,0)/(0,256)/(256,256)/(256,0) 依次映射到这四点）
        resample: PIL 重采样核（gcj 传 BILINEAR，bd 传 BICUBIC）

    Returns:
        256×256 RGBA 输出瓦片；四边形退化/整体落在合成图外时返回透明瓦片
    """
    (nw_x, nw_y), (sw_x, sw_y), (se_x, se_y), (ne_x, ne_y) = quad
    for v in (nw_x, nw_y, sw_x, sw_y, se_x, se_y, ne_x, ne_y):
        if not math.isfinite(v):
            return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    if (
        math.hypot(se_x - sw_x, se_y - sw_y) < 0.5
        or math.hypot(ne_x - nw_x, ne_y - nw_y) < 0.5
        or math.hypot(sw_x - nw_x, sw_y - nw_y) < 0.5
        or math.hypot(se_x - ne_x, se_y - ne_y) < 0.5
    ):
        return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    xs = (nw_x, sw_x, se_x, ne_x)
    ys = (nw_y, sw_y, se_y, ne_y)
    if (
        max(xs) < 0.0
        or min(xs) > composite.width
        or max(ys) < 0.0
        or min(ys) > composite.height
    ):
        return Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    return composite.transform(
        (TILE_SIZE, TILE_SIZE),
        Image.QUAD,
        (nw_x, nw_y, sw_x, sw_y, se_x, se_y, ne_x, ne_y),
        resample=resample,
    )
