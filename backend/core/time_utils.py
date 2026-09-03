"""
时间工具模块

功能：
- 获取本地时间（Docker 容器时区，设置为 Asia/Shanghai）
- 提供整点报时后台任务
"""

import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def get_local_now() -> datetime:
    """
    获取当前本地时间（Docker 容器时区）。

    Returns:
        datetime: 含时区信息的本地 datetime 对象
    """
    return datetime.now().astimezone()


def get_local_now_str(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """
    获取当前本地时间的格式化字符串。

    Args:
        fmt: 时间格式，默认 '%Y-%m-%d %H:%M:%S'

    Returns:
        str: 格式化后的本地时间字符串
    """
    return get_local_now().strftime(fmt)


async def hourly_chime_task(startup_time: datetime | None = None):
    """
    整点报时后台任务（本地时间）。

    精确计算到下一个整点的等待时间后输出报时日志。
    使用 asyncio.sleep 实现，不会阻塞主事件循环。
    内置异常保护：单次迭代异常不会终止整个任务。

    Args:
        startup_time: 后端启动时间（本地 datetime），用于在报时日志中显示已运行时长。
    """
    logger.info("[整点报时] 后台任务已启动，等待整点报时...")
    while True:
        try:
            now = get_local_now()
            # 计算到下一个整点的等待秒数
            next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
            wait_seconds = (next_hour - now).total_seconds()
            await asyncio.sleep(wait_seconds)
            # 整点到达，输出报时日志
            current = get_local_now()
            extra = ""
            if startup_time is not None:
                elapsed = current - startup_time
                if elapsed.total_seconds() < 0:
                    # 时钟回拨保护（如 NTP 调整）
                    extra = f" | 启动于 {startup_time.strftime('%Y-%m-%d %H:%M:%S')} | 已运行 未知（时钟回拨）"
                else:
                    days = elapsed.days
                    hours, remainder = divmod(elapsed.seconds, 3600)
                    minutes, secs = divmod(remainder, 60)
                    parts = []
                    if days > 0:
                        parts.append(f"{days}天")
                    if hours > 0:
                        parts.append(f"{hours}小时")
                    parts.append(f"{minutes}分{secs}秒")
                    uptime_str = "".join(parts)
                    extra = (
                        f" | 启动于 {startup_time.strftime('%Y-%m-%d %H:%M:%S')}"
                        f" | 已运行 {uptime_str}"
                    )
            logger.info(
                "[整点报时] %s 现在是 %d 点整%s",
                current.strftime("%Y-%m-%d %H:%M:%S"),
                current.hour,
                extra,
            )
        except asyncio.CancelledError:
            # 任务被取消，正常退出（shutdown 阶段）
            raise
        except Exception as e:
            # 意外异常：记录后继续运行，避免后台任务静默死亡
            logger.error("[整点报时] 异常: %s，60 秒后重试", str(e), exc_info=True)
            await asyncio.sleep(60)
