export type BottomNavigationTab =
  | "explore"
  | "marketplace"
  | "create"
  | "communities"
  | "profile";

const matchesRouteFamily = (location: string, path: string) =>
  location === path || location.startsWith(`${path}/`);

export function resolveBottomNavigationTab(
  location: string,
): BottomNavigationTab | null {
  if (
    location === "/" ||
    location.startsWith("/post/") ||
    location.startsWith("/posts/")
  ) {
    return "explore";
  }

  if (
    location.startsWith("/marketplace") ||
    ["/cart", "/orders", "/checkout", "/learn", "/courses"].some((path) =>
      matchesRouteFamily(location, path),
    )
  ) {
    return "marketplace";
  }

  if (
    location.startsWith("/create") ||
    location === "/new-text-post" ||
    [
      "/studio",
      "/distribution",
      "/cut-studio",
      "/broadcast",
      "/business",
      "/campaigns",
      "/ugc",
      "/earnings",
      "/products",
      "/events",
      "/ai",
      "/automations",
      "/library",
    ].some((path) => matchesRouteFamily(location, path))
  ) {
    return "create";
  }

  if (location.startsWith("/communities")) {
    return "communities";
  }

  if (
    location.startsWith("/profile") ||
    location.startsWith("/user/") ||
    [
      "/saved-posts",
      "/followers",
      "/following",
      "/revenue",
      "/contacts",
      "/documents",
      "/moderation",
      "/settings",
    ].some((path) => matchesRouteFamily(location, path))
  ) {
    return "profile";
  }

  return null;
}
