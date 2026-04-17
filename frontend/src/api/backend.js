/**
 * 后端 API 客户端
 * 
 * 此文件提供与后端 FastAPI 服务通信的客户端
 * 支持本地开发和生产环境切换
 * 
 * 环境变量：
 *   - VITE_BACKEND_URL: 后端 API 地址
 *     本地开发: http://localhost:8000
 *     生产环境: https://negiao-webgis.hf.space
 */

import axios from 'axios'

// 获取后端 URL，优先使用环境变量，否则使用默认值
const backendURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

console.log('[Backend API Client] 后端 URL:', backendURL)

/**
 * 后端 API 客户端实例
 * 自动处理请求/响应拦截
 */
const backendAPI = axios.create({
  baseURL: backendURL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json'
  }
})

/**
 * 请求拦截器
 * 用于添加全局请求头、认证信息等
 */
backendAPI.interceptors.request.use(
  config => {
    // 可以在这里添加认证令牌等
    // if (auth.token) {
    //   config.headers.Authorization = `Bearer ${auth.token}`
    // }
    return config
  },
  error => {
    console.error('[Backend API] 请求错误:', error)
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * 统一处理响应格式和错误
 */
backendAPI.interceptors.response.use(
  response => {
    // 返回数据中的 data 字段
    const { data } = response
    
    // 检查是否是统一的 API 响应格式
    if (data && typeof data === 'object' && 'code' in data) {
      if (data.code === 200) {
        // 成功响应
        return data.data || data
      } else {
        // 错误响应
        const error = new Error(data.message || '请求失败')
        error.code = data.code
        error.data = data
        return Promise.reject(error)
      }
    }
    
    // 返回原始数据
    return data
  },
  error => {
    // 处理网络错误、超时等
    let message = '请求失败'
    
    if (error.response) {
      // 服务器响应错误
      const { status, data } = error.response
      message = data?.message || `服务器错误 (${status})`
    } else if (error.request) {
      // 请求已发出但没有收到响应
      message = '无法连接到后端服务器，请检查网络连接'
    } else {
      // 其他错误
      message = error.message || '未知错误'
    }
    
    console.error('[Backend API] 响应错误:', message, error)
    
    const apiError = new Error(message)
    apiError.originalError = error
    return Promise.reject(apiError)
  }
)

/**
 * 导出 API 客户端实例
 * 使用方式:
 * import backendAPI from '@/api/backend'
 * const result = await backendAPI.post('/api/v1/geocoding/encode', { address })
 */
export default backendAPI

/**
 * 便捷方法集合
 * 使用这些方法可以更简洁地调用后端 API
 */

/**
 * 地理编码 - 地址→坐标
 * @param {string} address - 地址
 * @param {string} city - 城市（可选）
 * @returns {Promise<{lng, lat, address, adcode}>}
 */
export async function apiGeocode(address, city = '') {
  return backendAPI.post('/api/v1/geocoding/encode', { address, city })
}

/**
 * 反向地理编码 - 坐标→地址
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {Promise<{address, province, city, district, adcode}>}
 */
export async function apiReverseGeocode(lng, lat) {
  return backendAPI.post('/api/v1/geocoding/reverse', { lng, lat })
}

/**
 * 获取实时天气
 * @param {string} adcode - 行政区代码
 * @returns {Promise<{weather, temperature, windDirection, windPower, humidity}>}
 */
export async function apiGetWeatherCurrent(adcode) {
  return backendAPI.get('/api/v1/weather/current', { params: { adcode } })
}

/**
 * 获取天气预报
 * @param {string} adcode - 行政区代码
 * @param {number} days - 天数（默认7天）
 * @returns {Promise<Array>}
 */
export async function apiGetWeatherForecast(adcode, days = 7) {
  return backendAPI.get('/api/v1/weather/forecast', {
    params: { adcode, days }
  })
}

/**
 * 地名搜索
 * @param {string} keywords - 搜索关键词
 * @param {string} region - 区域（可选）
 * @param {string} service - 服务商（可选: auto|amap|tianditu|nominatim）
 * @returns {Promise<Array>}
 */
export async function apiSearchLocations(keywords, region = '', service = 'auto') {
  return backendAPI.get('/api/v1/search/locations', {
    params: { keywords, region, service }
  })
}

/**
 * 搜索建议
 * @param {string} keywords - 搜索关键词
 * @param {string} city - 城市（可选）
 * @returns {Promise<Array>}
 */
export async function apiSearchSuggest(keywords, city = '') {
  return backendAPI.get('/api/v1/search/suggest', {
    params: { keywords, city }
  })
}

/**
 * IP 定位
 * @param {string} ip - IP 地址（可选，不提供则使用请求 IP）
 * @returns {Promise<{ip, city, province, adcode, lng, lat}>}
 */
export async function apiGetLocationFromIP(ip = '') {
  return backendAPI.get('/api/v1/location/ip', {
    params: ip ? { ip } : {}
  })
}

/**
 * 驾车路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @param {Array} waypoints - 途经点（可选）
 * @param {string} strategy - 策略（可选）
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanDrivingRoute(origin, destination, waypoints = [], strategy = '') {
  return backendAPI.post('/api/v1/routes/driving', {
    origin,
    destination,
    waypoints,
    strategy
  })
}

/**
 * 公交路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{transit_lines}>}
 */
export async function apiPlanTransitRoute(origin, destination) {
  return backendAPI.post('/api/v1/routes/transit', {
    origin,
    destination
  })
}

/**
 * 步行路线规划
 * @param {Array} origin - 起点 [lng, lat]
 * @param {Array} destination - 终点 [lng, lat]
 * @returns {Promise<{distance, duration, steps}>}
 */
export async function apiPlanWalkingRoute(origin, destination) {
  return backendAPI.post('/api/v1/routes/walking', {
    origin,
    destination
  })
}
