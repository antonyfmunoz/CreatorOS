import { createContext, useCallback, useContext, useLayoutEffect, useRef } from "react";
import { createCutPreviewReadiness } from "@/lib/cut-preview-readiness";

export const CutPreviewReadinessContext = createContext<ReturnType<typeof createCutPreviewReadiness> | null>(null);

export function useCutPreviewResource(label: string, identity: string) {
  const store = useContext(CutPreviewReadinessContext);
  const lease = useRef<ReturnType<ReturnType<typeof createCutPreviewReadiness>["acquire"]> | null>(null);
  useLayoutEffect(() => {
    const current = store?.acquire(label) ?? null;
    lease.current = current;
    return () => { current?.release(); if (lease.current === current) lease.current = null; };
  }, [store, identity]);
  return useCallback((state: "pending" | "ready" | "error", message = "A preview resource failed to load.") => {
    if (state === "error") lease.current?.fail(message);
    else lease.current?.[state]();
  }, []);
}
