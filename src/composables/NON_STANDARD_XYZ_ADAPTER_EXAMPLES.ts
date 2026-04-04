/**
 * 非标准 XYZ 图源 - 适配器扩展示例
 * 
 * 本文件演示如何为新的非标准图源格式添加适配器。
 * 实际使用时，应将代码添加到 useBasemapManager.ts 中。
 */

// ============================================================================
// 示例 1：Maps-for-free 地形浮雕（已实现）
// ============================================================================
const example1_mapsForFreeRelief = {
    'maps-for-free-relief': {
        pattern: /maps-for-free\.com.*relief/i,
        name: '地形浮雕(MFF)',
        urlFunction: (tileCoord: number[]) => {
            // Maps-for-free 的非标准格式：z{z}/row{y}/{z}_{x}-{y}.jpg
            // 标准 XYZ 坐标转换：OL内部坐标 → Web Mercator 标准坐标
            const z = tileCoord[0];    // 缩放级别（保持不变）
            const x = tileCoord[1];    // 横坐标（保持不变）
            // 正确的 XYZ 转换公式：y = (2^z - 1) - tileCoord[2]
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            return `https://maps-for-free.com/layer/relief/z${z}/row${y}/${z}_${x}-${y}.jpg`;
        }
    }
};

// ============================================================================
// 示例 2：某个虚构的地图服务 - 自定义坐标格式
// ============================================================================
const example2_customMapService = {
    'custom-map-service': {
        // 匹配规则：包含 "custom-map.io" 且包含 "tiles" 路径
        pattern: /custom-map\.io.*tiles/i,
        name: '自定义地图服务',
        urlFunction: (tileCoord: number[]) => {
            // 假设这个服务的格式是：/map/layer/z/col/row.jpg
            // 其中 col 和 row 需要特殊计算
            const z = tileCoord[0];
            const x = tileCoord[1];
            // 使用标准 XYZ 转换公式
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            const col = x;
            const row = y;
            
            return `https://custom-map.io/tiles/map/layer/${z}/${col}/${row}.jpg`;
        }
    }
};

// ============================================================================
// 示例 3：OpenTopoMap 变体 - 带子域选择
// ============================================================================
const example3_openTopoMapVariant = {
    'opentopomap-variant': {
        pattern: /opentopomap-custom\.io/i,
        name: 'OpenTopoMap 变体',
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            // 某些服务通过子域选择来负载均衡
            const subdomains = ['a', 'b', 'c'];
            const subdomain = subdomains[(x + y) % subdomains.length];
            
            return `https://${subdomain}.opentopomap-custom.io/tiles/${z}/${x}/${y}.png`;
        }
    }
};

// ============================================================================
// 示例 4：查询参数型 - 参数在 URL 中而非路径中
// ============================================================================
const example4_queryParamStyle = {
    'query-param-tiles': {
        pattern: /tileserver\.local.*\?.*query/i,
        name: '参数式切片服务',
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            // 某些服务将瓦片索引作为查询参数
            return `https://tileserver.local/tile?z=${z}&x=${x}&y=${y}&format=png`;
        }
    }
};

// ============================================================================
// 示例 5：复杂坐标转换 - Bing Maps 风格的四叉树编码
// ============================================================================
const example5_quadtreeEncoding = {
    'quadtree-tiles': {
        pattern: /quadtree-service\.io/i,
        name: '四叉树编码服务',
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            // 某些服务（如 Bing）用四叉树编码代替 x/y
            // 这里是简化的实现
            let quadKey = '';
            for (let i = z; i > 0; i--) {
                quadKey += ((x >> (i - 1)) & 1) + (((y >> (i - 1)) & 1) << 1);
            }
            
            return `https://quadtree-service.io/tiles/${quadKey}.png`;
        }
    }
};

// ============================================================================
// 示例 6：多层次路径 - 包含数据集和风格选择
// ============================================================================
const example6_multiLevelPath = {
    'multi-level-tiles': {
        pattern: /geo-server\.org\/api\/tiles/i,
        name: '多层次瓦片服务',
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            // 假设 URL 结构为：/api/tiles/dataset/style/z/x/y.pbf
            // 这里硬编码 dataset 和 style，实际可通过上下文传入
            const dataset = 'osm';
            const style = 'default';
            
            return `https://geo-server.org/api/tiles/${dataset}/${style}/${z}/${x}/${y}.pbf`;
        }
    }
};

