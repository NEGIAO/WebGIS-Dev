"""网络出站护栏共用工具（SSRF 判定单点）。

背景：后端有三处「按调用方给的 URL 代为访问」的出站面——agent `override_base_url`（V3.4.63 已加固）、
`/proxy/**` 瓦片与通用代理、`download_xyz` 瓦片模板。此前 agent 侧自带一套 IP 字面量归一判定，
proxy 侧另有一套只认点分十进制的弱判定（`2130706433` 等写法可绕过）。本模块把判定收敛为单点，
供三处共用，避免"两处各写一套"（P1-4 SSRF 方案 S1；方案文档 Docs/TODO/proxy-ssrf-hardening-plan.md）。

导出：
- coerce_ip_literal(host)         非点分十进制 IP 字面量归一（inet_aton 语义）
- is_private_ip(ip)               IP 是否属于不可代为访问的段
- is_disallowed_host(host)        host 字面量判定（本机名/内网后缀/IP 字面量），**不做 DNS**
- is_loopback_host(host)          是否指向本机回环
- resolve_host_has_private_ip(h)  DNS 解析后复判（堵域名指向内网；解析失败视为不安全）
- host_matches_allowlist(h, list) 白名单匹配（精确 + `*.suffix` 通配 + 裸后缀）
- parse_host_allowlist(raw)       逗号分隔白名单串解析
"""

import ipaddress
import socket
from typing import Any, Iterable, List, Optional, Sequence, Tuple

# 本机/内网保留名（字面量层面直接拒绝，无需解析）
LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"}
LOCAL_HOST_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")

# DNS 解析结果缓存：{host: (到期时间戳, 是否含私网 IP)}；解析有网络开销，瓦片请求高频故加短缓存
_DNS_GUARD_TTL_SECONDS = 60.0
_dns_guard_cache: dict = {}


def normalize_host(hostname: str) -> str:
    """host 归一：去空白、去 IPv6 的 [] 包裹、转小写、去尾点（DNS 根点）。"""
    return str(hostname or "").strip().strip("[]").lower().rstrip(".")


def coerce_ip_literal(hostname: str) -> Optional[Any]:
    """把各种「非点分十进制」IP 字面量归一为 ipaddress 对象。

    参数：hostname —— URL 中的 host 部分（已去 [] 包裹的 IPv6 亦可）。
    返回：IPv4Address/IPv6Address；host 不是 IP 字面量（普通域名）时返回 None。
    核心逻辑：标准解析失败后，按 C 库 inet_aton 语义补齐 1~3 段写法与整数/十六进制/八进制形式——
    `2130706433`、`0x7f000001`、`127.1`、`0177.0.0.1` 全部等价于 127.0.0.1，
    只按点分十进制过滤会被这些写法绕过。

    （实现自 api/agent_chat/utils.py 迁入，逐行等价——V3.4.63 的 23 例单测语义不变。）
    """
    host = str(hostname or "").strip().strip("[]")
    if not host:
        return None

    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass

    parts = host.split(".")
    if len(parts) > 4 or not all(parts):
        return None

    values: List[int] = []
    for piece in parts:
        text = piece.lower()
        try:
            if text.startswith("0x"):
                values.append(int(text, 16))
            elif text.startswith("0") and len(text) > 1:
                values.append(int(text, 8))
            else:
                values.append(int(text, 10))
        except ValueError:
            return None  # 含非数字字符 → 普通域名

    # inet_aton：最后一段填满剩余字节（如 127.1 → 127.0.0.1；2130706433 → 单段 32 位）
    packed = 0
    head, tail = values[:-1], values[-1]
    if any(item < 0 or item > 0xFF for item in head):
        return None
    remaining_bits = 32 - 8 * len(head)
    if remaining_bits <= 0 or tail < 0 or tail >= (1 << remaining_bits):
        return None
    for index, item in enumerate(head):
        packed |= item << (32 - 8 * (index + 1))
    packed |= tail

    try:
        return ipaddress.ip_address(packed)
    except ValueError:
        return None


