import { useEffect, useMemo, useRef, useState } from 'react'
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { emptyDashboard, slugify } from '../../lib/admin-defaults'
import { importDashboardsFromRedash, type ImportChange } from '../../lib/redash-import'
import type { DashboardConfig, DashboardsMap, StoreConfig } from '../../types'
import { AdminDashboardEditor } from './AdminDashboardEditor'

interface AdminPageProps {
  dashboards: DashboardsMap
  stores: StoreConfig[]
  homeDashboardSlug: string
  adminCode: string
  onSave: (dashboards: DashboardsMap, stores: StoreConfig[], homeDashboardSlug: string, adminCode: string) => Promise<void>
}

type Section = 'dashboards' | 'builder' | 'stores' | 'system' | 'redash'

type DashboardRow = {
  slug: string
  title: string
  tabCount: number
  isPublic: boolean
  missingLanguageUrls: number
}

const requiredLanguages = ['en', 'fr', 'de']

function countMissingLanguageUrls(dashboard: DashboardConfig): number {
  let missing = 0
  for (const tab of dashboard.tabs || []) {
    for (const lang of requiredLanguages) {
      const url = tab.languages?.[lang]?.url || ''
      if (!url.trim()) missing += 1
    }
  }
  return missing
}

function inputCls() {
  return 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20'
}

