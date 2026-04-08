import type { TabConfig, ParamControlConfig } from '../../types'
import { emptyControl } from '../../lib/admin-defaults'
import { AdminLanguageEditor } from './AdminLanguageEditor'
import { AdminParamControlEditor } from './AdminParamControlEditor'
import { Field, inputCls } from './shared'

interface AdminTabEditorProps {
  tab: TabConfig
  onChange: (tab: TabConfig) => void
}

export function AdminTabEditor({ tab, onChange }: AdminTabEditorProps) {
  const updateControl = (index: number, next: ParamControlConfig) => {
    const controls = [...(tab.parameterControls || [])]
    controls[index] = next
    onChange({ ...tab, parameterControls: controls })
  }

  const deleteControl = (index: number) => {
    const controls = (tab.parameterControls || []).filter((_, i) => i !== index)
    onChange({ ...tab, parameterControls: controls })
  }

  const addControl = () => {
    onChange({ ...tab, parameterControls: [...(tab.parameterControls || []), emptyControl()] })
  }

  const qe = tab.queryExecution || {}

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tab label">
          <input
            className={inputCls()}
            value={tab.label || ''}
            placeholder="Overview"
            onChange={(e) => onChange({ ...tab, label: e.target.value })}
          />
        </Field>
        <Field label="Tab ID (slug, no spaces)">
          <input
            className={inputCls('font-mono text-xs')}
            value={tab.id || ''}
            placeholder="overview"
            onChange={(e) => onChange({ ...tab, id: e.target.value.replace(/\s+/g, '-') })}
          />
        </Field>
        <Field label="Auto-refresh (seconds, 0 = off)">
          <input
            type="number"
            className={inputCls()}
            value={tab.refreshIntervalSeconds ?? 0}
            onChange={(e) => onChange({ ...tab, refreshIntervalSeconds: Number(e.target.value) })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(tab.hideParameters)}
            onChange={(e) => onChange({ ...tab, hideParameters: e.target.checked })}
          />
          Hide Redash parameter bar (use topCrop + parameterControls above instead)
        </label>
      </div>

      <AdminLanguageEditor
        languages={tab.languages || {}}
        onChange={(langs) => onChange({ ...tab, languages: langs })}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            🎛 Parameter Controls
          </p>
          <button
            type="button"
            onClick={addControl}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            + Add Param
          </button>
        </div>
        {(tab.parameterControls || []).length === 0 ? (
          <p className="text-xs text-slate-400">No parameters. Add one if users should filter data.</p>
        ) : (
          <div className="grid gap-2">
            {(tab.parameterControls || []).map((control, i) => (
              <AdminParamControlEditor
                key={i}
                control={control}
                onChange={(next) => updateControl(i, next)}
                onDelete={() => deleteControl(i)}
              />
            ))}
          </div>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50/30">
        <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-slate-700">
          ⚡ Query Execution (optional — advanced)
        </summary>
        <div className="grid gap-3 px-4 pb-4 pt-2 sm:grid-cols-2">
          <Field label="Query ID">
            <input
              type="number"
              className={inputCls()}
              value={qe.queryId || ''}
              placeholder="2"
              onChange={(e) =>
                onChange({
                  ...tab,
                  queryExecution: { ...qe, queryId: Number(e.target.value) || null },
                })
              }
            />
          </Field>
          <Field label="API Base URL">
            <input
              className={inputCls('font-mono text-xs')}
              value={qe.apiBaseUrl || ''}
              placeholder="http://localhost:5001"
              onChange={(e) =>
                onChange({ ...tab, queryExecution: { ...qe, apiBaseUrl: e.target.value } })
              }
            />
          </Field>
          <Field label="API Key (Authorization: Key)">
            <input
              className={inputCls('font-mono text-xs')}
              value={qe.apiKey || ''}
              placeholder="your-api-key"
              onChange={(e) => onChange({ ...tab, queryExecution: { ...qe, apiKey: e.target.value } })}
            />
          </Field>
          <Field label="Max Age (seconds)">
            <input
              type="number"
              className={inputCls()}
              value={qe.maxAge ?? 0}
              onChange={(e) =>
                onChange({ ...tab, queryExecution: { ...qe, maxAge: Number(e.target.value) } })
              }
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={qe.includeCredentials !== false}
              onChange={(e) =>
                onChange({
                  ...tab,
                  queryExecution: { ...qe, includeCredentials: e.target.checked },
                })
              }
            />
            Include credentials (cookies)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={qe.applyAutoLimit !== false}
              onChange={(e) =>
                onChange({ ...tab, queryExecution: { ...qe, applyAutoLimit: e.target.checked } })
              }
            />
            Apply auto limit
          </label>
        </div>
      </details>
    </div>
  )
}
