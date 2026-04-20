const AUTH_TOKEN_KEY = 'webgis_auth_token'
const AUTH_USER_KEY = 'webgis_auth_user'
const GUEST_DEVICE_ID_KEY = 'webgis_guest_device_id'
const PENDING_POSITION_CODE_KEY = 'webgis_pending_position_code'

function normalizeBinaryFlag(value, fallback = '0') {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === '1' || raw === 'true') return '1'
  if (raw === '0' || raw === 'false') return '0'
  return fallback === '1' ? '1' : '0'
}

function readUrlParams() {
  if (typeof window === 'undefined') {
    return {
      hashParams: new URLSearchParams(),
      searchParams: new URLSearchParams()
    }
  }

  const hash = String(window.location.hash || '')
  const queryStart = hash.indexOf('?')
  const hashParams = queryStart >= 0
    ? new URLSearchParams(hash.slice(queryStart + 1))
    : new URLSearchParams()
  const searchParams = new URLSearchParams(String(window.location.search || '').replace(/^\?/, ''))

  return { hashParams, searchParams }
}

function getStorage() {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function getAuthToken() {
  const storage = getStorage()
  if (!storage) return ''
  return String(storage.getItem(AUTH_TOKEN_KEY) || '').trim()
}

export function getAuthUser() {
  const storage = getStorage()
  if (!storage) return null

  const raw = storage.getItem(AUTH_USER_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    storage.removeItem(AUTH_USER_KEY)
    return null
  }
}

export function setAuthSession(payload = {}) {
  const storage = getStorage()
  if (!storage) return

  const token = String(payload?.token || '').trim()
  const user = payload?.user || null

  if (!token || !user) {
    clearAuthSession()
    return
  }

  storage.setItem(AUTH_TOKEN_KEY, token)
  storage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function clearAuthSession() {
  const storage = getStorage()
  if (!storage) return

  storage.removeItem(AUTH_TOKEN_KEY)
  storage.removeItem(AUTH_USER_KEY)
}

export function isAuthenticated() {
  return !!getAuthToken()
}

export const AUTH_STORAGE_KEYS = Object.freeze({
  token: AUTH_TOKEN_KEY,
  user: AUTH_USER_KEY,
  guestDeviceId: GUEST_DEVICE_ID_KEY,
})

function randomGuestDeviceSeed() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

function normalizeGuestDeviceId(rawValue) {
  const compact = String(rawValue || '').trim().replace(/[^A-Za-z0-9_.:-]/g, '')
  if (compact.length < 6) return ''
  return compact.slice(0, 128)
}

export function getGuestDeviceId() {
  const storage = getStorage()
  if (!storage) return ''
  return normalizeGuestDeviceId(storage.getItem(GUEST_DEVICE_ID_KEY) || '')
}

export function getOrCreateGuestDeviceId() {
  const storage = getStorage()
  if (!storage) return ''

  const existing = getGuestDeviceId()
  if (existing) return existing

  const generated = normalizeGuestDeviceId(`gd_${randomGuestDeviceSeed()}`)
  if (!generated) return ''

  storage.setItem(GUEST_DEVICE_ID_KEY, generated)
  return generated
}

export function readShareModeFromUrl() {
  const { hashParams, searchParams } = readUrlParams()
  const raw = hashParams.get('s') ?? searchParams.get('s')
  return normalizeBinaryFlag(raw, '0') === '1'
}

export function readPositionCodeFromUrl() {
  const { hashParams, searchParams } = readUrlParams()
  const code = String(hashParams.get('p') ?? searchParams.get('p') ?? '').trim()
  return code
}

export function persistPositionCode(code) {
  const storage = getStorage()
  if (!storage) return ''

  const normalized = String(code || '').trim()
  if (!normalized) {
    storage.removeItem(PENDING_POSITION_CODE_KEY)
    return ''
  }

  storage.setItem(PENDING_POSITION_CODE_KEY, normalized)
  return normalized
}

export function persistPositionCodeFromUrl() {
  const code = readPositionCodeFromUrl()
  return persistPositionCode(code)
}

export function peekPersistedPositionCode() {
  const storage = getStorage()
  if (!storage) return ''
  return String(storage.getItem(PENDING_POSITION_CODE_KEY) || '').trim()
}

export function consumePersistedPositionCode() {
  const storage = getStorage()
  if (!storage) return ''

  const code = String(storage.getItem(PENDING_POSITION_CODE_KEY) || '').trim()
  storage.removeItem(PENDING_POSITION_CODE_KEY)
  return code
}

export function injectPositionCodeToPath(path = '/home', code = '') {
  const normalizedPath = String(path || '/home').trim()
  const safePath = normalizedPath.startsWith('/') ? normalizedPath : '/home'

  const [pathnameRaw, queryRaw = ''] = safePath.split('?')
  const pathname = pathnameRaw || '/home'
  const params = new URLSearchParams(queryRaw)

  const normalizedCode = String(code || '').trim()
  if (normalizedCode && !String(params.get('p') || '').trim()) {
    params.set('p', normalizedCode)
    if (normalizedCode !== '0' && !String(params.get('loc') || '').trim()) {
      params.set('loc', '1')
    }
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

// ============ Share Mode 访客令牌注入 ============

/**
 * 为分享模式注入访客令牌（临时）
 * 仅在 s=1 时调用，会生成临时访客凭证并存储
 * 
 * @returns {boolean} 是否成功注入（true 表示已注入访客令牌）
 */
export function injectGuestTokenForShareMode() {
  try {
    // 1. 生成或获取访客设备 ID
    const guestDeviceId = getOrCreateGuestDeviceId()
    if (!guestDeviceId) {
      console.warn('[Auth] Failed to create guest device ID')
      return false
    }

    // 2. 构造临时访客令牌（格式：guest_<timestamp>_<deviceId>）
    const timestamp = Date.now()
    const guestToken = `guest_${timestamp}_${guestDeviceId}`

    // 3. 构造访客用户对象
    const guestUser = {
      username: 'Guest',
      role: 'visitor',
      guest_uid: guestDeviceId,
      guest_token: guestToken,
      created_at: new Date().toISOString()
    }

    // 4. 注入到认证存储中
    setAuthSession({
      token: guestToken,
      user: guestUser
    })

    console.info('[Auth] Guest token injected for share mode', {
      guestDeviceId,
      timestamp,
      user: guestUser.username
    })

    return true
  } catch (error) {
    console.error('[Auth] Failed to inject guest token:', error)
    return false
  }
}

/**
 * 检查当前会话是否是访客身份
 * @returns {boolean}
 */
export function isGuestSession() {
  const user = getAuthUser()
  return user?.role === 'visitor' || user?.guest_uid !== undefined
}

/**
 * 获取当前访客会话的元数据
 * @returns {Object|null} {guestDeviceId, guestToken, createdAt} 或 null
 */
export function getGuestSessionMetadata() {
  if (!isGuestSession()) return null

  const user = getAuthUser()
  const token = getAuthToken()

  return {
    guestDeviceId: user?.guest_uid || '',
    guestToken: token,
    createdAt: user?.created_at || '',
    username: user?.username || 'Unknown'
  }
}
