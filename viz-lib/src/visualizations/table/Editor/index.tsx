import createTabbedEditor from "@/components/visualizations/editor/createTabbedEditor";
import { vt } from "@/visualizations/visualizationsSettings";

import ColumnsSettings from "./ColumnsSettings";
import GridSettings from "./GridSettings";

import "./editor.less";

export default createTabbedEditor([
  { key: "Columns", title: () => vt("table.editor.tabs.columns", "Columns"), component: ColumnsSettings },
  { key: "Grid", title: () => vt("table.editor.tabs.grid", "Grid"), component: GridSettings },
]);
