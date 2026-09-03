import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import { createCutPreparationTrace, untracedCutPreparation, type CutPreparationEvent } from "../server/cut-preparation-trace";
import { createCutTextRasterizer } from "../server/cut-text-layout-renderer";
import { cutTextLayoutSchema } from "../shared/cut-text-layout";
import { cutGraphicSchema } from "../shared/cut-studio";
import type { CutNativeBrowserSession } from "../server/cut-native-browser-session";

const scope = { jobId: "00000000-0000-4000-8000-000000000001", layer: 1, kind: "title" as const };
afterEach(() => vi.restoreAllMocks());

describe("privacy-safe native preparation timing", () => {
  it("reports exact operation timing without changing its result", async () => {
    let now = 10; const events: CutPreparationEvent[] = [];
    const measure = createCutPreparationTrace(scope, (event) => events.push(event), () => now);
    const result = { pixels: "private" };
    expect(await measure("capture", async () => { now = 24.6; return result; })).toBe(result);
    expect(events).toEqual([
      { event: "cut.preparation.stage", ...scope, stage: "capture", state: "started", elapsedMs: 0 },
      { event: "cut.preparation.stage", ...scope, stage: "capture", state: "completed", elapsedMs: 15 },
    ]);
    expect(JSON.stringify(events)).not.toContain("private");
  });
  it("retains the actual failure without logging its private exception content", async () => {
    const events: CutPreparationEvent[] = []; const failure = new Error("private-font-path secret-token");
    const measure = createCutPreparationTrace(scope, (event) => events.push(event));
    await expect(measure("font", async () => { throw failure; })).rejects.toBe(failure);
    expect(events.map((event) => event.state)).toEqual(["started", "failed"]);
    expect(JSON.stringify(events)).not.toMatch(/private-font|secret-token/);
  });
  it("ignores failing log sinks without changing result, error or cleanup execution", async () => {
    const measure = createCutPreparationTrace(scope, () => { throw new Error("log sink unavailable"); });
    expect(await measure("capture", async () => 42)).toBe(42);
    const failure = new Error("actual failure"); const cleanup = vi.fn(async () => undefined);
    await expect(measure("layout", async () => { try { throw failure; } finally { await measure("context_cleanup", cleanup); } })).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("copies only validated scope fields and admits every native graphic kind", async () => {
    const events: CutPreparationEvent[] = [];
    const input = { ...scope, extra: "private text" }; const measure = createCutPreparationTrace(input, (event) => events.push(event));
    input.jobId = "mutated";
    await measure("layer", async () => undefined);
    expect(events[0]).toMatchObject(scope); expect(events[0]).not.toHaveProperty("extra");
    for (const kind of cutGraphicSchema.innerType().shape.kind.removeDefault().options) expect(() => createCutPreparationTrace({ ...scope, kind })).not.toThrow();
    for (const invalid of [{ jobId: "private title" }, { layer: NaN }, { layer: 501 }, { kind: "secret" }]) expect(() => createCutPreparationTrace({ ...scope, ...invalid } as any)).toThrow(/scope/);
    const operation = vi.fn(async () => undefined);
    await expect(measure("unknown-private-label" as any, operation)).rejects.toThrow(/stage/); expect(operation).not.toHaveBeenCalled();
  });
  it("records independent overlapping durations and bounds invalid clock readings", async () => {
    let now = 0; const events: CutPreparationEvent[] = []; let finish!: () => void;
    const measure = createCutPreparationTrace(scope, (event) => events.push(event), () => now);
    const pending = measure("layer", () => new Promise<void>((resolve) => { finish = resolve; }));
    now = 10; await measure("font", async () => { now = 20; }); now = 30; finish(); await pending;
    expect(events.filter((event) => event.state === "completed").map((event) => [event.stage, event.elapsedMs])).toEqual([["font", 10], ["layer", 30]]);
    now = NaN; await measure("context_cleanup", async () => undefined);
    expect(events.at(-1)?.elapsedMs).toBe(0);
  });
  it("does not allocate an execution environment when tracing is omitted", async () => {
    const operation = vi.fn(async () => 7);
    expect(await untracedCutPreparation("font", operation)).toBe(7); expect(operation).toHaveBeenCalledOnce();
  });
});

describe("text renderer preparation stages", () => {
  function fixture(failCapture = false) {
    const events: CutPreparationEvent[] = [];
    const failure = new Error("private screenshot path");
    vi.spyOn(fs, "stat").mockResolvedValue({ isFile: () => true, size: 4 } as any);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("font"));
    const page = { setDefaultTimeout: vi.fn(), setContent: vi.fn(async () => undefined), evaluate: vi.fn(async () => undefined), screenshot: vi.fn(async () => { if (failCapture) throw failure; return Buffer.from("pixels"); }) };
    const context = { route: vi.fn(async () => undefined), newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
    const browser = { newContext: vi.fn(async () => context) };
    const session = { browser: vi.fn(async () => browser), close: vi.fn(async () => undefined) } as unknown as CutNativeBrowserSession;
    const renderer = createCutTextRasterizer(session);
    const input = { text: "private title", layout: cutTextLayoutSchema.parse({}), width: 320, height: 180, canvasWidth: 320, referenceWidth: 320, textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0, fontPath: "private-font-path", outputPath: "private-output-path", measure: createCutPreparationTrace(scope, (event) => events.push(event)) };
    return { events, failure, page, context, browser, session, renderer, input };
  }
  it("measures font, browser, layout, capture and cleanup with unchanged isolation and screenshot settings", async () => {
    const test = fixture(); await expect(test.renderer.render(test.input)).resolves.toBeNull();
    expect(test.events.filter((event) => event.state === "completed").map((event) => event.stage)).toEqual(["font", "browser", "context", "layout", "capture", "context_cleanup"]);
    expect(test.browser.newContext).toHaveBeenCalledWith({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1, serviceWorkers: "block", offline: true });
    expect(test.page.screenshot).toHaveBeenCalledWith({ path: "private-output-path", type: "png", omitBackground: true, clip: { x: 0, y: 0, width: 320, height: 180 }, timeout: 10_000 });
    expect(test.context.close).toHaveBeenCalledOnce(); expect(JSON.stringify(test.events)).not.toMatch(/private-|private title/);
    await test.renderer.close();
  });
  it("still closes the context and preserves screenshot failures", async () => {
    const test = fixture(true); await expect(test.renderer.render(test.input)).rejects.toBe(test.failure);
    expect(test.events.filter((event) => event.state === "failed").map((event) => event.stage)).toEqual(["capture"]);
    expect(test.events.at(-1)).toMatchObject({ stage: "context_cleanup", state: "completed" });
    expect(test.context.close).toHaveBeenCalledOnce(); expect(JSON.stringify(test.events)).not.toContain("private");
    await test.renderer.close();
  });
  it("rejects captured output when context cleanup fails and invalidates the job renderer", async () => {
    const test = fixture();
    test.context.close.mockRejectedValue(new Error("private context transport"));
    await expect(test.renderer.render(test.input)).rejects.toThrow("Native renderer context cleanup failed");
    expect(test.page.screenshot).toHaveBeenCalledOnce(); expect(test.session.close).toHaveBeenCalledOnce();
    expect(test.events.at(-1)).toMatchObject({ stage: "context_cleanup", state: "failed" });
    expect(JSON.stringify(test.events)).not.toContain("private");
    await expect(test.renderer.render(test.input)).rejects.toThrow("Text renderer is closed");
  });
});
