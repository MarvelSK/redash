import React, { useEffect, useMemo, useRef } from "react";
import PropTypes from "prop-types";
import Button from "antd/lib/button";
import location from "@/services/location";
import { Parameter } from "@/services/parameters";
import recordEvent from "@/services/recordEvent";
import {
  DEFAULT_DATE_RANGE_PRESET_KEYS,
  getPresetRange,
  resolveDateRangePresets,
  resolveLocaleFromContext,
} from "./dateRangeQuickPresets";

function normalizeParameterName(name) {
  return String(name || "").trim().toLowerCase();
}

export default function DateRangeQuickButtons({
  parameters,
  onValuesChange,
  presets,
  defaultPresetKey,
  userGroupIds,
  isPublic,
  dashboardId,
}) {
  const dateFromParam = parameters.find((param) => normalizeParameterName(param.name) === "date_from");
  const dateToParam = parameters.find((param) => normalizeParameterName(param.name) === "date_to");
  const locale = resolveLocaleFromContext();
  const hasAppliedDefaultRef = useRef(false);
  const presetList = useMemo(
    () => resolveDateRangePresets({ presets, locale, userGroupIds, isPublic }),
    [presets, locale, userGroupIds, isPublic]
  );

  if (!dateFromParam || !dateToParam || presetList.length === 0) {
    return null;
  }

  const applyPreset = (presetKey, autoApplied = false) => {
    const range = getPresetRange(presetKey);
    if (!range) {
      return;
    }

    const [startDate, endDate] = range;

    dateFromParam.setValue(startDate);
    dateToParam.setValue(endDate);

    const updatedSearch = {
      ...location.search,
      ...dateFromParam.toUrlParams(),
      ...dateToParam.toUrlParams(),
    };
    location.setSearch(updatedSearch, true);

    if (dashboardId) {
      recordEvent("apply_date_range_preset", "dashboard", dashboardId, {
        presetKey,
        autoApplied,
        isPublic,
      });
    }

    onValuesChange([dateFromParam, dateToParam]);
  };

  useEffect(() => {
    if (hasAppliedDefaultRef.current) {
      return;
    }

    if (!defaultPresetKey) {
      return;
    }

    const presetAvailable = presetList.some((preset) => preset.key === defaultPresetKey);
    if (!presetAvailable) {
      return;
    }

    if (location.search.p_date_from || location.search.p_date_to) {
      return;
    }

    hasAppliedDefaultRef.current = true;
    applyPreset(defaultPresetKey, true);
  }, [defaultPresetKey, presetList]);

  return (
    <div className="m-b-10" data-test="DashboardDateQuickButtons">
      {presetList.map((preset) => (
        <Button
          key={preset.key}
          size="small"
          className="m-r-5 m-b-5"
          onClick={() => applyPreset(preset.key)}
          type="default"
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}

DateRangeQuickButtons.propTypes = {
  parameters: PropTypes.arrayOf(PropTypes.instanceOf(Parameter)),
  onValuesChange: PropTypes.func,
  presets: PropTypes.arrayOf(
    PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.shape({
        key: PropTypes.string,
        label: PropTypes.string,
      }),
    ])
  ),
  defaultPresetKey: PropTypes.string,
  userGroupIds: PropTypes.arrayOf(PropTypes.number),
  isPublic: PropTypes.bool,
  dashboardId: PropTypes.number,
};

DateRangeQuickButtons.defaultProps = {
  parameters: [],
  onValuesChange: () => {},
  presets: DEFAULT_DATE_RANGE_PRESET_KEYS,
  defaultPresetKey: null,
  userGroupIds: [],
  isPublic: false,
  dashboardId: null,
};
