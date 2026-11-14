/**
 * WMS Capabilities（GetCapabilities XML）解析
 *
 * 产出与引擎无关的元信息：可选图层树、默认图层、版本、格式、CRS 策略、地理范围。
 * 只做 XML → 对象；取数见 ./transport，缓存与编排见入口 wmsService。
 */

import type { WmsLayerOption, WmsServiceInfo } from './types';
import { bboxUnion, isValidLonLatBbox } from './geoBbox';

/** Web 墨卡托常见 CRS 代号 */
const MERCATOR_CRS_PATTERN = /^(EPSG(:|\/)?(3857|900913|102100|102113)|OSGEO:41001)$/i;
/** 地理坐标（经纬度）常见 CRS 代号 */
const GEOGRAPHIC_CRS_PATTERN = /^(CRS:?84|EPSG:?4326|EPSG:?4269|EPSG:?4258)$/i;

function directChild(node: Element | null | undefined, tagName: string): Element | null {
    const children = node?.children || [];
    for (const child of children) {
        if (child.tagName === tagName) return child;
    }
    return null;
}

function textOf(node: Element | null | undefined): string {
    return String(node?.textContent || '').trim();
}

/** 从 Layer 元素及其祖先收集 CRS/SRS 声明 */
function collectLayerCrsList(layerNode: Element): string[] {
    const values = [];
    let current: Element | null = layerNode;
    while (current) {
        for (const child of current.children || []) {
            if (child.tagName === 'CRS' || child.tagName === 'SRS') {
                const text = textOf(child);
                if (text) values.push(text);
            } else if (child.tagName === 'BoundingBox') {
                const crs = child.getAttribute('CRS') || child.getAttribute('SRS');
                if (crs) values.push(crs);
            }
        }
        current = current.parentElement;
    }
    return values;
}

function findFirstNamedLayer(root: Element): { node: Element; name: string; title: string } | null {
    const layerNodes = root.getElementsByTagName('Layer');
    for (const node of Array.from(layerNodes)) {
        const nameNode = directChild(node, 'Name');
        if (nameNode && textOf(nameNode)) {
            const titleNode = directChild(node, 'Title');
            return { node, name: textOf(nameNode), title: textOf(titleNode) };
        }
    }
    return null;
}

/**
 * 递归枚举 Capabilities 中所有可选择的命名图层
 * 组图层（有 Name 的中间节点）同样可选择（服务端渲染全部子图层）
 */
function collectNamedLayerOptions(layerNode: Element, parentPath: string[] = []): WmsLayerOption[] {
    const options: WmsLayerOption[] = [];
    for (const child of layerNode?.children || []) {
        if (child.tagName !== 'Layer') continue;
        const name = textOf(directChild(child, 'Name'));
        const title = textOf(directChild(child, 'Title')) || name;
        if (!name) {
            // 无 Name 的纯分组节点：继续下钻，标题并入路径
            options.push(...collectNamedLayerOptions(child, [...parentPath, title]));
            continue;
        }
        options.push({
            name,
            title,
            path: parentPath.join(' / '),
            label: parentPath.length ? `${parentPath.join(' / ')} / ${title} (${name})` : `${title} (${name})`,
        });
        options.push(...collectNamedLayerOptions(child, [...parentPath, title]));
    }
    return options;
}

/** 去重并保证文档顺序（同名子分组先于后代出现时保留父项） */
function dedupeLayerOptions(options: WmsLayerOption[]): WmsLayerOption[] {
    return options.filter(
        (option, index) => options.findIndex((item) => item.name === option.name) === index,
    );
}

function extractGetMapFormats(root: Element): string[] {
    const formats: string[] = [];
    // 直接找 GetMap 节点下的 Format 子元素（兼容大小写命名风格）
    for (const node of Array.from(root.getElementsByTagName('*'))) {
        if (!/getmap$/i.test(node.tagName)) continue;
        for (const child of node.children || []) {
            if (child.tagName === 'Format' && textOf(child)) formats.push(textOf(child));
        }
        if (formats.length) break;
    }
    return formats;
}

function pickPreferredFormat(formats: string[]): string {
    return (
        formats.find((fmt) => /png/i.test(fmt)) ||
        formats.find((fmt) => /image/i.test(fmt)) ||
        'image/png'
    );
}

/**
 * 根据服务声明的 CRS 决定请求策略
 * 优先 Web 墨卡托（与 Cesium 默认瓦片方案一致），否则回退经纬度方案
 */
