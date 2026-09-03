import { performance } from "node:perf_hooks";
import type { CutGraphic } from "../shared/cut-studio";

const stages = ["layer", "font", "browser", "context", "layout", "fit", "capture", "context_cleanup", "session_cleanup"] as const;
export type CutPreparationStage = typeof stages[number];
export type CutPreparationEvent = {
  event: "cut.preparation.stage";
  jobId: string;
  layer: number;
  kind: string;
  stage: CutPreparationStage;
  state: "started" | "completed" | "failed";
  elapsedMs: number;
};
export type CutPreparationMeasure = <T>(stage: CutPreparationStage, operation: () => Promise<T>) => Promise<T>;
export const untracedCutPreparation: CutPreparationMeasure = (_stage, operation) => operation();

/** Fixed labels and timing only: no text, font paths, asset URLs or exceptions. */
export function createCutPreparationTrace(
  scope: { jobId: string; layer: number; kind: CutGraphic["kind"] | "session" },
  emit: (event: CutPreparationEvent) => void = (event) => console.info("CutStudio preparation stage", event),
  clock: () => number = () => performance.now(),
): CutPreparationMeasure {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scope.jobId)
    || !Number.isInteger(scope.layer) || scope.layer < 0 || scope.layer > 500
    || !["title", "lower_third", "callout", "shape", "path", "image", "svg", "three", "lottie", "rive", "session"].includes(scope.kind)) throw new Error("Invalid preparation trace scope");
  // Copy only these vetted values; callers cannot inject arbitrary log fields.
  const identity = { jobId: scope.jobId, layer: scope.layer, kind: scope.kind };
  return async (stage, operation) => {
    if (!stages.includes(stage)) throw new Error("Invalid preparation trace stage");
    const started = clock();
    const report = (state: CutPreparationEvent["state"]) => {
      const elapsed = clock() - started;
      const elapsedMs = Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0;
      // Diagnostics must not change rendering success or suppress cleanup.
      try { emit({ event: "cut.preparation.stage", ...identity, stage, state, elapsedMs }); } catch { /* Preserve the operation's own result. */ }
    };
    report("started");
    try { const value = await operation(); report("completed"); return value; }
    catch (error) { report("failed"); throw error; }
  };
}
