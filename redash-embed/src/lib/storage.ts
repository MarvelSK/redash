import { STORAGE_KEY } from '../constants'
import type { DashboardConfig, DashboardsMap, ResolvedTab, TabConfig } from '../types'

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Convert a legacy flat dashboard config to the current tabs+languages format.
 * Dashboards already in the new format pass through unchanged.
 */
export function normalizeDashboard(raw: unknown): DashboardConfig {
  if (!isObject(raw)) {
    return { title: '', password: null, defaultLanguage: 'en', tabs: [] }
  }

  // Already new format
  if (Array.isArray(raw.tabs)) return raw as unknown as DashboardConfig

  // Old flat format — wrap into a single tab
  const lang = String(raw.defaultLanguage || 'en')
  return {
    title: String(raw.title || ''),
    password: (raw.password as string | null) ?? null,
    defaultLanguage: lang,
    tabs: [
      {
        id: 'main',
        label: String(raw.title || 'Overview'),
        hideParameters: Boolean(raw.hideParameters),
        refreshIntervalSeconds: Number(raw.refreshIntervalSeconds ?? 0),
        parameterControls: Array.isArray(raw.parameterControls) ? raw.parameterControls : [],
        queryExecution: (raw.queryExecution as DashboardConfig['tabs'][0]['queryExecution']) || null,
        languages: {
          [lang]: {
            url: String(raw.url || ''),
            params: String(raw.params || ''),
          },
        },
      },
    ],
  }
}

export function normalizeDashboards(raw: unknown): DashboardsMap {
  if (!isObject(raw)) return {}
  const result: DashboardsMap = {}
  Object.entries(raw).forEach(([slug, config]) => {
    result[slug] = normalizeDashboard(config)
  })
  return result
}

/** Merge a tab config with the chosen language's url/params */
export function resolveTab(tab: TabConfig | undefined, language: string): ResolvedTab {
  const langData =
    tab?.languages?.[language] ||
    tab?.languages?.['en'] ||
    Object.values(tab?.languages || {})[0] ||
    {}
  return {
    ...(tab as TabConfig),
    url: langData.url || '',
    params: langData.params || '',
  }
}

/** Return the union of all language codes across all tabs */
export function getAvailableLanguages(dashboard: DashboardConfig | null): string[] {
  const langs = new Set<string>()
  ;(dashboard?.tabs || []).forEach((tab) => {
    Object.keys(tab?.languages || {}).forEach((l) => langs.add(l))
  })
  return [...langs]
}

export function loadDashboardsFromStorage(): DashboardsMap | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isObject(parsed) ? normalizeDashboards(parsed) : null
  } catch {
    return null
  }
}
