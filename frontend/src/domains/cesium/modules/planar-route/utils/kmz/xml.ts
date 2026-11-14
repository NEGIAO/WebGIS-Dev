/**
 * 功能名称：KML/WPML 通用 XML 节点读取
 * 日    期：2026/11/13
 *
 * 从 planarKmzImport 拆出：只做「按本地名找节点 / 读文本 / 读数值」，
 * 不含任何航线语义，便于其它 KML 解析器复用。
 */
import { translate as t } from '@common/app/useLocale';

/**
 * 获取 KML Document 节点。
 */
export function findDocument(document: XMLDocument): Element {
	if (document.documentElement && localName(document.documentElement) === 'Document') {
		return document.documentElement;
	}
	const documentNode = findDescendant(document.documentElement, 'Document');
	if (!documentNode) {
		throw new Error(t('cesium.module.planarRoute.err.kmzMissingDocumentNode'));
	}
	return documentNode;
}

/**
 * 获取直接子节点。
 */
export function findDirectChild(parent: Element | null | undefined, name: string): Element | null {
	if (!parent) {
		return null;
	}
	const childNodes = Array.from(parent.childNodes);
	for (let index = 0; index < childNodes.length; index++) {
		const node = childNodes[index];
		if (node.nodeType === 1 && localName(node as Element) === name) {
			return node as Element;
		}
	}
	return null;
}

/**
 * 获取全部直接子节点。
 */
export function findDirectChildren(parent: Element | null | undefined, name: string): Element[] {
	if (!parent) {
		return [];
	}
	const result: Element[] = [];
	const childNodes = Array.from(parent.childNodes);
	for (let index = 0; index < childNodes.length; index++) {
		const node = childNodes[index];
		if (node.nodeType === 1 && localName(node as Element) === name) {
			result.push(node as Element);
		}
	}
	return result;
}

/**
 * 获取第一个后代节点。
 */
export function findDescendant(parent: ParentNode | null | undefined, name: string): Element | null {
	const descendants = findDescendants(parent, name);
	return descendants[0] ?? null;
}

/**
 * 获取全部后代节点。
 */
export function findDescendants(parent: ParentNode | null | undefined, name: string): Element[] {
	if (!parent) {
		return [];
	}
	const result: Element[] = [];
	const pending = Array.from(parent.childNodes);
	for (let index = 0; index < pending.length; index++) {
		const node = pending[index];
		if (node.nodeType !== 1) {
			continue;
		}
		const element = node as Element;
		if (localName(element) === name) {
			result.push(element);
		}
		const childNodes = Array.from(element.childNodes);
		for (let childIndex = 0; childIndex < childNodes.length; childIndex++) {
			pending.push(childNodes[childIndex]);
		}
	}
	return result;
}

/**
 * 获取不含命名空间前缀的 XML 节点名。
 */
export function localName(element: Element): string {
	if (element.localName) {
		return element.localName;
	}
	const separatorIndex = element.nodeName.indexOf(':');
	return separatorIndex >= 0 ? element.nodeName.slice(separatorIndex + 1) : element.nodeName;
}

/**
 * 读取节点文本。
 */
export function readText(element: Element | null): string | undefined {
	if (!element || element.textContent === null) {
		return undefined;
	}
	const value = element.textContent.trim();
	return value.length > 0 ? value : undefined;
}

/**
 * 读取有限数值。
 */
export function parseNumber(element: Element | null): number | undefined {
	const text = readText(element);
	if (!text) {
		return undefined;
	}
	const value = Number(text);
	return Number.isFinite(value) ? value : undefined;
}
