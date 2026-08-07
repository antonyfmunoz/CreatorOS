export function normalizePostLocation(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let candidate = value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && "name" in parsed) {
      candidate = String((parsed as { name: unknown }).name ?? "");
    }
  } catch {
    // Plain text is also accepted so future clients do not need the legacy
    // JSON wrapper used by the current photo composer.
  }
  const normalized = candidate.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 180) : null;
}
