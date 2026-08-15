import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPostHog } from "./lib/posthog";

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
    void navigator.serviceWorker.register("/creativesos-sw.js", { scope: "/" });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
