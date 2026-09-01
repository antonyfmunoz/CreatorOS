import { afterEach, describe, expect, it, vi } from "vitest";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { cutCloudDispatchBodySchema, signCutCloudDispatch, verifyCutCloudDispatch } from "../server/cut-cloud-contract";
import { cutCloudDispatchLeaseDue, dispatchCutStudioCloudJob } from "../server/cut-cloud-client";
import { createCutCloudDispatchServer } from "../server/cut-cloud-dispatch";

const secret = "cut-cloud-test-secret-that-is-longer-than-thirty-two-characters";
const jobId = "8e877c4c-dfb3-4dd1-864b-3dc1d2ced5b9";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CutStudio cloud dispatch contract", () => {
  it("packages Chromium in the isolated GCP render image", () => {
    const dockerfile = readFileSync(new URL("../Dockerfile.cut-cloud", import.meta.url), "utf8");
    expect(dockerfile).toMatch(/apt-get install[^\n]*chromium/);
    expect(dockerfile).toContain("USER node");
  });

  it("exposes the Cloud Run readiness route", async () => {
    const server = createCutCloudDispatchServer({ project: "test", region: "us-central1", secret, runWorker: async () => null });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/readyz`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: "ok", project: "test", region: "us-central1" });
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("signs a fresh dispatch and rejects tampering or expiration", () => {
    const body = cutCloudDispatchBodySchema.parse({ jobId });
    const now = new Date("2026-08-31T20:00:00.000Z");
    const envelope = signCutCloudDispatch(secret, body, now);
    expect(verifyCutCloudDispatch(secret, body, envelope, now)).toBe(true);
    expect(verifyCutCloudDispatch(secret, { jobId: "9159c4ef-a202-4f04-932f-43af10305971" }, envelope, now)).toBe(false);
    expect(verifyCutCloudDispatch(secret, body, envelope, new Date(now.getTime() + 6 * 60_000))).toBe(false);
  });

  it("dispatches with a signed, bounded request", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const body = cutCloudDispatchBodySchema.parse(JSON.parse(String(init?.body)));
      expect(verifyCutCloudDispatch(secret, body, {
        issuedAt: headers.get("X-CreativesOS-Issued-At") ?? "",
        nonce: headers.get("X-CreativesOS-Nonce") ?? "",
        signature: headers.get("X-CreativesOS-Signature") ?? "",
      })).toBe(true);
      return new Response(JSON.stringify({ accepted: true, execution: "operations/test" }), { status: 202, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(dispatchCutStudioCloudJob(jobId, { CUT_CLOUD_DISPATCH_URL: "https://dispatch.example/dispatch", CUT_CLOUD_DISPATCH_SECRET: secret })).resolves.toMatchObject({ accepted: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts one authenticated request and deduplicates a replay", async () => {
    const runWorker = vi.fn(async () => "projects/test/locations/us-central1/operations/one");
    const server = createCutCloudDispatchServer({ project: "test", region: "us-central1", secret, runWorker });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable");
    const body = { jobId };
    const envelope = signCutCloudDispatch(secret, body);
    const send = () => fetch(`http://127.0.0.1:${address.port}/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CreativesOS-Issued-At": envelope.issuedAt, "X-CreativesOS-Nonce": envelope.nonce, "X-CreativesOS-Signature": envelope.signature },
      body: JSON.stringify(body),
    });
    try {
      const first = await send();
      const second = await send();
      expect(first.status).toBe(202);
      expect(await first.json()).toMatchObject({ accepted: true, execution: expect.stringContaining("operations/one") });
      expect(second.status).toBe(202);
      expect(await second.json()).toMatchObject({ accepted: true, duplicate: true });
      expect(runWorker).toHaveBeenCalledOnce();
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("deduplicates fresh signed requests for the same durable render job", async () => {
    const runWorker = vi.fn(async () => "projects/test/locations/us-central1/operations/one");
    const server = createCutCloudDispatchServer({ project: "test", region: "us-central1", secret, runWorker });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address is unavailable");
    const body = { jobId };
    const send = () => {
      const envelope = signCutCloudDispatch(secret, body);
      return fetch(`http://127.0.0.1:${address.port}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CreativesOS-Issued-At": envelope.issuedAt, "X-CreativesOS-Nonce": envelope.nonce, "X-CreativesOS-Signature": envelope.signature },
        body: JSON.stringify(body),
      });
    };
    try {
      const first = await send();
      const second = await send();
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      expect(await second.json()).toMatchObject({ accepted: true, duplicate: true });
      expect(runWorker).toHaveBeenCalledOnce();
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("holds a durable dispatch lease through normal Cloud Run cold starts", () => {
    const now = new Date("2026-08-31T20:00:00.000Z");
    expect(cutCloudDispatchLeaseDue(null, now)).toBe(true);
    expect(cutCloudDispatchLeaseDue(new Date(now.getTime() - 29 * 60_000), now)).toBe(false);
    expect(cutCloudDispatchLeaseDue(new Date(now.getTime() - 31 * 60_000), now)).toBe(true);
  });
});
