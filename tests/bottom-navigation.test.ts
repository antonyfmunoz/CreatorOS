import { describe, expect, it } from "vitest";
import { resolveBottomNavigationTab } from "../client/src/lib/bottom-navigation";

describe("resolveBottomNavigationTab", () => {
  it.each([
    ["/", "explore"],
    ["/posts/42/analytics", "explore"],
    ["/marketplace/product/42", "marketplace"],
    ["/checkout/success", "marketplace"],
    ["/learn/course-42", "marketplace"],
    ["/create", "create"],
    ["/create-product", "create"],
    ["/cut-studio", "create"],
    ["/cut-studio/workspace/42", "create"],
    ["/broadcast", "create"],
    ["/broadcast/audience/42", "create"],
    ["/distribution/connections", "create"],
    ["/events/42/edit", "create"],
    ["/communities/42/rooms/7", "communities"],
    ["/profile", "profile"],
    ["/user/antonyfm", "profile"],
    ["/settings/privacy", "profile"],
  ])("maps %s to %s", (location, expected) => {
    expect(resolveBottomNavigationTab(location)).toBe(expected);
  });

  it("leaves focused and unclassified routes unselected", () => {
    expect(resolveBottomNavigationTab("/messages")).toBeNull();
    expect(resolveBottomNavigationTab("/notifications")).toBeNull();
  });
});
