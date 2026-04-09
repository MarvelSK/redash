import { useMemo, useState } from 'react'
import { CH, FR, GB } from 'country-flag-icons/react/3x2'
import {
  APP_LOCALES,
  resolveLocaleFromBrowser,
  type AppLocale,
} from '../../lib/i18n'

interface AccessCodeGateProps {
  busy: boolean
  error: string
  onSubmit: (code: string) => void
}

export function AccessCodeGate({ busy, error, onSubmit }: AccessCodeGateProps) {
  const [code, setCode] = useState('')
  const [locale, setLocale] = useState<AppLocale>(() => resolveLocaleFromBrowser())

  const canSubmit = useMemo(() => /^\d{4}$/.test(code), [code])
  const gateText = useMemo(() => {
    if (locale === 'fr') {
      return {
        access: 'Store Access',
        title: 'PIN Login',
        subtitle: 'Entrez votre code PIN a 4 chiffres.',
        clear: 'Clear',
        del: 'Del',
        submit: 'Enter Dashboard',
        checking: 'Checking...',
      }
    }

    if (locale === 'de-ch') {
      return {
        access: 'Store Access',
        title: 'PIN Login',
        subtitle: 'Geben Sie Ihren 4-stelligen PIN-Code ein.',
        clear: 'Clear',
        del: 'Del',
        submit: 'Enter Dashboard',
        checking: 'Checking...',
      }
    }

    return {
      access: 'Store Access',
      title: 'PIN Login',
      subtitle: 'Enter your 4 digit PIN code.',
      clear: 'Clear',
      del: 'Del',
      submit: 'Enter Dashboard',
      checking: 'Checking...',
    }
  }, [locale])

  const flagsByLocale = {
    en: GB,
    fr: FR,
    'de-ch': CH,
  } as const

  const handleDigit = (digit: string) => {
    setCode((prev) => {
      if (busy || prev.length >= 4) return prev
      return `${prev}${digit}`
    })
  }

  const handleDelete = () => {
    setCode((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    setCode('')
  }

  const handleEnter = () => {
    if (!canSubmit || busy) return
    onSubmit(code)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-100 via-cyan-50 to-sky-100 p-6 sm:p-8">
      <div className="w-full max-w-md rounded-3xl border border-white/60 bg-white/90 p-6 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.45)] backdrop-blur sm:p-7">
        <div className="mb-5 flex items-center justify-center gap-2">
          {APP_LOCALES.map((opt) => {
            const active = locale === opt.code
            const FlagIcon = flagsByLocale[opt.code]
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => setLocale(opt.code)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  active
                    ? 'border-sky-300 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
                title={opt.label}
              >
                <FlagIcon className="h-5 w-6 rounded-xs" />
              </button>
            )
          })}
        </div>

        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-sky-700">{gateText.access}</p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight text-slate-900">{gateText.title}</h1>
          <p className="mt-2 text-sm text-slate-500">{gateText.subtitle}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            handleEnter()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleEnter()
              return
            }

            if (event.key === 'Backspace') {
              event.preventDefault()
              handleDelete()
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              handleClear()
              return
            }

            if (/^\d$/.test(event.key)) {
              event.preventDefault()
              handleDigit(event.key)
            }
          }}
        >
          <input
            value={code}
            onChange={(event) => {
              const next = event.target.value.replace(/\D+/g, '').slice(0, 4)
              setCode(next)
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
            placeholder="0000"
            className="w-full rounded-2xl border border-slate-300/90 bg-white px-4 py-3.5 text-center text-3xl font-semibold tracking-[0.34em] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />

          <div className="grid grid-cols-3 gap-3 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={busy || code.length >= 4}
                onClick={() => handleDigit(digit)}
                className="h-12 rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-700 shadow-[inset_0_-1px_0_rgba(148,163,184,0.2)] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              disabled={busy || code.length === 0}
              onClick={handleClear}
              className="h-12 rounded-xl border border-amber-300 bg-amber-500 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {gateText.clear}
            </button>

            <button
              type="button"
              disabled={busy || code.length >= 4}
              onClick={() => handleDigit('0')}
              className="h-12 rounded-xl border border-slate-300 bg-white text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              0
            </button>

            <button
              type="button"
              disabled={busy || code.length === 0}
              onClick={handleDelete}
              className="h-12 rounded-xl border border-rose-300 bg-rose-500 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {gateText.del}
            </button>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? gateText.checking : gateText.submit}
          </button>
        </form>
      </div>
    </main>
  )
}