export function AdminPage({ dashboards, stores, homeDashboardSlug, adminCode, onSave }: AdminPageProps) {
  const [error, setError] = useState('')
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [section, setSection] = useState<Section>('dashboards')
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [builderSearch, setBuilderSearch] = useState('')
  const [redashEndpoint, setRedashEndpoint] = useState<'hostname' | 'localhost'>(
    window.location.hostname === 'localhost' ? 'localhost' : 'hostname',
  )

  const [importBusy, setImportBusy] = useState(false)
  const [savingBusy, setSavingBusy] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [apiRoot, setApiRoot] = useState(
    (import.meta.env.VITE_REDASH_PROXY_PATH as string | undefined) || '/redash-api',
  )
  const [apiKey, setApiKey] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'overwrite' | 'merge'>('skip')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [previewChanges, setPreviewChanges] = useState<ImportChange[]>([])
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const [syncMinutes, setSyncMinutes] = useState(30)

  const [newStoreId, setNewStoreId] = useState('')
  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreCode, setNewStoreCode] = useState('')
  const [editableStores, setEditableStores] = useState<StoreConfig[]>(stores)
  const [editableDashboards, setEditableDashboards] = useState<DashboardsMap>(dashboards)
  const [editableHomeSlug, setEditableHomeSlug] = useState(homeDashboardSlug)
  const [editableAdminCode, setEditableAdminCode] = useState(adminCode)
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const lastSavedSnapshotRef = useRef('')
  const autoSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setEditableStores(stores)
  }, [stores])

  useEffect(() => {
    setEditableDashboards(dashboards)
  }, [dashboards])

  useEffect(() => {
    setEditableHomeSlug(homeDashboardSlug)
  }, [homeDashboardSlug])

  useEffect(() => {
    setEditableAdminCode(adminCode)
  }, [adminCode])

  useEffect(() => {
    lastSavedSnapshotRef.current = JSON.stringify({
      dashboards,
      stores,
      homeDashboardSlug,
      adminCode,
    })
  }, [dashboards, stores, homeDashboardSlug, adminCode])

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        dashboards: editableDashboards,
        stores: editableStores,
        homeDashboardSlug: editableHomeSlug,
        adminCode: editableAdminCode,
      }),
    [editableDashboards, editableStores, editableHomeSlug, editableAdminCode],
  )

  const hasValidCodes = useMemo(() => {
    if (!/^\d{4}$/.test(editableAdminCode.trim())) return false
    return editableStores.every((row) => /^\d{4}$/.test(String(row.accessCode || '').trim()))
  }, [editableAdminCode, editableStores])

  const dashboardRows = useMemo<DashboardRow[]>(
    () =>
      Object.entries(editableDashboards).map(([slug, dash]) => ({
        slug,
        title: dash.title || slug,
        tabCount: dash.tabs?.length || 0,
        isPublic: !dash.password,
        missingLanguageUrls: countMissingLanguageUrls(dash),
      })),
    [editableDashboards],
  )

  const dashboardSlugs = useMemo(() => dashboardRows.map((row) => row.slug), [dashboardRows])

  const persistAdminConfig = async (
    nextDashboards: DashboardsMap,
    nextStores: StoreConfig[],
    nextHomeSlug: string,
    nextAdminCode: string,
  ) => {
    setSavingBusy(true)
    setError('')
    try {
      await onSave(nextDashboards, nextStores, nextHomeSlug, nextAdminCode)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Saving changes failed.'
      setError(message)
      throw e
    } finally {
      setSavingBusy(false)
    }
  }

  useEffect(() => {
    if (!hasValidCodes) return
    if (currentSnapshot === lastSavedSnapshotRef.current) return
    if (savingBusy) return

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    setAutoSaveState('idle')
    autoSaveTimerRef.current = window.setTimeout(() => {
      setAutoSaveState('saving')
      void persistAdminConfig(
        editableDashboards,
        editableStores,
        editableHomeSlug,
        editableAdminCode,
      )
        .then(() => {
          lastSavedSnapshotRef.current = currentSnapshot
          setAutoSaveState('saved')
        })
        .catch(() => {
          setAutoSaveState('error')
        })
    }, 700)

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [
    hasValidCodes,
    currentSnapshot,
    savingBusy,
    editableDashboards,
    editableStores,
    editableHomeSlug,
    editableAdminCode,
  ])

  const filteredDashboards = useMemo(() => {
    const q = dashboardSearch.trim().toLowerCase()
    if (!q) return dashboardRows
    return dashboardRows.filter((row) => {
      return row.slug.toLowerCase().includes(q) || row.title.toLowerCase().includes(q)
    })
  }, [dashboardRows, dashboardSearch])

  const filteredBuilderRows = useMemo(() => {
    const q = builderSearch.trim().toLowerCase()
    if (!q) return dashboardRows
    return dashboardRows.filter((row) => {
      return row.slug.toLowerCase().includes(q) || row.title.toLowerCase().includes(q)
    })
  }, [dashboardRows, builderSearch])

  const syncIntervalMs = useMemo(() => Math.max(5, Number(syncMinutes || 30)) * 60_000, [syncMinutes])

  const redashBaseUrl = useMemo(() => {
    if (redashEndpoint === 'localhost') return 'http://localhost:5001'
    const host = (window.location.hostname || 'localhost').trim() || 'localhost'
    return `http://${host}:5001`
  }, [redashEndpoint])

  const redashAdminUrl = `${redashBaseUrl}/admin`
  const redashSsoUrl = `/api/embed/admin/redash/sso?target=${encodeURIComponent(redashAdminUrl)}`

  const openEditor = (slug: string) => {
    setEditingSlug(slug)
    setView('edit')
    setSection('builder')
  }

  const handleAdd = () => {
    const title = window.prompt('Dashboard title:')?.trim()
    if (!title) return

    const slug = slugify(title)
    if (editableDashboards[slug]) {
      setError(`Slug "${slug}" already exists. Choose a different title.`)
      return
    }

    const next = { ...editableDashboards, [slug]: { ...emptyDashboard(), title } }
    setEditableDashboards(next)
    openEditor(slug)
  }

  const handleDelete = (slug: string) => {
    const next = { ...editableDashboards }
    delete next[slug]
    setEditableDashboards(next)
    if (editingSlug === slug) {
      setEditingSlug(null)
      setView('list')
    }
  }

  const handleSaveDashboard = (slug: string, updated: DashboardConfig) => {
    const next = { ...editableDashboards, [slug]: updated }
    setEditableDashboards(next)
    setView('list')
    setEditingSlug(null)
    setSection('dashboards')
  }

  const handleAddStore = () => {
    const id = newStoreId.trim()
    const name = newStoreName.trim()
    if (!id) {
      setError('Store ID is required.')
      return
    }
    if (!name) {
      setError('Store name is required.')
      return
    }
    if (editableStores.some((row) => row.id.toLowerCase() === id.toLowerCase())) {
      setError(`Store ID "${id}" already exists.`)
      return
    }
    if (!/^\d{4}$/.test(newStoreCode.trim())) {
      setError('Store code must contain exactly 4 digits.')
      return
    }

    setEditableStores([...editableStores, { id, name, accessCode: newStoreCode.trim() }])
    setNewStoreId('')
    setNewStoreName('')
    setNewStoreCode('')
    setError('')
    setToast({ type: 'success', message: `Store ${id} added.` })
  }

  const handleDeleteStore = (id: string) => {
    setEditableStores(editableStores.filter((row) => row.id !== id))
    setToast({ type: 'success', message: `Store ${id} removed.` })
  }

  const handleUpdateStore = (id: string, updates: Partial<StoreConfig>) => {
    const next = editableStores.map((row) => {
      if (row.id !== id) return row
      return {
        id: updates.id ?? row.id,
        name: updates.name ?? row.name,
        accessCode: updates.accessCode ?? row.accessCode,
      }
    })

    const duplicate = new Set<string>()
    for (const row of next) {
      const key = row.id.trim().toLowerCase()
      if (!key) {
        setError('Store ID cannot be empty.')
        return
      }
      if (duplicate.has(key)) {
        setError(`Duplicate store ID found: ${row.id}`)
        return
      }
      if (!/^\d{4}$/.test(String(row.accessCode || '').trim())) {
        setError(`Store ${row.id} must have exactly 4 digits.`)
        return
      }
      duplicate.add(key)
    }

    setError('')
    setEditableStores(next)
  }

  const dashboardColumns = useMemo<ColumnDef<DashboardRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Dashboard',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-slate-900">{row.original.title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{row.original.slug}</p>
          </div>
        ),
      },
      {
        accessorKey: 'tabCount',
        header: 'Tabs',
      },
      {
        accessorKey: 'isPublic',
        header: 'Access',
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Public</span>
          ) : (
            <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Protected</span>
          ),
      },
      {
        accessorKey: 'missingLanguageUrls',
        header: 'Missing Lang URLs',
        cell: ({ getValue }) => {
          const count = Number(getValue() || 0)
          if (count === 0) {
            return <span className="text-xs font-medium text-emerald-700">0</span>
          }
          return <span className="text-xs font-semibold text-amber-700">{count}</span>
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openEditor(row.original.slug)}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <a
              href={row.original.slug === 'default' ? '/' : `/${row.original.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Preview
            </a>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete dashboard "${row.original.slug}"?`)) {
                  handleDelete(row.original.slug)
                }
              }}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [editingSlug],
  )

  const builderColumns = useMemo<ColumnDef<DashboardRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Dashboard',
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
      },
      {
        accessorKey: 'tabCount',
        header: 'Tabs',
      },
      {
        id: 'builderAction',
        header: 'Builder',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => openEditor(row.original.slug)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              editingSlug === row.original.slug
                ? 'bg-sky-600 text-white'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {editingSlug === row.original.slug ? 'Editing' : 'Open'}
          </button>
        ),
      },
    ],
    [editingSlug],
  )

  const storeColumns = useMemo<ColumnDef<StoreConfig>[]>(
    () => [
      {
        accessorKey: 'id',
        header: 'Store ID',
        cell: ({ row, getValue }) => (
          <input
            value={String(getValue() || '')}
            onChange={(e) => handleUpdateStore(row.original.id, { id: e.target.value.trim() })}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        ),
      },
      {
        accessorKey: 'name',
        header: 'Store Name',
        cell: ({ row, getValue }) => (
          <input
            value={String(getValue() || '')}
            onChange={(e) => handleUpdateStore(row.original.id, { name: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        ),
      },
      {
        accessorKey: 'accessCode',
        header: 'Code',
        cell: ({ row, getValue }) => (
          <input
            value={String(getValue() || '')}
            onChange={(e) => handleUpdateStore(row.original.id, { accessCode: e.target.value.replace(/\D+/g, '').slice(0, 4) })}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="0000"
          />
        ),
      },
      {
        id: 'actions',
        header: 'Action',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => handleDeleteStore(row.original.id)}
            className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Remove
          </button>
        ),
      },
    ],
    [editableStores],
  )

  const importPreviewColumns = useMemo<ColumnDef<ImportChange>[]>(
    () => [
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ getValue }) => {
          const action = String(getValue())
          const cls =
            action === 'create'
              ? 'bg-emerald-50 text-emerald-700'
              : action === 'skip'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-sky-50 text-sky-700'
          return <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${cls}`}>{action}</span>
        },
      },
      {
        accessorKey: 'slug',
        header: 'Slug',
      },
      {
        accessorKey: 'missingLanguageUrls',
        header: 'Missing Lang URLs',
      },
      {
        accessorKey: 'reason',
        header: 'Reason',
        cell: ({ getValue }) => <span className="text-xs text-slate-500">{String(getValue() || '-')}</span>,
      },
    ],
    [],
  )

  const dashboardsTable = useReactTable({
    data: filteredDashboards,
    columns: dashboardColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const builderTable = useReactTable({
    data: filteredBuilderRows,
    columns: builderColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const storeTable = useReactTable({
    data: editableStores,
    columns: storeColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  const importPreviewTable = useReactTable({
    data: previewChanges,
    columns: importPreviewColumns,
    getCoreRowModel: getCoreRowModel(),
  })

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
      const result = await importDashboardsFromRedash(editableDashboards, {
        endpointRoot: apiRoot.trim(),
        apiKey: apiKey.trim(),
        orgSlug: orgSlug.trim() || undefined,
        includeArchived,
        conflictPolicy,
        dryRun,
      })

      setPreviewChanges(result.changes.slice(0, 60))

      if (dryRun) {
        setImportMessage(
          `Dry run: ${result.importedCount} dashboard changes ready. ${result.skipped.length} skipped.`,
        )
        setToast({ type: 'success', message: 'Dry run completed. Review preview before applying.' })
        return
      }

      setEditableDashboards(result.merged)
      const skippedNote =
        result.skipped.length > 0
          ? ` Skipped: ${result.skipped.slice(0, 6).join(', ')}${result.skipped.length > 6 ? '…' : ''}.`
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
    if (!autoSyncEnabled || !apiKey.trim()) return
    const id = window.setInterval(() => {
      void runImport({ dryRun: false, silent: true })
    }, syncIntervalMs)
    return () => window.clearInterval(id)
  }, [autoSyncEnabled, apiKey, syncIntervalMs, editableDashboards, apiRoot, orgSlug, includeArchived, conflictPolicy])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (editableHomeSlug && editableDashboards[editableHomeSlug]) return
    const fallback = dashboardSlugs[0] || ''
    setEditableHomeSlug(fallback)
  }, [editableHomeSlug, editableDashboards, dashboardSlugs])

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[250px_1fr]">
        <aside className="border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen">
          <div className="border-b border-slate-200 bg-linear-to-r from-sky-700 to-cyan-700 px-5 py-5 text-white">
            <p className="text-sm font-semibold tracking-tight">Redash Embed</p>
            <p className="text-xs text-sky-100">Admin Control Center</p>
          </div>

          <nav className="space-y-1 p-3">
            {[
              { id: 'dashboards', label: 'Dashboards' },
              { id: 'builder', label: 'Builder' },
              { id: 'stores', label: 'Stores' },
              { id: 'system', label: 'System' },
              { id: 'redash', label: 'Redash' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id as Section)
                  if (item.id === 'dashboards') setView('list')
                }}
                className={`w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  section === item.id
                    ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="border-t border-slate-200 p-3">
            <a
              href="/"
              className="block rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View App
            </a>
          </div>
        </aside>

        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <p className="text-xs font-medium text-slate-500">
              {autoSaveState === 'saving'
                ? 'Autosave in progress...'
                : autoSaveState === 'saved'
                  ? 'Autosaved'
                  : autoSaveState === 'error'
                    ? 'Autosave failed'
                    : 'Autosave enabled'}
            </p>
            <button
              type="button"
              onClick={async () => {
                if (!/^\d{4}$/.test(editableAdminCode.trim())) {
                  setError('Admin code must contain exactly 4 digits.')
                  return
                }
                if (editableStores.some((row) => !/^\d{4}$/.test(String(row.accessCode || '').trim()))) {
                  setError('Every store must have exactly 4 digits.')
                  return
                }

                try {
                  await persistAdminConfig(
                    editableDashboards,
                    editableStores,
                    editableHomeSlug,
                    editableAdminCode,
                  )
                  lastSavedSnapshotRef.current = currentSnapshot
                  setAutoSaveState('saved')
                  setToast({ type: 'success', message: 'Configuration saved to database.' })
                } catch {
                  // Error message is already set in persistAdminConfig.
                }
              }}
              disabled={savingBusy}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingBusy ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

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

          {section === 'dashboards' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Dashboard Inventory</h2>
                    <p className="text-sm text-slate-500">Table-first view with direct actions and quality signals.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={dashboardSearch}
                      onChange={(e) => setDashboardSearch(e.target.value)}
                      placeholder="Search by title or slug"
                      className={inputCls()}
                    />
                    <button
                      type="button"
                      onClick={handleAdd}
                      className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      New Dashboard
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    {dashboardsTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="text-left text-slate-600">
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="border-b border-slate-200 px-3 py-2.5 font-medium">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {dashboardsTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No dashboards found.
                        </td>
                      </tr>
                    ) : (
                      dashboardsTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 align-top last:border-b-0">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {section === 'builder' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Builder Workspace</h2>
                    <p className="text-sm text-slate-500">Pick a dashboard from the table, then edit full tab settings below.</p>
                  </div>
                  <input
                    value={builderSearch}
                    onChange={(e) => setBuilderSearch(e.target.value)}
                    placeholder="Filter dashboards"
                    className={inputCls()}
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    {builderTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="text-left text-slate-600">
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="border-b border-slate-200 px-3 py-2.5 font-medium">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {builderTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          No dashboards found.
                        </td>
                      </tr>
                    ) : (
                      builderTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {view === 'edit' && editingSlug && editableDashboards[editingSlug] ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <AdminDashboardEditor
                    slug={editingSlug}
                    dashboard={editableDashboards[editingSlug]}
                    dashboards={editableDashboards}
                    onSave={handleSaveDashboard}
                    onBack={() => {
                      setView('list')
                      setEditingSlug(null)
                    }}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                  Select a dashboard in the table to open the builder.
                </div>
              )}
            </div>
          ) : null}

          {section === 'stores' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Store Catalog</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage stores used by SHOP ID. This parameter always renders as a select list.
                </p>

                <div className="mt-4 grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto]">
                  <input
                    value={newStoreId}
                    onChange={(e) => setNewStoreId(e.target.value)}
                    className={inputCls()}
                    placeholder="Store ID"
                  />
                  <input
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    className={inputCls()}
                    placeholder="Store Name"
                  />
                  <input
                    value={newStoreCode}
                    onChange={(e) => setNewStoreCode(e.target.value.replace(/\D+/g, '').slice(0, 4))}
                    className={inputCls()}
                    placeholder="Store Code"
                  />
                  <button
                    type="button"
                    onClick={handleAddStore}
                    className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    Add Store
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    {storeTable.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id} className="text-left text-slate-600">
                        {headerGroup.headers.map((header) => (
                          <th key={header.id} className="border-b border-slate-200 px-3 py-2.5 font-medium">
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {storeTable.getRowModel().rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                          No stores configured yet.
                        </td>
                      </tr>
                    ) : (
                      storeTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {section === 'system' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Overview</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboardRows.length}</p>
                <p className="text-sm text-slate-500">Dashboards configured</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Default Landing Dashboard</p>
                <select
                  value={editableHomeSlug}
                  onChange={(e) => setEditableHomeSlug(e.target.value)}
                  className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  disabled={dashboardSlugs.length === 0}
                >
                  {dashboardSlugs.length === 0 ? <option value="">No dashboards available</option> : null}
                  {dashboardSlugs.map((slug) => (
                    <option key={slug} value={slug}>
                      {editableDashboards[slug]?.title || slug}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</p>
                <label className="mt-3 grid gap-1">
                  <span className="text-xs font-medium text-slate-600">Admin PIN (4 digits)</span>
                  <input
                    value={editableAdminCode}
                    onChange={(e) => setEditableAdminCode(e.target.value.replace(/\D+/g, '').slice(0, 4))}
                    className={inputCls()}
                    placeholder="0000"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                <h3 className="text-sm font-semibold text-slate-900">Import from Redash API</h3>
                <p className="mt-1 text-sm text-slate-500">
                  API key is in memory only for this session and is never written into saved dashboard settings.
                </p>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">API root / proxy path</span>
                    <input
                      value={apiRoot}
                      onChange={(e) => setApiRoot(e.target.value)}
                      className={inputCls()}
                      placeholder="/redash-api or https://redash.example.com"
                    />
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-slate-600">Org slug (optional)</span>
                    <input
                      value={orgSlug}
                      onChange={(e) => setOrgSlug(e.target.value)}
                      className={inputCls()}
                      placeholder="default"
                    />
                  </label>

                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-xs font-medium text-slate-600">Redash API key</span>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className={inputCls()}
                      placeholder="Key..."
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

                  <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
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

                <div className="mt-4 flex flex-wrap items-center gap-3">
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
              </div>

              {previewChanges.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Import Preview (first {previewChanges.length} changes)
                    </p>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-white">
                      {importPreviewTable.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id} className="text-left text-slate-600">
                          {headerGroup.headers.map((header) => (
                            <th key={header.id} className="border-b border-slate-200 px-3 py-2.5 font-medium">
                              {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {importPreviewTable.getRowModel().rows.map((row) => (
                        <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                          {row.getVisibleCells().map((cell) => (
                            <td key={cell.id} className="px-3 py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {section === 'redash' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Redash Admin</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Manage native Redash settings directly inside redash-embed.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={redashEndpoint}
                      onChange={(e) => setRedashEndpoint(e.target.value as 'hostname' | 'localhost')}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="hostname">Hostname:5001</option>
                      <option value="localhost">localhost:5001</option>
                    </select>
                    <a
                      href={redashAdminUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open in New Tab
                    </a>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-500">Current endpoint: {redashAdminUrl}</p>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <iframe
                  key={redashSsoUrl}
                  src={redashSsoUrl}
                  title="Redash Admin"
                  className="h-[75vh] w-full"
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
