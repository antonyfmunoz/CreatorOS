import { beforeEach, describe, expect, it, vi } from "vitest";
import { access } from "node:fs/promises";
import { prepareDevelopmentClient } from "../server/development-client-readiness";

vi.mock("node:fs/promises", () => ({ access: vi.fn() }));
type Client = Parameters<typeof prepareDevelopmentClient>[0];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const client = {
    transformRequest: vi.fn().mockResolvedValue({ code: "export {}" }),
    waitForRequestsIdle: vi.fn().mockResolvedValue(undefined),
    depsOptimizer: { metadata: { depInfoList: [{ file: "/cache/react.js" }] } },
  };
  return { client, prepare: () => prepareDevelopmentClient(client as unknown as Client) };
}

describe("development client readiness", () => {
  beforeEach(() => { vi.mocked(access).mockReset().mockResolvedValue(undefined); });

  it("waits for entry transforms, static crawl, dependency scan, and committed browser modules", async () => {
    const { client, prepare } = fixture();
    const scan = deferred(); const commit = deferred();
    Object.assign(client.depsOptimizer, { scanProcessing: scan.promise });
    Object.assign(client.depsOptimizer.metadata.depInfoList[0], { processing: commit.promise });
    const complete = vi.fn(); const task = prepare().then(complete);
    await vi.waitFor(() => expect(client.waitForRequestsIdle).toHaveBeenCalledOnce());
    expect(client.transformRequest.mock.calls.map(([url]) => url)).toEqual(["/src/main.tsx", "/src/App.tsx"]);
    expect(access).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    scan.resolve(); await Promise.resolve();
    expect(access).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
    commit.resolve(); await task;
    expect(access).toHaveBeenCalledWith("/cache/react.js"); expect(complete).toHaveBeenCalledOnce();
  });

  it("checks cached dependencies and supports explicitly disabled optimization", async () => {
    const { client, prepare } = fixture(); await prepare();
    expect(access).toHaveBeenCalledOnce();
    await prepareDevelopmentClient({ ...client, depsOptimizer: undefined } as unknown as Client);
    expect(access).toHaveBeenCalledOnce();
  });

  it("propagates transform and missing-entry failures instead of announcing readiness", async () => {
    const { client, prepare } = fixture();
    client.transformRequest.mockResolvedValueOnce(null);
    await expect(prepare()).rejects.toThrow("Unable to prepare development entry: /src/main.tsx");
    expect(client.waitForRequestsIdle).not.toHaveBeenCalled();
    client.transformRequest.mockRejectedValueOnce(new Error("invalid syntax"));
    await expect(prepare()).rejects.toThrow("invalid syntax");
    expect(access).not.toHaveBeenCalled();
  });

  it("rejects missing files even when an optimizer failure resolved its processing promise", async () => {
    const { prepare } = fixture();
    vi.mocked(access).mockRejectedValueOnce(new Error("ENOENT: missing optimized dependency"));
    await expect(prepare()).rejects.toThrow("missing optimized dependency");
  });
});
