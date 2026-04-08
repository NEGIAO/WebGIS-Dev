import { ref, computed } from 'vue';
import { useMessage } from './useMessage';

/**
 * 共享资源加载器 - 用于从 public/ShareDate 目录加载预配置的地理数据资源
 * 
 * Features:
 * - 自动扫描共享资源目录
 * - 支持 KML, KMZ, GeoJSON, JSON, SHP, TIF/TIFF 格式
 * - 将文件内容转换为 Blob，复用上传逻辑
 * - 可扩展的资源发现机制
 * 
 * 使用方式：
 * const sharedLoader = useSharedResourceLoader();
 * const resources = await sharedLoader.scanResources();
 * const blobs = await sharedLoader.loadResourceAsBlobs(resourcePath);
 */

export interface SharedResource {
    name: string;           // 文件名 (如 '全国禁飞区.kml')
    path: string;           // 相对路径 (如 '全国禁飞区.kml')
    type: string;           // 文件扩展名小写 (如 'kml')
    size?: number;          // 文件大小 (字节)
    lastModified?: number;  // 最后修改时间
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

const SHARED_RESOURCE_DIR = './ShareDate';
const SUPPORTED_EXTENSIONS = ['kml', 'kmz', 'geojson', 'json', 'shp', 'shx', 'dbf', 'prj', 'cpg', 'tif', 'tiff', 'zip'];

function normalizeResourcePath(path: string): string {
    return String(path || '')
        .replace(/\\/g, '/')
        .replace(/^\/public\/ShareDate\//, '')
        .replace(/^public\/ShareDate\//, '')
        .replace(/^\/ShareDate\//, '')
        .replace(/^ShareDate\//, '')
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
                    resource
                });
                break;
            }

            let folderNode = currentNodes.find(
                (node) => node.type === 'folder' && node.name === part
            );

            if (!folderNode) {
                folderNode = {
                    id: `folder:${currentPath}`,
                    name: part,
                    path: currentPath,
                    type: 'folder',
                    children: []
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
    function getExtension(filename: string): string {
        const dot = filename.lastIndexOf('.');
        if (dot <= 0) return '';
        return filename.slice(dot + 1).toLowerCase();
    }

    /**
     * 扫描共享资源目录（支持两种实现方式）
     * 方案1: 使用 import.meta.glob（编译时扩展，最可靠）
     * 方案2: 使用 fetch API 动态获取（需要后端支持）
     * 
     * @returns 发现的资源列表
     */
    async function scanResources(): Promise<SharedResource[]> {
        isScanning.value = true;
        scanError.value = null;

        try {
            // 1. 扫描文件
            const rawModules = import.meta.glob('/public/ShareDate/**/*', {
                query: '?url',
                import: 'default',
                eager: true // 建议开启 eager，确保数据立即同步可用
            });

            // 2. 核心修复：把路径变成“相对路径”
            const globModules = Object.fromEntries(
                Object.entries(rawModules).map(([path, value]) => [
                    path.replace(/^\/public\//, ''), 
                    value
                ])
            );
            // 解决路径问题

            const discoveredMap = new Map<string, SharedResource>();

            for (const [path] of Object.entries(globModules)) {
                try {
                    const relativePath = normalizeResourcePath(path);
                    if (!relativePath) continue;

                    const filename = relativePath.split('/').pop() || '';
                    const ext = getExtension(filename);

                    if (!isSupportedExtension(ext)) {
                        continue;
                    }

                    discoveredMap.set(relativePath, {
                        name: filename,
                        path: relativePath,
                        type: ext
                    });
                } catch (error) {
                    console.warn(`Failed to process shared resource: ${path}`, error);
                }
            }

            const discovered = Array.from(discoveredMap.values());
            resources.value = discovered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
            lastScanTime.value = Date.now();

            return resources.value;
        } catch (error) {
            console.warn('Failed to scan shared resources with glob, falling back to dynamic fetch', error);

            try {
                // 降级方案: 尝试通过 API 或直接 fetch .json manifest
                return await fallbackScanViaApi();
            } catch (apiError) {
                scanError.value = `无法扫描共享资源: ${String(apiError)}`;
                message.warning(scanError.value);
                return [];
            }
        } finally {
            isScanning.value = false;
        }
    }

    /**
     * 降级方案: 从 API 或 manifest 文件获取资源列表
     * 这需要后端支持或一个静态 .json 配置文件
     */
    async function fallbackScanViaApi(): Promise<SharedResource[]> {
        try {
            // 尝试获取一个静态的 manifest 文件（可选实现）
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
                            lastModified: Number(r?.lastModified) || undefined
                        } as SharedResource;
                    })
                    .filter((r: SharedResource) => !!r.path && isSupportedExtension(r.type));

                resources.value = discovered;
                lastScanTime.value = Date.now();
                return discovered;
            }
        } catch {
            // manifest.json 不存在或有问题，继续
        }

        // 最后的降级方案: 返回空列表并提示用户
        console.warn('Could not scan shared resources via glob or API');
        return [];
    }

    /**
     * 将共享资源加载为 File 对象数组（用于复用上传逻辑）
     * 
     * @param resourcePath - 资源路径 (相对于 ShareDate 目录)
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
            'kml': 'application/xml',
            'kmz': 'application/zip',
            'geojson': 'application/geo+json',
            'json': 'application/json',
            'shp': 'application/x-shapefile',
            'shx': 'application/octet-stream',
            'dbf': 'application/octet-stream',
            'prj': 'text/plain',
            'cpg': 'text/plain',
            'tif': 'image/tiff',
            'tiff': 'image/tiff',
            'zip': 'application/zip'
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
        resources.value.forEach(resource => {
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
        refresh
    };
}
