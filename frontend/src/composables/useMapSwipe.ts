/**
 * Map Swipe Composable
 * 
 * 功能：
 * - 管理地图对比滑块（Map Swipe/Roller）功能
 * - 使用 OpenLayers Canvas prerender/postrender 事件实现图层裁剪
 * - 支持水平和竖直两种滑动模式
 * - 确保矢量层（SHP、绘图等）始终显示在滑块效果上方
 * 
 * 使用示例：
 *   const { swipePosition, swipeMode, enabled, setSwipeConfig, attachToLayers, detachFromLayers } = useMapSwipe()
 *   
 *   // 附加到指定图层
 *   attachToLayers(mapInstance, [baseMapLayer1, baseMapLayer2])
 *   
 *   // 更新滑块位置（0.0 - 1.0）
 *   swipePosition.value = 0.5
 *   
 *   // 改变模式
 *   swipeMode.value = 'vertical'
 * 
 * 依赖：OpenLayers 6+
 */

import { ref, computed, onUnmounted } from 'vue'

type SwipeMode = 'horizontal' | 'vertical'

interface SwipeConfig {
  enabled: boolean
  position: number
  mode: SwipeMode
}

interface SwipeHandlers {
  prerender: (event: any) => void
  postrender: (event: any) => void
}

type SwipeSide = 'left' | 'right'

interface SwipeLayerDescriptor {
  layer: any
  side?: SwipeSide
}

