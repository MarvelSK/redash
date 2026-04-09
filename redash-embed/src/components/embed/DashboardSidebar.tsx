import dayjs from 'dayjs'
import { ConfigProvider, DatePicker, Input, InputNumber, Select, theme } from 'antd'
import { CH, FR, GB } from 'country-flag-icons/react/3x2'
import { APP_LOCALES, getStrings, type AppLocale } from '../../lib/i18n'
import type { NormalisedControl, DashboardConfig, StoreConfig, TabConfig } from '../../types'

interface DashboardSidebarProps {
  dashboard: DashboardConfig
  stores: StoreConfig[]
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
}

export function DashboardSidebar({
  dashboard,
  stores,
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
}: DashboardSidebarProps) {
  const { RangePicker } = DatePicker
  const t = getStrings(locale)

  const compactLabel = (label: string) =>
    label
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 18)
  const flagsByLocale = {
    en: GB,
    fr: FR,
    'de-ch': CH,
  } as const

  const runPrimaryAction = () => {
    onApplyAndRunQuery()
  }

  const storeOptions = stores
    .filter((row) => row.id.trim())
    .map((row) => ({
      value: row.id,
      label: row.name.trim() ? `${row.name} (${row.id})` : row.id,
    }))

  const isShopIdControl = (control: NormalisedControl) => {
    const normalized = control.urlKey.toLowerCase()
    const byUrlKey = normalized === 'p_shop_id' || normalized.endsWith('.shop_id')
    const byName = control.name.toLowerCase() === 'shop_id'
    return byUrlKey || byName
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#0284c7',
          borderRadius: 8,
          fontSize: 13,
          controlHeightSM: 28,
          fontSizeSM: 12,
        },
      }}
    >
      <aside className="embed-topbar flex-none border-b border-slate-200 bg-white">
        <div className="flex min-h-11 items-center gap-2 px-2 py-1.5 sm:px-3">
          <span className="max-w-[32ch] truncate text-sm font-semibold text-slate-900">
            {dashboard.title || 'Dashboard'}
          </span>

          {tabs.length > 1 ? (
            <select
              value={activeTabId}
              onChange={(e) => onSelectTab(e.target.value)}
              className="h-8 min-w-[130px] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700"
              title="Tab"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label || tab.id}
                </option>
              ))}
            </select>
          ) : null}

          <div className="flex items-center gap-1">
            {APP_LOCALES.map((opt) => {
              const mappedLangAvailable = availableLanguages.includes(opt.dashboardLang)
              const active = locale === opt.code
              const FlagIcon = flagsByLocale[opt.code]
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => onLocaleChange(opt.code)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                    active
                      ? 'border-sky-300 bg-sky-50 shadow-sm'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                  title={`${opt.label}${mappedLangAvailable ? '' : ' (dashboard fallback)'}`}
                >
                  <FlagIcon className="h-4 w-5 rounded-xs" />
                </button>
              )
            })}
          </div>

          {configuredControls.length > 0 ? (
            <div className="min-w-0 flex-1 overflow-x-auto">
              <div className="flex min-w-max items-end gap-2 pr-1">
                {configuredControls.map((control) => {
                  const value = activeParams[control.urlKey] ?? ''
                  return (
                    <div
                      key={control.id}
                      className="w-[176px] min-w-[158px] rounded-md border border-slate-200 bg-slate-50/90 px-1.5 py-1"
                    >
                      <p
                        className="mb-0.5 flex items-center gap-1 truncate text-[9px] font-semibold uppercase tracking-[0.04em] text-slate-500"
                        title={control.label}
                      >
                        {compactLabel(control.label)}
                        {control.locked ? <span className="text-slate-400">🔒</span> : null}
                      </p>
                      {control.type === 'date-range' ? (
                        <RangePicker
                          className="w-full [&_.ant-picker-input>input]:text-xs [&_.ant-picker-input>input]:font-medium"
                          size="small"
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
                          className="w-full [&_.ant-picker-input>input]:text-xs [&_.ant-picker-input>input]:font-medium"
                          size="small"
                          disabled={control.locked}
                          value={value ? dayjs(value) : null}
                          onChange={(_, dateString) =>
                            updateParam(
                              control.urlKey,
                              typeof dateString === 'string' ? dateString : dateString[0] || '',
                            )
                          }
                        />
                      ) : isShopIdControl(control) ? (
                        <Select
                          className="w-full [&_.ant-select-selection-item]:text-xs [&_.ant-select-selection-item]:font-medium"
                          size="small"
                          disabled={control.locked}
                          value={value || undefined}
                          options={storeOptions}
                          placeholder="Select store"
                          onChange={(next) => updateParam(control.urlKey, String(next))}
                        />
                      ) : control.type === 'select' ? (
                        <Select
                          className="w-full [&_.ant-select-selection-item]:text-xs [&_.ant-select-selection-item]:font-medium"
                          size="small"
                          disabled={control.locked}
                          value={value || undefined}
                          options={control.options.map((o) => ({ label: o.label, value: o.value }))}
                          onChange={(next) => updateParam(control.urlKey, String(next))}
                        />
                      ) : control.type === 'number' ? (
                        <InputNumber
                          className="w-full [&_.ant-input-number-input]:text-xs [&_.ant-input-number-input]:font-medium"
                          size="small"
                          disabled={control.locked}
                          value={value === '' ? null : Number(value)}
                          onChange={(next) => updateParam(control.urlKey, String(next ?? ''))}
                        />
                      ) : (
                        <Input
                          className="text-xs font-medium"
                          size="small"
                          disabled={control.locked}
                          value={value}
                          onChange={(e) => updateParam(control.urlKey, e.target.value)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {refreshCountdown !== null ? <span>↻ {refreshCountdown}s</span> : null}
            <a
              href="/admin"
              className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Admin
            </a>
            <button
              type="button"
              onClick={runPrimaryAction}
              className="h-7 rounded-md bg-gradient-to-r from-sky-600 to-cyan-600 px-3 text-xs font-semibold text-white! shadow-sm transition-all hover:from-sky-500 hover:to-cyan-500 active:from-sky-700 active:to-cyan-700"
            >
              Save
            </button>
          </div>
        </div>
      </aside>
    </ConfigProvider>
  )
}
