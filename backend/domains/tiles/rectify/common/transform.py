# -*- coding: utf-8 -*-
"""
GCJ-02 坐标转换模块

基于国测局偏移算法实现 WGS84/GCJ-02/BD-09 坐标系之间的转换。

原始算法来源：QGIS OffsetWGS84Core 插件 (C) 2017 sshuair
许可证：GNU General Public License v2+

坐标系说明：
- WGS84: GPS 全球定位系统使用的坐标系
- GCJ-02: 中国国家测绘局制定的坐标系，对 WGS84 进行加偏处理
- BD-09: 百度坐标系，在 GCJ-02 基础上再次加偏

注意：GCJ-02 偏移仅适用于中国境内坐标
"""

import logging
from math import atan2, cos, fabs, pi as PI, sin, sqrt

logger = logging.getLogger(__name__)

# ============================================================
# WGS84 椭球参数 (World Geodetic System 1984)
# ============================================================
WGS84_SEMI_MAJOR_AXIS = 6378245.0        # 长半轴 (米)
WGS84_FLATTENING = 1 / 298.3             # 扁率
WGS84_SEMI_MINOR_AXIS = WGS84_SEMI_MAJOR_AXIS * (1 - WGS84_FLATTENING)  # 短半轴
WGS84_ECCENTRICITY_SQ = 1 - (WGS84_SEMI_MINOR_AXIS ** 2) / (WGS84_SEMI_MAJOR_AXIS ** 2)  # 偏心率平方

# 中国境内坐标范围（经度/纬度）
CHINA_LNG_MIN = 72.004
CHINA_LNG_MAX = 137.8347
CHINA_LAT_MIN = 0.8293
CHINA_LAT_MAX = 55.8271

# 迭代收敛参数
GCJ2WGS_MAX_ITERATIONS = 20
GCJ2WGS_TOLERANCE = 1e-6  # 约 0.1 米精度


def out_of_china(lng: float, lat: float) -> bool:
    """检查坐标是否在中国境外。

    GCJ-02 偏移算法仅适用于中国境内，境外坐标应直接返回原值。

    Args:
        lng: 经度
        lat: 纬度

    Returns:
        True 如果坐标在中国境外
    """
    return not (CHINA_LNG_MIN <= lng <= CHINA_LNG_MAX and CHINA_LAT_MIN <= lat <= CHINA_LAT_MAX)


