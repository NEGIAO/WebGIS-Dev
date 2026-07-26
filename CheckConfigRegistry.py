#!/usr/bin/env python3
"""
配置登记门禁扫描（三层配置架构·阶段 6）。

检查项（任一违规 exit 1，供 CR / 本地自检 / CI 使用）：
  [B1] 后端业务代码禁止裸读 os.getenv / os.environ（仅 backend/config 包内允许）
  [B2] 后端经 config helper（get_str/get_int/get_float/get_bool）读取的字面量 key
       必须已登记 backend/config/catalog.py（平台注入变量白名单除外）
  [B3] catalog 全部 key 必须出现在根 .env.example（登记门禁：先登记再写代码）
  [B4] 根 .env.example 的非 VITE_/L2_ key 必须存在于 catalog（防清单孤儿）
  [F1] 前端业务代码禁止散落 import.meta.env.VITE_*（仅 src/config/publicRuntime.ts 允许）
  [F2] 前端使用到的 VITE_* key 必须登记在根 .env.example
  [F3] 前端 src 禁止硬编码原作者后端域名

用法：
  python CheckConfigRegistry.py          # 全量检查
  python CheckConfigRegistry.py -q       # 只输出违规与结论
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND_SRC = ROOT / "frontend" / "src"
ENV_EXAMPLE = ROOT / ".env.example"

# 平台自动注入 / 诊断变量：允许经 config helper 读取但不强制登记 catalog
PLATFORM_KEY_ALLOWLIST = {
    "SPACE_ID",
    "HF_SPACE_ID",
    "SPACE_REPO_NAME",
    "SPACE_AUTHOR_NAME",
}

# 前端允许读取 import.meta.env 的文件（单点派生模块）
FRONTEND_ENV_ALLOWLIST = {"config/publicRuntime.ts"}

# 前端禁止出现的硬编码部署域名
FORBIDDEN_FRONTEND_DOMAIN = re.compile(r"negiao-webgis\.hf\.space")

CONFIG_HELPERS = {"get_str", "get_int", "get_float", "get_bool", "get_effective_str"}

BACKEND_EXCLUDE_DIRS = {"config", "__pycache__", ".venv", "venv", "data", "node_modules"}


def _iter_backend_py():
    """遍历 backend 业务 .py（排除 config 包与缓存目录）。"""
    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(BACKEND)
        if any(part in BACKEND_EXCLUDE_DIRS for part in rel.parts):
            continue
        yield path, rel


def _load_catalog_keys() -> set[str]:
    """导入 backend/config/catalog.py（纯标准库）获取登记 key 集合。"""
    sys.path.insert(0, str(BACKEND))
    try:
        from config.catalog import CONFIG_CATALOG  # type: ignore
    finally:
        sys.path.pop(0)
    return set(CONFIG_CATALOG.keys())


def _is_os_environ_node(node: ast.AST) -> bool:
    """匹配 os.getenv / os.environ 的 AST 引用。"""
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        if node.value.id == "os" and node.attr in {"getenv", "environ"}:
            return True
    return False


def scan_backend(catalog_keys: set[str]):
    """扫描后端：裸 os 读取（B1）与未登记 helper key（B2）。"""
    bare_env: list[str] = []
    unregistered: list[str] = []
    for path, rel in _iter_backend_py():
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as exc:  # 语法错误由编译门禁负责，此处提示即可
            bare_env.append(f"{rel}: 解析失败 {exc}")
            continue
        for node in ast.walk(tree):
            if _is_os_environ_node(node):
                bare_env.append(f"backend/{rel}:{node.lineno}: 裸 os.{node.attr} 读取")
            if isinstance(node, ast.Call):
                func = node.func
                name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
                if name in CONFIG_HELPERS and node.args:
                    first = node.args[0]
                    if isinstance(first, ast.Constant) and isinstance(first.value, str):
                        key = first.value
                        if (
                            key
                            and key.isupper()
                            and key not in catalog_keys
                            and key not in PLATFORM_KEY_ALLOWLIST
                        ):
                            unregistered.append(
                                f"backend/{rel}:{node.lineno}: {name}(\"{key}\") 未登记 catalog"
                            )
    return bare_env, unregistered


def scan_frontend():
    """扫描前端：散落 env 读取（F1）、使用到的 VITE_ key（F2 输入）、硬编码域名（F3）。"""
    scattered: list[str] = []
    domain_hits: list[str] = []
    used_vite: set[str] = set()
    pattern = re.compile(r"import\.meta\.env\.(VITE_[A-Z0-9_]+)")
    for path in FRONTEND_SRC.rglob("*"):
        if path.suffix not in {".js", ".ts", ".vue", ".jsx", ".tsx"}:
            continue
        rel = path.relative_to(FRONTEND_SRC).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in pattern.finditer(text):
            used_vite.add(match.group(1))
            if rel not in FRONTEND_ENV_ALLOWLIST:
                line_no = text.count("\n", 0, match.start()) + 1
                scattered.append(
                    f"frontend/src/{rel}:{line_no}: 散落读取 import.meta.env.{match.group(1)}"
                )
        for match in FORBIDDEN_FRONTEND_DOMAIN.finditer(text):
            line_no = text.count("\n", 0, match.start()) + 1
            domain_hits.append(f"frontend/src/{rel}:{line_no}: 硬编码部署域名")
    # vite.config.js 属构建配置，允许读 env，但其 VITE_ key 仍需登记
    vite_config = ROOT / "frontend" / "vite.config.js"
    if vite_config.exists():
        for match in re.finditer(r"(VITE_[A-Z0-9_]+)", vite_config.read_text(encoding="utf-8")):
            used_vite.add(match.group(1))
    return scattered, used_vite, domain_hits


def check_env_example(catalog_keys: set[str], used_vite: set[str]):
    """B3/B4/F2：catalog ↔ .env.example ↔ 前端 VITE 使用三方一致性。"""
    text = ENV_EXAMPLE.read_text(encoding="utf-8")

    def registered(key: str) -> bool:
        return re.search(rf"^\s*#?\s*{re.escape(key)}=", text, re.MULTILINE) is not None

    catalog_missing = sorted(k for k in catalog_keys if not registered(k))
    vite_missing = sorted(k for k in used_vite if not registered(k))

    example_keys = {
        m.group(1)
        for m in re.finditer(r"^\s*#?\s*([A-Z][A-Z0-9_]*)=", text, re.MULTILINE)
    }
    orphan = sorted(
        k
        for k in example_keys
        if not k.startswith(("VITE_", "L2_"))
        and k not in catalog_keys
        and k not in PLATFORM_KEY_ALLOWLIST
    )
    return catalog_missing, vite_missing, orphan


def main() -> int:
    quiet = "-q" in sys.argv
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass

    catalog_keys = _load_catalog_keys()
    bare_env, unregistered = scan_backend(catalog_keys)
    scattered, used_vite, domain_hits = scan_frontend()
    catalog_missing, vite_missing, orphan = check_env_example(catalog_keys, used_vite)

    sections = [
        ("[B1] 后端裸 os.getenv/os.environ", bare_env),
        ("[B2] 后端 helper key 未登记 catalog", unregistered),
        ("[B3] catalog key 未登记根 .env.example", catalog_missing),
        ("[B4] .env.example 孤儿 key（catalog 缺失）", orphan),
        ("[F1] 前端散落 import.meta.env", scattered),
        ("[F2] 前端 VITE_ key 未登记根 .env.example", vite_missing),
        ("[F3] 前端硬编码部署域名", domain_hits),
    ]

    violations = 0
    for title, items in sections:
        if items:
            violations += len(items)
            print(f"✘ {title} ({len(items)})")
            for item in items:
                print(f"    {item}")
        elif not quiet:
            print(f"✔ {title}: 通过")

    if not quiet:
        print(
            f"\n统计：catalog {len(catalog_keys)} key · 前端使用 VITE_ {len(used_vite)} 个"
        )
    if violations:
        print(f"\n结论：发现 {violations} 处违规（登记规则见根 .env.example 头部与 Docs/Guide/configuration.md）")
        return 1
    print("\n结论：配置登记门禁全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
