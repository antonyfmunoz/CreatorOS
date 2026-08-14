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
  const isReview = pathname.startsWith("/review/");
  const isBroadcastControl = pathname.startsWith("/broadcast/control/");
  const isBroadcastField = pathname === "/broadcast/field";
  return {
    isAuth: isAuth || isReview || isBroadcastControl || isBroadcastField,
    showBottomNavigation: !isAuth && !isConference && !isTrust && !isFocusedSearch && !isReview && !isBroadcastControl && !isBroadcastField,
  };
}
