import React from "react";
import PropTypes from "prop-types";
import moment from "moment";
import Button from "antd/lib/button";
import location from "@/services/location";
import { Parameter } from "@/services/parameters";

function normalizeParameterName(name) {
  return String(name || "").trim().toLowerCase();
}

function getPresetRange(presetKey) {
  switch (presetKey) {
    case "today":
      return [moment().startOf("day"), moment().endOf("day")];
    case "current-week":
      return [moment().startOf("isoWeek"), moment().endOf("isoWeek")];
    case "previous-week":
      return [
        moment().subtract(1, "week").startOf("isoWeek"),
        moment().subtract(1, "week").endOf("isoWeek"),
      ];
    case "current-month":
      return [moment().startOf("month"), moment().endOf("month")];
    case "previous-month":
      return [
        moment().subtract(1, "month").startOf("month"),
        moment().subtract(1, "month").endOf("month"),
      ];
    default:
      return null;
  }
}

const DEFAULT_DATE_PRESETS = [
  { key: "today", label: "Dnes" },
  { key: "current-week", label: "Aktualny tyzden" },
  { key: "previous-week", label: "Minuly tyzden" },
  { key: "current-month", label: "Aktualny mesiac" },
  { key: "previous-month", label: "Minuly mesiac" },
];

function buildPresetList(presets) {
  const source = Array.isArray(presets) && presets.length > 0 ? presets : DEFAULT_DATE_PRESETS;
  const normalized = [];

  source.forEach((item) => {
    const preset = typeof item === "string" ? { key: item } : item;
    const key = String(preset?.key || "").trim();
    if (!key || !getPresetRange(key)) {
      return;
    }

    const fallbackLabel = DEFAULT_DATE_PRESETS.find((defaultPreset) => defaultPreset.key === key)?.label || key;
    const customLabel = String(preset?.label || "").trim();
    normalized.push({
      key,
      label: customLabel || fallbackLabel,
    });
  });

  return normalized;
}

export default function DateRangeQuickButtons({ parameters, onValuesChange, presets }) {
  const dateFromParam = parameters.find((param) => normalizeParameterName(param.name) === "date_from");
  const dateToParam = parameters.find((param) => normalizeParameterName(param.name) === "date_to");
  const presetList = buildPresetList(presets);

  if (!dateFromParam || !dateToParam || presetList.length === 0) {
    return null;
  }

  const applyPreset = (presetKey) => {
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

    onValuesChange([dateFromParam, dateToParam]);
  };

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
};

DateRangeQuickButtons.defaultProps = {
  parameters: [],
  onValuesChange: () => {},
  presets: DEFAULT_DATE_PRESETS,
};
