import { access } from "node:fs/promises";
import type { DevEnvironment } from "vite";

type DevelopmentClient = Pick<DevEnvironment, "transformRequest" | "waitForRequestsIdle" | "depsOptimizer">;

/** Finish the cold client dependency preparation before announcing HTTP readiness. */
export async function prepareDevelopmentClient(client: DevelopmentClient): Promise<void> {
  await Promise.all(["/src/main.tsx", "/src/App.tsx"].map(async (entry) => {
    if (!await client.transformRequest(entry)) throw new Error(`Unable to prepare development entry: ${entry}`);
  }));
  // Vite's configured warmup is fire-and-forget. Crawl completion alone also
  // precedes the optimizer's commit; wait for its published processing promises.
  await client.waitForRequestsIdle();
  const optimizer = client.depsOptimizer;
  if (!optimizer) return;
  await optimizer.scanProcessing;
  const dependencies = [...optimizer.metadata.depInfoList];
  await Promise.all(dependencies.map((dependency) => dependency.processing));
  // Optimizer failures can resolve processing promises after logging an error.
  // Do not report ready when the actual browser modules are still missing.
  await Promise.all(dependencies.map((dependency) => access(dependency.file)));
}
