import { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </div>
  )
}

export function inputCls(extra = ''): string {
  return `rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors ${extra}`
}
