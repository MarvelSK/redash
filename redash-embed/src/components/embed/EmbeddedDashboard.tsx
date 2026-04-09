import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardsMap, DashboardConfig, EmbedAccessSession, StoreConfig } from '../../types'
import {
  buildExecutionPayload,
  buildExecutionUrl,
  buildJobUrl,
  getConfiguredControls,
  getInitialParams,
  parseParams,
  pollJobToCompletion,
} from '../../lib/params'
import { buildIframeUrl, discoverParamsUsingApi, getCookieValue } from '../../lib/iframe.ts'
import { getAvailableLanguages, normalizeDashboard, resolveTab } from '../../lib/storage'
import {
  EMBED_FILTERS_STORAGE_PREFIX,
  EMBED_LOCALE_STORAGE_KEY,
  SYSTEM_PARAM_KEYS,
} from '../../constants'
import {
  APP_LOCALES,
  getStrings,
  preferredDashboardLanguage,
  resolveLocaleFromBrowser,
  type AppLocale,
} from '../../lib/i18n'
import { NoDashboardState } from './NoDashboardState'
import { DashboardGate } from './DashboardGate'

const DashboardSidebar = lazy(async () => {
  const mod = await import('./DashboardSidebar.tsx')
  return { default: mod.DashboardSidebar }
})

interface EmbeddedDashboardProps {
  dashboards: DashboardsMap
  stores: StoreConfig[]
  homeDashboardSlug: string
  accessSession: EmbedAccessSession
  onLogout: () => void
}

