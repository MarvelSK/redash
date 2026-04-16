import { isEmpty, map } from "lodash";
import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import Button from "antd/lib/button";
import Checkbox from "antd/lib/checkbox";
import Input from "antd/lib/input";
import Select from "antd/lib/select";
import routeWithUserSession from "@/components/ApplicationArea/routeWithUserSession";
import DynamicComponent from "@/components/DynamicComponent";
import DashboardGrid from "@/components/dashboards/DashboardGrid";
import DateRangeQuickButtons from "@/components/dashboards/DateRangeQuickButtons";
import Parameters from "@/components/Parameters";
import Filters from "@/components/Filters";

import { Dashboard } from "@/services/dashboard";
import { currentUser } from "@/services/auth";
import recordEvent from "@/services/recordEvent";
import resizeObserver from "@/services/resizeObserver";
import routes from "@/services/routes";
import location from "@/services/location";
import url from "@/services/url";
import useImmutableCallback from "@/lib/hooks/useImmutableCallback";
import Group from "@/services/group";
import { DATE_RANGE_PRESET_DEFINITIONS } from "@/components/dashboards/dateRangeQuickPresets";
import {
  DATE_PRESET_UI_LOCALES,
  getPresetDefaultLabel,
} from "@/components/dashboards/dateRangeQuickPresets.i18n";

import useDashboard from "./hooks/useDashboard";
import DashboardHeader from "./components/DashboardHeader";

import "./DashboardPage.less";

function stringifyFixedValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseFixedValue(value) {
  const trimmedValue = value.trim();
  if (trimmedValue === "") {
    return null;
  }

  try {
    return JSON.parse(trimmedValue);
  } catch (_error) {
    return value;
  }
}

function normalizeGroupIds(groupIds) {
  return map(groupIds, id => Number(id));
}

function normalizeGroupId(groupId) {
  if (groupId === null || groupId === undefined || groupId === "") {
    return null;
  }

  return Number(groupId);
}

function normalizeDatePresetForEditor(preset) {
  if (typeof preset === "string") {
    return {
      key: preset,
      label: "",
      labelsByLocale: {},
      visibleToGroupIds: [],
      hideOnPublic: false,
    };
  }

  return {
    key: preset?.key || "today",
    label: preset?.label || "",
    labelsByLocale: preset?.labelsByLocale || {},
    visibleToGroupIds: Array.isArray(preset?.visibleToGroupIds) ? preset.visibleToGroupIds : [],
    hideOnPublic: !!preset?.hideOnPublic,
  };
}

