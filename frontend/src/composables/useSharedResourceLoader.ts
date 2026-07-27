import { ref, computed } from 'vue';
import { useMessage } from './useMessage';
import { getExtension as _getExtension } from '../utils/pathUtils.js';

/**
 * 共享资源加载器 - 用于从 public/ShareData 目录加载预配置的地理数据资源
 *
 * Features:
 * - 通过构建期生成的 manifest.json 发现资源(scripts/generate-sharedata-manifest.mjs
 *   在 vite 配置求值时自动刷新;旧 import.meta.glob 方案会把 ShareData 全目录
 *   再拷进 dist/assets 造成约 7.5MB 死重,V3.4.54 移除)
 * - 支持 KML, KMZ, GeoJSON, JSON, SHP, TIF/TIFF 格式
 * - 将文件内容转换为 Blob，复用上传逻辑
 *
 * 使用方式：
 * const sharedLoader = useSharedResourceLoader();
 * const resources = await sharedLoader.scanResources();
 * const blobs = await sharedLoader.loadResourceAsBlobs(resourcePath);
 */

export interface SharedResource {
    name: string; // 文件名 (如 '全国禁飞区.kml')
    path: string; // 相对路径 (如 '全国禁飞区.kml')
    type: string; // 文件扩展名小写 (如 'kml')
    size?: number; // 文件大小 (字节)
    lastModified?: number; // 最后修改时间
}

export interface SharedResourceGroup {
    name: string;
    resources: SharedResource[];
}

export interface SharedResourceTreeNode {
    id: string;
    name: string;
    path: string;
    type: 'folder' | 'file';
    children?: SharedResourceTreeNode[];
    resource?: SharedResource;
    fileCount?: number;
}

const SHARED_RESOURCE_DIR = `${import.meta.env.BASE_URL || '/'}ShareData`.replace(/\/+/g, '/');
const SUPPORTED_EXTENSIONS = [
    'kml',
    'kmz',
    'geojson',
    'json',
    'shp',
    'shx',
    'dbf',
    'prj',
    'cpg',
    'tif',
    'tiff',
    'zip',
];

function normalizeResourcePath(path: string): string {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\.\.\/\.\.\/public\/ShareData\//, '')
        .replace(/^\/public\/ShareData\//, '')
        .replace(/^public\/ShareData\//, '')
        .replace(/^\/ShareData\//, '')
        .replace(/^ShareData\//, '')
        .replace(/^\/+/, '')
        .trim();
}

function countFiles(nodes: SharedResourceTreeNode[]): number {
    let total = 0;
    for (const node of nodes) {
        if (node.type === 'file') {
            total += 1;
            continue;
        }
        total += countFiles(node.children || []);
    }
    return total;
}

function sortTreeNodes(nodes: SharedResourceTreeNode[]): void {
    nodes.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'zh-CN');
    });

    for (const node of nodes) {
        if (node.type === 'folder' && node.children?.length) {
            sortTreeNodes(node.children);
            node.fileCount = countFiles(node.children);
        }
    }
}

function buildResourceTree(resourceList: SharedResource[]): SharedResourceTreeNode[] {
    const root: SharedResourceTreeNode[] = [];

    for (const resource of resourceList) {
        const parts = String(resource.path || '')
            .split('/')
            .filter(Boolean);

        if (!parts.length) continue;

        let currentNodes = root;
        let currentPath = '';

        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            const isFile = i === parts.length - 1;
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (isFile) {
                currentNodes.push({
                    id: `file:${resource.path}`,
                    name: part,
                    path: resource.path,
                    type: 'file',
                    resource,
                });
                break;
            }

            let folderNode = currentNodes.find(
                (node) => node.type === 'folder' && node.name === part,
            );

            if (!folderNode) {
                folderNode = {
                    id: `folder:${currentPath}`,
                    name: part,
                    path: currentPath,
                    type: 'folder',
                    children: [],
                };
                currentNodes.push(folderNode);
            }

            if (!folderNode.children) {
                folderNode.children = [];
            }

            currentNodes = folderNode.children;
        }
    }

    sortTreeNodes(root);
    return root;
}

