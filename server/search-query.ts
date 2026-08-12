export function normalizeSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}
