import { describe, expect, it } from "vitest";
import { products } from "../shared/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("course community access", () => {
  it("keeps the product-to-community access link in the database contract", () => {
    expect(products.communityId.name).toBe("community_id");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0028_product_community_access.sql"), "utf8");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "community_id"');
    expect(migration).toContain('ON DELETE SET NULL');
  });
});
