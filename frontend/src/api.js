const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')

export async function api(path, options = {}) {
  const token = localStorage.getItem('homely_token')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'The request could not be completed')
  return data
}

export function saveSession(session) {
  localStorage.setItem('homely_token', session.token)
}

export function clearSession() {
  localStorage.removeItem('homely_token')
}

export function hasSession() {
  return Boolean(localStorage.getItem('homely_token'))
}

