import { isEqual, extend, map, sortBy, findIndex, filter, pick, omit } from "lodash";
import React, { useState, useMemo, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import Modal from "antd/lib/modal";
import Select from "antd/lib/select";
import Input from "antd/lib/input";
import { wrap as wrapDialog, DialogPropType } from "@/components/DialogWrapper";
import Filters, { filterData } from "@/components/Filters";
import notification from "@/services/notification";
import Visualization from "@/services/visualization";
import recordEvent from "@/services/recordEvent";
import useQueryResultData from "@/lib/useQueryResultData";
import { useUniqueId } from "@/lib/hooks/useUniqueId";
import {
  registeredVisualizations,
  getDefaultVisualization,
  newVisualization,
  VisualizationType,
} from "@redash/viz/lib";
import { Renderer, Editor } from "@/components/visualizations/visualizationComponents";
import { t } from "@/services/i18n";

import "./EditVisualizationDialog.less";

function updateQueryVisualizations(query, visualization) {
  const index = findIndex(query.visualizations, (v) => v.id === visualization.id);
  if (index > -1) {
    query.visualizations[index] = visualization;
  } else {
    // new visualization
    query.visualizations.push(visualization);
  }
  query.visualizations = [...query.visualizations]; // clone array
}

function saveVisualization(visualization) {
  if (visualization.id) {
    recordEvent("update", "visualization", visualization.id, { type: visualization.type });
  } else {
    recordEvent("create", "visualization", null, { type: visualization.type });
  }

  return Visualization.save(visualization)
    .then((result) => {
      notification.success(t("visualization.editor.saved", "Visualization saved"));
      return result;
    })
    .catch((error) => {
      notification.error(t("visualization.editor.saveError", "Visualization could not be saved"));
      return Promise.reject(error);
    });
}

function confirmDialogClose(isDirty) {
  return new Promise((resolve, reject) => {
    if (isDirty) {
      Modal.confirm({
        title: t("visualization.editor.closeConfirmTitle", "Visualization Editor"),
        content: t(
          "visualization.editor.closeConfirmContent",
          "Are you sure you want to close the editor without saving?"
        ),
        okText: t("visualization.editor.yes", "Yes"),
        cancelText: t("visualization.editor.no", "No"),
        onOk: () => resolve(),
        onCancel: () => reject(),
      });
    } else {
      resolve();
    }
  });
}

function EditVisualizationDialog({ dialog, visualization, query, queryResult }) {
  const errorHandlerRef = useRef();

  const isNew = !visualization;

  const data = useQueryResultData(queryResult);
  const [filters, setFilters] = useState(data.filters);

  const filteredData = useMemo(
    () => ({
      columns: data.columns,
      rows: filterData(data.rows, filters),
    }),
    [data, filters]
  );

  const defaultState = useMemo(() => {
    const config = visualization ? registeredVisualizations[visualization.type] : getDefaultVisualization();
    const options = config.getOptions(isNew ? {} : visualization.options, data);
    return {
      type: config.type,
      name: isNew ? config.name : visualization.name,
      options,
      originalOptions: options,
    };
  }, [data, isNew, visualization]);

  const [type, setType] = useState(defaultState.type);
  const [name, setName] = useState(defaultState.name);
  const [nameChanged, setNameChanged] = useState(false);
  const [options, setOptions] = useState(defaultState.options);

  const [saveInProgress, setSaveInProgress] = useState(false);

  useEffect(() => {
    if (errorHandlerRef.current) {
      errorHandlerRef.current.reset();
    }
  }, [data, options]);

  function onTypeChanged(newType) {
    setType(newType);

    const config = registeredVisualizations[newType];
    if (!nameChanged) {
      setName(config.name);
    }

    setOptions(config.getOptions(isNew ? {} : visualization.options, data));
  }

  function onNameChanged(newName) {
    setName(newName);
    setNameChanged(newName !== name);
  }

  function onOptionsChanged(newOptions) {
    const config = registeredVisualizations[type];
    setOptions(config.getOptions(newOptions, data));
  }

  function save() {
    setSaveInProgress(true);
    let visualizationOptions = options;
    if (type === "TABLE") {
      visualizationOptions = omit(visualizationOptions, ["paginationSize"]);
    }

    const visualizationData = extend(newVisualization(type), visualization, {
      name,
      options: visualizationOptions,
      query_id: query.id,
    });
    saveVisualization(visualizationData).then((savedVisualization) => {
      updateQueryVisualizations(query, savedVisualization);
      dialog.close(savedVisualization);
    });
  }

  function dismiss() {
    const optionsChanged = !isEqual(options, defaultState.originalOptions);
    confirmDialogClose(nameChanged || optionsChanged)
      .then(dialog.dismiss)
      .catch(() => {});
  }

  // When editing existing visualization chart type selector is disabled, so add only existing visualization's
  // descriptor there (to properly render the component). For new visualizations show all types except of deprecated
  const availableVisualizations = isNew
    ? filter(sortBy(registeredVisualizations, ["name"]), (vis) => !vis.isDeprecated)
    : pick(registeredVisualizations, [type]);

  const getVisualizationTypeLabel = vis => t(`visualization.types.${vis.type}`, vis.name || vis.type);

  const vizTypeId = useUniqueId("visualization-type");
  const vizNameId = useUniqueId("visualization-name");

  return (
    <Modal
      {...dialog.props}
      wrapClassName="ant-modal-fullscreen"
      title={t("visualization.editor.title", "Visualization Editor")}
      okText={t("visualization.editor.save", "Save")}
      okButtonProps={{
        loading: saveInProgress,
        disabled: saveInProgress,
      }}
      onOk={save}
      onCancel={dismiss}
      wrapProps={{ "data-test": "EditVisualizationDialog" }}
    >
      <div className="edit-visualization-dialog">
        <div className="visualization-settings">
          <div className="m-b-15">
            <label htmlFor={vizTypeId}>{t("visualization.editor.type", "Visualization Type")}</label>
            <Select
              data-test="VisualizationType"
              id={vizTypeId}
              className="w-100"
              disabled={!isNew}
              virtual={false}
              value={type}
              onChange={onTypeChanged}
            >
              {map(availableVisualizations, (vis) => (
                <Select.Option key={vis.type} data-test={"VisualizationType." + vis.type}>
                  {getVisualizationTypeLabel(vis)}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div className="m-b-15">
            <label htmlFor={vizNameId}>{t("visualization.editor.name", "Visualization Name")}</label>
            <Input
              data-test="VisualizationName"
              id={vizNameId}
              className="w-100"
              value={name}
              onChange={(event) => onNameChanged(event.target.value)}
            />
          </div>
          <div data-test="VisualizationEditor">
            <Editor
              type={type}
              data={data}
              options={options}
              visualizationName={name}
              onOptionsChange={onOptionsChanged}
            />
          </div>
        </div>
        <div className="visualization-preview">
          <label htmlFor="visualization-preview" className="invisible hidden-xs">
            {t("visualization.editor.preview", "Preview")}
          </label>
          <Filters filters={filters} onChange={setFilters} />
          <div className="scrollbox" data-test="VisualizationPreview">
            <Renderer
              type={type}
              data={filteredData}
              options={options}
              visualizationName={name}
              onOptionsChange={onOptionsChanged}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

EditVisualizationDialog.propTypes = {
  dialog: DialogPropType.isRequired,
  query: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
  visualization: VisualizationType,
  queryResult: PropTypes.object.isRequired, // eslint-disable-line react/forbid-prop-types
};

EditVisualizationDialog.defaultProps = {
  visualization: null,
};

export default wrapDialog(EditVisualizationDialog);
