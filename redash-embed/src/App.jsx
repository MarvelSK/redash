import { useEffect, useMemo, useRef, useState } from 'react'
import defaultDashboards from './dashboards.json'

const STORAGE_KEY = 'redash-embed-dashboards-json'
const ADMIN_PASSWORD = 'redash-admin'
const SYSTEM_PARAM_KEYS = new Set(['org_slug', 'hide_parameters', 'api_key'])

function parseParams(rawParams = '') {
  return rawParams
    .split('&')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const [rawKey, ...rest] = pair.split('=')
      const key = rawKey?.trim()
      const value = rest.join('=').trim()

      if (!key) {
        return acc
      }

      acc[key] = value
      return acc
    }, {})
}

function getCookieValue(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

function toUrlParamKey(name) {
  if (!name) {
    return ''
  }

  return name.startsWith('p_') ? name : `p_${name}`
}

function normalizeControl(control, index) {
  const rawName = String(control?.name || control?.param || '').trim()
  if (!rawName) {
    return null
  }

  const type = String(control?.type || 'text').toLowerCase()
  return {
    id: `${rawName}-${index}`,
    name: rawName,
    label: control?.label || rawName,
    type,
    urlKey: toUrlParamKey(control?.urlKey || rawName),
    defaultValue: control?.defaultValue ?? control?.default ?? '',
    locked: Boolean(control?.locked),
    options: Array.isArray(control?.options)
      ? control.options.map((option) => {
          if (typeof option === 'string') {
            return { label: option, value: option }
          }

          return {
            label: option?.label ?? option?.value ?? '',
            value: option?.value ?? option?.label ?? '',
          }
        })
      : [],
  }
}

function getConfiguredControls(config) {
  if (!Array.isArray(config?.parameterControls)) {
    return []
  }

  return config.parameterControls
    .map((control, index) => normalizeControl(control, index))
    .filter(Boolean)
}

function getInitialParams(config, controls) {
  const parsed = parseParams(config?.params || '')
  const next = { ...parsed }

  controls.forEach((control) => {
    const currentValue = next[control.urlKey]
    if (currentValue === undefined || currentValue === null || currentValue === '') {
      next[control.urlKey] = String(control.defaultValue ?? '')
    }
  })

  return next
}

function buildExecutionPayload(config, params, controls) {
  const configuredControls = controls.length > 0 ? controls : null
  const values = {}

  if (configuredControls) {
    configuredControls.forEach((control) => {
      values[control.name] = params[control.urlKey] ?? ''
    })
  } else {
    Object.entries(params).forEach(([key, value]) => {
      if (SYSTEM_PARAM_KEYS.has(key)) {
        return
      }

      const rawKey = key.startsWith('p_') ? key.slice(2) : key
      if (!rawKey) {
        return
      }

      values[rawKey] = value
    })
  }

  const execution = config?.queryExecution || {}
  const queryId = Number(execution.queryId)

  if (!Number.isFinite(queryId) || queryId <= 0) {
    return null
  }

  return {
    queryId,
    apiBaseUrl: String(execution.apiBaseUrl || '').trim(),
    apiPathPrefix: String(execution.apiPathPrefix || '').trim(),
    csrfToken: String(execution.csrfToken || '').trim(),
    includeCredentials: execution.includeCredentials !== false,
    applyAutoLimit: execution.applyAutoLimit !== false,
    maxAge: Number.isFinite(Number(execution.maxAge))
      ? Number(execution.maxAge)
      : 0,
    parameters: values,
  }
}

function buildExecutionUrl(payload) {
  if (payload.apiBaseUrl) {
    const base = payload.apiBaseUrl.replace(/\/$/, '')
    return `${base}/api/queries/${payload.queryId}/results`
  }

  if (payload.apiPathPrefix) {
    const prefix = payload.apiPathPrefix.replace(/\/$/, '')
    return `${prefix}/api/queries/${payload.queryId}/results`
  }

  return `/api/queries/${payload.queryId}/results`
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function loadDashboardsFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function buildIframeUrl(config, paramsOverride) {
  if (!config?.url?.trim()) {
    return ''
  }

  try {
    const url = new URL(config.url.trim())
    const params = paramsOverride || parseParams(config.params || '')

    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })

    if (config.hideParameters) {
      url.searchParams.set('hide_parameters', 'true')
    }

    return url.toString()
  } catch {
    return ''
  }
}

