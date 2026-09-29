import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./arkham-theme.css";
import "./tabletop.css";
import "./refinements.css";
import "./motion.css";
import "./identity.css";
import "./story.css";
import "./chaos-bag.css";
import "./premium-table.css";
import "./chaos-draw.css";
import "./additions.css";
import { registerSW } from "virtual:pwa-register";
// Installable, offline-capable shell. Updates apply on the next load.
registerSW({ immediate: true });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
