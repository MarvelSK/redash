import type { DashboardsMap } from '../../types'

interface AdminDashboardListProps {
  dashboards: DashboardsMap
  onAdd: () => void
  onDelete: (slug: string) => void
  onEdit: (slug: string) => void
}

export function AdminDashboardList({ dashboards, onAdd, onDelete, onEdit }: AdminDashboardListProps) {
  const count = Object.keys(dashboards).length
  const requiredLanguages = ['en', 'fr', 'de']

  const countMissingLanguageUrls = (slug: string) => {
    const dash = dashboards[slug]
    let missing = 0
    for (const tab of dash?.tabs || []) {
      for (const lang of requiredLanguages) {
        const url = tab.languages?.[lang]?.url || ''
        if (!url.trim()) missing += 1
      }
    }
    return missing
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dashboards</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {count} dashboard{count !== 1 ? 's' : ''} configured
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 active:bg-sky-700"
        >
          + Add Dashboard
        </button>
      </div>

      {count === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-14 text-center">
          <div className="mb-3 text-5xl">📊</div>
          <p className="font-medium text-slate-500">No dashboards yet</p>
          <p className="mt-1 text-sm text-slate-400">Click "+ Add Dashboard" to create one.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {Object.entries(dashboards).map(([slug, dash]) => (
            <div
              key={slug}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                  DB
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{dash.title || slug}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-500">
                      {slug}
                    </code>
                    <span>·</span>
                    <span>
                      {dash.tabs?.length || 0} tab{(dash.tabs?.length || 0) !== 1 ? 's' : ''}
                    </span>
                    <span>·</span>
                    {dash.password ? (
                      <span className="text-amber-500">🔒 password</span>
                    ) : (
                      <span className="text-emerald-500">✓ public</span>
                    )}
                    {countMissingLanguageUrls(slug) > 0 ? (
                      <>
                        <span>·</span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                          {countMissingLanguageUrls(slug)} missing lang URL
                          {countMissingLanguageUrls(slug) !== 1 ? 's' : ''}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(slug)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit
                </button>
                <a
                  href={slug === 'default' ? '/' : `/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Preview ↗
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete dashboard "${slug}"?`)) onDelete(slug)
                  }}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
