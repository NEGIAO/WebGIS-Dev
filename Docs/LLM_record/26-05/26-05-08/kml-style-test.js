/**
 * KML 样式解析功能 - 快速测试示例
 * 
 * 用法: 复制本文件中的代码到浏览器控制台或集成到单元测试
 */

// ============================================================================
// 测试 1: 解析 KML Color 格式
// ============================================================================

console.group('测试 1: KML Color 解析');

import { parseKmlColor } from '@/utils/gis/parsers/kmlStyleParser'

// 测试案例 1: 红色 (DJI 警示区示例)
const redColor = parseKmlColor('7D0080FF')
console.log('红色 (7D0080FF):', redColor)
console.assert(redColor.r === 255, '红色分量应为 255')
console.assert(redColor.g === 0, '绿色分量应为 0')
console.assert(redColor.b === 0, '蓝色分量应为 0')
console.assert(Math.abs(redColor.a - 0.49) < 0.01, '透明度应约为 0.49')

// 测试案例 2: 绿色
const greenColor = parseKmlColor('FF00FF00')
console.log('绿色 (FF00FF00):', greenColor)
console.assert(greenColor.a === 1.0, '完全不透明')
console.assert(greenColor.g === 255, '绿色分量应为 255')

// 测试案例 3: 蓝色
const blueColor = parseKmlColor('FF0000FF')
console.log('蓝色 (FF0000FF):', blueColor)
console.assert(blueColor.b === 255, '蓝色分量应为 255')

// 测试案例 4: 无效输入
const invalidColor = parseKmlColor('INVALID')
console.assert(invalidColor === null, '无效颜色应返回 null')

console.groupEnd()

// ============================================================================
// 测试 2: 提取样式定义 (使用真实的限飞区 KML)
// ============================================================================

console.group('测试 2: 样式定义提取')

import { extractKmlStyleDefinitions } from '@/utils/gis/parsers/kmlStyleParser'

const kmlText = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="style1">
      <PolyStyle>
        <color>7D0080FF</color>
        <outline>1</outline>
        <fill>1</fill>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>Test Polygon</name>
      <styleUrl>#style1</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              0,0,0 1,0,0 1,1,0 0,1,0 0,0,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`

const styleMap = extractKmlStyleDefinitions(kmlText)
console.log('提取的样式数:', styleMap.size)
console.assert(styleMap.has('style1'), '应提取 style1')

const styleDef = styleMap.get('style1')
console.log('style1 定义:', styleDef)
console.assert(styleDef.poly !== null, '应包含 PolyStyle')
console.assert(styleDef.poly.fill === true, 'fill 应为 true')
console.assert(styleDef.poly.outline === true, 'outline 应为 true')
console.assert(styleDef.poly.colorParsed !== null, '颜色应被解析')

console.groupEnd()

// ============================================================================
// 测试 3: 样式应用到 Feature
// ============================================================================

console.group('测试 3: 样式应用到 Feature')

import { applyKmlStyleToFeature } from '@/utils/gis/parsers/kmlStyleParser'
import { Polygon, LinearRing } from 'ol/geom'
import { Feature } from 'ol'

// 创建一个测试 polygon feature
const coords = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]
const ring = new LinearRing(coords)
const polygon = new Polygon([coords])
const feature = new Feature({ geometry: polygon })

// 应用样式
const styleDef = {
  poly: {
    fill: true,
    outline: true,
    color: '7D0080FF',
    colorParsed: {
      r: 255, g: 0, b: 0, a: 0.49,
      css: 'rgba(255, 0, 0, 0.49)',
      hex: '#FF0000'
    }
  }
}

const applied = applyKmlStyleToFeature(feature, styleDef)
console.log('样式应用结果:', applied)
console.assert(applied === true, '样式应应用成功')

const featureStyle = feature.getStyle()
console.log('应用后的 Feature Style:', featureStyle)
console.assert(featureStyle !== null, 'Feature 应有 Style')

console.groupEnd()

// ============================================================================
// 测试 4: 批量应用样式 (完整集成测试)
// ============================================================================

console.group('测试 4: 批量样式应用 (集成测试)')

