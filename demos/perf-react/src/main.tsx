// Reaching inside only for app css.
// eslint-disable-next-line @nx/enforce-module-boundaries
import "../../../libs/shared/src/styles/perf-editor.css";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Document root element not found!");
}

ReactDOM.createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
