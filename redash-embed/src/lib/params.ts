import { SYSTEM_PARAM_KEYS, POLL_INTERVAL_MS, JOB_STATUS_NAMES } from '../constants'
import type { NormalisedControl, ParamControlConfig, ResolvedTab, QueryExecutionConfig } from '../types'

// ---------------------------------------------------------------------------
// URL param parsing helpers
// ---------------------------------------------------------------------------

export function parseParams(rawParams = ''): Record<string, string> {
  return rawParams
    .split('&')
    .map((pair) => pair.trim())
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

export function toUrlParamKey(name: string): string {
  if (!name) return ''
  return name.startsWith('p_') ? name : `p_${name}`
}

export function normalizeControl(
  control: ParamControlConfig,
  index: number,
): NormalisedControl | null {
  const rawName = String(control?.name || control?.param || '').trim()
  if (!rawName) return null

  const type = String(control?.type || 'text').toLowerCase()
  return {
    id: `${rawName}-${index}`,
    name: rawName,
    label: control?.label || rawName,
    type,
    urlKey: toUrlParamKey(control?.urlKey || rawName),
    defaultValue: String(control?.defaultValue ?? control?.default ?? ''),
    defaultValueStart: String(control?.defaultValueStart ?? ''),
    defaultValueEnd: String(control?.defaultValueEnd ?? ''),
    locked: Boolean(control?.locked),
    options: Array.isArray(control?.options)
      ? control.options.map((option) => {
          if (typeof option === 'string') return { label: option, value: option }
          return {
            label: option?.label ?? option?.value ?? '',
            value: option?.value ?? option?.label ?? '',
          }
        })
      : [],
  }
}

export function getConfiguredControls(config: Partial<ResolvedTab> | null): NormalisedControl[] {
  if (!Array.isArray(config?.parameterControls)) return []
  return config.parameterControls
    .map((control, index) => normalizeControl(control, index))
    .filter((c): c is NormalisedControl => c !== null)
}

export function getInitialParams(
  config: Partial<ResolvedTab> | null,
  controls: NormalisedControl[],
): Record<string, string> {
  const parsed = parseParams(config?.params || '')
  const next: Record<string, string> = { ...parsed }

  const formatDate = (value: Date) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const getCurrentWeekRange = () => {
    const now = new Date()
    const day = now.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { from: formatDate(monday), to: formatDate(sunday) }
  }

  controls.forEach((control) => {
    if (control.type === 'date-range') {
      const startKey = `${control.urlKey}.start`
      const endKey = `${control.urlKey}.end`
      if (!next[startKey]) next[startKey] = control.defaultValueStart
      if (!next[endKey]) next[endKey] = control.defaultValueEnd
    } else {
      const currentValue = next[control.urlKey]
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        next[control.urlKey] = String(control.defaultValue ?? '')
      }
    }
  })

  const { from, to } = getCurrentWeekRange()
  next.p_date_from = from
  next.p_date_to = to

  return next
}

// ---------------------------------------------------------------------------
// Execution payload builder (for /api/queries/:id/results)
// ---------------------------------------------------------------------------

interface ExecutionPayload {
  queryId: number
  apiKey: string
  apiBaseUrl: string
  apiPathPrefix: string
  csrfToken: string
  includeCredentials: boolean
  applyAutoLimit: boolean
  maxAge: number
  parameters: Record<string, unknown>
}

export function buildExecutionPayload(
  config: Partial<ResolvedTab> | null,
  params: Record<string, string>,
  controls: NormalisedControl[],
): ExecutionPayload | null {
  const values: Record<string, string> = {}

  if (controls.length > 0) {
    controls.forEach((control) => {
      values[control.name] = params[control.urlKey] ?? ''
    })
  } else {
    Object.entries(params).forEach(([key, value]) => {
      if (SYSTEM_PARAM_KEYS.has(key)) return
      const rawKey = key.startsWith('p_') ? key.slice(2) : key
      if (!rawKey) return
      values[rawKey] = value
    })
  }

  const execution: Partial<QueryExecutionConfig> = config?.queryExecution || {}
  const queryId = Number(execution.queryId)
  if (!Number.isFinite(queryId) || queryId <= 0) return null

  // Group .start/.end pairs into nested objects for date-range params
  const finalParameters: Record<string, unknown> = {}
  const rangeAccum: Record<string, Record<string, string>> = {}

  Object.entries(values).forEach(([name, val]) => {
    const startMatch = name.match(/^(.+)\.start$/)
    const endMatch = name.match(/^(.+)\.end$/)
    if (startMatch) {
      const base = startMatch[1]
      if (!rangeAccum[base]) rangeAccum[base] = {}
      rangeAccum[base].start = val
    } else if (endMatch) {
      const base = endMatch[1]
      if (!rangeAccum[base]) rangeAccum[base] = {}
      rangeAccum[base].end = val
    } else {
      finalParameters[name] = val
    }
  })

  Object.assign(finalParameters, rangeAccum)

  return {
    queryId,
    apiKey: String(execution.apiKey || '').trim(),
    apiBaseUrl: String(execution.apiBaseUrl || '').trim(),
    apiPathPrefix: String(execution.apiPathPrefix || '').trim(),
    csrfToken: String(execution.csrfToken || '').trim(),
    includeCredentials: execution.includeCredentials !== false,
    applyAutoLimit: execution.applyAutoLimit !== false,
    maxAge: Number.isFinite(Number(execution.maxAge)) ? Number(execution.maxAge) : 0,
    parameters: finalParameters,
  }
}

export function buildExecutionUrl(payload: ExecutionPayload): string {
  if (payload.apiBaseUrl) {
    return `${payload.apiBaseUrl.replace(/\/$/, '')}/api/queries/${payload.queryId}/results`
  }
  if (payload.apiPathPrefix) {
    return `${payload.apiPathPrefix.replace(/\/$/, '')}/api/queries/${payload.queryId}/results`
  }
  return `/api/queries/${payload.queryId}/results`
}

export function buildJobUrl(payload: ExecutionPayload, jobId: string): string {
  if (payload.apiBaseUrl) {
    return `${payload.apiBaseUrl.replace(/\/$/, '')}/api/jobs/${jobId}`
  }
  if (payload.apiPathPrefix) {
    return `${payload.apiPathPrefix.replace(/\/$/, '')}/api/jobs/${jobId}`
  }
  return `/api/jobs/${jobId}`
}

export async function pollJobToCompletion(
  jobUrl: string,
  headers: Record<string, string>,
  credentials: RequestCredentials,
  signal: AbortSignal | undefined,
  onStatus: (msg: string) => void,
): Promise<string> {
  while (true) {
    if (signal?.aborted) throw new DOMException('Polling aborted', 'AbortError')

    const response = await fetch(jobUrl, { credentials, headers })
    if (!response.ok) throw new Error(`Job poll failed with status ${response.status}`)

    const data = await response.json()
    const status: number = data?.job?.status
    const statusName = JOB_STATUS_NAMES[status] || `status ${status}`
    onStatus(`Query job ${statusName}...`)

    if (status === 3) return String(data.job.query_result_id)
    if (status === 4) throw new Error(`Query job FAILED: ${data?.job?.error || 'unknown error'}`)
    if (status === 5) throw new Error('Query job was CANCELLED')

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, POLL_INTERVAL_MS)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new DOMException('Polling aborted', 'AbortError'))
        },
        { once: true },
      )
    })
  }
}
