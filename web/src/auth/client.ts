let csrfToken = ''

export class AuthAPIError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message)
    this.name = 'AuthAPIError'
  }
}

export function setCSRFToken(value: string) { csrfToken = value }
export function getCSRFToken() { return csrfToken }

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(input, {...init, headers, credentials: 'same-origin'})
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as {error?: {code?: string; message?: string; details?: unknown}}
    throw new AuthAPIError(response.status, payload.error?.code ?? 'request_failed', payload.error?.message ?? `请求失败 (${response.status})`, payload.error?.details)
  }
  return response
}

export async function json<T>(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await authFetch(input, init)
  if (response.status === 204) return undefined as T
  return await response.json() as T
}
