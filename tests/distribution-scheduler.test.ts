import { afterEach, describe, expect, it, vi } from "vitest";
import scheduler from "../workers/distribution-scheduler/src/index";

function scheduledContext(tasks: Promise<unknown>[]) {
  return {
    waitUntil(task: Promise<unknown>) { tasks.push(task); },
  } as Parameters<typeof scheduler.scheduled>[2];
}

function scheduledEvent(cron: string) {
  return { cron, scheduledTime: Date.now(), type: "scheduled" } as Parameters<typeof scheduler.scheduled>[0];
}

const environment = {
  API_BASE_URL: "https://creativesos.net",
  DISTRIBUTION_DISPATCH_SECRET: "qualification-only-secret",
} as Parameters<typeof scheduler.scheduled>[1];

afterEach(() => vi.unstubAllGlobals());

describe("Cloudflare production scheduler", () => {
  it("dispatches only due distribution work on the minute trigger", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const tasks: Promise<unknown>[] = [];

    scheduler.scheduled(scheduledEvent("* * * * *"), environment, scheduledContext(tasks));
    await Promise.all(tasks);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].toString()).toBe("https://creativesos.net/api/internal/distribution/dispatch");
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe("Bearer qualification-only-secret");
  });

  it("adds an idempotent production backup request on the daily trigger", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const tasks: Promise<unknown>[] = [];

    scheduler.scheduled(scheduledEvent("17 9 * * *"), environment, scheduledContext(tasks));
    await Promise.all(tasks);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url.toString())).toEqual([
      "https://creativesos.net/api/internal/distribution/dispatch",
      "https://creativesos.net/api/internal/operations/backup",
    ]);
  });
});
