import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sources = [
  "../server/routes.ts",
  "../server/commerce.ts",
  "../server/relationship-hub-routes.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("developer event contract", () => {
  it.each([
    "asset.ready",
    "content.published",
    "product.updated",
    "order.completed",
    "relationship.updated",
  ])("connects %s to a real product lifecycle", (eventType) => {
    expect(sources.some((source) => source.includes(`eventType: "${eventType}"`))).toBe(
      true,
    );
  });

  it("records API and webhook delivery service telemetry", () => {
    const runtime = readFileSync(
      new URL("../server/developer-platform.ts", import.meta.url),
      "utf8",
    );
    expect(runtime).toContain('service: "developer_api"');
    expect(runtime).toContain('service: "webhooks"');
  });
});