def is_private_ip(ip: Any) -> bool:
    """IP 是否属于「后端不得代为访问」的段（私网/回环/链路本地/保留/组播/未指定）。"""
    if ip is None:
        return False
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def is_disallowed_host(hostname: str) -> bool:
    """host **字面量**是否属于内网/本机目标（不做 DNS 解析）。

    参数：hostname —— URL host。返回：True=拒绝（空 host 亦拒绝，fail-closed）。
    核心逻辑：先按本机名/内网后缀字面量拒绝，再把 IP 字面量归一后按私网属性拒绝；
    普通域名返回 False，由 `resolve_host_has_private_ip` 决定是否进一步解析复判。
    """
    host = normalize_host(hostname)
    if not host:
        return True
    if host in LOCAL_HOSTNAMES or host.endswith(LOCAL_HOST_SUFFIXES):
        return True
    return is_private_ip(coerce_ip_literal(host))


def is_loopback_host(hostname: str) -> bool:
    """host 是否指向本机回环（供「允许 http 明文仅限本机」类放行判定）。"""
    host = normalize_host(hostname)
    if host in LOCAL_HOSTNAMES:
        return True
    ip = coerce_ip_literal(host)
    return bool(ip is not None and ip.is_loopback)


def resolve_host_has_private_ip(hostname: str, *, timeout: float = 1.0) -> Tuple[bool, str]:
    """DNS 解析 host 后判断是否落在私网段（堵「域名 A 记录指向内网」的绕过）。

    参数：hostname —— URL host；timeout —— 解析超时秒数。
    返回：(是否不安全, 原因串)；解析失败按 **fail-closed** 视为不安全。
    核心逻辑：`getaddrinfo` 取全部 A/AAAA，任一落私网即拒（DNS rebinding 场景无法完全消除，
    但代理请求紧随判定发出，窗口极小）；结果按 60s TTL 缓存，避免高频瓦片请求逐次解析。
    """
    host = normalize_host(hostname)
    if not host:
        return True, "空主机名"

    # IP 字面量无需解析，交由 is_disallowed_host 判定（此处直接复用其结论）
    literal = coerce_ip_literal(host)
    if literal is not None:
        return is_private_ip(literal), "IP 字面量"

    import time

    now = time.time()
    cached = _dns_guard_cache.get(host)
    if cached and cached[0] > now:
        return cached[1], "缓存结果"

    previous_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(timeout)
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except Exception as exc:  # DNS 失败/超时：fail-closed（不缓存，下次重试）
        return True, f"解析失败：{exc!r}"
    finally:
        socket.setdefaulttimeout(previous_timeout)

    unsafe = False
    for info in infos:
        address = info[4][0] if isinstance(info[4], tuple) and info[4] else ""
        try:
            ip = ipaddress.ip_address(str(address).split("%")[0])
        except ValueError:
            continue
        if is_private_ip(ip):
            unsafe = True
            break

    _dns_guard_cache[host] = (now + _DNS_GUARD_TTL_SECONDS, unsafe)
    # 缓存无界增长防御：条目极多时整表清空（host 基数正常在几十以内）
    if len(_dns_guard_cache) > 2048:
        _dns_guard_cache.clear()
    return unsafe, "解析后判定"


def parse_host_allowlist(raw: Any) -> List[str]:
    """解析逗号分隔的 host 白名单串 → 归一小写列表（空串/None → 空列表=不启用）。"""
    if not raw:
        return []
    if isinstance(raw, (list, tuple, set)):
        items: Iterable[Any] = raw
    else:
        items = str(raw).split(",")
    result: List[str] = []
    for item in items:
        text = normalize_host(item).lstrip("*").lstrip(".")
        if text:
            result.append(text)
    return result


def host_matches_allowlist(hostname: str, allowlist: Sequence[str]) -> bool:
    """host 是否命中白名单（精确匹配或作为其子域）。

    安全规则：白名单为空时恒 False（=拒绝所有），必须显式配置白名单才启用代理。
    """
    if not allowlist:
        return False
    host = normalize_host(hostname)
    if not host:
        return False
    return any(host == item or host.endswith(f".{item}") for item in allowlist)
