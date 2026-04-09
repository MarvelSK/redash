import type { DashboardsMap, StoreConfig } from '../types'

const API_PREFIX = (import.meta.env.VITE_REDASH_PROXY_PATH as string | undefined) || '/redash-api'

export interface PublicEmbedConfig {
  dashboards: DashboardsMap
  stores: StoreConfig[]
  homeDashboardSlug: string
}

export interface AdminEmbedConfig extends PublicEmbedConfig {
  adminCode: string
}

export interface AccessVerifyResponse {
  role: 'admin' | 'store'
  storeId?: string
}

export interface AccessSessionResponse {
  role: 'admin' | 'store' | null
  storeId?: string
}

function buildUrl(path: string): string {
  return `${API_PREFIX}${path}`
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

export async function loadPublicEmbedConfig(): Promise<PublicEmbedConfig> {
  const response = await fetch(buildUrl('/api/embed/config'))
  return parseResponse<PublicEmbedConfig>(response)
}

export async function loadAdminEmbedConfig(): Promise<AdminEmbedConfig> {
  const response = await fetch(buildUrl('/api/embed/admin/config'))
  return parseResponse<AdminEmbedConfig>(response)
}

export async function verifyAccessCode(code: string): Promise<AccessVerifyResponse> {
  const response = await fetch(buildUrl('/api/embed/access/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return parseResponse<AccessVerifyResponse>(response)
}

export async function loadAccessSession(): Promise<AccessSessionResponse> {
  const response = await fetch(buildUrl('/api/embed/access/session'))
  return parseResponse<AccessSessionResponse>(response)
}

export async function logoutAccessSession(): Promise<void> {
  const response = await fetch(buildUrl('/api/embed/access/logout'), {
    method: 'POST',
  })
  await parseResponse<{ ok: boolean }>(response)
}

export async function saveEmbedConfig(config: AdminEmbedConfig): Promise<void> {
  const response = await fetch(buildUrl('/api/embed/config'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })
  await parseResponse<{ ok: boolean }>(response)
}
