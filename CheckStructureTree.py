#!/usr/bin/env python3
"""
结构树漂移门禁：校验 Docs/Guide/frontend-structure.md 与 frontend/src 实际文件的一致性。

原理（按文件名比对，简单可靠）：
- 从结构树文档提取所有带扩展名的文件名；
- 扫描 frontend/src 下实际文件名（排除 node_modules 等）；
- 双向 diff：磁盘存在但文档未登记 → 「漏登记」；文档登记但磁盘不存在 → 「幽灵条目」。

用法：
    python CheckStructureTree.py            # 报告漂移，存在漂移时退出码 1
    python CheckStructureTree.py --quiet    # 只输出统计行

局限：按文件名（非全路径）比对，同名文件视为一个条目；作为漂移报警足够，
不替代人工核对目录归属。配套规范见 Docs/Force_command.md 第 5 条。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOC = ROOT / "Docs" / "Guide" / "frontend-structure.md"
SRC = ROOT / "frontend" / "src"

# 树文档与磁盘扫描共同关注的扩展名
EXTS = {
    ".vue", ".js", ".mjs", ".ts", ".tsx", ".css", ".json",
    ".frag", ".vert", ".glsl", ".svg", ".md", ".worker.js",
}
# 磁盘扫描排除目录
EXCLUDE_DIRS = {"node_modules", "dist", ".vite", "__pycache__"}

FILENAME_PATTERN = re.compile(r"([A-Za-z0-9_.@-]+\.(?:vue|mjs|ts|tsx|js|css|json|frag|vert|glsl|svg|md))\b")


# 刻意目录级概括的资产/数据目录：文档只登记目录条目，不逐文件展开
SUMMARIZED_DIR_SUFFIXES = (
    "feng-shui-compass-svg/Explanation",
    "feng-shui-compass-svg/themes",
    "feng-shui-compass-svg/types",
    "ShallowWater/shaders",
)


def collect_doc_filenames() -> set[str]:
    # 只扫描树条目行（含 "── "），避免散文/链接中的 Three.js、md 交叉引用误报
    names: set[str] = set()
    for line in DOC.read_text(encoding="utf-8").splitlines():
        if "── " in line:
            # 只取条目本体（# 注释段里的 Three.js 等库名不算文件条目）
            entry_part = line.split("#", 1)[0]
            names.update(FILENAME_PATTERN.findall(entry_part))
    return names


def collect_disk_filenames() -> set[str]:
    names: set[str] = set()
    for path in SRC.rglob("*"):
        if path.is_dir():
            continue
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        parent_posix = path.parent.as_posix()
        if any(parent_posix.endswith(suffix) for suffix in SUMMARIZED_DIR_SUFFIXES):
            continue
        if path.suffix.lower() in EXTS or path.name.endswith(".worker.js"):
            names.add(path.name)
    return names


def main() -> int:
    quiet = "--quiet" in sys.argv
    if not DOC.exists() or not SRC.exists():
        print(f"[结构树门禁] 路径缺失：{DOC if not DOC.exists() else SRC}")
        return 2

    doc_names = collect_doc_filenames()
    disk_names = collect_disk_filenames()

    missing_in_doc = sorted(disk_names - doc_names)   # 磁盘有、文档漏登记
    ghost_in_doc = sorted(
        name for name in (doc_names - disk_names)
        # 文档中示例/说明里的文件名（如 README 提到的规范文件）允许少量豁免
        if not name.startswith("frontend-structure")
    )

    print(
        f"[结构树门禁] 文档条目 {len(doc_names)} · 磁盘文件 {len(disk_names)} · "
        f"漏登记 {len(missing_in_doc)} · 幽灵条目 {len(ghost_in_doc)}"
    )
    if not quiet:
        if missing_in_doc:
            print("\n── 磁盘存在但文档未登记（请补录 frontend-structure.md）──")
            for name in missing_in_doc:
                print(f"  + {name}")
        if ghost_in_doc:
            print("\n── 文档登记但磁盘不存在（请从树中移除或核对改名）──")
            for name in ghost_in_doc:
                print(f"  - {name}")

    return 1 if (missing_in_doc or ghost_in_doc) else 0


if __name__ == "__main__":
    sys.exit(main())
