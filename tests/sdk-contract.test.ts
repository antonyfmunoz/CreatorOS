import { describe, expect, it } from "vitest";
import { CreativesOSClient, verifyCreativesOSWebhook } from "../sdk/typescript/src/index";
import { developerWebhookSignature } from "../server/developer-platform";
describe("CreativesOS TypeScript SDK", () => {
  it("preserves opaque pagination and typed request evidence", async () => {
    let requested = "";
    const client = new CreativesOSClient({ accessToken: "cos_test", baseUrl: "https://example.com/api/v1", fetch: async (input) => { requested = String(input); return new Response(JSON.stringify({ data: [], nextCursor: "opaque" }), { status: 200, headers: { "content-type": "application/json" } }); } });
    expect((await client.assets({ limit: 5, cursor: "opaque cursor" })).nextCursor).toBe("opaque");
    expect(requested).toContain("cursor=opaque+cursor");
  });
  it("throws typed errors and verifies timestamp-bound webhook bodies", async () => {
    const client = new CreativesOSClient({ accessToken: "bad", fetch: async () => new Response(JSON.stringify({ error: { code: "invalid_api_key", message: "No" } }), { status: 401, headers: { "x-request-id": "request-1" } }) });
    await expect(client.profile()).rejects.toMatchObject({ status: 401, code: "invalid_api_key", requestId: "request-1" });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    await expect(verifyCreativesOSWebhook({ body: "{}", timestamp, secret: "secret", signature: developerWebhookSignature("secret", timestamp, "{}") })).resolves.toBe(true);
  });
});
