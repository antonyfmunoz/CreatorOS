export const publicClientRoutes = [
  "/auth/login",
  "/auth/register",
  "/auth",
  "/login",
  "/register",
  "/logout",
  "/trust",
  "/legal/data-deletion",
  "/legal/community-guidelines",
  "/legal/ai-recording",
  "/review/cut/:token",
  "/ugc/creator/:id",
  "/broadcast/field",
  "/subscribe/:publicId",
  "/audience/preferences/:token",
  "/podcasts/:publicId",
  "/design/review/:token",
  "/s/:slug",
  "/sponsorship/portal/:token",
  "/affiliates/:slug",
  "/book/:slug",
  "/events/:id/tickets",
  "/store/:slug",
  "/apps",
] as const;

export const protectedClientRoutes = [
  "/",
  "/marketplace",
  "/cart",
  "/orders",
  "/checkout/success",
  "/learn",
  "/learn/:id",
  "/courses/:id/manage",
  "/studio",
  "/distribution",
  "/distribution/connections",
  "/cut-studio",
  "/cut-studio/workspace/:id",
  "/broadcast",
  "/broadcast/control/:id",
  "/broadcast/audience/:id",
  "/business",
  "/business/benchmarks",
  "/business/analytics",
  "/business/planner",
  "/business/developer",
  "/business/operations",
  "/business/providers",
  "/oauth/authorize",
  "/business/audience",
  "/business/podcasts",
  "/business/design/:id",
  "/business/design",
  "/business/site",
  "/business/sponsorship",
  "/business/affiliates",
  "/business/booking/events/:id",
  "/business/booking",
  "/business/marketplace",
  "/support/:id",
  "/support",
  "/business/approvals",
  "/business/portability",
  "/earnings",
  "/moderation",
  "/admin/apps",
  "/campaigns",
  "/ugc",
  "/ai",
  "/automations",
  "/library",
  "/settings",
  "/settings/privacy",
  "/communities/:communityId/rooms/:roomId",
  "/communities/:id",
  "/communities",
  "/profile",
  "/profile/:id",
  "/user/:username",
  "/saved-posts",
  "/followers",
  "/followers/:id",
  "/user/:username/followers",
  "/following",
  "/following/:id",
  "/user/:username/following",
  "/revenue",
  "/contacts",
  "/documents",
  "/create-product",
  "/products/:id/edit",
  "/marketplace/product/:id",
  "/create/post",
  "/create/event",
  "/events/:id/edit",
  "/create",
  "/messages",
  "/notifications",
  "/search",
  "/new-text-post",
  "/post/:id",
  "/posts/:id/analytics",
] as const;

export type ClientRouteAccess = "public" | "protected";

export type ClientRouteQualification = {
  pattern: string;
  qualificationPath: string;
  access: ClientRouteAccess;
};

const qualificationUuid = "00000000-0000-4000-8000-000000000099";

export function materializeClientRoute(pattern: string): string {
  const parameterized = pattern
    .replace(":communityId", "1")
    .replace(":roomId", qualificationUuid)
    .replace(":username", "sarahmitchell")
    .replace(":publicId", "qualification-missing")
    .replace(":token", "qualification-invalid-token")
    .replace(":slug", "qualification-missing");

  const uuidIdRoutes = [
    "/events/:id/tickets",
    "/events/:id/edit",
    "/cut-studio/workspace/:id",
    "/broadcast/control/:id",
    "/broadcast/audience/:id",
    "/business/design/:id",
    "/business/booking/events/:id",
    "/support/:id",
  ];

  return parameterized.replace(
    ":id",
    uuidIdRoutes.includes(pattern) ? qualificationUuid : "1",
  );
}

export const clientRouteQualificationManifest: readonly ClientRouteQualification[] = [
  ...publicClientRoutes.map((pattern) => ({
    pattern,
    qualificationPath: materializeClientRoute(pattern),
    access: "public" as const,
  })),
  ...protectedClientRoutes.map((pattern) => ({
    pattern,
    qualificationPath: materializeClientRoute(pattern),
    access: "protected" as const,
  })),
];
