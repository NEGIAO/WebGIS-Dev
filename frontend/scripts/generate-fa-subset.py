#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate-fa-subset.py — Font Awesome 图标子集生成器（自托管，替代 BootCDN 全量 CSS+字体）

背景（V3.4.54 遗留项 3 的落地）：
  index.html 此前从 BootCDN 异步加载 FA 6.4.0 全量 all.min.css（~20KB gzip）+ 全量字体
  （fa-solid-900.woff2 ~150KB 等），而全库实际只用到 ~53 个图标；且 CDN 属外部单点，
  国外访问 BootCDN 偏慢、CDN 故障时图标整体消失。
  本脚本把「实际用到的图标」子集出两个小字体 + 一段极简 CSS，自托管进 public/fonts/，
  彻底去掉运行时 CDN 依赖。

用法：
  python generate-fa-subset.py <fontawesome-free包目录> <输出目录>
  例：python generate-fa-subset.py ./node_modules/@fortawesome/fontawesome-free ./public/fonts

  <fontawesome-free包目录> 需含 metadata/icons.json 与 webfonts/*.woff2，
  版本必须与 ICON 清单审计时一致（当前锚定 6.4.0，与原 BootCDN 链接同版）。

依赖：pip install fonttools brotli

维护须知：
  新增页面图标后需①把图标名加入下方清单②重跑本脚本③替换 index.html 内联 CSS。
  或者新图标直接改用项目已有的 lucide-vue-next（tree-shake，无需本流程）。
  审计命令（与清单比对）：
    grep -rhoE "fa-[a-z0-9-]+" src public/min-enhanced.js index.html | sort -u
"""

import json
import sys
from io import BytesIO
from pathlib import Path

try:
    from fontTools.subset import Options, Subsetter
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover
    sys.exit("缺少 fonttools：pip install fonttools brotli")

# ============ 图标清单（2026-07-27 全库审计：src + public/min-enhanced.js + index.html） ============

# solid（fas，font-weight 900）——51 个
SOLID_ICONS = [
    "spinner", "shield-alt", "check-circle", "paper-plane", "lock", "envelope",
    "arrow-left", "save", "eye-slash", "eye", "check", "user", "sliders-h",
    "sign-in-alt", "key", "bolt", "users", "user-shield", "user-plus",
    "user-clock", "unlock-alt", "times", "stopwatch", "sign-out-alt",
    "ruler-combined", "rotate", "robot", "person-hiking", "palette", "map",
    "language", "info-circle", "image", "id-card", "id-badge", "home", "globe",
    "gauge-high", "file-contract", "expand-alt", "exclamation-triangle",
    "exclamation-circle", "envelope-circle-check", "earth-asia", "database",
    "copy", "compress-alt", "comments", "chevron-up", "check-double",
    "chart-line",
]

# brands（fab，font-weight 400）——2 个
BRAND_ICONS = ["google", "github"]


def load_metadata(fa_dir: Path) -> dict:
    """读取 FA 官方 metadata/icons.json（含 canonical 名、unicode、aliases）。"""
    meta_path = fa_dir / "metadata" / "icons.json"
    if not meta_path.is_file():
        sys.exit(f"未找到 {meta_path}（请指向 @fortawesome/fontawesome-free 包目录）")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def resolve_icon(meta: dict, name: str, style: str):
    """
    解析图标名 → (unicode码点hex, canonical名)。
    支持 FA5 别名（如 shield-alt → shield-halved：icons.json 的 aliases.names）。
    解析失败立即报错退出（禁止静默缺字）。
    """
    for canonical, item in meta.items():
        if canonical == name or name in (item.get("aliases", {}).get("names") or []):
            if style not in item.get("styles", []):
                sys.exit(f"图标 {name}（canonical={canonical}）不属于 {style} 风格：{item.get('styles')}")
            return item["unicode"], canonical
    sys.exit(f"图标名 {name} 在 icons.json 中无法解析（canonical 与别名均未命中）")


def subset_font(src_woff2: Path, unicodes: list, out_path: Path) -> int:
    """用 fontTools 将 woff2 子集到指定码点集合，返回输出字节数。"""
    options = Options()
    options.flavor = "woff2"
    # 图标字体无需保留 hinting/OT 特性，最小化输出
    options.hinting = False
    options.desubroutinize = True
    options.drop_tables += ["GSUB", "GPOS"]  # 纯图标展示用不到排版特性（连字由 CSS content 直接给码点，不依赖 liga）
    font = TTFont(str(src_woff2))
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=[int(u, 16) for u in unicodes])
    subsetter.subset(font)
    buf = BytesIO()
    font.save(buf)
    data = buf.getvalue()
    out_path.write_bytes(data)
    return len(data)


def build_css(solid_map: dict, brand_map: dict) -> str:
    """生成极简 CSS：两段 @font-face + 基础类 + fa-spin + 逐图标 ::before 规则。"""
    lines = [
        "/* Font Awesome 6.4.0 自托管子集 — 由 frontend/scripts/generate-fa-subset.py 生成，勿手改。",
        "   覆盖类名与原 BootCDN 全量 CSS 兼容（fas/fab + fa-xxx），新增图标见脚本头「维护须知」。 */",
        '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;'
        "src:url(fonts/fa-solid-900-subset.woff2) format(\"woff2\")}",
        '@font-face{font-family:"Font Awesome 6 Brands";font-style:normal;font-weight:400;font-display:block;'
        "src:url(fonts/fa-brands-400-subset.woff2) format(\"woff2\")}",
        ".fa,.fas,.fab,.fa-solid,.fa-brands{display:inline-block;font-style:normal;font-variant:normal;"
        "line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased}",
        '.fa,.fas,.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900}',
        '.fab,.fa-brands{font-family:"Font Awesome 6 Brands";font-weight:400}',
        ".fa-spin{animation:fa-spin 2s infinite linear}",
        "@keyframes fa-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
    ]
    for name, code in sorted(solid_map.items()):
        lines.append(f'.fa-{name}::before{{content:"\\{code}"}}')
    for name, code in sorted(brand_map.items()):
        lines.append(f'.fa-{name}::before{{content:"\\{code}"}}')
    return "\n".join(lines) + "\n"


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    fa_dir = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    meta = load_metadata(fa_dir)

    solid_map, brand_map = {}, {}
    for name in SOLID_ICONS:
        code, canonical = resolve_icon(meta, name, "solid")
        solid_map[name] = code
        # 别名与 canonical 同码点：canonical 类名一并输出，双写法均可用
        solid_map.setdefault(canonical, code)
    for name in BRAND_ICONS:
        code, canonical = resolve_icon(meta, name, "brands")
        brand_map[name] = code
        brand_map.setdefault(canonical, code)

    solid_size = subset_font(
        fa_dir / "webfonts" / "fa-solid-900.woff2",
        sorted(set(solid_map.values())),
        out_dir / "fa-solid-900-subset.woff2",
    )
    brand_size = subset_font(
        fa_dir / "webfonts" / "fa-brands-400.woff2",
        sorted(set(brand_map.values())),
        out_dir / "fa-brands-400-subset.woff2",
    )

    css = build_css(solid_map, brand_map)
    (out_dir / "fa-subset.css").write_text(css, encoding="utf-8")

    print(f"solid 子集: {len(set(solid_map.values()))} 码点 → {solid_size/1024:.1f} KB")
    print(f"brands 子集: {len(set(brand_map.values()))} 码点 → {brand_size/1024:.1f} KB")
    print(f"CSS: {len(css)} 字节 → {out_dir/'fa-subset.css'}")


if __name__ == "__main__":
    main()
