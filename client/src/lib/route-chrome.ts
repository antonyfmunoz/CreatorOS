const authRoutes = new Set([
  "/auth",
  "/auth/login",
  "/auth/register",
  "/login",
  "/register",
  "/logout",
]);

export function routeChrome(pathname: string) {
  const isAuth = authRoutes.has(pathname);
  const isConference = /^\/communities\/[^/]+\/rooms\/[^/]+$/.test(pathname);
  const isTrust = pathname === "/trust" || pathname.startsWith("/legal/");
  const isFocusedSearch = pathname === "/search";
  return {
    isAuth,
    showBottomNavigation: !isAuth && !isConference && !isTrust && !isFocusedSearch,
  };
}