// ============================================================================
// 示例 7：时间维度 - 动态气象数据
// ============================================================================
const example7_timeDynamicTiles = {
    'weather-tiles': {
        pattern: /weather-service\.io\/tiles/i,
        name: '天气瓦片服务',
        urlFunction: (tileCoord: number[]) => {
            const z = tileCoord[0];
            const x = tileCoord[1];
            const y = (Math.pow(2, z) - 1) - tileCoord[2];
            
            // 某些气象服务包含时间戳
            // 这里用当前小时的时间戳
            const now = new Date();
            const timestamp = Math.floor(now.getTime() / (3600000)) * 3600000;
            
            return `https://weather-service.io/tiles/${z}/${x}/${y}?time=${timestamp}`;
        }
    }
};

// ============================================================================
// 使用模式：如何集成到项目中
// ============================================================================

/*
1. 在 useBasemapManager.ts 中找到 NON_STANDARD_XYZ_ADAPTERS 常量

2. 按照上述示例添加新的适配器：

export const NON_STANDARD_XYZ_ADAPTERS = {
    'maps-for-free-relief': { ... },
    
    // 添加你的新适配器
    'your-new-format': {
        pattern: /your-pattern/i,
        name: '显示名称',
        urlFunction: (tileCoord) => { ... }
    }
};

3. 框架会自动处理：
   ✓ 自动检测用户输入的 URL
   ✓ 显示"✓ 已识别"提示
   ✓ 在加载时应用转换函数

4. 可选：将新适配器添加到预设（BASEMAP_OPTIONS）中
*/

// ============================================================================
// 坐标系详解
// ============================================================================

/*
OpenLayers 使用内部坐标系统，传入的 tileCoord 格式为：
  tileCoord = [z, x, y]
  
其中：
  - z: 缩放级别（0-n，与标准相同）
  - x: 从西向东的横坐标（与标准相同）
  - y: **OL 内部坐标**，从北到南递增

标准 XYZ Web Mercator 坐标转换：
  standardY = (2^z - 1) - tileCoord[2]
  
原因：OL 的 y 坐标从北到南递增（0在北方），而标准 XYZ 也是这样，
但 OL 内部 tileCoord[2] 需要通过倒置公式转换。

示例（缩放级别 z=10 时，最多有 2^10 = 1024 行）：
  OL tileCoord: [10,  512,     0]  →  标准 y: 1023
  OL tileCoord: [10,  512,   512]  →  标准 y: 512
  OL tileCoord: [10,  512,  1023]  →  标准 y: 0
  
这就是为什么所有非标准格式都有：
  const y = (Math.pow(2, z) - 1) - tileCoord[2];
  
而不是错误的：
  const y = -tileCoord[2] - 1;  // ❌ 这是错的！
*/

// ============================================================================
// 常见错误及解决方案
// ============================================================================

/*
❌ 错误 1：忘记转换 Y 坐标
✅ 正确做法：const y = (Math.pow(2, z) - 1) - tileCoord[2];

❌ 错误 2：正则表达式大小写敏感
✅ 正确做法：pattern: /example\.com/i  // 加 'i' 标志

❌ 错误 3：URL 中没有正确的占位符
✅ 正确做法：检查 URL 中是否有 {z}, {x}, {y} 等

❌ 错误 4：函数返回值不是字符串
✅ 正确做法：确保 urlFunction 总是返回有效的 URL 字符串

❌ 错误 5：CORS 问题
✅ 解决方案：确认图源服务器允许跨域请求
*/

// ============================================================================
// 导出示例集合
// ============================================================================

export const ADAPTER_EXAMPLES = {
    example1_mapsForFreeRelief,
    example2_customMapService,
    example3_openTopoMapVariant,
    example4_queryParamStyle,
    example5_quadtreeEncoding,
    example6_multiLevelPath,
    example7_timeDynamicTiles
};
