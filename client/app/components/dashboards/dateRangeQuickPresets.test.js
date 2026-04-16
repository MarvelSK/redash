import moment from "moment";
import {
  getPresetRange,
  resolveDateRangePresets,
  DEFAULT_DATE_RANGE_PRESET_KEYS,
} from "./dateRangeQuickPresets";

describe("dateRangeQuickPresets", () => {
  test("supports additional range keys", () => {
    const last7 = getPresetRange("last-7-days");
    const last30 = getPresetRange("last-30-days");
    const thisQuarter = getPresetRange("this-quarter");
    const previousQuarter = getPresetRange("previous-quarter");
    const ytd = getPresetRange("year-to-date");

    expect(last7).toHaveLength(2);
    expect(last30).toHaveLength(2);
    expect(thisQuarter).toHaveLength(2);
    expect(previousQuarter).toHaveLength(2);
    expect(ytd).toHaveLength(2);

    expect(last7[0].format("YYYY-MM-DD")).toBe(moment().subtract(6, "days").startOf("day").format("YYYY-MM-DD"));
    expect(last30[0].format("YYYY-MM-DD")).toBe(moment().subtract(29, "days").startOf("day").format("YYYY-MM-DD"));
  });

  test("resolves locale label with fallback", () => {
    const presets = [
      {
        key: "today",
        label: "Default label",
        labelsByLocale: {
          fr: "Aujourd'hui",
        },
      },
    ];

    const fr = resolveDateRangePresets({ presets, locale: "fr-CH", userGroupIds: [1], isPublic: false });
    const en = resolveDateRangePresets({ presets, locale: "en", userGroupIds: [1], isPublic: false });

    expect(fr[0].label).toBe("Aujourd'hui");
    expect(en[0].label).toBe("Default label");
  });

  test("applies group and public visibility restrictions", () => {
    const presets = [
      {
        key: "today",
        visibleToGroupIds: [3],
      },
      {
        key: "current-week",
        hideOnPublic: true,
      },
    ];

    const forGroup3 = resolveDateRangePresets({ presets, locale: "en", userGroupIds: [3], isPublic: false });
    const forGroup2 = resolveDateRangePresets({ presets, locale: "en", userGroupIds: [2], isPublic: false });
    const forPublic = resolveDateRangePresets({ presets, locale: "en", userGroupIds: [], isPublic: true });

    expect(forGroup3.map(item => item.key)).toEqual(["today", "current-week"]);
    expect(forGroup2.map(item => item.key)).toEqual(["current-week"]);
    expect(forPublic.map(item => item.key)).toEqual([]);
  });

  test("falls back to default preset keys", () => {
    const resolved = resolveDateRangePresets({ presets: null, locale: "en", userGroupIds: [], isPublic: false });
    expect(resolved.map(item => item.key)).toEqual(DEFAULT_DATE_RANGE_PRESET_KEYS);
  });
});
