import { describe, expect, it } from "vitest";
import { mutationOriginAllowed } from "../server/security";

describe("browser mutation origin policy", () => {
  it("allows reads and configured first-party mutations", () => {
    expect(mutationOriginAllowed({ method: "GET", origin: "https://evil.example", path: "/api/user", publicAppUrl: "https://creativesos.net", production: true })).toBe(true);
    expect(mutationOriginAllowed({ method: "POST", origin: "https://creativesos.net", path: "/api/posts", publicAppUrl: "https://creativesos.net", production: true })).toBe(true);
  });

  it("blocks cross-site browser mutations", () => {
    expect(mutationOriginAllowed({ method: "DELETE", origin: "https://evil.example", path: "/api/cart", publicAppUrl: "https://creativesos.net", production: true })).toBe(false);
  });

  it("preserves signed provider and internal ingress contracts", () => {
    expect(mutationOriginAllowed({ method: "POST", origin: "https://provider.example", path: "/api/stripe/webhook", publicAppUrl: "https://creativesos.net", production: true })).toBe(true);
    expect(mutationOriginAllowed({ method: "POST", path: "/api/umh/commands", publicAppUrl: "https://creativesos.net", production: true })).toBe(true);
  });

  it("allows local first-party development origins", () => {
    expect(mutationOriginAllowed({ method: "POST", origin: "http://localhost:5000", path: "/api/posts", publicAppUrl: "https://creativesos.net", production: false })).toBe(true);
  });
});
