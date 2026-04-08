export type AppLocale = 'en' | 'fr' | 'de-ch'

export const APP_LOCALES: Array<{ code: AppLocale; label: string; dashboardLang: string }> = [
  { code: 'en', label: 'English', dashboardLang: 'en' },
  { code: 'fr', label: 'Français', dashboardLang: 'fr' },
  { code: 'de-ch', label: 'Deutsch (Schweiz)', dashboardLang: 'de' },
]

type UiStrings = {
  language: string
  filters: string
  urlParams: string
  addParam: string
  applyRun: string
  applyUrl: string
  autoLoad: string
  admin: string
  noUrl: string
  collapseSidebar: string
  openSidebar: string
}

const STRINGS: Record<AppLocale, UiStrings> = {
  en: {
    language: 'Language',
    filters: 'Filters',
    urlParams: 'URL Params',
    addParam: '+ Add Param',
    applyRun: 'Apply and Refresh',
    applyUrl: 'Apply to URL',
    autoLoad: 'Auto Load Params',
    admin: 'Admin Panel',
    noUrl: 'No URL configured for this tab/language.',
    collapseSidebar: 'Collapse sidebar',
    openSidebar: 'Open sidebar',
  },
  fr: {
    language: 'Langue',
    filters: 'Filtres',
    urlParams: 'Paramètres URL',
    addParam: '+ Ajouter paramètre',
    applyRun: 'Apply and Refresh',
    applyUrl: 'Appliquer à l’URL',
    autoLoad: 'Charger auto paramètres',
    admin: 'Admin Panel',
    noUrl: 'Aucune URL configurée pour cet onglet/langue.',
    collapseSidebar: 'Réduire la barre latérale',
    openSidebar: 'Ouvrir la barre latérale',
  },
  'de-ch': {
    language: 'Sprache',
    filters: 'Filter',
    urlParams: 'URL-Parameter',
    addParam: '+ Parameter hinzufügen',
    applyRun: 'Apply and Refresh',
    applyUrl: 'Auf URL anwenden',
    autoLoad: 'Parameter automatisch laden',
    admin: 'Admin Panel',
    noUrl: 'Keine URL für diesen Tab/diese Sprache konfiguriert.',
    collapseSidebar: 'Seitenleiste einklappen',
    openSidebar: 'Seitenleiste öffnen',
  },
}

export function getStrings(locale: AppLocale): UiStrings {
  return STRINGS[locale] || STRINGS.en
}

export function resolveLocaleFromBrowser(): AppLocale {
  const lang = (window.navigator.language || 'en').toLowerCase()
  if (lang.startsWith('fr')) return 'fr'
  if (lang.startsWith('de')) return 'de-ch'
  return 'en'
}

export function preferredDashboardLanguage(
  locale: AppLocale,
  available: string[],
  fallback: string,
): string {
  const localeMeta = APP_LOCALES.find((l) => l.code === locale)
  const desired = localeMeta?.dashboardLang || 'en'
  if (available.includes(desired)) return desired
  if (available.includes('en')) return 'en'
  return available[0] || fallback || 'en'
}

export function localeFromDashboardLanguage(lang: string, current: AppLocale): AppLocale {
  if (lang === 'fr') return 'fr'
  if (lang === 'de') return 'de-ch'
  if (lang === 'en') return 'en'
  return current
}
