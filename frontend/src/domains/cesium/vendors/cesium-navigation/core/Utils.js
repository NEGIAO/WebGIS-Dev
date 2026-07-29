/* eslint-disable no-unused-vars */
import { defined, Ray, Cartesian3, Cartographic, ReferenceFrame, SceneMode } from 'cesium'

var Utils = {}

var unprojectedScratch = null
var rayScratch = null
function getScratch(name) {
    if (name === 'unprojected') {
        if (!unprojectedScratch) unprojectedScratch = new Cartographic()
        return unprojectedScratch
    }
    if (name === 'ray') {
        if (!rayScratch) rayScratch = new Ray()
        return rayScratch
    }
}

/**
 * gets the focus point of the camera
 * @param {Viewer|Widget} terria The terria
 * @param {boolean} inWorldCoordinates true to get the focus in world coordinates, otherwise get it in projection-specific map coordinates, in meters.
 * @param {Cartesian3} [result] The object in which the result will be stored.
 * @return {Cartesian3} The modified result parameter, a new instance if none was provided or undefined if there is no focus point.
 */
Utils.getCameraFocus = function (terria, inWorldCoordinates, result) {
  var scene = terria.scene
  var camera = scene.camera

  if (scene.mode === SceneMode.MORPHING) {
    return undefined
  }

  if (!defined(result)) {
    result = new Cartesian3()
  }

  // TODO bug when tracking: if entity moves the current position should be used and not only the one when starting orbiting/rotating
  // TODO bug when tracking: reset should reset to default view of tracked entity

  if (defined(terria.trackedEntity)) {
    result = terria.trackedEntity.position.getValue(terria.clock.currentTime, result)
  } else {
    // 💡 改动点 1：通过 getScratch('ray') 获取实例后再赋值，避免 null 报错
    var rs = getScratch('ray')
    rs.origin = camera.positionWC
    rs.direction = camera.directionWC
    result = scene.globe.pick(rs, scene, result)
  }

  if (!defined(result)) {
    return undefined
  }

  if (scene.mode === SceneMode.SCENE2D || scene.mode === SceneMode.COLUMBUS_VIEW) {
    result = camera.worldToCameraCoordinatesPoint(result, result)

    if (inWorldCoordinates) {
      // 💡 改动点 2：将 unprojectedScratch 替换为 getScratch('unprojected')
      result = scene.globe.ellipsoid.cartographicToCartesian(scene.mapProjection.unproject(result, getScratch('unprojected')), result)
    }
  } else {
    if (!inWorldCoordinates) {
      result = camera.worldToCameraCoordinatesPoint(result, result)
    }
  }

  return result
}
export default Utils
