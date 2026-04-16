import { compact, isArray, isObject, toLower, uniq } from "lodash";
import moment from "moment";
import { getPresetDefaultLabel } from "./dateRangeQuickPresets.i18n";

export const DATE_RANGE_PRESET_DEFINITIONS = {
  today: {
    getRange: () => [moment().startOf("day"), moment().endOf("day")],
  },
  "current-week": {
    getRange: () => [moment().startOf("isoWeek"), moment().endOf("isoWeek")],
  },
  "previous-week": {
    getRange: () => [moment().subtract(1, "week").startOf("isoWeek"), moment().subtract(1, "week").endOf("isoWeek")],
  },
  "current-month": {
    getRange: () => [moment().startOf("month"), moment().endOf("month")],
  },
  "previous-month": {
    getRange: () => [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  },
  "last-7-days": {
    getRange: () => [moment().subtract(6, "days").startOf("day"), moment().endOf("day")],
  },
  "last-30-days": {
    getRange: () => [moment().subtract(29, "days").startOf("day"), moment().endOf("day")],
  },
  "this-quarter": {
    getRange: () => [moment().startOf("quarter"), moment().endOf("quarter")],
  },
  "previous-quarter": {
    getRange: () => [moment().subtract(1, "quarter").startOf("quarter"), moment().subtract(1, "quarter").endOf("quarter")],
  },
  "year-to-date": {
    getRange: () => [moment().startOf("year"), moment().endOf("day")],
  },
};

export const DEFAULT_DATE_RANGE_PRESET_KEYS = [
  "today",
  "current-week",
  "previous-week",
  "current-month",
  "previous-month",
];

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

  const urlParams = new URLSearchParams(window.location.search || "");
  const localeFromUrl = normalizeLocaleCode(urlParams.get("lang") || urlParams.get("locale"));
  if (localeFromUrl) {
    return localeFromUrl;
  }

  return normalizeLocaleCode(window.navigator.language) || "en";
}

export function getPresetRange(presetKey) {
  return DATE_RANGE_PRESET_DEFINITIONS[presetKey]?.getRange() || null;
}

function normalizePresetItem(preset) {
  const normalized = typeof preset === "string" ? { key: preset } : preset;
  const key = String(normalized?.key || "").trim();

  if (!key || !DATE_RANGE_PRESET_DEFINITIONS[key]) {
    return null;
  }

  return {
    key,
    label: String(normalized?.label || "").trim(),
    labelsByLocale: isObject(normalized?.labelsByLocale) ? normalized.labelsByLocale : {},
    visibleToGroupIds: isArray(normalized?.visibleToGroupIds) ? normalized.visibleToGroupIds.map(id => Number(id)) : [],
    hideOnPublic: Boolean(normalized?.hideOnPublic),
  };
}

function getPresetLabel(preset, locale) {
  const localeCode = normalizeLocaleCode(locale);
  const localeBase = localeCode.split("-")[0];
  const localeCandidates = uniq(compact([localeCode, localeBase, "en"]));

  for (const code of localeCandidates) {
    const localized = preset.labelsByLocale?.[code];
    if (typeof localized === "string" && localized.trim()) {
      return localized.trim();
    }
  }

  if (preset.label) {
    return preset.label;
  }

  return getPresetDefaultLabel(preset.key, locale);
}

function intersectsGroups(allowedGroups, userGroupIds) {
  if (!allowedGroups || allowedGroups.length === 0) {
    return true;
  }

  if (!userGroupIds || userGroupIds.length === 0) {
    return false;
  }

  const userSet = new Set(userGroupIds.map(id => Number(id)));
  return allowedGroups.some(id => userSet.has(Number(id)));
}

export function resolveDateRangePresets(options = {}) {
  const {
    presets,
    locale,
    userGroupIds,
    isPublic,
  } = options;

  const source = isArray(presets) && presets.length > 0 ? presets : DEFAULT_DATE_RANGE_PRESET_KEYS;
  const normalized = compact(source.map(normalizePresetItem));

  return normalized
    .filter(preset => !preset.hideOnPublic || !isPublic)
    .filter(preset => intersectsGroups(preset.visibleToGroupIds, userGroupIds || []))
    .map(preset => ({ ...preset, label: getPresetLabel(preset, locale) }));
}
