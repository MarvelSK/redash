import { compact, get, toLower, uniq } from "lodash";

import enMessages from "@/i18n/en.json";
import deMessages from "@/i18n/de.json";
import frMessages from "@/i18n/fr.json";

const UI_MESSAGES = {
  en: enMessages,
  de: deMessages,
  fr: frMessages,
};

function normalizeLocaleCode(value) {
  if (!value) {
    return "";
  }

  return toLower(String(value).trim().replace("_", "-"));
}

export function resolveLocaleFromContext() {
  if (typeof window === "undefined") {
    return "en";
  }

  const params = new URLSearchParams(window.location.search || "");
  const localeFromUrl = normalizeLocaleCode(params.get("lang") || params.get("locale"));
  if (localeFromUrl) {
    return localeFromUrl;
  }

  return normalizeLocaleCode(window.navigator.language) || "en";
}

export function getMessagesForLocale(locale) {
  const localeCode = normalizeLocaleCode(locale);
  const localeBase = localeCode.split("-")[0];
  const candidates = uniq(compact([localeCode, localeBase, "en"]));

  for (const code of candidates) {
    if (UI_MESSAGES[code]) {
      return UI_MESSAGES[code];
    }
  }

  return UI_MESSAGES.en;
}

export function t(key, fallback = "", values = {}, locale = undefined) {
  const activeLocale = locale || resolveLocaleFromContext();
  const messages = getMessagesForLocale(activeLocale);
  const template = get(messages, key, fallback || key);

  if (typeof template !== "string") {
    return fallback || key;
  }

  return template.replace(/\{(\w+)\}/g, (_, token) => {
    if (values[token] === undefined || values[token] === null) {
      return "";
    }
    return String(values[token]);
  });
}

export function getVisualizationI18nPayload(locale = undefined) {
  const activeLocale = locale || resolveLocaleFromContext();
  const messages = getMessagesForLocale(activeLocale);
  return {
    locale: activeLocale,
    strings: {
      table: {
        editor: {
          tabs: {
            columns: get(messages, "visualization.tableEditor.tabs.columns", "Columns"),
            grid: get(messages, "visualization.tableEditor.tabs.grid", "Grid"),
          },
          itemsPerPage: get(messages, "visualization.tableEditor.itemsPerPage", "Items per page"),
          toggleVisibility: get(messages, "visualization.tableEditor.toggleVisibility", "Toggle visibility"),
        },
      },
    },
  };
}
