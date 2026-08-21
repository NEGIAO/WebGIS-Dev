/**
 * ESRI Wayback World Imagery 动态图层获取工具 (Node.js 版)
 *
 * 功能：
 *   1. 从 ESRI 服务自动拉取所有历史影像快照的日期↔ID 映射
 *   2. 直接输出每个图层的完整 XYZ URL
 *   3. 按年分组输出
 *
 * 用法：
 *   node fetch_wayback_layers.js             # 打印完整列表
 *   node fetch_wayback_layers.js --json      # 输出 JSON
 *   node fetch_wayback_layers.js --code      # 输出 basemapConfig.ts 代码片段
 *
 * 瓦片 XYZ URL 格式：
 *   https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{layer_id}/{z}/{y}/{x}
 */

const SOURCE_URL =
  "https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer?f=json";

const TILE_URL_TEMPLATE =
  "https://wayback-a.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{layer_id}/{z}/{y}/{x}";

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes("--json");
  const isCode = args.includes("--code");

  console.error("🔄 正在从 ESRI 服务拉取 Wayback 历史影像数据...");
  const resp = await fetch(SOURCE_URL, { headers: { "User-Agent": "curl/8.0" } });
  if (!resp.ok) {
    console.error(`❌ 网络错误: HTTP ${resp.status}`);
    process.exit(1);
  }
  const data = await resp.json();
  const selection = data.Selection || [];
  console.error(`✅ 成功获取 ${selection.length} 个时间快照\n`);

  // 解析条目
  const entries = selection
    .map((item) => {
      const name = item.Name || "";
      const layerId = item.M || "";
      const code = item.ID || "";
      const dateStr = name.includes("Wayback")
        ? name.split("Wayback ")[1].replace(")", "")
        : "";
      return { date: dateStr, layer_id: layerId, code, name };
    })
    .filter((e) => e.date)
    .sort((a, b) => b.date.localeCompare(a.date)); // 最新在前

  if (isJson) {
    console.log(JSON.stringify({ total: entries.length, url_template: TILE_URL_TEMPLATE, source_url: SOURCE_URL, layers: entries }, null, 2));
    return;
  }

  if (isCode) {
    // 按年分组
    const byYear = {};
    for (const e of entries) {
      const year = e.date.slice(0, 4);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(e);
    }

    const lines = [];
    lines.push("// ============================================================");
    lines.push(`// ESRI Wayback World Imagery — 动态生成 (${entries.length} 个时间快照)`);
    lines.push(`// 生成时间: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
    lines.push("// 数据来源: " + SOURCE_URL);
    lines.push("// ============================================================");
    lines.push("");

    for (const year of Object.keys(byYear).sort().reverse()) {
      const yearEntries = byYear[year];
      lines.push(`    // ===== ${year}年 (${yearEntries.length} 个快照) =====`);
      for (const e of yearEntries) {
        const dateSlug = e.date.replace(/-/g, "_");
        const safeId = `wayback_${dateSlug}`;
        const url = TILE_URL_TEMPLATE.replace("{layer_id}", e.layer_id);
        lines.push(`    {`);
        lines.push(`        id: '${safeId}',`);
        lines.push(`        name: 'ESRI Wayback ${e.date}',`);
        lines.push(`        category: 'imagery',`);
        lines.push(`        group: 'ESRI Online',`);
        lines.push(`        url: '${url}',`);
        lines.push(`        serviceType: 'xyz',`);
        lines.push(`        createSource: () => prioritizeTileSourceRequest(new XYZ({ url: '${url}' })),`);
        lines.push(`    },`);
        lines.push("");
      }
    }

    console.log(lines.join("\n"));
    return;
  }

  // 默认：打印表格
  console.log("=".repeat(100));
  console.log(`  ESRI Wayback World Imagery — 历史影像图层清单`);
  console.log(`  总计: ${entries.length} 个时间快照 (${entries[entries.length - 1].date} ~ ${entries[0].date})`);
  console.log("=".repeat(100));
  console.log();
  console.log(`${"日期".padEnd(22)} ${"Layer ID".padEnd(12)} ${"内部编码".padEnd(18)} 示例 XYZ URL`);
  console.log(`${"-".repeat(22)} ${"-".repeat(12)} ${"-".repeat(18)} ${"-".repeat(80)}`);
  for (const e of entries) {
    const url = TILE_URL_TEMPLATE.replace("{layer_id}", e.layer_id).replace("{z}", "12").replace("{x}", "0").replace("{y}", "0");
    console.log(`${e.date.padEnd(22)} ${e.layer_id.padEnd(12)} ${e.code.padEnd(18)} ${url}`);
  }
  console.log();
  console.log("=".repeat(100));
  console.log(`  URL 模板: ${TILE_URL_TEMPLATE}`);
  console.log("=".repeat(100));
}

main().catch((err) => {
  console.error("❌ 错误:", err.message);
  process.exit(1);
});