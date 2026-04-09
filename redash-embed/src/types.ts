// ---------------------------------------------------------------------------
// Shared domain types for redash-embed
// ---------------------------------------------------------------------------

export interface LanguageConfig {
  url: string
  params: string
}

export interface ParamControlConfig {
  name: string
  label?: string
  type?: string
  urlKey?: string
  defaultValue?: string
  defaultValueStart?: string
  defaultValueEnd?: string
  locked?: boolean
  options?: Array<{ label: string; value: string } | string>
  /** legacy: some configs use `param` instead of `name` */
  param?: string
  /** legacy alias */
  default?: string
}

export interface QueryExecutionConfig {
  queryId?: number | null
  apiKey?: string
  apiBaseUrl?: string
  apiPathPrefix?: string
  csrfToken?: string
  includeCredentials?: boolean
  applyAutoLimit?: boolean
  maxAge?: number
}

export interface TabConfig {
  id: string
  label: string
  hideParameters?: boolean
  refreshIntervalSeconds?: number
  parameterControls: ParamControlConfig[]
  queryExecution: QueryExecutionConfig | null
  languages: Record<string, LanguageConfig>
}

export interface DashboardConfig {
  title: string
  password: string | null
  defaultLanguage: string
  tabs: TabConfig[]
}

export interface StoreConfig {
  id: string
  name: string
  accessCode?: string
}

export interface EmbedAccessSession {
  role: 'admin' | 'store'
  storeId?: string
}

/** Top-level map of slug → dashboard */
export type DashboardsMap = Record<string, DashboardConfig>

// ---------------------------------------------------------------------------
// Normalised internal types (after parseParams, normalizeControl, etc.)
// ---------------------------------------------------------------------------

export interface NormalisedControl {
  id: string
  name: string
  label: string
  type: string
  urlKey: string
  defaultValue: string
  defaultValueStart: string
  defaultValueEnd: string
  locked: boolean
  options: Array<{ label: string; value: string }>
}

/** Tab config with url/params merged from the chosen language */
export type ResolvedTab = Omit<TabConfig, 'languages'> & {
  url: string
  params: string
}
