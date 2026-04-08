export function NoDashboardState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-4xl">📊</div>
        <h1 className="text-2xl font-semibold">No dashboard configured</h1>
        <p className="mt-3 text-sm text-slate-500">
          Open <a href="/admin" className="text-sky-600 hover:underline">/admin</a> and add a dashboard.
        </p>
      </div>
    </div>
  )
}
