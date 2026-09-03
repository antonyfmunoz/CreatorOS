import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { PassThrough, Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { materializePrivateAsset } from "../server/asset-storage";

const storage = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...await original<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = storage.send; },
}));

describe("private storage download cancellation", () => {
  let directory: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    directory = await mkdtemp(path.join(os.tmpdir(), "cut-download-test-"));
    for (const [name, value] of Object.entries({ ASSET_STORAGE_PROVIDER: "r2", R2_ACCOUNT_ID: "synthetic", R2_ACCESS_KEY_ID: "synthetic-key", R2_SECRET_ACCESS_KEY: "synthetic-secret", R2_BUCKET_NAME: "synthetic-public", R2_PRIVATE_BUCKET_NAME: "synthetic-private", R2_PUBLIC_BASE_URL: "https://synthetic.invalid" })) vi.stubEnv(name, value);
  });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });

  it("passes cancellation to the private-bucket request while preserving exact successful bytes", async () => {
    storage.send.mockResolvedValueOnce({ Body: Readable.from([Buffer.from("private bytes")]) });
    const controller = new AbortController(); const destination = path.join(directory, "source");
    expect(await materializePrivateAsset("private/source", destination, controller.signal)).toBe(destination);
    expect(await readFile(destination, "utf8")).toBe("private bytes");
    const [command, options] = storage.send.mock.calls[0];
    expect(command.input).toEqual({ Bucket: "synthetic-private", Key: "private/source" });
    expect(options.abortSignal).toBe(controller.signal);
  });
  it("rejects a pre-aborted request before contacting storage or writing a destination", async () => {
    const controller = new AbortController(); controller.abort();
    const destination = path.join(directory, "unused");
    await expect(materializePrivateAsset("private/source", destination, controller.signal)).rejects.toThrow(/cancelled/);
    expect(storage.send).not.toHaveBeenCalled();
    await expect(stat(destination)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("destroys an in-flight response stream and settles before caller cleanup", async () => {
    const body = new PassThrough(); storage.send.mockResolvedValueOnce({ Body: body });
    const controller = new AbortController(); const destination = path.join(directory, "partial");
    const observed = materializePrivateAsset("private/source", destination, controller.signal).catch(error => error);
    body.write("partial bytes");
    await vi.waitFor(async () => expect((await stat(destination)).size).toBeGreaterThan(0));
    controller.abort();
    expect(await observed).toMatchObject({ name: "AbortError" });
    expect(body.destroyed).toBe(true);
    expect(body.writable).toBe(false);
    // Windows would reject removing an open destination handle: this is also
    // a real stream/handle cleanup check, not merely a mocked rejection.
    await rm(destination);
  });
});
