import type { DashboardConfig, DashboardsMap, ParamControlConfig, TabConfig } from '../types'
import { slugify } from './admin-defaults'

type RedashDashboardListItem = {
  slug?: string
  name?: string
  is_archived?: boolean
}

type RedashParameter = {
  name?: string
  title?: string
  type?: string
  value?: unknown
  enumOptions?: string[]
}

type RedashDashboardDetails = {
  slug?: string
  name?: string
  public_url?: string
  widgets?: Array<{
    options?: { parameterMappings?: Record<string, { type?: string; mapTo?: string }> }
    visualization?: {
      query?: {
        id?: number
        options?: { parameters?: RedashParameter[] }
      }
    }
  }>
}

export type ImportOptions = {
  endpointRoot: string
  apiKey: string
  orgSlug?: string
  includeArchived?: boolean
  overwriteExisting?: boolean
  conflictPolicy?: 'skip' | 'overwrite' | 'merge'
  dryRun?: boolean
}

export type ImportAction = 'create' | 'overwrite' | 'merge' | 'skip'

export type ImportChange = {
  slug: string
  action: ImportAction
  reason?: string
  missingLanguageUrls: number
}

export type ImportResult = {
  merged: DashboardsMap
  importedCount: number
  skipped: string[]
  changes: ImportChange[]
}

class RedashApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'RedashApiError'
    this.status = status
  }
}

