import { describe, expect, it } from "vitest";
import { routeChrome } from "../client/src/lib/route-chrome";

describe("application chrome routing", () => {
  it.each(["/auth", "/auth/login", "/auth/register", "/login", "/register", "/logout"])(
    "hides application navigation on %s",
    (path) => expect(routeChrome(path)).toEqual({ isAuth: true, showBottomNavigation: false }),
  );

  it.each(["/trust", "/legal/data-deletion", "/communities/8/rooms/room-1", "/search", "/broadcast/control/00000000-0000-4000-8000-000000000001"])(
    "keeps focused public and conference surfaces free of global navigation on %s",
    (path) => expect(routeChrome(path).showBottomNavigation).toBe(false),
  );

  it.each(["/", "/marketplace", "/communities", "/profile", "/settings", "/settings/privacy"])(
    "retains application navigation on %s",
    (path) => expect(routeChrome(path).showBottomNavigation).toBe(true),
  );
});
