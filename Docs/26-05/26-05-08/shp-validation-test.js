/**
 * SHP/DBF 属性解析验证脚本
 * 用于测试真实用户数据（c:\Users\NEGIAO\Desktop\aaa\）
 * 
 * 使用方式：
 * 1. 在浏览器控制台中粘贴此脚本
 * 2. 上传 c:\Users\NEGIAO\Desktop\aaa\ 中的 SHP 文件
 * 3. 查看控制台输出，验证属性是否正确解析
 */

// ============================================================================
// 测试辅助函数
// ============================================================================

const ShpTestSuite = {
    /**
     * 验证 DBF 数据解析结果
     */
    validateDbfParsing(dbfData) {\n        const { header, fields, records, encoding, warnings } = dbfData;

        console.group('📋 DBF 数据验证报告');

        // 1. 文件头信息
        console.group('文件头信息');
        console.log(`版本: 0x${header.version.toString(16).toUpperCase()}`);
        console.log(`最后更新: ${header.lastUpdate.toISOString().split('T')[0]}`);
        console.log(`记录总数: ${header.recordCount}`);
        console.log(`文件头长度: ${header.headerLength} 字节`);
        console.log(`单条记录长度: ${header.recordLength} 字节`);
        console.groupEnd();

        // 2. 字段信息
        console.group(`字段定义 (${fields.length} 个)`);
        fields.forEach((field, idx) => {
            console.log(
                `${idx + 1}. ${field.name.padEnd(12)} | ` +
                `类型: ${field.type} | ` +
                `长度: ${field.length} | ` +
                `小数: ${field.decimals}`
            );
        });
        console.groupEnd();

        // 3. 记录统计
        console.group('记录统计');
        console.log(`✓ 有效记录: ${records.length}`);
        console.log(`编码: ${encoding}`);
        console.log(`警告数: ${warnings.length}`);
        if (warnings.length > 0) {
            warnings.forEach((w, i) => {
                console.warn(`  ${i + 1}. ${w}`);
            });
        }
        console.groupEnd();

        // 4. 样本数据
        if (records.length > 0) {
            console.group('样本数据 (前 3 条)');
            records.slice(0, 3).forEach((record, idx) => {
                console.group(`记录 ${idx + 1}`);
                Object.entries(record.values).forEach(([key, value]) => {
                    const displayValue = typeof value === 'string' && value.length > 50
                        ? value.substring(0, 50) + '...'
                        : value;
                    console.log(`  ${key}: ${displayValue}`);
                });
                console.groupEnd();
            });
            console.groupEnd();
        }

        console.groupEnd();

        return {
            success: records.length > 0 && fields.length > 0,
            recordCount: records.length,
            fieldCount: fields.length,
            encoding,
            warnings: warnings.length,
        };
    },

    /**
     * 验证 GeoJSON 特征属性
     */
    validateGeoJsonFeatures(geojson) {
        const { features } = geojson;

        console.group('🗺️ GeoJSON 特征属性验证');

        if (!features || features.length === 0) {
            console.error('❌ 无 features，GeoJSON 数据为空');
            console.groupEnd();
            return { success: false, featureCount: 0, fieldsPerFeature: 0 };
        }

        const firstFeature = features[0];
        const propCount = Object.keys(firstFeature.properties || {}).length;

        console.log(`📊 特征总数: ${features.length}`);
        console.log(`📝 首个特征的属性数: ${propCount}`);

        // 检查是否有 DBF 相关元数据
        const hasDbfMetadata = '_dbf_fields' in (firstFeature.properties || {});
        console.log(`${hasDbfMetadata ? '✓' : '✗'} DBF 属性增强: ${hasDbfMetadata ? '是' : '否'}`);

        if (hasDbfMetadata) {
            const dbfFields = firstFeature.properties._dbf_fields || [];
            const dbfEncoding = firstFeature.properties._dbf_encoding || '未知';
            console.group('DBF 增强信息');
            console.log(`字段列表: ${dbfFields.join(', ')}`);
            console.log(`编码: ${dbfEncoding}`);
            console.groupEnd();
        }

        // 样本属性值
        if (propCount > 0) {
            console.group('样本属性值 (前 5 个字段)');
            Object.entries(firstFeature.properties)
                .filter(([key]) => !key.startsWith('_'))
                .slice(0, 5)
                .forEach(([key, value]) => {
                    const displayValue = typeof value === 'string' && value.length > 50
                        ? value.substring(0, 50) + '...'
                        : value;
                    console.log(`  ${key}: ${displayValue}`);
                });
            console.groupEnd();
        }

        console.groupEnd();

        return {
            success: features.length > 0 && propCount > 0,
            featureCount: features.length,
            fieldsPerFeature: propCount,
            hasDbfMetadata,
        };
    },

    /**
     * 综合验证报告
     */
    generateSummaryReport(dbfResult, geoJsonResult) {
        console.log('\\n' + '='.repeat(80));
        console.group('📈 综合验证报告');

        const checks = [
            {
                name: 'DBF 文件解析',
                passed: dbfResult.success,
                detail: `${dbfResult.recordCount} 条记录, ${dbfResult.fieldCount} 个字段`
            },
            {
                name: 'GeoJSON 特征加载',
                passed: geoJsonResult.success,
                detail: `${geoJsonResult.featureCount} 个特征`
            },
            {
                name: '属性数据关联',
                passed: geoJsonResult.hasDbfMetadata,
                detail: geoJsonResult.hasDbfMetadata ? '✓ 已关联' : '✗ 未关联'
            },
            {
                name: '属性完整性',
                passed: geoJsonResult.fieldsPerFeature > 5,
                detail: `${geoJsonResult.fieldsPerFeature} 个字段`
            },
            {
                name: '编码处理',
                passed: dbfResult.encoding !== '未知',
                detail: `检测到: ${dbfResult.encoding}`
            },
        ];

        checks.forEach(check => {
            const icon = check.passed ? '✓' : '✗';
            const color = check.passed ? 'color: green' : 'color: red';
            console.log(
                `%c${icon}%c ${check.name.padEnd(16)} ${check.detail}`,
                color,
                'color: black'
            );
        });

        const allPassed = checks.every(c => c.passed);
        console.log('\\n' + (allPassed ? '✓ 所有检查通过！' : '⚠ 部分检查未通过，请检查上方日志'));

        console.groupEnd();
        console.log('='.repeat(80) + '\\n');

        return allPassed;
    }
};