export function useMapSwipe() {
  // ========== 状态管理 ==========
  const enabled = ref(false)
  const swipePosition = ref(0.5) // 0.05 ~ 0.95
  const swipeMode = ref<SwipeMode>('horizontal')
  const activeMapInstance = ref<any>(null)

  // 存储当前附加的图层和处理器
  const attachedLayers = ref<Array<{ layer: any; handlers: SwipeHandlers }>>([])

  // ========== 计算属性 ==========
  const swipeConfig = computed<SwipeConfig>(() => ({
    enabled: enabled.value,
    position: swipePosition.value,
    mode: swipeMode.value
  }))



  // ========== API：附加图层 ==========
  /**
   * 将滑块效果附加到指定图层。
   * 兼容两种参数形式：
   * 1) 旧格式: [layerA, layerB]，默认首个为左侧，其余为右侧。
   * 2) 新格式: [{ layer, side: 'left'|'right' }, ...]
   */
  function attachToLayers(mapInstance: any, layers: any[]) {
    if (!mapInstance || !Array.isArray(layers)) {
      console.warn('[useMapSwipe] Invalid parameters for attachToLayers')
      return
    }

    activeMapInstance.value = mapInstance

    console.log('[useMapSwipe] attachToLayers called with', layers.length, 'layers');

    // 清除之前的附加
    detachFromLayers()

    console.log('[useMapSwipe] Swipe handlers will be attached by side (left/right)');

    const descriptors: SwipeLayerDescriptor[] = layers
      .map((item, idx): SwipeLayerDescriptor => {
        if (item && typeof item === 'object' && 'layer' in item) {
          const side: SwipeSide = item.side === 'right' ? 'right' : 'left'
          return { layer: item.layer, side }
        }
        const side: SwipeSide = idx === 0 ? 'left' : 'right'
        return { layer: item, side }
      })
      .filter((item) => !!item.layer)

    // 为每个图层附加事件处理器（按 side 分别裁剪）
    descriptors.forEach((descriptor, idx) => {
      const layer = descriptor.layer
      const side: SwipeSide = descriptor.side === 'right' ? 'right' : 'left'

      try {
        console.log('[useMapSwipe] Attaching to layer', idx, ':', layer.get?.('name'), 'side:', side);

        const layerHandlers = createSwipeHandlersForLayer(side)

        layer.on('prerender', layerHandlers.prerender)
        layer.on('postrender', layerHandlers.postrender)

        attachedLayers.value.push({
          layer,
          handlers: layerHandlers
        })
        console.log('[useMapSwipe] Successfully attached to layer', idx, 'side:', side);
      } catch (error) {
        console.warn('[useMapSwipe] Error attaching to layer', idx, ':', error)
      }
    })

    enabled.value = true
    console.log('[useMapSwipe] Swipe enabled with', attachedLayers.value.length, 'attached layers');
  }

  /**
   * 为指定的图层创建Canvas裁剪处理器
  * @param side 图层所属侧：left 或 right
   */
  function createSwipeHandlersForLayer(side: SwipeSide): SwipeHandlers {
    return {
      // prerender 事件：应用 Canvas 裁剪
      prerender(event: any) {
        if (!enabled.value) return

        const ctx = event.context
        if (!ctx) {
          console.warn('[useMapSwipe] prerender: No context');
          return;
        }

        // 获取 Canvas 尺寸
        const canvas = event.context.canvas
        if (!canvas) {
          console.warn('[useMapSwipe] prerender: No canvas');
          return;
        }

        const width = canvas.width
        const height = canvas.height

        // 计算裁剪边界
        let clipX: number, clipY: number, clipWidth: number, clipHeight: number

        const isLeftSide = side === 'left'

        if (swipeMode.value === 'horizontal') {
          if (isLeftSide) {
            // 主图层：显示左侧 (0 ~ swipePosition)
            clipX = 0
            clipY = 0
            clipWidth = width * swipePosition.value
            clipHeight = height
          } else {
            // 对比图层：显示右侧 (swipePosition ~ 100%)
            clipX = width * swipePosition.value
            clipY = 0
            clipWidth = width * (1 - swipePosition.value)
            clipHeight = height
          }
        } else {
          if (isLeftSide) {
            // 主图层：显示顶部 (0 ~ swipePosition)
            clipX = 0
            clipY = 0
            clipWidth = width
            clipHeight = height * swipePosition.value
          } else {
            // 对比图层：显示底部 (swipePosition ~ 100%)
            clipX = 0
            clipY = height * swipePosition.value
            clipWidth = width
            clipHeight = height * (1 - swipePosition.value)
          }
        }

        // 保存当前 Canvas 状态
        ctx.save()

        // 应用矩形裁剪区域
        ctx.beginPath()
        ctx.rect(clipX, clipY, clipWidth, clipHeight)
        ctx.clip()
      },

      // postrender 事件：恢复 Canvas 状态
      postrender(event: any) {
        if (!enabled.value) return

        const ctx = event.context
        if (!ctx) return

        // 恢复 Canvas 状态
        try {
          ctx.restore()
        } catch (error) {
          console.warn('[useMapSwipe] Error restoring Canvas context:', error)
        }
      }
    }
  }

  // ========== API：分离图层 ==========
  /**
   * 从所有附加的图层移除滑块效果
   */
  function detachFromLayers() {
    attachedLayers.value.forEach(({ layer, handlers }) => {
      try {
        layer.un('prerender', handlers.prerender)
        layer.un('postrender', handlers.postrender)
      } catch (error) {
        console.warn('[useMapSwipe] Error detaching from layer:', error)
      }
    })

    attachedLayers.value = []
    enabled.value = false
    activeMapInstance.value = null
  }

  // ========== API：更新配置 ==========
  /**
   * 更新滑块配置
   * @param config 部分或完整的配置对象
   */
  function setSwipeConfig(config: Partial<SwipeConfig>) {
    if (config.enabled !== undefined) {
      enabled.value = config.enabled
    }
    if (config.position !== undefined) {
      swipePosition.value = Math.max(0.05, Math.min(0.95, config.position))
    }
    if (config.mode !== undefined && (config.mode === 'horizontal' || config.mode === 'vertical')) {
      swipeMode.value = config.mode
    }

    if (activeMapInstance.value && typeof activeMapInstance.value.render === 'function') {
      activeMapInstance.value.render()
    }
  }

  // ========== API：更新位置 ==========
  /**
   * 更新滑块位置（会自动重新渲染地图）
   * @param position 新位置 (0.0 ~ 1.0)
   */
  function updateSwipePosition(position: number) {
    swipePosition.value = Math.max(0.05, Math.min(0.95, position))

    // 实时刷新，确保拖动过程中即时更新卷帘裁剪效果
    if (activeMapInstance.value && typeof activeMapInstance.value.render === 'function') {
      activeMapInstance.value.render()
    }
  }

  /**
   * 显式更新卷帘方向（horizontal/vertical）并立即重绘。
   */
  function updateSwipeMode(mode: SwipeMode) {
    if (mode !== 'horizontal' && mode !== 'vertical') return
    swipeMode.value = mode

    if (activeMapInstance.value && typeof activeMapInstance.value.render === 'function') {
      activeMapInstance.value.render()
    }
  }

  // ========== API：切换模式 ==========
  /**
   * 切换滑块模式
   */
  function toggleSwipeMode() {
    swipeMode.value = swipeMode.value === 'horizontal' ? 'vertical' : 'horizontal'

    if (activeMapInstance.value && typeof activeMapInstance.value.render === 'function') {
      activeMapInstance.value.render()
    }
  }

  // ========== 清理 ==========
  onUnmounted(() => {
    detachFromLayers()
  })

  // ========== 导出接口 ==========
  return {
    // 状态
    enabled,
    swipePosition,
    swipeMode,
    swipeConfig,

    // API
    attachToLayers,
    detachFromLayers,
    setSwipeConfig,
    updateSwipePosition,
    updateSwipeMode,
    toggleSwipeMode
  }
}
