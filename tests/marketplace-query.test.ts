import { describe, expect, it } from "vitest";
import { parseMarketplaceQuery } from "../server/marketplace-query";

describe("marketplace query parsing", () => {
  it("bounds catalog discovery input and rejects unsupported filters", () => {
    expect(parseMarketplaceQuery({ search: "  design systems ", category: "courses", sort: "top_rated", page: "3", pageSize: "100" })).toEqual({ search: "design systems", category: "courses", sort: "top_rated", page: 3, pageSize: 48 });
    expect(parseMarketplaceQuery({ category: "anything", sort: "random", page: "-2", pageSize: "0" })).toMatchObject({ category: "all", sort: "newest", page: 1, pageSize: 24 });
  });

  it("accepts the paid community and membership catalog", () => {
    expect(parseMarketplaceQuery({ category: "communities" }).category).toBe("communities");
  });
});
