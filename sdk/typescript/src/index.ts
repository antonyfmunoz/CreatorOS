export type CreativesOSScope = "profile:read" | "assets:read" | "products:read" | "analytics:read";
export type CreativesOSPage<T> = { data: T[]; nextCursor: string | null };
export type CreativesOSErrorBody = { error?: { code?: string; message?: string }; message?: string };

export class CreativesOSError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly requestId: string | null) { super(message); this.name = "CreativesOSError"; }
}

export class CreativesOSClient {
  constructor(private readonly options: { accessToken: string; baseUrl?: string; fetch?: typeof globalThis.fetch }) {}
  private async request<T>(path: string): Promise<T> {
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${(this.options.baseUrl ?? "https://creativesos.net/api/v1").replace(/\/$/, "")}${path}`, { headers: { authorization: `Bearer ${this.options.accessToken}`, accept: "application/json" } });
    const body = await response.json() as T & CreativesOSErrorBody;
    if (!response.ok) throw new CreativesOSError(response.status, body.error?.code ?? "request_failed", body.error?.message ?? body.message ?? "CreativesOS request failed", response.headers.get("x-request-id"));
    return body;
  }
  profile<T = Record<string, unknown>>() { return this.request<{ data: T }>("/profile"); }
  assets<T = Record<string, unknown>>(options: { limit?: number; cursor?: string } = {}) { return this.request<CreativesOSPage<T>>(`/assets?${new URLSearchParams(Object.entries(options).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]))}`); }
  products<T = Record<string, unknown>>(options: { limit?: number; cursor?: string } = {}) { return this.request<CreativesOSPage<T>>(`/products?${new URLSearchParams(Object.entries(options).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)]))}`); }
  analytics<T = Record<string, unknown>>() { return this.request<{ data: T[] }>("/analytics/summary"); }
}

export function verifyCreativesOSWebhook(input: { body: string; timestamp: string; signature: string; secret: string; toleranceSeconds?: number }) {
  const age = Math.abs(Date.now() / 1_000 - Number(input.timestamp));
  if (!Number.isFinite(age) || age > (input.toleranceSeconds ?? 300)) return false;
  // Runtime-neutral SDKs cannot assume Node crypto. Consumers should provide a
  // Web Crypto-compatible environment; compare the returned digest exactly.
  return crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]).then(async (key) => {
    const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${input.timestamp}.${input.body}`));
    const expected = `v1=${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    if (expected.length !== input.signature.length) return false;
    let difference = 0; for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index);
    return difference === 0;
  });
}
