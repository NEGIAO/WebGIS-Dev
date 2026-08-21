"""
ESRI Wayback World Imagery 动态图层获取工具

功能：
  1. 从 ESRI 服务自动拉取所有历史影像快照的日期↔ID 映射
  2. 生成标准 XYZ 瓦片 URL（保留 {z}/{y}/{x} 占位符）
  3. 生成前端 basemap 配置代码或 JSON 数据

用法：
  python fetch_wayback_layers.py             # 默认：输出包含日期和标准 XYZ URL 的列表
  python fetch_wayback_layers.py --urls      # 同上
  python fetch_wayback_layers.py --pure-urls # 仅输出标准 XYZ URL 列表（每行一个 URL）
  python fetch_wayback_layers.py --json      # 输出 JSON 格式
  python fetch_wayback_layers.py --code      # 输出 TypeScript (basemapConfig.ts) 代码片段

数据来源：
  MapServer?f=json 返回的 Selection 数组

ESRI 官方服务端 URL：
  https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer?f=json

瓦片 XYZ URL 格式：
  https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{layer_id}/{z}/{y}/{x}
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime

# 源数据 URL
SOURCE_URL = (
    "https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/"
    "World_Imagery/WMTS/1.0.0/default028mm/MapServer?f=json"
)

# 瓦片 URL 模板
TILE_URL_TEMPLATE = (
    "https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/"
    "World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{layer_id}/{z}/{y}/{x}"
)


def fetch_selection():
    """从 ESRI 服务拉取 Selection 数组"""
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "curl/8.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("Selection", [])
    except urllib.error.URLError as e:
        print(f"❌ 网络错误: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失败: {e}", file=sys.stderr)
        sys.exit(1)


def parse_entries(selection):
    """
    解析 Selection 条目，返回按日期排序的列表。
    每条：{ "date": "2014-02-20", "layer_id": "10", "code": "WB_2014_R01", "name": "..." }
    """
    entries = []
    for item in selection:
        name = item.get("Name", "")
        layer_id = item.get("M", "")
        code = item.get("ID", "")
        # 从 Name 中提取日期: "World Imagery (Wayback 2026-08-05)" → "2026-08-05"
        date_str = name.split("Wayback ")[-1].rstrip(")") if "Wayback" in name else ""
        entries.append({
            "date": date_str,
            "layer_id": str(layer_id),
            "code": code,
            "name": name,
        })
    # 按日期倒序（最新在前）
    def sort_key(e):
        try:
            return datetime.strptime(e["date"], "%Y-%m-%d")
        except (ValueError, IndexError):
            return datetime.min
    entries.sort(key=sort_key, reverse=True)
    return entries


def build_xyz_url(layer_id):
    """构建单图层的标准 XYZ 瓦片 URL（包含 {z}/{y}/{x}）"""
    return TILE_URL_TEMPLATE.replace("{layer_id}", str(layer_id))


def output_xyz_urls(entries, pure=False):
    """输出标准 XYZ URL 列表"""
    if pure:
        # 纯 URL 模式：每行一个 URL，方便批量导入或脚本读取
        for e in entries:
            print(build_xyz_url(e["layer_id"]))
    else:
        # 可读表格模式：带日期和 Layer ID
        print(f"\n{'='*110}")
        print(f"  ESRI Wayback World Imagery — 标准 XYZ 瓦片 URL 清单")
        print(f"  总计: {len(entries)} 个时间快照")
        print(f"{'='*110}\n")
        print(f"{'快照日期':<14} | {'Layer ID':<10} | {'标准 XYZ 瓦片 URL 模板'}")
        print(f"{'-'*14}-+-{'-'*10}-+-{'-'*80}")
        for e in entries:
            url = build_xyz_url(e["layer_id"])
            print(f"{e['date']:<14} | {e['layer_id']:<10} | {url}")
        print(f"\n{'='*110}\n")


def output_json(entries):
    """输出包含标准 XYZ URL 的 JSON 结构"""
    layers = []
    for e in entries:
        layers.append({
            "date": e["date"],
            "layer_id": e["layer_id"],
            "code": e["code"],
            "name": e["name"],
            "xyz_url": build_xyz_url(e["layer_id"])
        })

    result = {
        "total": len(entries),
        "source_url": SOURCE_URL,
        "layers": layers,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def output_code(entries):
    """输出可直接粘贴到 TS 配置文件的代码片段"""
    lines = []
    lines.append("// ============================================================")
    lines.append(f"// ESRI Wayback World Imagery — 动态生成 ({len(entries)} 个时间快照)")
    lines.append("// 生成时间: " + datetime.now().strftime("%Y-%m-%d %H:%M"))
    lines.append("// 数据来源: " + SOURCE_URL)
    lines.append("// ============================================================")
    lines.append("")

    by_year = {}
    for e in entries:
        year = e["date"][:4]
        by_year.setdefault(year, []).append(e)

    for year in sorted(by_year.keys(), reverse=True):
        year_entries = by_year[year]
        lines.append(f"    // ===== {year}年 ({len(year_entries)} 个快照) =====")
        for e in year_entries:
            date_slug = e["date"].replace("-", "_")
            safe_id = f"wayback_{date_slug}"
            url = build_xyz_url(e["layer_id"])
            lines.append(f"    {{")
            lines.append(f"        id: '{safe_id}',")
            lines.append(f"        name: 'ESRI Wayback {e['date']}',")
            lines.append(f"        category: 'imagery',")
            lines.append(f"        group: 'ESRI Online',")
            lines.append(f"        url: '{url}',")
            lines.append(f"        serviceType: 'xyz',")
            lines.append(f"        createSource: () => prioritizeTileSourceRequest(new XYZ({{ url: '{url}' }})),")
            lines.append(f"    }},")
            lines.append("")

    print("\n".join(lines))


def main():
    print("🔄 正在从 ESRI 服务拉取 Wayback 历史影像数据...", file=sys.stderr)
    selection = fetch_selection()
    entries = parse_entries(selection)
    print(f"✅ 成功获取 {len(entries)} 个时间快照\n", file=sys.stderr)

    if "--json" in sys.argv:
        output_json(entries)
    elif "--code" in sys.argv:
        output_code(entries)
    elif "--pure-urls" in sys.argv:
        output_xyz_urls(entries, pure=True)
    else:
        # 默认或使用 --urls 参数
        output_xyz_urls(entries, pure=False)


if __name__ == "__main__":
    main()