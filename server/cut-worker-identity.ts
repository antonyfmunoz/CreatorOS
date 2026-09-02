/** Cloud Run containers can share hostname/PID; executions must not share rows. */
export function cutWorkerRuntimeId(environment: NodeJS.ProcessEnv, localFallback: string, pid: number) {
  if (environment.CUT_WORKER_ID) return environment.CUT_WORKER_ID;
  const execution = environment.CLOUD_RUN_EXECUTION;
  if (execution === undefined) return localFallback;
  const index = environment.CLOUD_RUN_TASK_INDEX;
  const attempt = environment.CLOUD_RUN_TASK_ATTEMPT;
  if (!/^[a-z][a-z0-9-]{0,99}$/.test(execution) || !/^(0|[1-9]\d{0,5})$/.test(index ?? "") || !/^(0|[1-9]\d{0,5})$/.test(attempt ?? "") || !Number.isSafeInteger(pid) || pid < 1) {
    throw new Error("Cloud Run CutStudio execution identity is incomplete or invalid");
  }
  return `cut:${execution}:${index}:${attempt}:${pid}`;
}
