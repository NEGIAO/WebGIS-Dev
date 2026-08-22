/**
 * 工具
 *
 * 注意：本文件经 planarConfig 被 toolModules/planarRouteModule.js 静态引用，
 * 属应用启动期加载链——顶层禁止 import 'cesium'；Cesium 仅在运行时函数体内
 * 经 window.Cesium 取用（调用时机必然在 CDN 就绪后）。
 */

/**
 * 下载 Blob 文件到本地（原 baseInstance.Utilities.downloadBlobFile，浮层 UI 移除后迁入此处）
 * @param data Blob 数据
 * @param filename 保存文件名
 */
export function downloadBlobFile(data: BlobPart, filename: string): void {
	const blob = new Blob([data]);
	const objectUrl = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.style.display = 'none';
	a.href = objectUrl;
	a.setAttribute('download', filename);
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(objectUrl);
}

/**
 * 深拷贝
 * @param obj
 * @returns
 */
export function deepClone<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	// 处理特殊对象：Date、RegExp 等
	if (obj instanceof Date) {
		return new Date(obj) as any as T;
	}
	if (obj instanceof RegExp) {
		return new RegExp(obj) as any as T;
	}

	// 处理数组和普通对象
	const clone: any = Array.isArray(obj) ? [] : {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			clone[key] = deepClone(obj[key]);
		}
	}

	return clone as T;
}

/**
 * 动态生成svg
 */
/** 航点序号图标缓存，避免八百点级重绘时重复 createObjectURL */
const waypointImgCache = new Map<string, string>();

export function getImg(text: number) {
	const label = text == 1 ? 'S' : String(text);
	const cached = waypointImgCache.get(label);
	if (cached) {
		return cached;
	}
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 26' width='32' height='26'> <g fill='none' fill-rule='evenodd'> <path fill='#00D690' d='M16.8320503 24.75192456L30.9635332 3.5547002c.3063525-.4595287.1821786-1.080398-.2773501-1.3867505C30.5219156 2.058438 30.3289079 2 30.1314829 2H1.86851709c-.55228475 0-1 .4477153-1 1 0 .197425.05843803.3904327.16794971.5547002l14.1314829 21.19722436c.3063525.45952869.9272218.58370256 1.3867505.2773501.1098523-.07323486.2041152-.16749781.2773501-.2773501z'/> <text fill='#FFF' font-size='16' font-weight='500'> <tspan x='50%' y='50%' dy='.25em' text-anchor='middle'>${label}</tspan> </text> </g> </svg>`;
	const url = svgToBase64(svg);
	waypointImgCache.set(label, url);
	return url;
}

/**
 * 将 SVG 字符串转换为 Base64 编码
 * @param svgString - SVG 的字符串内容
 * @returns Base64 编码的 SVG 字符串
 */
export function svgToBase64(svgString: string): string {
	const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
	return URL.createObjectURL(blob);
}

/**
 * 生成 UUID（WPML 动作节点 actionUUID 使用）
 * @returns RFC4122 v4 格式 UUID 字符串
 */
export function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}