/**
 * 主测试函数 - 在控制台调用
 * 
 * 使用示例：
 * 1. 打开浏览器控制台
 * 2. 上传 SHP 文件
 * 3. 输入: ShpTestSuite.runFullTest()
 */
ShpTestSuite.runFullTest = function() {
    console.log('\\n🧪 SHP/DBF 属性解析测试开始...\\n');

    // 监听导入完成的事件或检查已加载的数据
    // 这取决于你的应用架构，可能需要调整
    
    // 示例：检查是否存在已导入的 features
    console.log('%c提示: 请先在 UI 中上传 SHP 文件，然后运行此命令', 'color: blue');
    console.log('%cShpTestSuite.validateImportedData()', 'color: green; font-weight: bold');
};

/**
 * 验证已导入的数据（在 features 加载后调用）
 */
ShpTestSuite.validateImportedData = function(features) {
    if (!features || features.length === 0) {
        console.error('❌ 未找到任何已导入的特征');
        return;
    }

    console.log(`\\n🧪 验证 ${features.length} 个已导入的特征...\\n`);

    // 验证属性
    const firstFeature = features[0];
    const propCount = Object.keys(firstFeature.getProperties && firstFeature.getProperties() || firstFeature.properties || {}).length;

    const result = {
        featureCount: features.length,
        hasProperties: propCount > 0,
        propertySample: {},
    };

    if (firstFeature.getProperties) {
        // OpenLayers Feature
        result.propertySample = firstFeature.getProperties();
    } else if (firstFeature.properties) {
        // 直接 GeoJSON Feature
        result.propertySample = firstFeature.properties;
    }

    console.group('验证结果');
    console.log(`✓ 特征总数: ${result.featureCount}`);
    console.log(`✓ 属性字段数: ${Object.keys(result.propertySample).length}`);
    console.group('属性样本（前 10 个）');
    Object.entries(result.propertySample)
        .slice(0, 10)
        .forEach(([key, value]) => {
            const val = typeof value === 'string' && value.length > 50
                ? value.substring(0, 50) + '...'
                : value;
            console.log(`  ${key}: ${val}`);
        });
    console.groupEnd();
    console.groupEnd();

    return result;
};

console.log('%c✅ SHP/DBF 测试套件已加载', 'color: green; font-size: 16px; font-weight: bold');
console.log('%c📖 使用说明:\\n' +
    '1. 上传 SHP 文件\\n' +
    '2. 运行: ShpTestSuite.validateImportedData(features)\\n' +
    '   其中 features 是你的已导入特征数组',
    'color: blue'
);
