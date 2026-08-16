import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeNativeRuntime } from "./lib/native-runtime";
import "./index.css";

import { initPostHog } from "./lib/posthog";

function renderApplication() {
  initPostHog();

  if (
    window.location.pathname === "/broadcast/field" &&
    "serviceWorker" in navigator
  ) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/field-capture.webmanifest";
    document.head.appendChild(manifest);
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/field-capture-sw.js", {
        scope: "/broadcast/",
      });
    });
  } else if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/creativesos-sw.js", {
        scope: "/",
      });
    });
  }

  createRoot(document.getElementById("root")!).render(<App />);
}

// Native listener setup must settle before the router renders. The web app is
// still usable if a platform plugin fails to initialize; the rejected branch
// is handled explicitly so it cannot reach the global unhandled boundary.
void initializeNativeRuntime().then(renderApplication, renderApplication);
