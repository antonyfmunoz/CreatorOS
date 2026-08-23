import { describe, expect, it } from "vitest";
import { portabilityPackageSchema } from "../shared/portability";

const product = (index: number) => ({ sourceId: `product-${index}`, title: `Product ${index}`, description: "Portable", price: 10, category: "Education", status: "draft" as const });

describe("portability scale and adversarial boundaries", () => {
  it("accepts the documented product ceiling and rejects one record beyond it", () => {
    const baseline = { schemaVersion: "creativesos.portability.v1" as const, sourceSystem: "scale-qualification", courses: [], contacts: [], automations: [] };
    expect(portabilityPackageSchema.safeParse({ ...baseline, products: Array.from({ length: 5_000 }, (_, index) => product(index)) }).success).toBe(true);
    expect(portabilityPackageSchema.safeParse({ ...baseline, products: Array.from({ length: 5_001 }, (_, index) => product(index)) }).success).toBe(false);
  });

  it("rejects duplicate source identities so replay cannot overwrite ambiguous records", () => {
    const parsed = portabilityPackageSchema.safeParse({
      schemaVersion: "creativesos.portability.v1",
      sourceSystem: "adversarial-qualification",
      products: [product(1), product(1)], courses: [], contacts: [], automations: [],
    });
    expect(parsed.success).toBe(false);
  });
});
