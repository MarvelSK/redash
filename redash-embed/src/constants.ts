export const SYSTEM_PARAM_KEYS = new Set(['org_slug', 'hide_parameters', 'api_key'])

export const JOB_STATUS_NAMES: Record<number, string> = {
  1: 'PENDING',
  2: 'STARTED',
  3: 'SUCCESS',
  4: 'FAILURE',
  5: 'CANCELLED',
}

export const POLL_INTERVAL_MS = 1500

export const EMBED_LOCALE_STORAGE_KEY = 'redash-embed.locale'
export const EMBED_FILTERS_STORAGE_PREFIX = 'redash-embed.filters.'

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  sk: 'Slovenčina',
  cs: 'Čeština',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pl: 'Polski',
  hu: 'Magyar',
  ro: 'Română',
  hr: 'Hrvatski',
  nl: 'Nederlands',
}
