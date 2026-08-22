import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import themePlugin from "@replit/vite-plugin-shadcn-theme-json";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  // Browser qualification runs against a disposable cache so stale optimized
  // dependency metadata from an earlier local install cannot invalidate lazy
  // route chunks midway through the field-test matrix.
  cacheDir: process.env.CREATOROS_VITE_CACHE_DIR
    ? path.resolve(process.env.CREATOROS_VITE_CACHE_DIR)
    : undefined,
  plugins: [
    react(),
    runtimeErrorOverlay(),
    themePlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    // LiveKit is loaded only after a user enters a live room. Its 138 kB gzip
    // provider runtime is intentionally isolated from the application shell.
    chunkSizeWarningLimit: 550,
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@clerk/")) return "clerk";
          if (id.includes("node_modules/@tanstack/react-query")) return "query";
          if (id.includes("node_modules/@livekit/components")) return "livekit-components";
          if (id.includes("node_modules/@livekit/protocol")) return "livekit-protocol";
          if (id.includes("node_modules/webrtc-adapter")) return "webrtc-adapter";
          if (id.includes("node_modules/livekit-client")) return "livekit-runtime";
        },
      },
    },
  },
});