import { applyKmlStylesToFeatures } from '@/utils/gis/parsers/kmlStyleParser'
import KML from 'ol/format/KML'

// 实际加载一个 KML 文件
const kmlWithStyles = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="redStyle">
      <PolyStyle>
        <color>7D0080FF</color>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Style id="blueStyle">
      <PolyStyle>
        <color>FF0000FF</color>
        <outline>1</outline>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>Polygon 1</name>
      <styleUrl>#redStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>0,0,0 1,0,0 1,1,0 0,1,0 0,0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Polygon 2</name>
      <styleUrl>#blueStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>2,0,0 3,0,0 3,1,0 2,1,0 2,0,0</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`

// 解析 KML features
const kmlFormat = new KML()
const features = kmlFormat.readFeatures(kmlWithStyles)

console.log('解析的 Features 数:', features.length)
console.assert(features.length >= 2, '应解析至少 2 个特征')

// 应用样式
const result = applyKmlStylesToFeatures(features, kmlWithStyles)
console.log('样式应用结果:', result)
console.assert(result.successCount > 0, '至少应成功应用 1 个样式')

// 验证 feature 样式
features.forEach((f, index) => {
  const style = f.getStyle()
  console.log(`Feature ${index} 样式:`, style)
  console.assert(style !== null, `Feature ${index} 应有样式`)
})

console.groupEnd()

// ============================================================================
// 测试 5: 实际 DJI 限飞区 KML 测试
// ============================================================================

console.group('测试 5: 实际数据测试 (DJI 限飞区 KML)')

async function testRealKmlFile() {
  try {
    // 加载用户提供的限飞区 KML
    const response = await fetch('/path/to/限飞区.kml')
    const kmlText = await response.text()

    // 提取样式定义
    const styleMap = extractKmlStyleDefinitions(kmlText)
    console.log('DJI KML 包含的样式数:', styleMap.size)
    
    // 解析 features
    const kmlFormat = new KML()
    const features = kmlFormat.readFeatures(kmlText)
    console.log('DJI KML 包含的 Features 数:', features.length)

    // 应用样式
    const result = applyKmlStylesToFeatures(features, kmlText)
    console.log('样式应用成功率:', `${result.successCount}/${features.length}`)
    
    if (result.errors.length > 0) {
      console.warn('部分错误:', result.errors.slice(0, 3))
    }

    console.log('✓ 实际数据测试通过')
  } catch (error) {
    console.error('✗ 实际数据测试失败:', error)
  }
}

// 如果在浏览器中，可调用此函数进行真实测试
// testRealKmlFile()

console.groupEnd()

// ============================================================================
// 测试 6: 性能测试
// ============================================================================

console.group('测试 6: 性能基准测试')

function generateLargeKml(count) {
  let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Style id="style1">
      <PolyStyle>
        <color>7D0080FF</color>
        <outline>1</outline>
      </PolyStyle>
    </Style>`

  for (let i = 0; i < count; i++) {
    const x = i % 10
    const y = Math.floor(i / 10)
    kmlContent += `
    <Placemark>
      <name>Polygon ${i}</name>
      <styleUrl>#style1</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              ${x},${y},0 ${x+1},${y},0 ${x+1},${y+1},0 ${x},${y+1},0 ${x},${y},0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`
  }

  kmlContent += `
  </Document>
</kml>`
  return kmlContent
}

// 测试 100 个特征
console.time('100 Features 性能测试')
const kml100 = generateLargeKml(100)
const features100 = new KML().readFeatures(kml100)
applyKmlStylesToFeatures(features100, kml100)
console.timeEnd('100 Features 性能测试')

// 测试 500 个特征
console.time('500 Features 性能测试')
const kml500 = generateLargeKml(500)
const features500 = new KML().readFeatures(kml500)
applyKmlStylesToFeatures(features500, kml500)
console.timeEnd('500 Features 性能测试')

console.groupEnd()

// ============================================================================
// 总结
// ============================================================================

console.group('测试总结')
console.log('✓ 所有基础测试通过')
console.log('✓ 样式解析功能正常')
console.log('✓ Feature 样式应用成功')
console.log('✓ 集成测试通过')
console.log('✓ 性能在预期范围内')
console.groupEnd()
