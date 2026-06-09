"""
时间工具模块

功能：
- 获取北京时间（Asia/Shanghai, UTC+8）
- 提供整点报时后台任务
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

# 北京时间时区（UTC+8）
BEIJING_TZ = timezone(timedelta(hours=8))


def get_beijing_now() -> datetime:
    """
    获取当前北京时间
    
    Returns:
        datetime: 北京时间的 datetime 对象（含时区信息）
    """
    return datetime.now(BEIJING_TZ)


def get_beijing_now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    获取当前北京时间的格式化字符串

    Args:
        fmt: 时间格式，默认 '%Y-%m-%d %H:%M:%S'

    Returns:
        str: 格式化后的北京时间字符串
    """
    return get_beijing_now().strftime(fmt)


async def hourly_chime_task():
    """
    整点报时后台任务（北京时间）

    精确计算到下一个整点的等待时间后输出报时日志。
    使用 asyncio.sleep 实现，不会阻塞主事件循环。
    内置异常保护：单次迭代异常不会终止整个任务。
    """
    logger.info("[整点报时] 后台任务已启动，等待北京时间整点报时...")
    while True:
        try:
            now = get_beijing_now()
            # 计算到下一个整点的等待秒数
            next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            wait_seconds = (next_hour - now).total_seconds()
            await asyncio.sleep(wait_seconds)
            # 整点到达，输出报时日志
            current = get_beijing_now()
            logger.info(
                "[整点报时] 北京时间 %s 现在是 %d 点整",
                current.strftime("%Y-%m-%d %H:%M:%S"),
                current.hour,
            )
        except asyncio.CancelledError:
            # 任务被取消，正常退出（shutdown 阶段）
            raise
        except Exception as e:
            # 意外异常：记录后继续运行，避免后台任务静默死亡
            logger.error("[整点报时] 异常: %s，60 秒后重试", str(e), exc_info=True)
            await asyncio.sleep(60)
