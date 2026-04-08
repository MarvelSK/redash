import type { ParamControlConfig } from '../../types'
import { Field, inputCls } from './shared'

interface AdminParamControlEditorProps {
  control: ParamControlConfig
  onChange: (next: ParamControlConfig) => void
  onDelete: () => void
}

export function AdminParamControlEditor({ control, onChange, onDelete }: AdminParamControlEditorProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Name (param key)">
          <input
            className={inputCls()}
            value={control.name || ''}
            placeholder="date_from"
            onChange={(e) => onChange({ ...control, name: e.target.value })}
          />
        </Field>
        <Field label="Label (display)">
          <input
            className={inputCls()}
            value={control.label || ''}
            placeholder="From"
            onChange={(e) => onChange({ ...control, label: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <select
            className={inputCls()}
            value={control.type || 'text'}
            onChange={(e) => onChange({ ...control, type: e.target.value })}
          >
            {['text', 'number', 'date', 'date-range', 'select'].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default value">
          <input
            className={inputCls()}
            value={control.defaultValue || ''}
            onChange={(e) => onChange({ ...control, defaultValue: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(control.locked)}
            onChange={(e) => onChange({ ...control, locked: e.target.checked })}
          />
          Locked (not editable by user)
        </label>

        {(control.type || 'text') === 'select' ? (
          <div className="flex-1">
            <p className="mb-1 text-xs text-slate-500">Options (one per line, or label:value)</p>
            <textarea
              className={inputCls('w-full resize-none font-mono text-xs')}
              rows={3}
              value={(control.options || [])
                .map((o) => {
                  const option = typeof o === 'string' ? { label: o, value: o } : o
                  return option.label === option.value
                    ? option.label
                    : `${option.label}:${option.value}`
                })
                .join('\n')}
              onChange={(e) => {
                const options = e.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const colonIdx = line.indexOf(':')
                    if (colonIdx > 0) {
                      return {
                        label: line.slice(0, colonIdx).trim(),
                        value: line.slice(colonIdx + 1).trim(),
                      }
                    }
                    return { label: line, value: line }
                  })
                onChange({ ...control, options })
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={onDelete}
          className="ml-auto rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          Remove param
        </button>
      </div>
    </div>
  )
}
