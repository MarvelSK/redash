import { useEffect, useMemo, useState } from 'react'
import { ADMIN_PASSWORD } from '../../constants'
import { emptyDashboard, slugify } from '../../lib/admin-defaults'
import type { DashboardsMap, DashboardConfig } from '../../types'
import { AdminDashboardEditor } from './AdminDashboardEditor'
import { AdminDashboardList } from './AdminDashboardList'
import { importDashboardsFromRedash } from '../../lib/redash-import'

interface AdminPageProps {
  dashboards: DashboardsMap
  onSave: (dashboards: DashboardsMap) => void
}

export function AdminPage({ dashboards, onSave }: AdminPageProps) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [section, setSection] = useState<'dashboards' | 'builder' | 'system'>('dashboards')
  const [importBusy, setImportBusy] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [apiRoot, setApiRoot] = useState(
    (import.meta.env.VITE_REDASH_PROXY_PATH as string | undefined) || '/redash-api',
  )
  const [apiKey, setApiKey] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'overwrite' | 'merge'>('skip')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [preview, setPreview] = useState<string[]>([])
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncMinutes, setSyncMinutes] = useState(30)

  const syncIntervalMs = useMemo(() => Math.max(5, Number(syncMinutes || 30)) * 60_000, [syncMinutes])

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setAuthed(true)
      setError('')
    } else {
      setError('Invalid password')
    }
  }

  const handleAdd = () => {
    const title = window.prompt('Dashboard title:')?.trim()
    if (!title) return

    const slug = slugify(title)
    if (dashboards[slug]) {
      setError(`Slug "${slug}" already exists. Choose a different title.`)
      return
    }

    const next = { ...dashboards, [slug]: { ...emptyDashboard(), title } }
    onSave(next)
    setEditingSlug(slug)
    setView('edit')
    setSection('builder')
  }

  const handleDelete = (slug: string) => {
    const next = { ...dashboards }
    delete next[slug]
    onSave(next)
  }

  const handleEdit = (slug: string) => {
    setEditingSlug(slug)
    setView('edit')
    setSection('builder')
  }

  const handleSaveDashboard = (slug: string, updated: DashboardConfig) => {
    const next = { ...dashboards, [slug]: updated }
    onSave(next)
    setView('list')
    setEditingSlug(null)
    setSection('dashboards')
  }

  const runImport = async ({ dryRun, silent }: { dryRun: boolean; silent?: boolean }) => {
    setError('')
    if (!silent) setImportMessage('')

    if (!apiRoot.trim()) {
      setError('API root is required (for example /redash-api or https://redash.example.com).')
      return
    }
    if (!apiKey.trim()) {
      setError('API key is required for Redash API import.')
      return
    }

    setImportBusy(true)
    try {
      const result = await importDashboardsFromRedash(dashboards, {
        endpointRoot: apiRoot.trim(),
        apiKey: apiKey.trim(),
        orgSlug: orgSlug.trim() || undefined,
        includeArchived,
        conflictPolicy,
        dryRun,
      })

      const previewRows = result.changes.slice(0, 30).map((change) => {
        const quality =
          change.missingLanguageUrls > 0
            ? ` | missing lang URLs: ${change.missingLanguageUrls}`
            : ' | language URLs complete'
        return `${change.action.toUpperCase()} ${change.slug}${quality}`
      })
      setPreview(previewRows)

      if (dryRun) {
        setImportMessage(
          `Dry run: ${result.importedCount} dashboard changes ready. ${result.skipped.length} skipped.`,
        )
        setToast({ type: 'success', message: 'Dry run completed. Review preview before applying.' })
        return
      }

      onSave(result.merged)
      const skippedNote =
        result.skipped.length > 0
          ? ` Skipped existing: ${result.skipped.slice(0, 6).join(', ')}${
              result.skipped.length > 6 ? '…' : ''
            }.`
          : ''
      setImportMessage(`Imported ${result.importedCount} dashboards.${skippedNote}`)
      setToast({ type: 'success', message: `Import applied (${result.importedCount}).` })
      setSection('dashboards')
      setView('list')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Import failed.'
      setError(message)
      setToast({ type: 'error', message })
    } finally {
      setImportBusy(false)
    }
  }

  const handleImportFromRedash = async () => runImport({ dryRun: false })
  const handleDryRun = async () => runImport({ dryRun: true })

  useEffect(() => {
    if (!authed || !autoSyncEnabled || !apiKey.trim()) return
    const id = window.setInterval(() => {
      void runImport({ dryRun: false, silent: true })
    }, syncIntervalMs)
    return () => window.clearInterval(id)
  }, [authed, autoSyncEnabled, apiKey, syncIntervalMs, dashboards, apiRoot, orgSlug, includeArchived, conflictPolicy])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(id)
  }, [toast])

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600 text-2xl font-bold text-white shadow-sm">
              R
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard Admin</h1>
            <p className="mt-1 text-sm text-slate-500">Enter your password to continue</p>
          </div>
          <form
            onSubmit={handleLogin}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                placeholder="••••••••"
                autoFocus
              />
            </label>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 active:bg-sky-700"
            >
              Continue →
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white shadow-sm">
                R
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-slate-900">Dashboard Admin</p>
                <p className="text-xs text-slate-500">Redash Embed Console</p>
              </div>
            </div>
          </div>

          <nav className="space-y-1 p-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Navigation
            </p>
            <button
              type="button"
              onClick={() => {
                setSection('dashboards')
                setView('list')
              }}
              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                section === 'dashboards'
                  ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Dashboards
            </button>
            <button
              type="button"
              onClick={() => setSection('builder')}
              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                section === 'builder'
                  ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Builder
            </button>
            <button
              type="button"
              onClick={() => setSection('system')}
              className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                section === 'system'
                  ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              System
            </button>
          </nav>

          <div className="border-t border-slate-200 p-3">
            <a
              href="/"
              className="block rounded-xl border border-slate-300 px-3 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              ← View App
            </a>
          </div>
        </aside>

        <section className="px-4 py-6 sm:px-6 lg:px-8">
          {toast ? (
            <div
              className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                toast.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {toast.message}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {section === 'system' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Overview
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {Object.keys(dashboards).length}
                </p>
                <p className="text-sm text-slate-500">Dashboards configured</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Access
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  Admin access is protected by VITE_ADMIN_PASSWORD from .env.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Import From Redash API
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Fetch dashboards and parameters automatically. Requires a Redash user API key.
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Security note: API key is kept in memory for this session and is never written into saved
                  dashboard query settings.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">API root / proxy path</span>
                    <input
                      value={apiRoot}
                      onChange={(e) => setApiRoot(e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="/redash-api or https://redash.example.com"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Org slug (optional)</span>
                    <input
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="default"
                    />
                  </label>

                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Redash API key</span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      placeholder="Key ..."
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Conflict policy</span>
                    <select
                      value={conflictPolicy}
                      onChange={(e) => setConflictPolicy(e.target.value as 'skip' | 'overwrite' | 'merge')}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="skip">Skip existing dashboards</option>
                      <option value="merge">Merge with existing dashboards</option>
                      <option value="overwrite">Overwrite existing dashboards</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.target.checked)}
                    />
                    Include archived dashboards
                  </label>
                </div>

                <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoSyncEnabled}
                      onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                    />
                    Enable scheduled sync
                  </label>
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Sync every (minutes)</span>
                    <input
                      type="number"
                      min={5}
                      value={syncMinutes}
                      onChange={(e) => setSyncMinutes(Number(e.target.value || 30))}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDryRun}
                    disabled={importBusy}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importBusy ? 'Running...' : 'Dry Run'}
                  </button>
                  <button
                    type="button"
                    onClick={handleImportFromRedash}
                    disabled={importBusy}
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {importBusy ? 'Importing...' : 'Import Dashboards'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setApiKey('')}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Clear API Key
                  </button>
                  {importMessage ? <p className="text-sm text-emerald-700">{importMessage}</p> : null}
                </div>

                {preview.length > 0 ? (
                  <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Import Preview (first {preview.length} changes)
                    </p>
                    <ul className="mt-2 max-h-52 overflow-auto text-xs text-slate-600">
                      {preview.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          ) : view === 'list' || section === 'dashboards' ? (
            <AdminDashboardList
              dashboards={dashboards}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ) : editingSlug && dashboards[editingSlug] ? (
            <AdminDashboardEditor
              slug={editingSlug}
              dashboard={dashboards[editingSlug]}
              dashboards={dashboards}
              onSave={handleSaveDashboard}
              onBack={() => {
                setView('list')
                setEditingSlug(null)
                setSection('dashboards')
              }}
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Select a dashboard from the Dashboards section to start editing.
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
