import { FormEvent } from 'react'
import type { DashboardConfig } from '../../types'

interface DashboardGateProps {
  dashboard: DashboardConfig
  gatePassword: string
  gateError: string
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function DashboardGate({
  dashboard,
  gatePassword,
  gateError,
  onPasswordChange,
  onSubmit,
}: DashboardGateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-6 text-center">
          <div className="mb-3 text-4xl">🔒</div>
          <h1 className="text-xl font-semibold text-slate-900">{dashboard.title || 'Dashboard'}</h1>
          <p className="mt-1 text-sm text-slate-500">This dashboard is password protected.</p>
        </div>
        <input
          type="password"
          value={gatePassword}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Enter password"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
          autoFocus
        />
        {gateError ? <p className="mt-2 text-sm text-red-600">{gateError}</p> : null}
        <button
          type="submit"
          className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 active:bg-sky-700"
        >
          Unlock →
        </button>
      </form>
    </div>
  )
}
