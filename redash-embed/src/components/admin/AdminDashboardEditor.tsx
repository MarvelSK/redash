import { useEffect, useMemo, useState } from 'react'
import type { DashboardConfig, DashboardsMap, TabConfig } from '../../types'
import { emptyTab } from '../../lib/admin-defaults'
import { AdminTabEditor } from './AdminTabEditor'
import { Field, inputCls } from './shared'

interface AdminDashboardEditorProps {
  slug: string
  dashboard: DashboardConfig
  dashboards: DashboardsMap
  onSave: (slug: string, dashboard: DashboardConfig) => void
  onBack: () => void
}

export function AdminDashboardEditor({
  slug,
  dashboard,
  dashboards,
  onSave,
  onBack,
}: AdminDashboardEditorProps) {
  const [draft, setDraft] = useState<DashboardConfig>(() => JSON.parse(JSON.stringify(dashboard)))
  const [activeTabId, setActiveTabId] = useState(draft.tabs?.[0]?.id || '')
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showAddTabPicker, setShowAddTabPicker] = useState(false)
  const [addTabMode, setAddTabMode] = useState<'new' | 'existing'>('new')
  const [sourceDashboardSlug, setSourceDashboardSlug] = useState<string>(slug)
  const [sourceTabId, setSourceTabId] = useState<string>(dashboard.tabs?.[0]?.id || '')

  const activeTabIndex = draft.tabs?.findIndex((t) => t.id === activeTabId) ?? -1
  const activeTab = draft.tabs?.[activeTabIndex]
  const isDirty = useMemo(
    () => JSON.stringify(dashboard) !== JSON.stringify(draft),
    [dashboard, draft],
  )

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const ensureUniqueTabId = (baseId: string) => {
    const safe = String(baseId || 'tab').replace(/\s+/g, '-').toLowerCase()
    let next = safe
    let index = 2
    while ((draft.tabs || []).some((t) => t.id === next)) {
      next = `${safe}-${index}`
      index += 1
    }
    return next
  }

  const updateTab = (next: TabConfig) => {
    const tabs = [...(draft.tabs || [])]
    tabs[activeTabIndex] = next
    setDraft({ ...draft, tabs })
    setActiveTabId(next.id)
  }

  const addTab = () => {
    const t = emptyTab()
    t.id = ensureUniqueTabId(t.id)
    const tabs = [...(draft.tabs || []), t]
    setDraft({ ...draft, tabs })
    setActiveTabId(t.id)
    setShowAddTabPicker(false)
  }

  const addTabFromExisting = () => {
    const sourceDashboard = dashboards[sourceDashboardSlug]
    const sourceTab = sourceDashboard?.tabs?.find((t) => t.id === sourceTabId)
    if (!sourceTab) {
      setError('Please select a valid source dashboard and tab.')
      return
    }

    const cloned = JSON.parse(JSON.stringify(sourceTab)) as TabConfig
    cloned.id = ensureUniqueTabId(cloned.id || 'tab')
    cloned.label = cloned.label ? `${cloned.label} Copy` : 'Copied Tab'

    const tabs = [...(draft.tabs || []), cloned]
    setDraft({ ...draft, tabs })
    setActiveTabId(cloned.id)
    setShowAddTabPicker(false)
  }

  const deleteTab = (id: string) => {
    if (draft.tabs.length === 1) {
      setError('Cannot delete the only tab.')
      return
    }
    if (!window.confirm('Delete this tab?')) return
    const tabs = draft.tabs.filter((t) => t.id !== id)
    setDraft({ ...draft, tabs })
    setActiveTabId(tabs[0]?.id || '')
  }

  const handleSave = () => {
    const errors: string[] = []
    if (!draft.title.trim()) {
      errors.push('Title is required.')
    }
    for (const tab of draft.tabs || []) {
      if (!tab.id.trim()) {
        errors.push('Every tab must have an ID.')
      }
      if (Object.keys(tab.languages || {}).length === 0) {
        errors.push(`Tab "${tab.label || tab.id}" needs at least one language URL.`)
      }
    }
    if (errors.length > 0) {
      setValidationErrors(errors)
      setError('Please fix the highlighted validation issues before saving.')
      return
    }

    setValidationErrors([])
    setError('')
    onSave(slug, draft)
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return
    }
    onBack()
  }

  return (
    <div>
      <nav className="mb-5 flex items-center gap-1.5 text-sm text-slate-400">
        <button type="button" onClick={handleBack} className="hover:text-indigo-600">
          Dashboards
        </button>
        <span>/</span>
        <span className="font-semibold text-slate-800">{draft.title || slug}</span>
      </nav>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Dashboard Settings
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Title">
            <input
              className={inputCls()}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field>
          <Field label="Default language code (en, de, sk…)">
            <input
              className={inputCls('font-mono')}
              value={draft.defaultLanguage || 'en'}
              onChange={(e) =>
                setDraft({ ...draft, defaultLanguage: e.target.value.slice(0, 5) })
              }
            />
          </Field>
          <Field label="Password (empty = public)">
            <input
              type="text"
              className={inputCls()}
              value={draft.password || ''}
              placeholder="leave empty for no lock"
              onChange={(e) => setDraft({ ...draft, password: e.target.value || null })}
            />
          </Field>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(draft.tabs || []).map((tab) => (
          <div key={tab.id} className="flex items-center">
            <button
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`rounded-l-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab.id === activeTabId
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label || tab.id}
            </button>
            <button
              type="button"
              onClick={() => deleteTab(tab.id)}
              className={`rounded-r-md border-l px-2 py-1.5 text-xs transition-colors ${
                tab.id === activeTabId
                  ? 'border-sky-700 bg-sky-700 text-sky-100 hover:bg-red-700 hover:text-white'
                  : 'border-slate-300 bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600'
              }`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowAddTabPicker((prev) => !prev)}
          className="rounded border border-dashed border-slate-400 px-3 py-1.5 text-sm text-slate-500 hover:border-slate-600 hover:text-slate-700"
        >
          + Tab
        </button>
      </div>

      {showAddTabPicker ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Add Tab
          </p>

          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setAddTabMode('new')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                addTabMode === 'new'
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              Create new tab
            </button>
            <button
              type="button"
              onClick={() => setAddTabMode('existing')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                addTabMode === 'existing'
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              Use existing dashboard tab
            </button>
          </div>

          {addTabMode === 'new' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addTab}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Add blank tab
              </button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Source dashboard">
                <select
                  className={inputCls()}
                  value={sourceDashboardSlug}
                  onChange={(e) => {
                    const nextSlug = e.target.value
                    setSourceDashboardSlug(nextSlug)
                    const firstTabId = dashboards[nextSlug]?.tabs?.[0]?.id || ''
                    setSourceTabId(firstTabId)
                  }}
                >
                  {Object.entries(dashboards).map(([dashboardSlug, dash]) => (
                    <option key={dashboardSlug} value={dashboardSlug}>
                      {dash.title || dashboardSlug}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Source tab">
                <select
                  className={inputCls()}
                  value={sourceTabId}
                  onChange={(e) => setSourceTabId(e.target.value)}
                >
                  {(dashboards[sourceDashboardSlug]?.tabs || []).map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.label || tab.id}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={addTabFromExisting}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                >
                  Clone selected tab
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <AdminTabEditor tab={activeTab} onChange={updateTab} />
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {validationErrors.length > 0 ? (
        <ul className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {validationErrors.map((msg) => (
            <li key={msg}>• {msg}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 active:bg-sky-700"
        >
          Save Dashboard
        </button>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