function extractPublicDashboardToken(dashboardUrl) {
  try {
    const url = new URL(dashboardUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const publicIdx = parts.findIndex((part) => part === 'public')

    if (publicIdx === -1) {
      return null
    }

    if (parts[publicIdx + 1] !== 'dashboards') {
      return null
    }

    return parts[publicIdx + 2] || null
  } catch {
    return null
  }
}

function buildPublicDashboardApiUrl(dashboardUrl) {
  try {
    const url = new URL(dashboardUrl)
    const token = extractPublicDashboardToken(dashboardUrl)

    if (!token) {
      return null
    }

    const apiUrl = new URL(`/api/dashboards/public/${token}`, url.origin)
    const orgSlug = url.searchParams.get('org_slug')

    if (orgSlug) {
      apiUrl.searchParams.set('org_slug', orgSlug)
    }

    return apiUrl.toString()
  } catch {
    return null
  }
}

function buildPublicDashboardProxyPath(dashboardUrl) {
  try {
    const url = new URL(dashboardUrl)
    const token = extractPublicDashboardToken(dashboardUrl)

    if (!token) {
      return null
    }

    const proxyPrefix = import.meta.env.VITE_REDASH_PROXY_PATH || '/redash-api'
    const apiPath = `${proxyPrefix}/api/dashboards/public/${token}`
    const params = new URLSearchParams()
    const orgSlug = url.searchParams.get('org_slug')

    if (orgSlug) {
      params.set('org_slug', orgSlug)
    }

    const queryString = params.toString()
    return queryString ? `${apiPath}?${queryString}` : apiPath
  } catch {
    return null
  }
}

function discoverParamsFromPublicDashboardApi(payload) {
  const discovered = {}
  const widgets = Array.isArray(payload?.widgets) ? payload.widgets : []

  widgets.forEach((widget) => {
    const queryParams = widget?.visualization?.query?.options?.parameters
    const mappings = widget?.options?.parameterMappings || {}

    if (!Array.isArray(queryParams)) {
      return
    }

    queryParams.forEach((param) => {
      const localName = param?.name
      if (!localName) {
        return
      }

      const mapping = mappings[localName]
      const mappedName =
        mapping?.type === 'dashboard-level' && mapping?.mapTo
          ? mapping.mapTo
          : localName

      const key = mappedName.startsWith('p_') ? mappedName : `p_${mappedName}`

      if (!Object.prototype.hasOwnProperty.call(discovered, key)) {
        discovered[key] = param?.value ?? ''
      }
    })
  })

  return discovered
}

async function discoverParamsUsingApi(configUrl) {
  const directApiUrl = buildPublicDashboardApiUrl(configUrl || '')
  const proxyApiPath = buildPublicDashboardProxyPath(configUrl || '')
  const candidates = [
    { url: directApiUrl, source: 'Redash Public API' },
    { url: proxyApiPath, source: 'proxy API' },
  ].filter((item) => Boolean(item.url))

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, { credentials: 'omit' })
      if (!response.ok) {
        continue
      }

      const payload = await response.json()
      const discovered = discoverParamsFromPublicDashboardApi(payload)
      if (Object.keys(discovered).length > 0) {
        return { discovered, source: candidate.source }
      }
    } catch {
      // Try the next candidate endpoint.
    }
  }

  return null
}

