// ---------------------------------------------------------------------------
// iframe URL building + Redash public-dashboard API discovery
// ---------------------------------------------------------------------------

export function getCookieValue(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

function parseParamsLocal(rawParams = ''): Record<string, string> {
  return rawParams
    .split('&')
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, pair) => {
      const [rawKey, ...rest] = pair.split('=')
      const key = rawKey?.trim()
      const value = rest.join('=').trim()
      if (!key) return acc
      acc[key] = value
      return acc
    }, {})
}

function isSameOrigin(url: URL): boolean {
  try {
    return url.origin === window.location.origin
  } catch {
    return false
  }
}

export function buildIframeUrl(
  config: { url?: string; params?: string; hideParameters?: boolean } | null,
  paramsOverride?: Record<string, string>,
): string {
  if (!config?.url?.trim()) return ''
  try {
    const url = new URL(config.url.trim())
    const params = paramsOverride ?? parseParamsLocal(config.params || '')
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    if (config.hideParameters) url.searchParams.set('hide_parameters', 'true')
    return url.toString()
  } catch {
    return ''
  }
}

export function extractPublicDashboardToken(dashboardUrl: string): string | null {
  try {
    const url = new URL(dashboardUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const publicIdx = parts.findIndex((part) => part === 'public')
    if (publicIdx === -1) return null
    if (parts[publicIdx + 1] !== 'dashboards') return null
    return parts[publicIdx + 2] || null
  } catch {
    return null
  }
}

function buildPublicDashboardApiUrl(dashboardUrl: string): string | null {
  try {
    const url = new URL(dashboardUrl)
    const token = extractPublicDashboardToken(dashboardUrl)
    if (!token) return null
    const apiUrl = new URL(`/api/dashboards/public/${token}`, url.origin)
    const orgSlug = url.searchParams.get('org_slug')
    if (orgSlug) apiUrl.searchParams.set('org_slug', orgSlug)
    return apiUrl.toString()
  } catch {
    return null
  }
}

function buildPublicDashboardProxyPath(dashboardUrl: string): string | null {
  try {
    const url = new URL(dashboardUrl)
    const token = extractPublicDashboardToken(dashboardUrl)
    if (!token) return null

    const proxyPrefix =
      (import.meta.env.VITE_REDASH_PROXY_PATH as string | undefined) || '/redash-api'
    const apiPath = `${proxyPrefix}/api/dashboards/public/${token}`
    const params = new URLSearchParams()
    const orgSlug = url.searchParams.get('org_slug')

    if (orgSlug) params.set('org_slug', orgSlug)

    const queryString = params.toString()
    return queryString ? `${apiPath}?${queryString}` : apiPath
  } catch {
    return null
  }
}

function discoverParamsFromPublicDashboardApi(payload: unknown): Record<string, unknown> {
  const discovered: Record<string, unknown> = {}
  const widgets = Array.isArray((payload as { widgets?: unknown[] } | null)?.widgets)
    ? (payload as { widgets: unknown[] }).widgets
    : []

  widgets.forEach((widget) => {
    const w = widget as {
      visualization?: { query?: { options?: { parameters?: unknown[] } } }
      options?: { parameterMappings?: Record<string, { type?: string; mapTo?: string }> }
    }

    const queryParams = w?.visualization?.query?.options?.parameters
    const mappings = w?.options?.parameterMappings || {}
    if (!Array.isArray(queryParams)) return

    queryParams.forEach((param) => {
      const p = param as { name?: string; value?: unknown }
      const localName = p?.name
      if (!localName) return

      const mapping = mappings[localName]
      const mappedName =
        mapping?.type === 'dashboard-level' && mapping?.mapTo ? mapping.mapTo : localName

      const key = mappedName.startsWith('p_') ? mappedName : `p_${mappedName}`
      if (!Object.prototype.hasOwnProperty.call(discovered, key)) {
        discovered[key] = p?.value ?? ''
      }
    })
  })

  return discovered
}

export async function discoverParamsUsingApi(
  configUrl: string,
): Promise<{ discovered: Record<string, unknown>; source: string } | null> {
  const directApiUrl = buildPublicDashboardApiUrl(configUrl || '')
  const proxyApiPath = buildPublicDashboardProxyPath(configUrl || '')

  const candidates: Array<{ url: string; source: string }> = []

  if (proxyApiPath) {
    candidates.push({ url: proxyApiPath, source: 'proxy API' })
  }

  if (directApiUrl) {
    try {
      const direct = new URL(directApiUrl)
      // Skip direct cross-origin calls to avoid noisy CORS errors in browser console.
      if (isSameOrigin(direct)) {
        candidates.push({ url: directApiUrl, source: 'Redash Public API' })
      }
    } catch {
      // ignore malformed URL
    }
  }

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { credentials: 'omit' })
      if (!response.ok) continue

      const payload: unknown = await response.json()
      const discovered = discoverParamsFromPublicDashboardApi(payload)
      if (Object.keys(discovered).length > 0) {
        return { discovered, source: candidate.source }
      }
    } catch {
      // Try next candidate endpoint.
    }
  }

  return null
}
