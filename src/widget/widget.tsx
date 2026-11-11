import React from "react";
import ReactDOM from "react-dom/client";
import WidgetApp from "./WidgetApp";
import "../styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WidgetApp />
  </React.StrictMode>,
);
