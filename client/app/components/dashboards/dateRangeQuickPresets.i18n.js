import { get } from "lodash";
import { getMessagesForLocale } from "@/services/i18n";

export const DATE_PRESET_UI_LOCALES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Francais" },
];

export function getPresetDefaultLabel(presetKey, locale) {
  const messages = getMessagesForLocale(locale);
  return get(messages, `datePresets.labels.${presetKey}`, presetKey);
}
