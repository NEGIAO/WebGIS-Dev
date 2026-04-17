const AUTH_TOKEN_KEY = 'webgis_auth_token'
const AUTH_USER_KEY = 'webgis_auth_user'

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
})
