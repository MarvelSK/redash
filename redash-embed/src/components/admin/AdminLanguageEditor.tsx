import { LANGUAGE_NAMES } from '../../constants'
import type { TabConfig } from '../../types'
import { Field, inputCls } from './shared'

interface AdminLanguageEditorProps {
  languages: TabConfig['languages']
  onChange: (languages: TabConfig['languages']) => void
}

export function AdminLanguageEditor({ languages, onChange }: AdminLanguageEditorProps) {
  const langs = Object.entries(languages || {})

  const addLanguage = () => {
    const code = window.prompt('Language code (e.g. de, sk, fr):')?.trim().slice(0, 5)
    if (!code) return
    onChange({ ...languages, [code]: { url: '', params: '' } })
  }

  const removeLanguage = (code: string) => {
    const next = { ...languages }
    delete next[code]
    onChange(next)
  }

  const update = (code: string, field: 'url' | 'params', value: string) => {
    onChange({ ...languages, [code]: { ...languages[code], [field]: value } })
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          🌐 Language URLs
        </p>
        <button
          type="button"
          onClick={addLanguage}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          + Add Language
        </button>
      </div>

      {langs.length === 0 ? (
        <p className="text-xs text-slate-400">No languages yet. Add at least one Redash public URL.</p>
      ) : (
        <div className="grid gap-2">
          {langs.map(([code, data]) => (
            <div key={code} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-700">
                  🌐 {LANGUAGE_NAMES[code] || code.toUpperCase()} ({code})
                </span>
                <button
                  type="button"
                  onClick={() => removeLanguage(code)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-2">
                <Field label="Redash public dashboard URL">
                  <input
                    className={inputCls('font-mono text-xs')}
                    value={data.url || ''}
                    placeholder="https://your-redash/public/dashboards/TOKEN?org_slug=default"
                    onChange={(e) => update(code, 'url', e.target.value)}
                  />
                </Field>
                <Field label="Default params (key=value&key=value)">
                  <input
                    className={inputCls('font-mono text-xs')}
                    value={data.params || ''}
                    placeholder="p_date_from=2026-01-01&p_shop_id=ZURICH"
                    onChange={(e) => update(code, 'params', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
