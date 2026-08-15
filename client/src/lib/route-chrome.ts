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
  const isCreationWorkspace = pathname.startsWith("/broadcast") || pathname.startsWith("/cut-studio");
  const isPublicPortfolio = pathname.startsWith("/ugc/creator/");
  return {
    isAuth: isAuth || isReview || isBroadcastControl || isBroadcastField || isPublicPortfolio,
    showBottomNavigation: !isAuth && !isConference && !isTrust && !isFocusedSearch && !isReview && !isCreationWorkspace && !isPublicPortfolio,
  };
}
