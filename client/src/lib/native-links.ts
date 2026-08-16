const nativeRouteRoots = new Set([
  "admin",
  "affiliates",
  "ai",
  "apps",
  "audience",
  "auth",
  "automations",
  "book",
  "broadcast",
  "business",
  "campaigns",
  "cart",
  "checkout",
  "communities",
  "contacts",
  "courses",
  "create",
  "create-product",
  "cut-studio",
  "design",
  "distribution",
  "documents",
  "earnings",
  "events",
  "followers",
  "following",
  "learn",
  "legal",
  "library",
  "login",
  "logout",
  "marketplace",
  "messages",
  "moderation",
  "new-text-post",
  "notifications",
  "oauth",
  "orders",
  "podcasts",
  "post",
  "posts",
  "products",
  "profile",
  "register",
  "revenue",
  "review",
  "s",
  "saved-posts",
  "search",
  "settings",
  "sponsorship",
  "store",
  "studio",
  "subscribe",
  "support",
  "trust",
  "ugc",
  "user",
]);

/**
 * Converts an approved web or custom-scheme URL into an internal SPA path.
 * Unknown origins and route roots are rejected so notification/provider data
 * cannot turn the native shell into an arbitrary navigation surface.
 */
export function safeNativeAppPath(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw, "https://creativesos.net");
    const allowedWebOrigin = url.origin === "https://creativesos.net";
    const allowedAppScheme =
      url.protocol === "creativesos:" && url.host === "app";
    if (!allowedWebOrigin && !allowedAppScheme) return null;
    const path = url.pathname.replace(/\/{2,}/g, "/") || "/";
    const routeRoot = path.split("/").filter(Boolean)[0];
    if (routeRoot && !nativeRouteRoots.has(routeRoot)) return null;
    return `${path}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
