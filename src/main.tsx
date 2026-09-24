import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// The default webview menu only offers Reload/Inspect, which do nothing useful here.
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
