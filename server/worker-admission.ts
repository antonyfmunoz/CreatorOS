/** Reserve synchronously before any lease/query await in this worker process. */
export function reserveWorkerSlot(running: Set<string>, jobId: string, capacity: number, stopping: boolean) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64) throw new Error("Invalid native worker capacity");
  if (stopping || running.has(jobId) || running.size >= capacity) return false;
  running.add(jobId);
  return true;
}