export function useSharedResourceLoader() {
    const message = useMessage();
    const resources = ref<SharedResource[]>([]);
    const isScanning = ref(false);
    const lastScanTime = ref<number | null>(null);
    const scanError = ref<string | null>(null);

    /**
     * 检查扩展名是否被支持
     */
    function isSupportedExtension(ext: string): boolean {
        return SUPPORTED_EXTENSIONS.includes(ext.toLowerCase());
    }

    /**
     * 从文件名提取扩展名
     */
    const getExtension = _getExtension;

    /**
     * 扫描共享资源目录:读取构建期生成的 public/ShareData/manifest.json
     *
     * 清单由 scripts/generate-sharedata-manifest.mjs 在 dev/build 启动时自动刷新,
     * 运行时按需 fetch——资源文件本体只保留 public 一份,不再进 bundle。
     *
     * @returns 发现的资源列表
     */
    async function scanResources(): Promise<SharedResource[]> {
        isScanning.value = true;
        scanError.value = null;

        try {
            const discovered = await scanViaManifest();
            if (!discovered.length) {
                console.warn('[SharedResource] manifest 为空或缺失,共享资源列表不可用');
            }
            return discovered;
        } catch (error) {
            scanError.value = `无法扫描共享资源: ${String(error)}`;
            message.warning(scanError.value);
            return [];
        } finally {
            isScanning.value = false;
        }
    }

    /**
     * 从 manifest.json 获取资源列表(主路径;清单由构建脚本自动生成)
     */
    async function scanViaManifest(): Promise<SharedResource[]> {
        try {
            const response = await fetch(`${SHARED_RESOURCE_DIR}/manifest.json`);
            if (response.ok) {
                const manifest = await response.json();

                const discovered = (manifest.resources || [])
                    .map((r: any) => {
                        const normalizedPath = normalizeResourcePath(r?.path || r?.name || '');
                        const fileName = normalizedPath.split('/').pop() || '';
                        const ext = getExtension(fileName);

                        return {
                            name: fileName,
                            path: normalizedPath,
                            type: ext,
                            size: Number(r?.size) || undefined,
                            lastModified: Number(r?.lastModified) || undefined,
                        } as SharedResource;
                    })
                    .filter((r: SharedResource) => !!r.path && isSupportedExtension(r.type));

                resources.value = discovered;
                lastScanTime.value = Date.now();
                return discovered;
            }
        } catch {
            // manifest.json 不存在或解析失败,走下方空列表返回
        }

        console.warn('Could not scan shared resources via manifest.json');
        return [];
    }

    /**
     * 将共享资源加载为 File 对象数组（用于复用上传逻辑）
     *
     * @param resourcePath - 资源路径 (相对于 ShareData 目录)
     * @returns File 对象数组
     */
    async function loadResourceAsFiles(resourcePath: string): Promise<File[]> {
        try {
            const fullPath = `${SHARED_RESOURCE_DIR}/${resourcePath}`;
            const response = await fetch(fullPath);

            if (!response.ok) {
                throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
            }

            const buffer = await response.arrayBuffer();
            const filename = resourcePath.split('/').pop() || 'shared-resource';
            const contentType = getContentTypeForExtension(getExtension(filename));

            const file = new File([buffer], filename, { type: contentType });
            return [file];
        } catch (error) {
            const message = `Failed to load shared resource: ${String(error)}`;
            console.error(message, error);
            throw error;
        }
    }

    /**
     * 根据扩展名获取 MIME 类型
     */
    function getContentTypeForExtension(ext: string): string {
        const mimeMap: Record<string, string> = {
            kml: 'application/xml',
            kmz: 'application/zip',
            geojson: 'application/geo+json',
            json: 'application/json',
            shp: 'application/x-shapefile',
            shx: 'application/octet-stream',
            dbf: 'application/octet-stream',
            prj: 'text/plain',
            cpg: 'text/plain',
            tif: 'image/tiff',
            tiff: 'image/tiff',
            zip: 'application/zip',
        };
        return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * 检查是否有可用的共享资源
     */
    const hasResources = computed(() => resources.value.length > 0);

    /**
     * 按类型分组的资源
     */
    const groupedResources = computed(() => {
        const grouped: Record<string, SharedResource[]> = {};
        resources.value.forEach((resource) => {
            if (!grouped[resource.type]) {
                grouped[resource.type] = [];
            }
            grouped[resource.type].push(resource);
        });
        return grouped;
    });

    /**
     * 目录树结构（用于树形界面展示）
     */
    const resourceTree = computed(() => buildResourceTree(resources.value));

    /**
     * 刷新资源列表
     */
    async function refresh(): Promise<SharedResource[]> {
        return scanResources();
    }

    return {
        // 状态
        resources: computed(() => resources.value),
        isScanning: computed(() => isScanning.value),
        hasResources,
        groupedResources,
        resourceTree,
        lastScanTime: computed(() => lastScanTime.value),
        scanError: computed(() => scanError.value),

        // 方法
        scanResources,
        loadResourceAsFiles,
        isSupportedExtension,
        getExtension,
        refresh,
    };
}