function DashboardSettings({ dashboardConfiguration, globalParameters }) {
  const { dashboard, updateDashboard } = dashboardConfiguration;
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    Group.query().then(allGroups => {
      setGroups(Array.isArray(allGroups) ? allGroups : []);
    });
  }, []);

  const parameterPermissions = dashboard.options.parameterPermissions || {};
  const dateRangeQuickPresets = Array.isArray(dashboard.options.dateRangeQuickPresets)
    ? dashboard.options.dateRangeQuickPresets.map(normalizeDatePresetForEditor)
    : [];
  const defaultDateRangeQuickPreset = dashboard.options.defaultDateRangeQuickPreset || null;
  const presetOptions = Object.entries(DATE_RANGE_PRESET_DEFINITIONS).map(([key, item]) => ({
    key,
    label: getPresetDefaultLabel(key, "en"),
  }));
  const localeCodesFromOptions = Object.keys(dashboard.options.parameterTranslations || {});
  const localeCodesFromPresets = dateRangeQuickPresets.flatMap(preset => Object.keys(preset.labelsByLocale || {}));
  const baseLocaleCodes = DATE_PRESET_UI_LOCALES.map(locale => locale.code);
  const allLocaleCodes = Array.from(new Set([...baseLocaleCodes, ...localeCodesFromOptions, ...localeCodesFromPresets]));

  const updateDashboardOptions = patch => {
    updateDashboard({
      options: {
        ...dashboard.options,
        ...patch,
      },
    });
  };

  const updateParameterPermission = (parameterName, patch) => {
    const currentRule = parameterPermissions[parameterName] || {};
    const updatedRule = { ...currentRule, ...patch };

    updateDashboard({
      options: {
        ...dashboard.options,
        parameterPermissions: {
          ...parameterPermissions,
          [parameterName]: updatedRule,
        },
      },
    });
  };

  const updateGroupOverride = (parameterName, index, patch) => {
    const rule = parameterPermissions[parameterName] || {};
    const currentOverrides = Array.isArray(rule.groupValueOverrides) ? rule.groupValueOverrides : [];
    const updatedOverrides = currentOverrides.map((override, currentIndex) =>
      currentIndex === index ? { ...override, ...patch } : override
    );

    updateParameterPermission(parameterName, { groupValueOverrides: updatedOverrides });
  };

  const addGroupOverride = parameterName => {
    const rule = parameterPermissions[parameterName] || {};
    const currentOverrides = Array.isArray(rule.groupValueOverrides) ? rule.groupValueOverrides : [];

    updateParameterPermission(parameterName, {
      groupValueOverrides: [...currentOverrides, { groupId: null, fixedValue: null, canEdit: false }],
    });
  };

  const removeGroupOverride = (parameterName, index) => {
    const rule = parameterPermissions[parameterName] || {};
    const currentOverrides = Array.isArray(rule.groupValueOverrides) ? rule.groupValueOverrides : [];

    updateParameterPermission(parameterName, {
      groupValueOverrides: currentOverrides.filter((_, currentIndex) => currentIndex !== index),
    });
  };

  const updateDatePreset = (index, patch) => {
    const nextPresets = dateRangeQuickPresets.map((preset, currentIndex) =>
      currentIndex === index ? { ...preset, ...patch } : preset
    );
    updateDashboardOptions({ dateRangeQuickPresets: nextPresets });
  };

  const updateDatePresetLocaleLabel = (index, locale, label) => {
    const preset = dateRangeQuickPresets[index] || {};
    const labelsByLocale = { ...(preset.labelsByLocale || {}) };
    const trimmedLabel = String(label || "").trim();
    if (trimmedLabel) {
      labelsByLocale[locale] = trimmedLabel;
    } else {
      delete labelsByLocale[locale];
    }
    updateDatePreset(index, { labelsByLocale });
  };

  const moveDatePreset = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= dateRangeQuickPresets.length) {
      return;
    }

    const nextPresets = [...dateRangeQuickPresets];
    const temp = nextPresets[index];
    nextPresets[index] = nextPresets[targetIndex];
    nextPresets[targetIndex] = temp;
    updateDashboardOptions({ dateRangeQuickPresets: nextPresets });
  };

  const addDatePreset = () => {
    updateDashboardOptions({
      dateRangeQuickPresets: [
        ...dateRangeQuickPresets,
        {
          key: "today",
          label: "",
          labelsByLocale: {},
          visibleToGroupIds: [],
          hideOnPublic: false,
        },
      ],
    });
  };

  const removeDatePreset = index => {
    const removedPreset = dateRangeQuickPresets[index];
    const nextPresets = dateRangeQuickPresets.filter((_, currentIndex) => currentIndex !== index);
    const patch = { dateRangeQuickPresets: nextPresets };
    if (removedPreset?.key && defaultDateRangeQuickPreset === removedPreset.key) {
      patch.defaultDateRangeQuickPreset = null;
    }
    updateDashboardOptions(patch);
  };

  const resetDatePresetsToDefault = () => {
    updateDashboardOptions({
      dateRangeQuickPresets: [],
      defaultDateRangeQuickPreset: null,
    });
  };

  return (
    <div className="m-b-10 p-15 bg-white tiled">
      <Checkbox
        checked={!!dashboard.dashboard_filters_enabled}
        onChange={({ target }) => updateDashboard({ dashboard_filters_enabled: target.checked })}
        data-test="DashboardFiltersCheckbox"
      >
        Use Dashboard Level Filters
      </Checkbox>

      {!isEmpty(globalParameters) && (
        <div className="m-t-20">
          <h4 className="m-b-15">Parameter Access Rules</h4>
          {map(globalParameters, param => {
            const rule = parameterPermissions[param.name] || {};
            const groupValueOverrides = Array.isArray(rule.groupValueOverrides) ? rule.groupValueOverrides : [];

            return (
              <div key={param.name} className="m-b-15 p-10" style={{ border: "1px solid #eaeaea" }}>
                <div className="m-b-5">
                  <strong>{param.title || param.name}</strong>
                </div>

                <div className="m-b-5">Groups allowed to edit</div>
                <Select
                  mode="multiple"
                  value={rule.editableByGroups || []}
                  style={{ width: "100%" }}
                  placeholder="Leave empty to allow all groups"
                  onChange={(value) =>
                    updateParameterPermission(param.name, { editableByGroups: normalizeGroupIds(value) })
                  }
                >
                  {map(groups, group => (
                    <Select.Option key={group.id} value={group.id}>
                      {group.name}
                    </Select.Option>
                  ))}
                </Select>

                <div className="m-t-10 m-b-5">Groups locked to fixed value</div>
                <Select
                  mode="multiple"
                  value={rule.fixedValueGroupIds || []}
                  style={{ width: "100%" }}
                  placeholder="Select groups that must use fixed value"
                  onChange={(value) =>
                    updateParameterPermission(param.name, { fixedValueGroupIds: normalizeGroupIds(value) })
                  }
                >
                  {map(groups, group => (
                    <Select.Option key={group.id} value={group.id}>
                      {group.name}
                    </Select.Option>
                  ))}
                </Select>

                <div className="m-t-10 m-b-5">Fixed value (plain text or JSON)</div>
                <Input
                  value={stringifyFixedValue(rule.fixedValue)}
                  onChange={(event) =>
                    updateParameterPermission(param.name, { fixedValue: parseFixedValue(event.target.value) })
                  }
                  placeholder={'Example: US or ["US","UK"]'}
                />

                <div className="m-t-15 m-b-5">
                  <strong>Per-group value overrides</strong>
                </div>

                {map(groupValueOverrides, (override, index) => (
                  <div key={`${param.name}-override-${index}`} className="m-b-10 p-10" style={{ border: "1px solid #f0f0f0" }}>
                    <div className="m-b-5">Group</div>
                    <Select
                      value={override.groupId}
                      style={{ width: "100%" }}
                      placeholder="Select group"
                      onChange={(value) =>
                        updateGroupOverride(param.name, index, { groupId: normalizeGroupId(value) })
                      }
                    >
                      {map(groups, group => (
                        <Select.Option key={group.id} value={group.id}>
                          {group.name}
                        </Select.Option>
                      ))}
                    </Select>

                    <div className="m-t-10 m-b-5">Fixed value for this group (plain text or JSON)</div>
                    <Input
                      value={stringifyFixedValue(override.fixedValue)}
                      onChange={(event) =>
                        updateGroupOverride(param.name, index, { fixedValue: parseFixedValue(event.target.value) })
                      }
                      placeholder={'Example: ZURICH or ["ZH","GE"]'}
                    />

                    <div className="m-t-10">
                      <Checkbox
                        checked={!!override.canEdit}
                        onChange={({ target }) => updateGroupOverride(param.name, index, { canEdit: target.checked })}
                      >
                        This group can edit value
                      </Checkbox>
                    </div>

                    <div className="m-t-10">
                      <Button onClick={() => removeGroupOverride(param.name, index)}>Remove group override</Button>
                    </div>
                  </div>
                ))}

                <Button onClick={() => addGroupOverride(param.name)}>Add group override</Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="m-t-20">
        <h4 className="m-b-15">Date Range Quick Presets</h4>
        <div className="m-b-10 text-muted">
          Configure quick buttons for <code>date_from</code> and <code>date_to</code> parameters.
        </div>

        {map(dateRangeQuickPresets, (preset, index) => (
          <div key={`date-preset-${index}`} className="m-b-15 p-10" style={{ border: "1px solid #eaeaea" }}>
            <div className="m-b-5">Preset key</div>
            <Select
              value={preset.key}
              style={{ width: "100%" }}
              onChange={(value) => updateDatePreset(index, { key: value })}
            >
              {map(presetOptions, (option) => (
                <Select.Option key={option.key} value={option.key}>
                  {option.label} ({option.key})
                </Select.Option>
              ))}
            </Select>

            <div className="m-t-10 m-b-5">Default button label</div>
            <Input
              value={preset.label || ""}
              onChange={(event) => updateDatePreset(index, { label: event.target.value })}
              placeholder="Optional custom label"
            />

            {map(allLocaleCodes, (localeCode) => {
              const localeLabel = DATE_PRESET_UI_LOCALES.find(item => item.code === localeCode)?.label || localeCode;
              return (
                <div key={`${preset.key}-locale-${localeCode}`}>
                  <div className="m-t-10 m-b-5">Label for {localeLabel} ({localeCode})</div>
                  <Input
                    value={preset.labelsByLocale?.[localeCode] || ""}
                    onChange={(event) => updateDatePresetLocaleLabel(index, localeCode, event.target.value)}
                    placeholder={`Optional ${localeCode} label`}
                  />
                </div>
              );
            })}

            <div className="m-t-10 m-b-5">Visible only for groups (optional)</div>
            <Select
              mode="multiple"
              value={preset.visibleToGroupIds || []}
              style={{ width: "100%" }}
              placeholder="Leave empty to show for all groups"
              onChange={(value) => updateDatePreset(index, { visibleToGroupIds: normalizeGroupIds(value) })}
            >
              {map(groups, group => (
                <Select.Option key={group.id} value={group.id}>
                  {group.name}
                </Select.Option>
              ))}
            </Select>

            <div className="m-t-10">
              <Checkbox
                checked={!!preset.hideOnPublic}
                onChange={({ target }) => updateDatePreset(index, { hideOnPublic: target.checked })}
              >
                Hide this preset on public dashboard links
              </Checkbox>
            </div>

            <div className="m-t-10">
              <Button className="m-r-5" onClick={() => moveDatePreset(index, -1)} disabled={index === 0}>
                Move up
              </Button>
              <Button
                className="m-r-5"
                onClick={() => moveDatePreset(index, 1)}
                disabled={index === dateRangeQuickPresets.length - 1}
              >
                Move down
              </Button>
              <Button onClick={() => removeDatePreset(index)}>Remove preset</Button>
            </div>
          </div>
        ))}

        <div className="m-b-10">
          <Button className="m-r-10" onClick={addDatePreset}>
            Add date preset
          </Button>
          <Button onClick={resetDatePresetsToDefault}>Reset presets to default</Button>
        </div>

        <div className="m-t-10 m-b-5">Default preset (auto-applied on first load if URL has no date params)</div>
        <Select
          value={defaultDateRangeQuickPreset}
          style={{ width: "100%" }}
          placeholder="No default preset"
          allowClear
          onChange={(value) => updateDashboardOptions({ defaultDateRangeQuickPreset: value || null })}
        >
          {map(dateRangeQuickPresets, (preset, index) => (
            <Select.Option key={`${preset.key}-${index}`} value={preset.key}>
              {preset.key}
            </Select.Option>
          ))}
        </Select>
      </div>
    </div>
  );
}

DashboardSettings.propTypes = {
  dashboardConfiguration: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  globalParameters: PropTypes.arrayOf(PropTypes.object),
};

DashboardSettings.defaultProps = {
  globalParameters: [],
};

function AddWidgetContainer({ dashboardConfiguration, className, ...props }) {
  const { showAddTextboxDialog, showAddWidgetDialog } = dashboardConfiguration;
  return (
    <div className={cx("add-widget-container", className)} {...props}>
      <h2>
        <i className="zmdi zmdi-widgets" aria-hidden="true" />
        <span className="hidden-xs hidden-sm">
          Widgets are individual query visualizations or text boxes you can place on your dashboard in various
          arrangements.
        </span>
      </h2>
      <div>
        <Button className="m-r-15" onClick={showAddTextboxDialog} data-test="AddTextboxButton">
          Add Textbox
        </Button>
        <Button type="primary" onClick={showAddWidgetDialog} data-test="AddWidgetButton">
          Add Widget
        </Button>
      </div>
    </div>
  );
}

AddWidgetContainer.propTypes = {
  dashboardConfiguration: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  className: PropTypes.string,
};

function DashboardComponent(props) {
  const dashboardConfiguration = useDashboard(props.dashboard);
  const {
    dashboard,
    filters,
    setFilters,
    loadDashboard,
    loadWidget,
    removeWidget,
    saveDashboardLayout,
    globalParameters,
    updateDashboard,
    refreshDashboard,
    refreshWidget,
    editingLayout,
    setGridDisabled,
  } = dashboardConfiguration;

  const [pageContainer, setPageContainer] = useState(null);
  const [bottomPanelStyles, setBottomPanelStyles] = useState({});
  const onParametersEdit = (parameters) => {
    const paramOrder = map(parameters, "name");
    updateDashboard({ options: { ...dashboard.options, globalParamOrder: paramOrder } });
  };

  useEffect(() => {
    if (pageContainer) {
      const unobserve = resizeObserver(pageContainer, () => {
        if (editingLayout) {
          const style = window.getComputedStyle(pageContainer, null);
          const bounds = pageContainer.getBoundingClientRect();
          const paddingLeft = parseFloat(style.paddingLeft) || 0;
          const paddingRight = parseFloat(style.paddingRight) || 0;
          setBottomPanelStyles({
            left: Math.round(bounds.left) + paddingRight,
            width: pageContainer.clientWidth - paddingLeft - paddingRight,
          });
        }

        // reflow grid when container changes its size
        window.dispatchEvent(new Event("resize"));
      });
      return unobserve;
    }
  }, [pageContainer, editingLayout]);

  return (
    <div className="container" ref={setPageContainer} data-test={`DashboardId${dashboard.id}Container`}>
      <DashboardHeader
        dashboardConfiguration={dashboardConfiguration}
        headerExtra={
          <DynamicComponent
            name="Dashboard.HeaderExtra"
            dashboard={dashboard}
            dashboardConfiguration={dashboardConfiguration}
          />
        }
      />
      {!isEmpty(globalParameters) && (
        <div className="dashboard-parameters m-b-10 p-15 bg-white tiled" data-test="DashboardParameters">
          <DateRangeQuickButtons
            parameters={globalParameters}
            onValuesChange={refreshDashboard}
            presets={dashboard.options?.dateRangeQuickPresets}
            defaultPresetKey={dashboard.options?.defaultDateRangeQuickPreset}
            userGroupIds={currentUser.groups || []}
            dashboardId={dashboard.id}
          />
          <Parameters
            parameters={globalParameters}
            onValuesChange={refreshDashboard}
            sortable={editingLayout}
            onParametersEdit={onParametersEdit}
          />
        </div>
      )}
      {!isEmpty(filters) && (
        <div className="m-b-10 p-15 bg-white tiled" data-test="DashboardFilters">
          <Filters filters={filters} onChange={setFilters} />
        </div>
      )}
      {editingLayout && (
        <DashboardSettings dashboardConfiguration={dashboardConfiguration} globalParameters={globalParameters} />
      )}
      <div id="dashboard-container">
        <DashboardGrid
          dashboard={dashboard}
          widgets={dashboard.widgets}
          filters={filters}
          isEditing={editingLayout}
          onLayoutChange={editingLayout ? saveDashboardLayout : () => {}}
          onBreakpointChange={setGridDisabled}
          onLoadWidget={loadWidget}
          onRefreshWidget={refreshWidget}
          onRemoveWidget={removeWidget}
          onParameterMappingsChange={loadDashboard}
        />
      </div>
      {editingLayout && (
        <AddWidgetContainer dashboardConfiguration={dashboardConfiguration} style={bottomPanelStyles} />
      )}
    </div>
  );
}

DashboardComponent.propTypes = {
  dashboard: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

function DashboardPage({ dashboardSlug, dashboardId, onError }) {
  const [dashboard, setDashboard] = useState(null);
  const handleError = useImmutableCallback(onError);

  useEffect(() => {
    Dashboard.get({ id: dashboardId, slug: dashboardSlug })
      .then((dashboardData) => {
        recordEvent("view", "dashboard", dashboardData.id);
        setDashboard(dashboardData);

        // if loaded by slug, update location url to use the id
        if (!dashboardId) {
          location.setPath(url.parse(dashboardData.url).pathname, true);
        }
      })
      .catch(handleError);
  }, [dashboardId, dashboardSlug, handleError]);

  return <div className="dashboard-page">{dashboard && <DashboardComponent dashboard={dashboard} />}</div>;
}

DashboardPage.propTypes = {
  dashboardSlug: PropTypes.string,
  dashboardId: PropTypes.string,
  onError: PropTypes.func,
};

DashboardPage.defaultProps = {
  dashboardSlug: null,
  dashboardId: null,
  onError: PropTypes.func,
};

// route kept for backward compatibility
routes.register(
  "Dashboards.LegacyViewOrEdit",
  routeWithUserSession({
    path: "/dashboard/:dashboardSlug",
    render: (pageProps) => <DashboardPage {...pageProps} />,
  })
);

routes.register(
  "Dashboards.ViewOrEdit",
  routeWithUserSession({
    path: "/dashboards/:dashboardId([^-]+)(-.*)?",
    render: (pageProps) => <DashboardPage {...pageProps} />,
  })
);
