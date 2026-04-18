const AUTH_TOKEN_KEY = 'webgis_auth_token'
const AUTH_USER_KEY = 'webgis_auth_user'
const GUEST_DEVICE_ID_KEY = 'webgis_guest_device_id'

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