function buildEndpoint(root: string, path: string, orgSlug?: string): string {
  const base = root.replace(/\/$/, '')
  const route = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${route}`

  if (!orgSlug) return url
  const hasQuery = url.includes('?')
  const sep = hasQuery ? '&' : '?'
  return `${url}${sep}org_slug=${encodeURIComponent(orgSlug)}`
}

function mapParamType(param: RedashParameter): ParamControlConfig['type'] {
  const t = String(param.type || '').toLowerCase()
  if (t.includes('date') && t.includes('range')) return 'date-range'
  if (t.includes('date')) return 'date'
  if (Array.isArray(param.enumOptions) && param.enumOptions.length > 0) return 'select'
  if (t.includes('enum') || t.includes('dropdown')) return 'select'
  return 'text'
}

function toHumanLabel(name: string): string {
  return name
    .replace(/^p_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function buildPublicUrl(endpointRoot: string, publicUrl?: string): string {
  if (!publicUrl) return ''

  // If publicUrl is absolute, try to replace the origin with endpointRoot origin
  // (handles cases where Redash returns internal Docker URLs like http://server:5000/...)
  if (publicUrl.startsWith('http://') || publicUrl.startsWith('https://')) {
    if (endpointRoot.startsWith('http')) {
      try {
        const internalOrigin = new URL(publicUrl).origin
        const externalOrigin = new URL(endpointRoot).origin
        if (internalOrigin !== externalOrigin) {
          return publicUrl.replace(internalOrigin, externalOrigin)
        }
      } catch {
        // fallthrough
      }
    }
    return publicUrl
  }

  // If endpointRoot is a proxy path (/redash-api), we cannot infer public origin safely.
  if (!endpointRoot.startsWith('http')) return ''

  const base = endpointRoot.replace(/\/$/, '')
  return `${base}${publicUrl.startsWith('/') ? '' : '/'}${publicUrl}`
}

function deriveControlsAndParams(details: RedashDashboardDetails): {
  controls: ParamControlConfig[]
  paramsString: string
  queryId: number | null
} {
  const controlsByName = new Map<string, ParamControlConfig>()
  let firstQueryId: number | null = null

  for (const widget of details.widgets || []) {
    const query = widget.visualization?.query
    if (firstQueryId === null && Number.isFinite(Number(query?.id))) {
      firstQueryId = Number(query?.id)
    }

    const mappings = widget.options?.parameterMappings || {}
    const params = query?.options?.parameters || []

    for (const p of params) {
      const localName = String(p.name || '').trim()
      if (!localName) continue

      const mapped = mappings[localName]
      const mappedName =
        mapped?.type === 'dashboard-level' && mapped.mapTo ? String(mapped.mapTo).trim() : localName
      if (!mappedName) continue
      if (controlsByName.has(mappedName)) continue

      const type = mapParamType(p)
      const control: ParamControlConfig = {
        name: mappedName,
        label: String(p.title || toHumanLabel(mappedName)),
        type,
        locked: false,
      }

      if (type === 'date-range' && p.value && typeof p.value === 'object') {
        const v = p.value as { start?: string; end?: string }
        control.defaultValueStart = String(v.start || '')
        control.defaultValueEnd = String(v.end || '')
      } else if (Array.isArray(p.enumOptions) && p.enumOptions.length > 0) {
        control.options = p.enumOptions.map((opt) => ({ label: opt, value: opt }))
        control.defaultValue = String(p.value ?? p.enumOptions[0] ?? '')
      } else {
        control.defaultValue = String(p.value ?? '')
      }

      controlsByName.set(mappedName, control)
    }
  }

  const controls = [...controlsByName.values()]

  const params: string[] = []
  for (const c of controls) {
    if (c.type === 'date-range') {
      if (c.defaultValueStart) params.push(`p_${c.name}.start=${c.defaultValueStart}`)
      if (c.defaultValueEnd) params.push(`p_${c.name}.end=${c.defaultValueEnd}`)
    } else if (c.defaultValue !== undefined && c.defaultValue !== '') {
      params.push(`p_${c.name}=${String(c.defaultValue)}`)
    }
  }

  return { controls, paramsString: params.join('&'), queryId: firstQueryId }
}

function mapDashboardToEmbedConfig(
  item: RedashDashboardListItem,
  details: RedashDashboardDetails,
  options: ImportOptions,
): { slug: string; config: DashboardConfig } {
  const slug = String(item.slug || details.slug || slugify(String(item.name || details.name || 'dashboard')))
  const title = String(item.name || details.name || slug)

  const { controls, paramsString, queryId } = deriveControlsAndParams(details)
  const publicUrl = buildPublicUrl(options.endpointRoot, details.public_url)

  return {
    slug,
    config: {
      title,
      password: null,
      defaultLanguage: 'en',
      tabs: [
        {
          id: 'main',
          label: 'Overview',
          hideParameters: true,
          refreshIntervalSeconds: 0,
          parameterControls: controls,
          queryExecution: queryId
            ? {
                queryId,
                // Security: imported dashboards should not persist user API keys in local config.
                apiKey: '',
                apiPathPrefix: options.endpointRoot.startsWith('http') ? '' : options.endpointRoot,
                apiBaseUrl: options.endpointRoot.startsWith('http') ? options.endpointRoot : '',
                includeCredentials: true,
                applyAutoLimit: true,
                maxAge: 0,
              }
            : null,
          languages: {
            en: { url: publicUrl, params: paramsString },
            fr: { url: publicUrl, params: paramsString },
            de: { url: publicUrl, params: paramsString },
          },
        },
      ],
    },
  }
}

function countMissingLanguageUrls(config: DashboardConfig): number {
  const required = ['en', 'fr', 'de']
  let missing = 0
  for (const tab of config.tabs || []) {
    for (const lang of required) {
      const url = tab.languages?.[lang]?.url || ''
      if (!url.trim()) missing += 1
    }
  }
  return missing
}

function mergeTab(local: TabConfig, incoming: TabConfig): TabConfig {
  const mergedLanguages = { ...local.languages }
  Object.entries(incoming.languages || {}).forEach(([code, data]) => {
    const existing = mergedLanguages[code]
    if (!existing) {
      mergedLanguages[code] = data
      return
    }
    mergedLanguages[code] = {
      url: existing.url || data.url,
      params: existing.params || data.params,
    }
  })

  return {
    ...local,
    label: local.label || incoming.label,
    hideParameters: local.hideParameters ?? incoming.hideParameters,
    refreshIntervalSeconds: local.refreshIntervalSeconds ?? incoming.refreshIntervalSeconds,
    parameterControls:
      (local.parameterControls || []).length > 0
        ? local.parameterControls
        : incoming.parameterControls,
    queryExecution: local.queryExecution || incoming.queryExecution,
    languages: mergedLanguages,
  }
}

function mergeDashboardConfigs(local: DashboardConfig, incoming: DashboardConfig): DashboardConfig {
  const tabsById = new Map<string, TabConfig>()
  ;(local.tabs || []).forEach((tab) => tabsById.set(tab.id, tab))

  for (const incomingTab of incoming.tabs || []) {
    const existingTab = tabsById.get(incomingTab.id)
    if (!existingTab) {
      tabsById.set(incomingTab.id, incomingTab)
    } else {
      tabsById.set(incomingTab.id, mergeTab(existingTab, incomingTab))
    }
  }

  return {
    ...local,
    title: local.title || incoming.title,
    defaultLanguage: local.defaultLanguage || incoming.defaultLanguage,
    // Keep explicit local password as source of truth.
    password: local.password,
    tabs: [...tabsById.values()],
  }
}

async function fetchJson<T>(url: string, apiKey: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new RedashApiError(response.status, `Redash API ${response.status}: ${text || response.statusText}`)
  }

  return (await response.json()) as T
}

export async function importDashboardsFromRedash(
  existing: DashboardsMap,
  options: ImportOptions,
): Promise<ImportResult> {
  const listUrl = buildEndpoint(options.endpointRoot, '/api/dashboards?page_size=250', options.orgSlug)
  const list = await fetchJson<{ results?: RedashDashboardListItem[] }>(listUrl, options.apiKey)
  const dashboards = list.results || []

  const merged: DashboardsMap = { ...existing }
  const skipped: string[] = []
  const changes: ImportChange[] = []
  let importedCount = 0
  const conflictPolicy: 'skip' | 'overwrite' | 'merge' =
    options.conflictPolicy || (options.overwriteExisting ? 'overwrite' : 'skip')

  for (const item of dashboards) {
    if (!item.slug) continue
    if (!options.includeArchived && item.is_archived) continue

    if (conflictPolicy === 'skip' && merged[item.slug]) {
      skipped.push(item.slug)
      changes.push({
        slug: item.slug,
        action: 'skip',
        reason: 'Already exists and policy is skip',
        missingLanguageUrls: 0,
      })
      continue
    }

    const detailUrl = buildEndpoint(
      options.endpointRoot,
      `/api/dashboards/${encodeURIComponent(item.slug)}?legacy=1`,
      options.orgSlug,
    )
    let details: RedashDashboardDetails
    try {
      details = await fetchJson<RedashDashboardDetails>(detailUrl, options.apiKey)
    } catch (error) {
      const reason =
        error instanceof RedashApiError
          ? `Detail fetch failed (${error.status})`
          : error instanceof Error
            ? `Detail fetch failed (${error.message})`
            : 'Detail fetch failed'

      skipped.push(item.slug)
      changes.push({
        slug: item.slug,
        action: 'skip',
        reason,
        missingLanguageUrls: 0,
      })
      continue
    }

    const mapped = mapDashboardToEmbedConfig(item, details, options)
    const current = merged[mapped.slug]
    const missingLanguageUrls = countMissingLanguageUrls(mapped.config)

    if (!current) {
      merged[mapped.slug] = mapped.config
      importedCount += 1
      changes.push({ slug: mapped.slug, action: 'create', missingLanguageUrls })
      continue
    }

    if (conflictPolicy === 'skip') {
      skipped.push(mapped.slug)
      changes.push({
        slug: mapped.slug,
        action: 'skip',
        reason: 'Already exists and policy is skip',
        missingLanguageUrls,
      })
      continue
    }

    if (conflictPolicy === 'merge') {
      merged[mapped.slug] = mergeDashboardConfigs(current, mapped.config)
      importedCount += 1
      changes.push({ slug: mapped.slug, action: 'merge', missingLanguageUrls })
      continue
    }

    merged[mapped.slug] = mapped.config
    importedCount += 1
    changes.push({ slug: mapped.slug, action: 'overwrite', missingLanguageUrls })
  }

  if (options.dryRun) {
    // In dry run mode return the hypothetical merged state but caller can choose not to persist it.
    return { merged, importedCount, skipped, changes }
  }

  return { merged, importedCount, skipped, changes }
}
