export type MarketplaceSort = "newest" | "price_low" | "price_high" | "top_rated";
export type MarketplaceCategory = "all" | "courses" | "digital_assets";

const sorts = new Set<MarketplaceSort>(["newest", "price_low", "price_high", "top_rated"]);
const categories = new Set<MarketplaceCategory>(["all", "courses", "digital_assets"]);

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number) {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export function parseMarketplaceQuery(query: Record<string, unknown>) {
  const rawSearch = typeof query.search === "string" ? query.search.trim() : "";
  const rawCategory = typeof query.category === "string" ? query.category : "all";
  const rawSort = typeof query.sort === "string" ? query.sort : "newest";
  return {
    search: rawSearch.slice(0, 120),
    category: categories.has(rawCategory as MarketplaceCategory) ? rawCategory as MarketplaceCategory : "all" as MarketplaceCategory,
    sort: sorts.has(rawSort as MarketplaceSort) ? rawSort as MarketplaceSort : "newest" as MarketplaceSort,
    page: boundedPositiveInteger(query.page, 1, 10_000),
    pageSize: boundedPositiveInteger(query.pageSize, 24, 48),
  };
}
