/**
 * Map Swipe Testing Composable
 * 
 * 功能：
 * - 为开发和测试提供便利函数，快速激活地图对比滑块功能
 * - 支持配置双底图对比场景
 * - 用于验证网络请求和性能指标
 * 
 * 使用示例：
 *   const { setupDualBasemapSwipe, testSwipePerformance } = useMapSwipeTest()
 *   setupDualBasemapSwipe(mapInstance, layerStore, [leftBaseMapId, rightBaseMapId])
 */

export function useMapSwipeTest() {
  /**
   * 设置双底图对比滑块
   * @param mapInstance OpenLayers Map 实例
   * @param layerStore Pinia 图层状态管理
   * @param baseMapIds 底图图层 ID 数组 [leftBaseMapId, rightBaseMapId]
   */
  function setupDualBasemapSwipe(mapInstance, layerStore, baseMapIds = []) {
    if (!mapInstance || !layerStore) {
      console.warn('[useMapSwipeTest] Missing required parameters')
      return false
    }

    try {
      // 启用滑块功能
      layerStore.enableSwipe(baseMapIds)
      
      // 设置初始位置为中间
      layerStore.updateSwipePosition(0.5)
      
      // 设置为水平模式
      layerStore.updateSwipeMode('horizontal')

      console.log('[useMapSwipeTest] Dual basemap swipe setup completed')
      console.log('[useMapSwipeTest] Network requests should now be visible in DevTools Network tab')
      
      return true
    } catch (error) {
      console.error('[useMapSwipeTest] Setup failed:', error)
      return false
    }
  }

  /**
   * 测试滑块性能
   * 对滑块进行多次移动，记录性能指标
   */
  function testSwipePerformance(layerStore, iterations = 10) {
    if (!layerStore) {
      console.warn('[useMapSwipeTest] Missing layerStore')
      return null
    }

    const positions = []
    const startTime = performance.now()

    // 从 0 移动到 1
    for (let i = 0; i <= iterations; i++) {
      const position = i / iterations
      layerStore.updateSwipePosition(position)
      positions.push(position)
    }

    // 从 1 移动回 0
    for (let i = iterations; i >= 0; i--) {
      const position = i / iterations
      layerStore.updateSwipePosition(position)
      positions.push(position)
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    const metrics = {
      iterations,
      totalMoves: positions.length,
      duration: `${duration.toFixed(2)}ms`,
      averageTimePerMove: `${(duration / positions.length).toFixed(2)}ms`,
      fps: `${(positions.length / (duration / 1000)).toFixed(2)}`
    }

    console.log('[useMapSwipeTest] Performance metrics:', metrics)
    return metrics
  }

  /**
   * 切换滑块模式并测试
   */
  function testModeToggling(layerStore, toggleCount = 5) {
    if (!layerStore) {
      console.warn('[useMapSwipeTest] Missing layerStore')
      return null
    }

    const startTime = performance.now()
    let currentMode = 'horizontal'

    for (let i = 0; i < toggleCount; i++) {
      currentMode = currentMode === 'horizontal' ? 'vertical' : 'horizontal'
      layerStore.updateSwipeMode(currentMode)
    }

    const endTime = performance.now()
    const duration = endTime - startTime

    console.log(`[useMapSwipeTest] Mode toggle test completed: ${toggleCount} toggles in ${duration.toFixed(2)}ms`)
    return {
      toggles: toggleCount,
      duration: `${duration.toFixed(2)}ms`,
      averageTimePerToggle: `${(duration / toggleCount).toFixed(2)}ms`
    }
  }

  /**
   * 监控网络请求
   * 帮助验证双底图的网络请求
   */
  function monitorNetworkRequests(callback) {
    if (typeof window === 'undefined') {
      console.warn('[useMapSwipeTest] Not in browser environment')
      return
    }

    // 使用 PerformanceObserver 监控网络请求
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          entries.forEach((entry) => {
            if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
              const details = {
                name: entry.name,
                type: entry.initiatorType,
                duration: entry.duration.toFixed(2),
                timestamp: entry.startTime.toFixed(2)
              }
              console.log('[useMapSwipeTest] Network request:', details)
              callback?.(details)
            }
          })
        })
        observer.observe({ entryTypes: ['resource'] })
        return observer
      } catch (error) {
        console.warn('[useMapSwipeTest] PerformanceObserver not supported:', error)
        return null
      }
    }
  }

  /**
   * 打印调试信息
   */
  function printDebugInfo(mapInstance, layerStore) {
    if (!mapInstance || !layerStore) {
      console.warn('[useMapSwipeTest] Missing parameters')
      return
    }

    const swipeConfig = layerStore.swipeConfig
    const baseLayers = []
    
    mapInstance.getLayers().forEach((layer) => {
      const source = layer.getSource?.()
      if (source && typeof source.getTile === 'function') {
        baseLayers.push({
          name: layer.get('name'),
          visible: layer.getVisible?.()
        })
      }
    })

    console.group('[useMapSwipeTest] Debug Info')
    console.log('Swipe Configuration:', swipeConfig)
    console.log('Base Layers:', baseLayers)
    console.log('Map View:', {
      zoom: mapInstance.getView?.()?.getZoom?.(),
      center: mapInstance.getView?.()?.getCenter?.()
    })
    console.groupEnd()
  }

  return {
    setupDualBasemapSwipe,
    testSwipePerformance,
    testModeToggling,
    monitorNetworkRequests,
    printDebugInfo
  }
}
