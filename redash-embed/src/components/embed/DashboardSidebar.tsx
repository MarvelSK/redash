import dayjs from 'dayjs'
import { ConfigProvider, DatePicker, Input, InputNumber, Select, theme } from 'antd'
import { CH, FR, GB } from 'country-flag-icons/react/3x2'
import { APP_LOCALES, getStrings, type AppLocale } from '../../lib/i18n'
import type { NormalisedControl, DashboardConfig, TabConfig } from '../../types'

interface DashboardSidebarProps {
  sidebarOpen: boolean
  onToggleSidebar: (open: boolean) => void
  dashboard: DashboardConfig
  tabs: TabConfig[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  availableLanguages: string[]
  locale: AppLocale
  onLocaleChange: (locale: AppLocale) => void
  configuredControls: NormalisedControl[]
  activeParams: Record<string, string>
  updateParam: (key: string, value: string) => void
  onApplyAndRunQuery: () => void
  loadStatus: string
  refreshCountdown: number | null
  isMobile: boolean
}

export function DashboardSidebar({
  sidebarOpen,
  onToggleSidebar,
  dashboard,
  tabs,
  activeTabId,
  onSelectTab,
  availableLanguages,
  locale,
  onLocaleChange,
  configuredControls,
  activeParams,
  updateParam,
  onApplyAndRunQuery,
  loadStatus,
  refreshCountdown,
  isMobile,
}: DashboardSidebarProps) {
  const { RangePicker } = DatePicker
  const t = getStrings(locale)
  const flagsByLocale = {
    en: GB,
    fr: FR,
    'de-ch': CH,
  } as const

  const runPrimaryAction = () => {
    onApplyAndRunQuery()
    if (isMobile) onToggleSidebar(false)
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#0284c7',
          borderRadius: 8,
          fontSize: 13,
        },
      }}
    >
      <aside
        className={`embed-sidebar relative flex h-full flex-none flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ${
          sidebarOpen ? 'w-72 max-w-[92vw]' : isMobile ? 'w-0 border-r-0' : 'w-11'
        } overflow-hidden`}
      >
        {sidebarOpen ? (
          <>
            <div className="flex h-14 flex-none items-center justify-between border-b border-slate-200 px-4">
              <span className="truncate text-base font-semibold text-slate-900">
                {dashboard.title || 'Dashboard'}
              </span>
              <button
                type="button"
                onClick={() => onToggleSidebar(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                title={t.collapseSidebar}
              >
                ‹
              </button>
            </div>

            {tabs.length > 1 ? (
              <nav className="flex-none border-b border-slate-200 p-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onSelectTab(tab.id)}
                    className={`mb-1 w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      tab.id === activeTabId
                        ? 'border-sky-200 bg-sky-50 text-sky-700'
                        : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {tab.label || tab.id}
                  </button>
                ))}
              </nav>
            ) : null}

            <div className="flex-none border-b border-slate-200 px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.language}
              </p>
              <div className="flex items-center gap-2">
                {APP_LOCALES.map((opt) => {
                  const mappedLangAvailable = availableLanguages.includes(opt.dashboardLang)
                  const active = locale === opt.code
                  const FlagIcon = flagsByLocale[opt.code]
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => onLocaleChange(opt.code)}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl leading-none transition-colors ${
                        active
                          ? 'border-sky-300 bg-sky-50 shadow-sm'
                          : 'border-slate-300 bg-white hover:border-slate-400'
                      }`}
                      title={`${opt.label}${mappedLangAvailable ? '' : ' (dashboard fallback)'}`}
                    >
                      <FlagIcon className="h-5 w-6 rounded-xs shadow-sm" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {configuredControls.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t.filters}
                  </p>
                  {configuredControls.map((control) => {
                    const value = activeParams[control.urlKey] ?? ''
                    return (
                      <div key={control.id}>
                        <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-700">
                          {control.label}
                          {control.locked ? <span className="text-slate-400">🔒</span> : null}
                        </p>
                        {control.type === 'date-range' ? (
                          <RangePicker
                            className="w-full"
                            size="middle"
                            disabled={control.locked}
                            allowEmpty={[true, true]}
                            value={[
                              activeParams[`${control.urlKey}.start`]
                                ? dayjs(activeParams[`${control.urlKey}.start`])
                                : null,
                              activeParams[`${control.urlKey}.end`]
                                ? dayjs(activeParams[`${control.urlKey}.end`])
                                : null,
                            ]}
                            onChange={(_, dateStrings) => {
                              updateParam(`${control.urlKey}.start`, dateStrings[0] || '')
                              updateParam(`${control.urlKey}.end`, dateStrings[1] || '')
                            }}
                          />
                        ) : control.type === 'date' ? (
                          <DatePicker
                            className="w-full"
                            size="middle"
                            disabled={control.locked}
                            value={value ? dayjs(value) : null}
                            onChange={(_, dateString) =>
                              updateParam(
                                control.urlKey,
                                typeof dateString === 'string' ? dateString : dateString[0] || '',
                              )
                            }
                          />
                        ) : control.type === 'select' ? (
                          <Select
                            className="w-full"
                            size="middle"
                            disabled={control.locked}
                            value={value || undefined}
                            options={control.options.map((o) => ({ label: o.label, value: o.value }))}
                            onChange={(next) => updateParam(control.urlKey, String(next))}
                          />
                        ) : control.type === 'number' ? (
                          <InputNumber
                            className="w-full"
                            size="middle"
                            disabled={control.locked}
                            value={value === '' ? null : Number(value)}
                            onChange={(next) => updateParam(control.urlKey, String(next ?? ''))}
                          />
                        ) : (
                          <Input
                            size="middle"
                            disabled={control.locked}
                            value={value}
                            onChange={(e) => updateParam(control.urlKey, e.target.value)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  No configured filters for this tab.
                </div>
              )}
            </div>

            <div className="flex-none space-y-2 border-t border-slate-200 bg-slate-50 px-4 py-4">
              <button
                type="button"
                onClick={runPrimaryAction}
                className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white! hover:bg-sky-500 active:bg-sky-700"
              >
                {t.applyRun}
              </button>
              {loadStatus ? (
                <p className="pt-0.5 text-xs leading-tight text-slate-500">{loadStatus}</p>
              ) : null}
              <div className="flex items-center justify-between pt-1">
                {refreshCountdown !== null ? (
                  <span className="text-xs text-slate-500">↻ {refreshCountdown}s</span>
                ) : (
                  <span />
                )}
                <a href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-700">
                  {t.admin}
                </a>
              </div>
            </div>
          </>
        ) : isMobile ? null : (
          <div className="flex flex-col items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => onToggleSidebar(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title={t.openSidebar}
            >
              ☰
            </button>
            {refreshCountdown !== null ? (
              <span
                className="select-none text-[10px] text-slate-400"
                style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}
              >
                ↻{refreshCountdown}s
              </span>
            ) : null}
          </div>
        )}
      </aside>
    </ConfigProvider>
  )
}