function EmbeddedDashboard({ dashboards }) {
  const iframeRef = useRef(null)
  const path = window.location.pathname.replace(/^\//, '')
  const slug = path || 'default'
  const config = dashboards[slug] || dashboards.default
  const iframeUrl = useMemo(() => buildIframeUrl(config), [config])
  const configuredControls = useMemo(() => getConfiguredControls(config), [config])
  const [activeParams, setActiveParams] = useState(() =>
    getInitialParams(config, configuredControls)
  )
  const [iframeSrc, setIframeSrc] = useState(iframeUrl)
  const [panelOpen, setPanelOpen] = useState(false)
  const [loadStatus, setLoadStatus] = useState('')
  const requestedCrop = Number(config?.topCropPx ?? 130)
  const topCropPx =
    config?.hideParameters && Number.isFinite(requestedCrop) && requestedCrop > 0
      ? requestedCrop
      : 0

  useEffect(() => {
    const parsed = getInitialParams(config, configuredControls)
    setActiveParams(parsed)
    setIframeSrc(buildIframeUrl(config, parsed))
  }, [config, configuredControls])

  const tryHideElementsInsideIframe = () => {
    if (!config?.hideParameters) {
      return
    }

    const iframe = iframeRef.current
    if (!iframe) {
      return
    }

    // This works only on same-origin embeds; cross-origin iframes are blocked by the browser.
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document

      if (!doc) {
        return
      }

      const selectors = [
        '.m-b-10.p-15.bg-white.tiled',
        '.parameter-container',
        '.parameter-apply-button',
        '.page-header-wrapper',
      ]

      selectors.forEach((selector) => {
        doc.querySelectorAll(selector).forEach((node) => {
          node.style.display = 'none'
        })
      })
    } catch {
      // Cross-origin access denied, top crop fallback is used instead.
    }
  }

  const loadParamsFromIframe = async () => {
    const iframe = iframeRef.current
    const baseParams = parseParams(config?.params || '')
    const loaded = { ...baseParams }

    const apiResult = await discoverParamsUsingApi(config?.url || '')
    if (apiResult?.discovered) {
      setActiveParams({ ...loaded, ...apiResult.discovered })
      setPanelOpen(true)
      setLoadStatus(`Loaded params from ${apiResult.source}.`)
      return
    }

    if (!iframe) {
      setLoadStatus('Iframe is not ready yet.')
      return
    }

    let domLoaded = false

    // Same-origin only: try to read actual parameter widgets from Redash UI.
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document

      if (doc) {
        const blocks = doc.querySelectorAll('[data-test^="ParameterBlock-"]')

        blocks.forEach((block) => {
          const testAttr = block.getAttribute('data-test') || ''
          const name = testAttr.replace('ParameterBlock-', '').trim()

          if (!name) {
            return
          }

          const textInput = block.querySelector('input')
          const selectedItem = block.querySelector('.ant-select-selection-item')

          let value = ''
          if (textInput && typeof textInput.value === 'string') {
            value = textInput.value
          } else if (selectedItem?.textContent) {
            value = selectedItem.textContent.trim()
          }

          loaded[`p_${name}`] = value
        })

        domLoaded = blocks.length > 0
      }
    } catch {
      domLoaded = false
    }

    if (!domLoaded) {
      try {
        const currentUrl = new URL(iframe.src)

        currentUrl.searchParams.forEach((value, key) => {
          if (SYSTEM_PARAM_KEYS.has(key)) {
            return
          }
          loaded[key] = value
        })

        setLoadStatus(
          'Public/proxy API unavailable. Loaded params from iframe URL fallback.'
        )
      } catch {
        setLoadStatus('Could not load params from iframe.')
      }
    } else {
      setLoadStatus(
        'Public/proxy API unavailable. Loaded params from iframe controls.'
      )
    }

    setActiveParams(loaded)
    setPanelOpen(true)
  }

  const updateParam = (key, value) => {
    setActiveParams((prev) => ({ ...prev, [key]: value }))
  }

  const applyParamsToIframe = () => {
    const nextUrl = buildIframeUrl(config, activeParams)
    setIframeSrc(nextUrl)
    setLoadStatus('Applied params to iframe URL.')
  }

  const applyAndRunQuery = async () => {
    const nextUrl = buildIframeUrl(config, activeParams)
    setIframeSrc(nextUrl)

    const payload = buildExecutionPayload(config, activeParams, configuredControls)
    if (!payload) {
      setLoadStatus(
        'Applied params to iframe URL. Query execution is not configured in /admin.'
      )
      return
    }

    const requestUrl = buildExecutionUrl(payload)
    const csrfToken = payload.csrfToken || getCookieValue('csrf_token')
    const headers = {
      'Content-Type': 'application/json',
    }

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        credentials: payload.includeCredentials ? 'include' : 'omit',
        headers,
        body: JSON.stringify({
          id: payload.queryId,
          parameters: payload.parameters,
          apply_auto_limit: payload.applyAutoLimit,
          max_age: payload.maxAge,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        setLoadStatus(
          `Request failed (${response.status}). Check /admin queryExecution and auth. ${errorText}`
        )
        return
      }

      const result = await response.json()
      const jobId = result?.job?.id
      if (jobId) {
        setLoadStatus(`Applied params and started query job: ${jobId}`)
      } else {
        setLoadStatus('Applied params and executed query request.')
      }
    } catch {
      setLoadStatus(
        'Applied params to iframe URL, but query POST failed (network/CORS/auth).'
      )
    }
  }

  const addParam = () => {
    let index = 1
    let nextKey = `p_new_${index}`
    while (Object.prototype.hasOwnProperty.call(activeParams, nextKey)) {
      index += 1
      nextKey = `p_new_${index}`
    }

    setActiveParams((prev) => ({ ...prev, [nextKey]: '' }))
  }

  const removeParam = (key) => {
    setActiveParams((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  if (!config) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <h1 className="text-2xl font-semibold">No dashboard configured</h1>
          <p className="mt-3 text-sm text-slate-400">
            Add a default dashboard in dashboards.json or open /admin and save
            one.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen bg-slate-950 text-slate-100">
      <div className="h-10 border-b border-slate-800 bg-slate-900 px-4 text-xs text-slate-400">
        <div className="mx-auto flex h-full max-w-full items-center justify-between">
          <span className="truncate">{config.title || 'Dashboard'}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadParamsFromIframe}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              Auto Load Params
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((open) => !open)}
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700"
            >
              {panelOpen ? 'Hide Panel' : 'Edit Params'}
            </button>
            <span className="opacity-80">Live</span>
          </div>
        </div>
      </div>

      {panelOpen ? (
        <div className="max-h-52 overflow-auto border-b border-slate-800 bg-slate-900 px-4 py-3 text-xs text-slate-300">
          {loadStatus ? <p className="mb-2 text-slate-400">{loadStatus}</p> : null}

          {configuredControls.length > 0 ? (
            <div className="grid gap-2">
              {configuredControls.map((control) => {
                const value = activeParams[control.urlKey] ?? ''

                return (
                  <div
                    key={control.id}
                    className="grid grid-cols-[1fr_2fr_auto] items-center gap-2"
                  >
                    <label className="truncate text-slate-200">{control.label}</label>

                    {control.type === 'date' ? (
                      <input
                        type="date"
                        value={value}
                        disabled={control.locked}
                        onChange={(event) =>
                          updateParam(control.urlKey, event.target.value)
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-60"
                      />
                    ) : control.type === 'select' ? (
                      <select
                        value={value}
                        disabled={control.locked}
                        onChange={(event) =>
                          updateParam(control.urlKey, event.target.value)
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-60"
                      >
                        {control.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={value}
                        disabled={control.locked}
                        onChange={(event) =>
                          updateParam(control.urlKey, event.target.value)
                        }
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 disabled:opacity-60"
                      />
                    )}

                    <span className="text-right text-[11px] text-slate-400">
                      {control.locked ? 'locked' : control.type}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid gap-2">
              {Object.entries(activeParams).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                  <input
                    value={key}
                    onChange={(event) => {
                      const newKey = event.target.value.trim()
                      if (!newKey || newKey === key) {
                        return
                      }
                      setActiveParams((prev) => {
                        const next = { ...prev }
                        const oldValue = next[key]
                        delete next[key]
                        next[newKey] = oldValue
                        return next
                      })
                    }}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                  />
                  <input
                    value={value}
                    onChange={(event) => updateParam(key, event.target.value)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeParam(key)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            {configuredControls.length === 0 ? (
              <button
                type="button"
                onClick={addParam}
                className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200"
              >
                Add Param
              </button>
            ) : null}
            <button
              type="button"
              onClick={applyParamsToIframe}
              className="rounded border border-emerald-700 bg-emerald-800 px-2 py-1 text-emerald-100"
            >
              Apply Params
            </button>
            <button
              type="button"
              onClick={applyAndRunQuery}
              className="rounded border border-cyan-700 bg-cyan-800 px-2 py-1 text-cyan-100"
            >
              Apply + Run Query
            </button>
          </div>
        </div>
      ) : null}

      {iframeSrc ? (
        <div className="h-[calc(100vh-2.5rem)] w-full overflow-hidden">
          <iframe
            ref={iframeRef}
            title={config.title || 'Redash Dashboard'}
            src={iframeSrc}
            onLoad={tryHideElementsInsideIframe}
            className="w-full border-0"
            style={
              topCropPx
                ? {
                    height: `calc(100vh - 2.5rem + ${topCropPx}px)`,
                    transform: `translateY(-${topCropPx}px)`,
                  }
                : { height: 'calc(100vh - 2.5rem)' }
            }
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="flex h-[calc(100vh-2.5rem)] items-center justify-center text-sm text-slate-400">
          Invalid URL in dashboard config for slug: {slug}
        </div>
      )}
    </main>
  )
}

function AdminPage({ dashboards, onSave }) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [jsonText, setJsonText] = useState(
    JSON.stringify(dashboards, null, 2)
  )

  const handleLogin = (event) => {
    event.preventDefault()

    if (password === ADMIN_PASSWORD) {
      setAuthed(true)
      setError('')
      return
    }

    setError('Invalid password')
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText)

      if (!isObject(parsed)) {
        setError('JSON must be an object with slug keys')
        return
      }

      onSave(parsed)
      setError('')
    } catch {
      setError('JSON is not valid')
    }
  }

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold text-slate-900">Admin Login</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter password to edit dashboard configuration.
          </p>

          <label className="mt-4 grid gap-1 text-sm text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            Login
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Dashboard Config Admin
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Edit JSON and save. This stores configuration in browser localStorage.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Optional per-dashboard config: parameterControls[] (type=date/select/text,
          defaultValue, options, locked) and queryExecution (queryId, maxAge,
          applyAutoLimit, apiBaseUrl/apiPathPrefix, csrfToken).
        </p>

        <textarea
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          className="mt-4 h-[60vh] w-full rounded-lg border border-slate-300 p-3 font-mono text-xs text-slate-900"
          spellCheck={false}
        />

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save JSON
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Open Dashboard
          </a>
        </div>
      </div>
    </main>
  )
}

function App() {
  const [dashboards, setDashboards] = useState(
    () => loadDashboardsFromStorage() || defaultDashboards
  )

  const handleSave = (nextDashboards) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDashboards))
    setDashboards(nextDashboards)
  }

  if (window.location.pathname === '/admin') {
    return <AdminPage dashboards={dashboards} onSave={handleSave} />
  }

  return <EmbeddedDashboard dashboards={dashboards} />
}

export default App