export function EmbeddedDashboard({ dashboards, stores, homeDashboardSlug, accessSession, onLogout }: EmbeddedDashboardProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const hideObserverRef = useRef<MutationObserver | null>(null)
  const modalOpenRef = useRef(false)
  const lastAutoLoadKeyRef = useRef('')

  const pathname = window.location.pathname.replace(/\/+$/, '')
  const segments = pathname.split('/').filter(Boolean)
  const slug =
    segments.length > 0
      ? decodeURIComponent(segments[segments.length - 1])
      : homeDashboardSlug || 'default'
  const rawDashboard = dashboards[slug] || dashboards.default || Object.values(dashboards)[0] || null
  const dashboard: DashboardConfig | null = rawDashboard ? normalizeDashboard(rawDashboard) : null

  const [unlocked, setUnlocked] = useState(() => !dashboard?.password)
  const [gatePassword, setGatePassword] = useState('')
  const [gateError, setGateError] = useState('')

  useEffect(() => {
    setUnlocked(!dashboard?.password)
    setGatePassword('')
    setGateError('')
  }, [slug, dashboard?.password])

  const handleGateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (dashboard && gatePassword === dashboard.password) {
      setUnlocked(true)
      setGateError('')
    } else {
      setGateError('Incorrect password')
    }
  }

  const tabs = dashboard?.tabs || []
  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || '')
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]

  const availableLanguages = getAvailableLanguages(dashboard)
  const defaultLang = dashboard?.defaultLanguage || availableLanguages[0] || 'en'
  const [locale, setLocale] = useState<AppLocale>(() => {
    try {
      const stored = window.localStorage.getItem(EMBED_LOCALE_STORAGE_KEY)
      if (stored === 'en' || stored === 'fr' || stored === 'de-ch') {
        return stored
      }
    } catch {
      // ignore localStorage failures
    }
    return resolveLocaleFromBrowser()
  })
  const [language, setLanguage] = useState(() =>
    preferredDashboardLanguage(locale, availableLanguages, defaultLang),
  )

  const filtersStorageKey = useMemo(
    () => `${EMBED_FILTERS_STORAGE_PREFIX}${slug}.${activeTabId}.${language}`,
    [slug, activeTabId, language],
  )

  useEffect(() => {
    const next = preferredDashboardLanguage(locale, availableLanguages, defaultLang)
    setLanguage(next)
    document.documentElement.lang = locale
  }, [locale, availableLanguages, defaultLang])

  useEffect(() => {
    try {
      window.localStorage.setItem(EMBED_LOCALE_STORAGE_KEY, locale)
    } catch {
      // ignore localStorage failures
    }
  }, [locale])

  const config = resolveTab(activeTab, language)
  const t = getStrings(locale)

  const iframeUrl = useMemo(() => buildIframeUrl(config), [config])
  const configuredControls = useMemo(() => getConfiguredControls(config), [config])
  const lockedStoreId = accessSession.role === 'store' ? accessSession.storeId || '' : ''
  const lockedShopKeys = useMemo(() => {
    if (!lockedStoreId) return []
    return configuredControls
      .filter((control) => {
        const normalized = control.urlKey.toLowerCase()
        const byUrlKey = normalized === 'p_shop_id' || normalized.endsWith('.shop_id')
        const byName = control.name.toLowerCase() === 'shop_id'
        return byUrlKey || byName
      })
      .map((control) => control.urlKey)
  }, [configuredControls, lockedStoreId])

  const [activeParams, setActiveParams] = useState<Record<string, string>>(() =>
    getInitialParams(config, configuredControls),
  )
  const [iframeSrc, setIframeSrc] = useState(iframeUrl)
  const [loadStatus, setLoadStatus] = useState('')
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [isIframeModalOpen, setIsIframeModalOpen] = useState(false)
  const topCropPx = config?.hideParameters && !isIframeModalOpen ? 155 : 0
  const isPublicDashboardUrl = (config?.url || '').includes('/public/dashboards/')
  const bottomCropPx = isPublicDashboardUrl ? 95 : 0

  const areParamsEqual = (a: Record<string, string>, b: Record<string, string>) => {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false
    }
    return true
  }

  useEffect(() => {
    if (!toastMessage) return
    const id = window.setTimeout(() => setToastMessage(''), 2800)
    return () => window.clearTimeout(id)
  }, [toastMessage])

  const handleLocaleChange = (nextLocale: AppLocale) => {
    const desiredLang = APP_LOCALES.find((item) => item.code === nextLocale)?.dashboardLang || 'en'
    if (!availableLanguages.includes(desiredLang)) {
      setToastMessage('This dashboard has no translation for the selected language.')
      return
    }
    setLocale(nextLocale)
  }

  useEffect(() => {
    const autoLoadKey = `${activeTabId}|${language}|${config?.url || ''}|${config?.params || ''}`
    if (lastAutoLoadKeyRef.current === autoLoadKey) return
    lastAutoLoadKeyRef.current = autoLoadKey

    const parsed = getInitialParams(config, configuredControls)
    let nextParams = parsed
    let hasSavedFilters = false

    try {
      const raw = window.localStorage.getItem(filtersStorageKey)
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
          const merged: Record<string, string> = { ...parsed }
          Object.entries(saved).forEach(([key, value]) => {
            if (typeof value === 'string') {
              merged[key] = value
            }
          })
          nextParams = merged
          hasSavedFilters = true
        }
      }
    } catch {
      // ignore malformed localStorage data
    }

    setActiveParams((prev) => (areParamsEqual(prev, nextParams) ? prev : nextParams))
    setIframeSrc(buildIframeUrl(config, nextParams))
    setLoadStatus('')
    if (!hasSavedFilters) {
      void loadParamsFromIframe()
    }
  }, [activeTabId, language, config?.url, config?.params, filtersStorageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(filtersStorageKey, JSON.stringify(activeParams))
    } catch {
      // ignore localStorage failures
    }
  }, [filtersStorageKey, activeParams])

  useEffect(() => {
    if (!lockedStoreId || lockedShopKeys.length === 0) return
    setActiveParams((prev) => {
      const next = { ...prev }
      let changed = false
      for (const key of lockedShopKeys) {
        if (next[key] !== lockedStoreId) {
          next[key] = lockedStoreId
          changed = true
        }
      }
      if (changed) {
        setIframeSrc(buildIframeUrl(config, next))
      }
      return changed ? next : prev
    })
  }, [lockedStoreId, lockedShopKeys, config])

  useEffect(() => {
    const interval = Number(config?.refreshIntervalSeconds)
    if (!Number.isFinite(interval) || interval <= 0) {
      setRefreshCountdown(null)
      return
    }

    setRefreshCountdown(interval)
    let remaining = interval

    const tick = window.setInterval(() => {
      remaining -= 1
      setRefreshCountdown(remaining)
      if (remaining <= 0) {
        remaining = interval
        setRefreshCountdown(interval)
        setIframeSrc(buildIframeUrl(config, activeParams))
      }
    }, 1000)

    return () => window.clearInterval(tick)
  }, [config?.refreshIntervalSeconds, config?.url])

  const hideRedashChromeInDocument = (doc: Document) => {
    // Keep injected CSS updated for hidden Redash chrome.
    let style = doc.getElementById('redash-embed-hide-style') as HTMLStyleElement | null
    if (!style) {
      style = doc.createElement('style')
      style.id = 'redash-embed-hide-style'
      doc.head?.appendChild(style)
    }

    style.textContent = `
      .parameter-container,
      .parameter-apply-button,
      .m-b-10.p-15.bg-white.tiled,
      .page-header-wrapper,
      .public-dashboard-page #footer,
      #footer,
      footer {
        display: none !important;
      }
    `

    const selectors = [
      '.m-b-10.p-15.bg-white.tiled',
      '.parameter-container',
      '.parameter-apply-button',
      '.page-header-wrapper',
      '.public-dashboard-page #footer',
      '#footer',
      'footer',
    ]

    selectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((node) => {
        ;(node as HTMLElement).style.display = 'none'
      })
    })

    const modalOpen = Boolean(doc.querySelector('.ant-modal-root .ant-modal-wrap'))
    if (modalOpen !== modalOpenRef.current) {
      modalOpenRef.current = modalOpen
      setIsIframeModalOpen(modalOpen)
    }
  }

  const tryHideElementsInsideIframe = () => {
    const iframe = iframeRef.current
    if (!iframe) return

    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (!doc) return
      hideRedashChromeInDocument(doc)

      if (hideObserverRef.current) {
        hideObserverRef.current.disconnect()
        hideObserverRef.current = null
      }

      if (doc.body) {
        const observer = new MutationObserver(() => {
          hideRedashChromeInDocument(doc)
        })
        observer.observe(doc.body, { childList: true, subtree: true })
        hideObserverRef.current = observer
      }
    } catch {
      // cross-origin
    }
  }

  useEffect(
    () => () => {
      if (hideObserverRef.current) {
        hideObserverRef.current.disconnect()
        hideObserverRef.current = null
      }
    },
    [],
  )

  const loadParamsFromIframe = async () => {
    const iframe = iframeRef.current
    const baseParams = parseParams(config?.params || '')
    const loaded: Record<string, string> = { ...baseParams }

    const apiResult = await discoverParamsUsingApi(config?.url || '')
    if (apiResult?.discovered) {
      const discovered = Object.entries(apiResult.discovered).reduce<Record<string, string>>(
        (acc, [k, v]) => {
          acc[k] = String(v ?? '')
          return acc
        },
        {},
      )
      const nextParams = { ...loaded, ...discovered }
      setActiveParams((prev) => (areParamsEqual(prev, nextParams) ? prev : nextParams))
      setLoadStatus(`Loaded params from ${apiResult.source}.`)
      return
    }

    if (!iframe) {
      return
    }

    let domLoaded = false
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        const blocks = doc.querySelectorAll('[data-test^="ParameterBlock-"]')
        blocks.forEach((block) => {
          const testAttr = block.getAttribute('data-test') || ''
          const name = testAttr.replace('ParameterBlock-', '').trim()
          if (!name) return
          const textInput = block.querySelector('input') as HTMLInputElement | null
          const selectedItem = block.querySelector('.ant-select-selection-item')
          let value = ''
          if (textInput && typeof textInput.value === 'string') value = textInput.value
          else if (selectedItem?.textContent) value = selectedItem.textContent.trim()
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
          if (SYSTEM_PARAM_KEYS.has(key)) return
          loaded[key] = value
        })
        setLoadStatus('Public/proxy API unavailable. Loaded params from iframe URL fallback.')
      } catch {
        setLoadStatus('Could not load params from iframe.')
      }
    } else {
      setLoadStatus('Public/proxy API unavailable. Loaded params from iframe controls.')
    }

    setActiveParams((prev) => (areParamsEqual(prev, loaded) ? prev : loaded))
  }

  const updateParam = (key: string, value: string) => {
    if (lockedStoreId && lockedShopKeys.includes(key)) return
    setActiveParams((prev) => {
      const next = { ...prev, [key]: value }
      setIframeSrc(buildIframeUrl(config, next))
      return next
    })
  }

  const applyAndRunQuery = async () => {
    const nextUrl = buildIframeUrl(config, activeParams)
    setIframeSrc(nextUrl)

    const payload = buildExecutionPayload(config, activeParams, configuredControls)
    if (!payload) {
      setLoadStatus('Applied params to iframe URL. Query execution is not configured in /admin.')
      return
    }

    const requestUrl = buildExecutionUrl(payload)
    const csrfToken = payload.csrfToken || getCookieValue('csrf_token')
    const credentials: RequestCredentials = payload.includeCredentials ? 'include' : 'omit'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
    if (payload.apiKey) headers['Authorization'] = `Key ${payload.apiKey}`

    pollAbortRef.current?.abort()
    const abortController = new AbortController()
    pollAbortRef.current = abortController

    try {
      setLoadStatus('Submitting query execution request...')
      const response = await fetch(requestUrl, {
        method: 'POST',
        credentials,
        headers,
        signal: abortController.signal,
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
          `Request failed (${response.status}). Check /admin queryExecution and auth. ${errorText}`,
        )
        return
      }

      const result = (await response.json()) as { job?: { id?: string } }
      const jobId = result?.job?.id
      if (!jobId) {
        setLoadStatus('Cached result returned. Params applied to iframe.')
        return
      }

      setLoadStatus(`Query job started (${jobId}). Polling for completion...`)
      const jobUrl = buildJobUrl(payload, jobId)
      const pollHeaders = { ...headers }
      delete pollHeaders['Content-Type']

      const queryResultId = await pollJobToCompletion(
        jobUrl,
        pollHeaders,
        credentials,
        abortController.signal,
        setLoadStatus,
      )

      setLoadStatus(`Query SUCCESS (result ${queryResultId}). Reloading iframe with fresh data...`)
      setIframeSrc(`${nextUrl}&_t=${Date.now()}`)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setLoadStatus('Query polling cancelled.')
        return
      }
      const message = err instanceof Error ? err.message : 'network/CORS/auth error.'
      setLoadStatus(`Query execution error: ${message}`)
    }
  }

  if (!dashboard) return <NoDashboardState />

  if (!unlocked) {
    return (
      <DashboardGate
        dashboard={dashboard}
        gatePassword={gatePassword}
        gateError={gateError}
        onPasswordChange={setGatePassword}
        onSubmit={handleGateSubmit}
      />
    )
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-100 text-slate-900">
      <Suspense fallback={<div className="h-11 border-b border-slate-200 bg-white" />}>
        <DashboardSidebar
          stores={stores}
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          availableLanguages={availableLanguages}
          locale={locale}
          onLocaleChange={handleLocaleChange}
          configuredControls={configuredControls}
          activeParams={activeParams}
          updateParam={updateParam}
          onApplyAndRunQuery={applyAndRunQuery}
          refreshCountdown={refreshCountdown}
          canOpenAdmin={accessSession.role === 'admin'}
          lockedStoreId={lockedStoreId}
          onLogout={onLogout}
        />
      </Suspense>

      <div className="min-h-0 flex-1 overflow-hidden">
        {toastMessage ? (
          <div className="pointer-events-none absolute right-3 top-3 z-40 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm">
            {toastMessage}
          </div>
        ) : null}

        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            title={config.label || dashboard.title || 'Redash Dashboard'}
            src={iframeSrc}
            onLoad={tryHideElementsInsideIframe}
            className="w-full border-0"
            style={
              topCropPx > 0 || bottomCropPx > 0
                ? {
                    height: `calc(100% + ${topCropPx + bottomCropPx}px)`,
                    transform: `translateY(-${topCropPx}px)`,
                  }
                : { height: '100%' }
            }
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {t.noUrl}
          </div>
        )}
      </div>
    </div>
  )
}
