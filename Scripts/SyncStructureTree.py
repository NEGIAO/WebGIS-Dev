"""结构树批量同步：把文档里的 `.js` 条目改写为同名 `.ts`（JS→TS 迁移后的补登）。

背景：`CheckStructureTree.py` 按文件名比对，`a.js` → `a.ts` 的重命名会同时产生
一条「幽灵 .js」与一条「漏登记 .ts」。本脚本处理这一对：仅当磁盘上存在同名 `.ts`
且不存在同名 `.js` 时改写条目，其余条目一律不动。

用法：
    python Scripts/SyncStructureTree.py           # 预览（不写盘）
    python Scripts/SyncStructureTree.py --write   # 实际写入
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOC = ROOT / "Docs" / "Guide" / "frontend-structure.md"
SRC = ROOT / "frontend" / "src"

EXCLUDE_DIRS = {"node_modules", "dist", ".vite", "__pycache__"}
ENTRY = re.compile(r"([A-Za-z0-9_.@-]+)\.js\b")


def disk_names() -> set:
    names = set()
    for path in SRC.rglob("*"):
        if any(part in EXCLUDE_DIRS for part in path.parts):
            continue
        if path.is_file():
            names.add(path.name)
    return names


def main() -> int:
    write = "--write" in sys.argv
    names = disk_names()
    lines = DOC.read_text(encoding="utf-8").splitlines(keepends=True)
    changed = 0
    out = []
    for line in lines:
        if "── " not in line:
            out.append(line)
            continue

        def repl(match):
            stem = match.group(1)
            if (stem + ".ts") in names and (stem + ".js") not in names:
                return stem + ".ts"
            return match.group(0)

        new_line = ENTRY.sub(repl, line)
        if new_line != line:
            changed += 1
        out.append(new_line)

    print("待改写条目：%d" % changed)
    if write and changed:
        DOC.write_text("".join(out), encoding="utf-8")
        print("已写入 %s" % DOC)
    elif not write:
        print("（预览模式，加 --write 生效）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
