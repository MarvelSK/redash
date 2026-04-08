import { lazy, Suspense, useState } from 'react'
import defaultDashboards from './dashboards.json'
import { STORAGE_KEY } from './constants'
import type { DashboardsMap } from './types'
import { loadDashboardsFromStorage, normalizeDashboards } from './lib/storage'

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
    () => loadDashboardsFromStorage() || normalizeDashboards(defaultDashboards),
  )

  const handleSave = (nextDashboards: DashboardsMap) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDashboards))
    setDashboards(nextDashboards)
  }

  if (window.location.pathname === '/admin') {
    return (
      <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading admin…</div>}>
        <AdminPage dashboards={dashboards} onSave={handleSave} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading dashboard…</div>}>
      <EmbeddedDashboard dashboards={dashboards} />
    </Suspense>
  )
}

export default App
