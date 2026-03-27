import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";

async function bootstrap() {
  const supports =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    (CSS.supports("animation-timeline: view()") ||
      CSS.supports("scroll-timeline-name: --timeline"));

  // No polyfill: rely on native Scroll Timelines when available

  const { default: App } = await import("./App");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();
