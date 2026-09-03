import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const worker = vi.hoisted(() => ({
  identity: vi.fn(() => ({ id: "qualification-worker", region: "qualification", capabilities: ["native"], maxConcurrency: 1 })),
  recover: vi.fn(async () => 0),
  process: vi.fn(async () => 1),
  stop: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  schedule: vi.fn(),
}));

vi.mock("dotenv/config", () => ({}));
vi.mock("../server/db", () => ({ closeDatabase: worker.close }));
vi.mock("../server/cut-studio", () => ({
  cutWorkerIdentity: worker.identity,
  recoverInterruptedCutStudioJobs: worker.recover,
  processDueCutStudioJobs: worker.process,
  stopCutStudioProcessing: worker.stop,
  scheduleCutStudioProcessing: worker.schedule,
}));

describe("standalone CutStudio startup measurement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("CUT_WORKER_RUN_ONCE", "true");
    vi.stubEnv("CREATOROS_DEMO_MODE", "false");
    vi.stubEnv("CREATOROS_QUALIFICATION_MODE", "false");
    vi.stubEnv("CUT_STARTUP_TEST_SECRET", "must-not-appear-in-events");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("records elapsed process bootstrap before recovery without exposing the environment", async () => {
    const events: Array<Record<string, unknown>> = [];
    vi.spyOn(process, "uptime").mockReturnValue(2.3456);
    vi.spyOn(process.stdout, "write").mockImplementation(((value: string | Uint8Array) => {
      events.push(JSON.parse(String(value)));
      return true;
    }) as typeof process.stdout.write);
    worker.recover.mockImplementationOnce(async () => {
      expect(events).toHaveLength(1);
      return 2;
    });
    await import("../server/cut-worker");
    await vi.waitFor(() => expect(worker.close).toHaveBeenCalledOnce());
    expect(events).toEqual([
      { event: "cut.worker.start", workerId: "qualification-worker", region: "qualification", capabilities: ["native"], maxConcurrency: 1, processUptimeMs: 2346 },
      { event: "cut.worker.complete", workerId: "qualification-worker", recovered: 2, processed: 1 },
    ]);
    expect(JSON.stringify(events)).not.toContain("must-not-appear-in-events");
    expect(worker.process).toHaveBeenCalledWith(1);
    expect(worker.stop).toHaveBeenCalledOnce();
    expect(worker.schedule).not.toHaveBeenCalled();
  });

  it.each(["CREATOROS_DEMO_MODE", "CREATOROS_QUALIFICATION_MODE"])("retains the %s refusal before any worker event or work", async (name) => {
    vi.stubEnv(name, "true");
    const output = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await expect(import("../server/cut-worker")).rejects.toThrow("cannot run in demo or qualification mode");
    expect(output).not.toHaveBeenCalled();
    expect(worker.identity).not.toHaveBeenCalled();
    expect(worker.recover).not.toHaveBeenCalled();
    expect(worker.process).not.toHaveBeenCalled();
  });
});
