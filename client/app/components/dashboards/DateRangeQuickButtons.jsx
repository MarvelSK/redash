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

const DATE_PRESETS = [
  { key: "today", label: "Dnes" },
  { key: "current-week", label: "Aktualny tyzden" },
  { key: "previous-week", label: "Minuly tyzden" },
  { key: "current-month", label: "Aktualny mesiac" },
  { key: "previous-month", label: "Minuly mesiac" },
];

export default function DateRangeQuickButtons({ parameters, onValuesChange }) {
  const dateFromParam = parameters.find((param) => normalizeParameterName(param.name) === "date_from");
  const dateToParam = parameters.find((param) => normalizeParameterName(param.name) === "date_to");

  if (!dateFromParam || !dateToParam) {
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
      {DATE_PRESETS.map((preset) => (
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
};

DateRangeQuickButtons.defaultProps = {
  parameters: [],
  onValuesChange: () => {},
};
