import { describe, expect, it } from "vitest";
import { cutWorkerRuntimeId } from "../server/cut-worker-identity";

describe("CutStudio execution identity", () => {
  const cloud = { CLOUD_RUN_EXECUTION: "creativesos-cut-worker-test", CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0" };
  it("distinguishes cloud executions, tasks, attempts and processes with the same hostname", () => {
    const ids = [cloud, { ...cloud, CLOUD_RUN_EXECUTION: "creativesos-cut-worker-other" }, { ...cloud, CLOUD_RUN_TASK_INDEX: "1" }, { ...cloud, CLOUD_RUN_TASK_ATTEMPT: "1" }].map((env) => cutWorkerRuntimeId(env, "localhost:1:cut", 1));
    ids.push(cutWorkerRuntimeId(cloud, "localhost:1:cut", 2));
    expect(new Set(ids).size).toBe(5);
    expect(ids[0]).toBe("cut:creativesos-cut-worker-test:0:0:1");
  });
  it("preserves explicitly managed identity and non-cloud fallback", () => {
    expect(cutWorkerRuntimeId({}, "local:123:cut", 123)).toBe("local:123:cut");
    expect(cutWorkerRuntimeId({ ...cloud, CUT_WORKER_ID: "operator-worker" }, "local:1:cut", 1)).toBe("operator-worker");
  });
  it("rejects incomplete cloud identity instead of silently sharing a registry row", () => {
    for (const env of [{ CLOUD_RUN_EXECUTION: cloud.CLOUD_RUN_EXECUTION }, { ...cloud, CLOUD_RUN_TASK_INDEX: "-1" }, { ...cloud, CLOUD_RUN_TASK_ATTEMPT: "1.5" }, { ...cloud, CLOUD_RUN_TASK_INDEX: "00" }, { ...cloud, CLOUD_RUN_EXECUTION: "" }, { ...cloud, CLOUD_RUN_EXECUTION: "bad/path" }]) {
      expect(() => cutWorkerRuntimeId(env, "localhost:1:cut", 1)).toThrow(/identity/);
    }
  });
});