export function resolveCrsStrategy(
    crsList: string[],
    explicitSrs: string,
): { srs: string; mercator: boolean } {
    if (explicitSrs) {
        if (MERCATOR_CRS_PATTERN.test(explicitSrs)) return { srs: 'EPSG:3857', mercator: true };
        if (GEOGRAPHIC_CRS_PATTERN.test(explicitSrs)) return { srs: 'EPSG:4326', mercator: false };
    }
    const hasMercator = crsList.some((crs) => MERCATOR_CRS_PATTERN.test(crs));
    if (hasMercator) return { srs: 'EPSG:3857', mercator: true };
    const geographic = crsList.find((crs) => GEOGRAPHIC_CRS_PATTERN.test(crs));
    if (geographic) return { srs: 'EPSG:4326', mercator: false };
    return { srs: 'EPSG:3857', mercator: true };
}

/**
 * 定位 Capabilities 根图层节点
 * OGC 规范路径: WMS_Capabilities → Capability → Layer（注意不能只查文档根直接子级）
 */
function findRootCapabilityLayer(doc: Document): Element | null {
    for (const child of doc.documentElement?.children || []) {
        if (child.tagName === 'Capability') {
            const rootLayer = directChild(child, 'Layer');
            if (rootLayer) return rootLayer;
        }
    }
    // 兜底：个别服务不规范时全文搜索第一个 Layer 节点
    return doc.getElementsByTagName('Layer')[0] || null;
}

/** 合成单条图层选项（枚举兜底用） */
function toSingleOption(name: string, title: string): WmsLayerOption {
    return { name, title: title || name, path: '', label: `${title || name} (${name})` };
}

/** 从 Layer 元素读取地理范围（兼容 1.3.0 EX_GeographicBoundingBox 与 1.1.1 LatLonBoundingBox） */
function readLayerGeographicBbox(layerNode: Element | null | undefined): number[] | null {
    for (const child of layerNode?.children || []) {
        if (child.tagName === 'EX_GeographicBoundingBox') {
            const pick = (tag: string): number => {
                const node = directChild(child, tag);
                const value = Number.parseFloat(textOf(node));
                return Number.isFinite(value) ? value : NaN;
            };
            const west = pick('westBoundLongitude');
            const east = pick('eastBoundLongitude');
            const south = pick('southBoundLatitude');
            const north = pick('northBoundLatitude');
            const box = [west, south, east, north];
            if (isValidLonLatBbox(box)) return box;
        } else if (child.tagName === 'LatLonBoundingBox') {
            const box = [
                Number.parseFloat(child.getAttribute('minx') ?? ''),
                Number.parseFloat(child.getAttribute('miny') ?? ''),
                Number.parseFloat(child.getAttribute('maxx') ?? ''),
                Number.parseFloat(child.getAttribute('maxy') ?? ''),
            ];
            if (isValidLonLatBbox(box)) return box;
        }
    }
    return null;
}

export function parseCapabilitiesXml(xmlText: string, fallbackEndpoint: string): WmsServiceInfo {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('WMS Capabilities XML 解析失败');
    }

    const version = doc.documentElement.getAttribute('version') || '1.1.1';
    const found = findFirstNamedLayer(doc.documentElement);
    if (!found) throw new Error('WMS Capabilities 未找到可用图层名称');

    const rootLayerNode = findRootCapabilityLayer(doc);
    let layerOptions: WmsLayerOption[] = rootLayerNode
        ? dedupeLayerOptions(collectNamedLayerOptions(rootLayerNode))
        : [];

    // 兜底：树形枚举异常为空时至少保留默认图层，保证选择器可用
    if (!layerOptions.length) {
        layerOptions = [toSingleOption(found.name, found.title)];
    }

    // 多图层服务：默认按文档顺序整卷加载（WMS 规范中列表首层画在最底部）
    const allNames: string[] = layerOptions.map((option) => option.name);
    const layers = allNames.join(',');
    if (allNames.length > 1) {
        layerOptions = [
            { name: layers, title: '全部图层', path: '', label: '全部图层（按顺序叠加）' },
            ...layerOptions,
        ];
    }

    // 服务地理范围：并集所有图层声明的经纬度范围，供前端自动缩放定位
    let geographicBbox: number[] | null = null;
    if (rootLayerNode) {
        for (const node of [rootLayerNode, ...rootLayerNode.getElementsByTagName('Layer')]) {
            geographicBbox = bboxUnion(geographicBbox, readLayerGeographicBbox(node));
        }
    }
    if (!isValidLonLatBbox(geographicBbox)) {
        geographicBbox = readLayerGeographicBbox(found.node);
    }

    const crsList = collectLayerCrsList(found.node);
    const format = pickPreferredFormat(extractGetMapFormats(doc.documentElement));
    const strategy = resolveCrsStrategy(crsList, '');

    return {
        layers,
        title: found.title,
        layerOptions,
        geographicBbox: isValidLonLatBbox(geographicBbox) ? geographicBbox : null,
        version,
        format,
        crsList,
        ...strategy,
        endpoint: fallbackEndpoint,
        source: 'capabilities',
    };
}
