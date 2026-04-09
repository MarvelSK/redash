import { lazy, Suspense, useState } from 'react'
import { STORAGE_KEY, STORE_CATALOG_STORAGE_KEY } from './constants'
import type { DashboardsMap, StoreConfig } from './types'
import { loadDashboardsFromStorage } from './lib/storage'

const EmbeddedDashboard = lazy(async () => {
  const mod = await import('./components/embed/EmbeddedDashboard')
  return { default: mod.EmbeddedDashboard }
})

const AdminPage = lazy(async () => {
  const mod = await import('./components/admin/AdminPage')
  return { default: mod.AdminPage }
})

function App() {
  const [dashboards, setDashboards] = useState<DashboardsMap>(
    () => loadDashboardsFromStorage() || {},
  )
  const [stores, setStores] = useState<StoreConfig[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORE_CATALOG_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((row) => {
          const value = row as { id?: unknown; name?: unknown }
          return {
            id: String(value.id || '').trim(),
            name: String(value.name || '').trim(),
          }
        })
        .filter((row) => row.id)
    } catch {
      return []
    }
  })

  const handleSave = (nextDashboards: DashboardsMap) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDashboards))
    setDashboards(nextDashboards)
  }

  const handleSaveStores = (nextStores: StoreConfig[]) => {
    window.localStorage.setItem(STORE_CATALOG_STORAGE_KEY, JSON.stringify(nextStores))
    setStores(nextStores)
  }

  if (window.location.pathname === '/admin') {
    return (
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading admin…</div>}>
        <AdminPage dashboards={dashboards} stores={stores} onSave={handleSave} onSaveStores={handleSaveStores} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading dashboard…</div>}>
      <EmbeddedDashboard dashboards={dashboards} stores={stores} />
    </Suspense>
  )
}

export default App