def _transform_lat(x: float, y: float) -> float:
    """计算纬度偏移量（内部函数）

    Args:
        x: 经度偏移量（相对 105°）
        y: 纬度偏移量（相对 35°）

    Returns:
        纬度偏移量
    """
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(fabs(x))
    ret += (20.0 * sin(6.0 * x * PI) + 20.0 * sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * sin(y * PI) + 40.0 * sin(y / 3.0 * PI)) * 2.0 / 3.0
    ret += (160.0 * sin(y / 12.0 * PI) + 320.0 * sin(y * PI / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lon(x: float, y: float) -> float:
    """计算经度偏移量（内部函数）

    Args:
        x: 经度偏移量（相对 105°）
        y: 纬度偏移量（相对 35°）

    Returns:
        经度偏移量
    """
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(fabs(x))
    ret += (20.0 * sin(6.0 * x * PI) + 20.0 * sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * sin(x * PI) + 40.0 * sin(x / 3.0 * PI)) * 2.0 / 3.0
    ret += (150.0 * sin(x / 12.0 * PI) + 300.0 * sin(x * PI / 30.0)) * 2.0 / 3.0
    return ret


def wgs2gcj(wgs_lon: float, wgs_lat: float) -> tuple[float, float]:
    """WGS84 坐标转换为 GCJ-02 坐标（正向加偏）

    使用国测局标准算法对 WGS84 坐标进行加偏处理。
    中国境外坐标直接返回原值。

    Args:
        wgs_lon: WGS84 经度
        wgs_lat: WGS84 纬度

    Returns:
        (gcj_lon, gcj_lat) GCJ-02 坐标
    """
    if out_of_china(wgs_lon, wgs_lat):
        return wgs_lon, wgs_lat

    d_lat = _transform_lat(wgs_lon - 105.0, wgs_lat - 35.0)
    d_lon = _transform_lon(wgs_lon - 105.0, wgs_lat - 35.0)

    rad_lat = wgs_lat / 180.0 * PI
    sin_lat = sin(rad_lat)
    magic = 1 - WGS84_ECCENTRICITY_SQ * sin_lat * sin_lat
    sqrt_magic = sqrt(magic)

    d_lat = (d_lat * 180.0) / ((WGS84_SEMI_MAJOR_AXIS * (1 - WGS84_ECCENTRICITY_SQ)) / (magic * sqrt_magic) * PI)
    d_lon = (d_lon * 180.0) / (WGS84_SEMI_MAJOR_AXIS / sqrt_magic * cos(rad_lat) * PI)

    return (wgs_lon + d_lon, wgs_lat + d_lat)


def gcj2wgs(gcj_lon: float, gcj_lat: float) -> tuple[float, float]:
    """GCJ-02 坐标转换为 WGS84 坐标（逆向求解）

    使用牛顿迭代法求解逆向变换。
    最多迭代 20 次，精度达到 1e-6 度（约 0.1 米）时停止。

    Args:
        gcj_lon: GCJ-02 经度
        gcj_lat: GCJ-02 纬度

    Returns:
        (wgs_lon, wgs_lat) WGS84 坐标
    """
    g0 = (gcj_lon, gcj_lat)
    w0 = g0
    w1 = g0  # 初始化，确保即使循环不执行也有返回值

    for iteration in range(GCJ2WGS_MAX_ITERATIONS):
        g1 = wgs2gcj(w0[0], w0[1])
        w1 = (w0[0] - (g1[0] - g0[0]), w0[1] - (g1[1] - g0[1]))

        # 检查收敛
        delta_lon = abs(w1[0] - w0[0])
        delta_lat = abs(w1[1] - w0[1])
        if delta_lon < GCJ2WGS_TOLERANCE and delta_lat < GCJ2WGS_TOLERANCE:
            return w1

        w0 = w1

    # 迭代未收敛，记录警告
    logger.warning(
        "gcj2wgs iteration did not converge after %d iterations for (%.6f, %.6f), "
        "delta=(%.9f, %.9f)",
        GCJ2WGS_MAX_ITERATIONS, gcj_lon, gcj_lat, delta_lon, delta_lat
    )
    return w1


def gcj2bd(gcj_lon: float, gcj_lat: float) -> tuple[float, float]:
    """GCJ-02 坐标转换为 BD-09 坐标（百度坐标系）

    Args:
        gcj_lon: GCJ-02 经度
        gcj_lat: GCJ-02 纬度

    Returns:
        (bd_lon, bd_lat) BD-09 坐标
    """
    z = sqrt(gcj_lon * gcj_lon + gcj_lat * gcj_lat) + 0.00002 * sin(gcj_lat * PI * 3000.0 / 180.0)
    theta = atan2(gcj_lat, gcj_lon) + 0.000003 * cos(gcj_lon * PI * 3000.0 / 180.0)
    return (z * cos(theta) + 0.0065, z * sin(theta) + 0.006)


def bd2gcj(bd_lon: float, bd_lat: float) -> tuple[float, float]:
    """BD-09 坐标转换为 GCJ-02 坐标

    Args:
        bd_lon: BD-09 经度
        bd_lat: BD-09 纬度

    Returns:
        (gcj_lon, gcj_lat) GCJ-02 坐标
    """
    x = bd_lon - 0.0065
    y = bd_lat - 0.006
    z = sqrt(x * x + y * y) - 0.00002 * sin(y * PI * 3000.0 / 180.0)
    theta = atan2(y, x) - 0.000003 * cos(x * PI * 3000.0 / 180.0)
    return (z * cos(theta), z * sin(theta))


def wgs2bd(wgs_lon: float, wgs_lat: float) -> tuple[float, float]:
    """WGS84 坐标转换为 BD-09 坐标

    通过 GCJ-02 中转：WGS84 -> GCJ-02 -> BD-09

    Args:
        wgs_lon: WGS84 经度
        wgs_lat: WGS84 纬度

    Returns:
        (bd_lon, bd_lat) BD-09 坐标
    """
    gcj = wgs2gcj(wgs_lon, wgs_lat)
    return gcj2bd(gcj[0], gcj[1])


def bd2wgs(bd_lon: float, bd_lat: float) -> tuple[float, float]:
    """BD-09 坐标转换为 WGS84 坐标

    通过 GCJ-02 中转：BD-09 -> GCJ-02 -> WGS84

    Args:
        bd_lon: BD-09 经度
        bd_lat: BD-09 纬度

    Returns:
        (wgs_lon, wgs_lat) WGS84 坐标
    """
    gcj = bd2gcj(bd_lon, bd_lat)
    return gcj2wgs(gcj[0], gcj[1])
