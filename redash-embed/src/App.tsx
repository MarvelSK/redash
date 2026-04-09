import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { DashboardsMap, EmbedAccessSession, StoreConfig } from './types'
import {
  loadAccessSession,
  loadAdminEmbedConfig,
  loadPublicEmbedConfig,
  logoutAccessSession,
  saveEmbedConfig,
  verifyAccessCode,
} from './lib/embed-config-api'
import { AccessCodeGate } from './components/embed/AccessCodeGate'

const EmbeddedDashboard = lazy(async () => {
  const mod = await import('./components/embed/EmbeddedDashboard')
  return { default: mod.EmbeddedDashboard }
})

const AdminPage = lazy(async () => {
  const mod = await import('./components/admin/AdminPage')
  return { default: mod.AdminPage }
})

function App() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dashboards, setDashboards] = useState<DashboardsMap>({})
  const [stores, setStores] = useState<StoreConfig[]>([])
  const [homeDashboardSlug, setHomeDashboardSlug] = useState('')
  const [adminCode, setAdminCode] = useState('')
  const [accessSession, setAccessSession] = useState<EmbedAccessSession | null>(null)

  const pathname = window.location.pathname.replace(/\/+$/, '')
  const isAdminRoute = pathname === '/admin'

  const hasAdminSession = useMemo(() => accessSession?.role === 'admin', [accessSession])

  const loadPublicConfig = async () => {
    const config = await loadPublicEmbedConfig()
    setDashboards(config.dashboards || {})
    setStores(config.stores || [])
    setHomeDashboardSlug(config.homeDashboardSlug || '')
  }

  useEffect(() => {
    let active = true

    const run = async () => {
      setLoading(true)
      setError('')
      try {
        await Promise.all([
          loadPublicConfig(),
          loadAccessSession()
            .then((session) => {
              if (!session.role) {
                setAccessSession(null)
                return
              }
              setAccessSession({
                role: session.role,
                storeId: session.storeId,
              })
            })
            .catch(() => {
              setAccessSession(null)
            }),
        ])
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : 'Failed to load app configuration.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isAdminRoute || !hasAdminSession) return

    let active = true
    const run = async () => {
      try {
        const config = await loadAdminEmbedConfig()
        if (!active) return
        setDashboards(config.dashboards || {})
        setStores(config.stores || [])
        setHomeDashboardSlug(config.homeDashboardSlug || '')
        setAdminCode(config.adminCode || '')
      } catch {
        if (!active) return
        setAccessSession(null)
        setError('Admin session expired. Enter code again.')
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [isAdminRoute, hasAdminSession])

  const handleCodeSubmit = async (code: string) => {
    setBusy(true)
    setError('')
    try {
      const verified = await verifyAccessCode(code)
      setAccessSession({
        role: verified.role,
        storeId: verified.storeId,
      })

      if (verified.role === 'admin' && isAdminRoute) {
        const adminConfig = await loadAdminEmbedConfig()
        setDashboards(adminConfig.dashboards || {})
        setStores(adminConfig.stores || [])
        setHomeDashboardSlug(adminConfig.homeDashboardSlug || '')
        setAdminCode(adminConfig.adminCode || '')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code.')
    } finally {
      setBusy(false)
    }
  }

  const handleSaveAdminConfig = async (
    nextDashboards: DashboardsMap,
    nextStores: StoreConfig[],
    nextHomeDashboardSlug: string,
    nextAdminCode: string,
  ) => {
    await saveEmbedConfig({
      dashboards: nextDashboards,
      stores: nextStores,
      homeDashboardSlug: nextHomeDashboardSlug,
      adminCode: nextAdminCode,
    })

    setDashboards(nextDashboards)
    setStores(nextStores)
    setHomeDashboardSlug(nextHomeDashboardSlug)
    setAdminCode(nextAdminCode)
  }

  const handleLogout = async () => {
    try {
      await logoutAccessSession()
    } finally {
      setAccessSession(null)
      setError('')
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading application...</div>
  }

  if (error && !accessSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      </main>
    )
  }

  if (!accessSession) {
    return <AccessCodeGate busy={busy} error={error} onSubmit={handleCodeSubmit} />
  }

  if (isAdminRoute) {
    if (!hasAdminSession) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">Admin Access Required</h1>
            <p className="mt-2 text-sm text-slate-500">Use admin PIN code to open this page.</p>
            <button
              type="button"
              onClick={() => {
                void handleLogout()
              }}
              className="mt-4 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
            >
              Enter Different Code
            </button>
          </div>
        </main>
      )
    }

    return (
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading admin…</div>}>
        <AdminPage
          dashboards={dashboards}
          stores={stores}
          homeDashboardSlug={homeDashboardSlug}
          adminCode={adminCode}
          onSave={handleSaveAdminConfig}
        />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading dashboard…</div>}>
      <EmbeddedDashboard
        dashboards={dashboards}
        stores={stores}
        homeDashboardSlug={homeDashboardSlug}
        accessSession={accessSession}
        onLogout={handleLogout}
      />
    </Suspense>
  )
}

export default App
