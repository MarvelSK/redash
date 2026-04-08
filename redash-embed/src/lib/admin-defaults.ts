import type { DashboardConfig, TabConfig, ParamControlConfig } from '../types'

export function emptyTab(): TabConfig {
  return {
    id: `tab_${Date.now()}`,
    label: 'New Tab',
    hideParameters: true,
    refreshIntervalSeconds: 0,
    parameterControls: [],
    queryExecution: null,
    languages: {
      en: { url: '', params: '' },
      fr: { url: '', params: '' },
      de: { url: '', params: '' },
    },
  }
}

export function emptyDashboard(): DashboardConfig {
  return {
    title: 'New Dashboard',
    password: null,
    defaultLanguage: 'en',
    tabs: [emptyTab()],
  }
}

export function emptyControl(): ParamControlConfig {
  return { name: '', label: '', type: 'text', defaultValue: '', locked: false, options: [] }
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `dashboard-${Date.now()}`
  )
}
