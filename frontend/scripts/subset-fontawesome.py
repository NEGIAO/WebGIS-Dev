# -*- coding: utf-8 -*-
"""Font Awesome 图标字体子集化（WebGIS 前端）

背景
----
官方 FA 6.4.0 三份字体共 283KB，本项目实际只使用 50 个图标。
本脚本从源码扫描用到的 fa-* 图标 → 从官方 CSS 取 unicode 映射 →
按使用族（solid / regular / brands）分别子集化 → 输出（默认）
frontend/src/assets/fontawesome-subset.css（仅用到的图标 class 规则，约 3.6KB——
   官方 all.min.css 全量约 102KB，其中 98.9KB 用不到，Lighthouse 计入 unused CSS）。

字体文件不走自托管
------------------
2026-11 实测结论：字体自托管在 GitHub Pages 上，国内访问明显慢于 BootCDN 国内节点，
故字体保留 CDN（见 index.html 的 preload 与 @font-face），产品中不使用子集 woff2。
仍保留 `--fonts` 参数可生成子集（frontend/public/fonts/fa/，约 6.6KB）用于离线/内网
或其它部署环境，默认不生成。

index.html 中的 @font-face 指向 BootCDN 官方 woff2（仅覆盖 font-display: block → swap），
不指向本脚本可能生成的子集文件。本脚本默认产物只有 CSS 规则表。

依赖
----
    pip install fonttools brotli

用法
----
    cd frontend
    python scripts/subset-fontawesome.py          # 生成/更新图标 CSS（默认，字体走 CDN）
    python scripts/subset-fontawesome.py --fonts   # 额外生成子集字体 woff2（非默认部署方式）
    python scripts/subset-fontawesome.py --check   # 只校验产物存在且非空

维护约定
--------
* 新增 fa-* 图标后必须重跑本脚本，否则新图标无字形（页面显示豆腐块）。
* 升级 FA 版本：改 FA_VERSION，并同步 index.html 里 all.min.css 的版本号路径。
* 字体源 ttf 从 jsDelivr 拉取（woff2 版 regular 在 fontTools 下 glyf 解析异常，
  故统一用 ttf 源再编码为 woff2，结构更规范）。
"""
from __future__ import annotations

import io
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # frontend/
FA_VERSION = '6.4.0'
CSS_URL = f'https://cdn.bootcdn.net/ajax/libs/font-awesome/{FA_VERSION}/css/all.min.css'
TTF_BASE = f'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@{FA_VERSION}/webfonts'
OUT_DIR = os.path.join(ROOT, 'public', 'fonts', 'fa')
CACHE_DIR = os.path.join(ROOT, '.fa-cache')

FAMILY_FILES = {'solid': 'fa-solid-900', 'regular': 'fa-regular-400', 'brands': 'fa-brands-400'}
MODIFIERS = {
    'spin', 'pulse', 'spin-pulse', 'fw', 'ul', 'li', 'border', 'pull-left', 'pull-right',
    'xs', 'sm', 'lg', 'xl', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x',
    'solid', 'regular', 'brands', 'light', 'thin', 'duotone', 'sharp', 'stack',
    'stack-1x', 'stack-2x', 'inverse', 'rotate-90', 'rotate-180', 'rotate-270',
    'flip-horizontal', 'flip-vertical', 'beat', 'bounce', 'fade', 'shake', 'flip',
    'fixed-width', 'list',
}
FAM_RE = re.compile(r'\b(fas|far|fab|fa-solid|fa-regular|fa-brands)\b[^"\'>]{0,40}?\bfa-([a-z0-9-]+)\b')
ALIAS = {'fas': 'solid', 'far': 'regular', 'fab': 'brands',
         'fa-solid': 'solid', 'fa-regular': 'regular', 'fa-brands': 'brands'}


def fetch(url: str, dst: str) -> str:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst) or os.path.getsize(dst) == 0:
        with urllib.request.urlopen(url, timeout=60) as r, open(dst, 'wb') as f:
            f.write(r.read())
    return dst


def scan_usage() -> dict[str, set[str]]:
    fam_icons = {'solid': set(), 'regular': set(), 'brands': set()}
    used_all: set[str] = set()
    src = os.path.join(ROOT, 'src')
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in ('node_modules', 'vendors')]
        for fn in files:
            if not fn.endswith(('.vue', '.ts', '.js', '.html', '.css')):
                continue
            s = io.open(os.path.join(root, fn), encoding='utf-8', errors='ignore').read()
            for m in FAM_RE.finditer(s):
                icon = m.group(2)
                if icon not in MODIFIERS:
                    fam_icons[ALIAS[m.group(1)]].add(icon)
            for m in re.finditer(r'fa-([a-z0-9-]+)', s):
                if m.group(1) not in MODIFIERS:
                    used_all.add(m.group(1))
    # 未带族前缀的图标：三族兜底（子集化时按各字体 cmap 自动过滤掉不存在的码点）
    orphan = used_all - set().union(*fam_icons.values())
    for fam in fam_icons:
        fam_icons[fam] |= orphan
    return fam_icons


def unicode_map(css_path: str) -> dict[str, str]:
    css = io.open(css_path, encoding='utf-8', errors='replace').read()
    out: dict[str, str] = {}
    for block in re.finditer(r'([^{}]+)\{content:"\\([0-9a-f]{2,5})"\}', css):
        for sel in block.group(1).split(','):
            m = re.search(r'\.fa-([a-z0-9-]+):before', sel)
            if m:
                out.setdefault(m.group(1), block.group(2))
    return out


