/**
 * 功能名称：面状航线前端 KMZ 导出
 * 日    期：2026/07/17
 *
 * 生成 DJI Pilot 可导入的 KMZ（wpmz/template.kml + wpmz/waylines.wpml）。
 * 实现按职责分层在同目录 `kmz/` 下：
 * - `kmz/types`      对外类型（航线/导出选项）与内部数据结构
 * - `kmz/routeData`  选项校验、航点/范围计算、朝向与数值格式化
 * - `kmz/document`   KML/WPML 文档构建（任务配置、动作组、样式、序列化）
 */

import JSZip from 'jszip';
import { translate as t } from '@common/app/useLocale';
import { buildTemplateKml, buildWaylinesWpml } from './kmz/document';
import { createExportRouteData, validateExportOptions } from './kmz/routeData';
import { ExportRouteData, PlanarKmzExportOptions } from './kmz/types';


/**
 * 使用当前前端规划结果生成 DJI WPMZ 格式的 KMZ 文件。
 */
export async function buildPlanarKmz(options: PlanarKmzExportOptions): Promise<Blob> {
	validateExportOptions(options);
	const routeData: ExportRouteData[] = [];
	for (let routeIndex = 0; routeIndex < options.routes.length; routeIndex++) {
		routeData.push(createExportRouteData(options.routes[routeIndex], options));
	}

	const zip = new JSZip();
	const folder = zip.folder('wpmz');
	if (!folder) {
		throw new Error(t('cesium.module.planarRoute.err.kmzMkdirFailed'));
	}
	folder.file('template.kml', buildTemplateKml(options));
	folder.file('waylines.wpml', buildWaylinesWpml(options, routeData));
	return await zip.generateAsync({
		type: 'blob',
		mimeType: 'application/vnd.google-earth.kmz',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 },
	});
}

export type { PlanarKmzExportOptions, PlanarKmzRoute } from './kmz/types';