CSS_TEMPLATE = """/* Font Awesome 子集样式（由 scripts/subset-fontawesome.py 生成，勿手改）
 *
 * 来源：Font Awesome __VER__ all.min.css（MIT 代码 / SIL OFL 1.1 字体 / CC BY 4.0 图标）
 * 生成内容：仅本项目实际使用的 __N__ 个图标 + 基础布局 + fa-spin 动画。
 * 官方全量 CSS 约 100KB，其中约 99KB 为未使用规则（Lighthouse unused CSS 审计）。
 * 维护：新增 fa-* 图标后重跑 `npm run fonts:subset`，字体与规则会同步再生。
 */

/* ---------- 基础布局（等价官方 .fa,.fa-brands,.fa-solid,… 选择器组） ---------- */
.fa, .fas, .far, .fab, .fa-solid, .fa-regular, .fa-brands {
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    display: var(--fa-display, inline-block);
    font-style: normal;
    font-variant: normal;
    line-height: 1;
    text-rendering: auto;
}

/* ---------- 字体族 / 字重（与 index.html 内联 @font-face 的子集文件对应） ---------- */
.fa, .fas, .fa-solid { font-family: "Font Awesome 6 Free"; font-weight: 900; }
.far, .fa-regular { font-family: "Font Awesome 6 Free"; font-weight: 400; }
.fab, .fa-brands { font-family: "Font Awesome 6 Brands"; font-weight: 400; }

/* ---------- 旋转动画（实际使用的唯一修饰类 fa-spin；其余修饰类未使用） ---------- */
.fa-spin { animation: fa-spin 2s linear infinite; }
@keyframes fa-spin {
    0% { transform: rotate(0deg); }
    to { transform: rotate(1turn); }
}

/* ---------- 图标内容码点 ---------- */
"""


def write_css(cmap_map: dict[str, str], fam_icons: dict[str, set[str]], out_path: str) -> int:
    """按使用清单生成最小图标 CSS；返回写入的图标规则数。"""
    icons = set()
    for s in fam_icons.values():
        icons |= s
    header = CSS_TEMPLATE.replace('__VER__', FA_VERSION).replace('__N__', str(len(icons)))
    lines = [header]
    count = 0
    for name in sorted(icons):
        code = cmap_map.get(name)
        if not code:
            continue
        lines.append(f'.fa-{name}:before {{ content: "\\{code}"; }}')
        count += 1
    io.open(out_path, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    return count


def main() -> int:
    check_only = '--check' in sys.argv
    with_fonts = '--fonts' in sys.argv
    try:
        from fontTools.ttLib import TTFont
        from fontTools import subset  # noqa: F401
    except ImportError:
        print('缺少依赖：pip install fonttools brotli', file=sys.stderr)
        return 2

    css_path = fetch(CSS_URL, os.path.join(CACHE_DIR, 'all.min.css'))
    cmap_map = unicode_map(css_path)
    fam_icons = scan_usage()

    report = []
    for fam, icons in fam_icons.items():
        ttf = fetch(f'{TTF_BASE}/{FAMILY_FILES[fam]}.ttf',
                    os.path.join(CACHE_DIR, f'{FAMILY_FILES[fam]}.ttf'))
        font = TTFont(ttf)
        covered = set()
        for table in font['cmap'].tables:
            covered |= set(table.cmap.keys())
        font.close()

        codes = sorted({int(cmap_map[i], 16) for i in icons if i in cmap_map} & covered)
        if not with_fonts:
            report.append((fam, len(codes), 0, True))
            continue
        out = os.path.join(OUT_DIR, f'fa-{fam}.subset.woff2')
        unis = ','.join(f'U+{c:04X}' for c in codes)

        if check_only:
            # 默认模式（字体走 CDN）不产出 woff2，故不得把 size=0 判为 MISSING
            if with_fonts:
                exists = os.path.exists(out)
                size = os.path.getsize(out) if exists else 0
                report.append((fam, len(codes), size, exists))
            else:
                report.append((fam, len(codes), 0, True))
            continue

        os.makedirs(OUT_DIR, exist_ok=True)
        from fontTools.subset import main as subset_main
        subset_main([ttf, f'--unicodes={unis}', f'--output-file={out}',
                     '--flavor=woff2', '--no-hinting'])
        report.append((fam, len(codes), os.path.getsize(out), True))

    css_path_out = os.path.join(ROOT, 'src', 'assets', 'fontawesome-subset.css')
    if check_only:
        css_ok = os.path.exists(css_path_out)
        css_size = os.path.getsize(css_path_out) if css_ok else 0
    else:
        n_rules = write_css(cmap_map, fam_icons, css_path_out)
        css_ok = True
        css_size = os.path.getsize(css_path_out)

    print(f'Font Awesome {FA_VERSION} 子集报告{"（校验模式）" if check_only else ""}:')
    total = 0
    for fam, glyphs, size, exists in report:
        total += size
        if with_fonts:
            state = 'OK' if exists and size > 0 else 'MISSING'
            print(f'  {fam:8s} {glyphs:3d} glyphs  {size:6d} bytes  {state}')
        else:
            print(f'  {fam:8s} {glyphs:3d} glyphs  （字体走 CDN，不生成子集）')
    if with_fonts:
        print(f'  字体合计 {total} bytes（官方三份约 283KB）')
    print(f'  CSS      {css_size:6d} bytes  {"OK" if css_ok else "MISSING"}（官方 all.min.css 约 102KB）')

    if check_only:
        # 默认模式字体走 CDN，size=0 是预期值；只有 --fonts 模式才校验 woff2 存在且非空
        if with_fonts:
            bad = [r[0] for r in report if not r[3] or r[2] == 0]
        else:
            bad = []
        if not css_ok:
            bad.append('css')
        if bad:
            print(f'校验失败：缺少子集文件 {bad}', file=sys.stderr)
            return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
