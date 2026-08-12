import { describe, expect, it } from "vitest";
import { businessRoleCanAdminister, businessRoleCanManage } from "../server/businesses";

describe("business authority", () => {
  it("allows operators to work the inbox without changing sensitive tenant controls", () => {
    expect(businessRoleCanManage("operator")).toBe(true);
    expect(businessRoleCanAdminister("operator")).toBe(false);
  });

  it("allows owners and administrators to manage provider, policy, and export controls", () => {
    for (const role of ["owner", "admin"]) {
      expect(businessRoleCanManage(role)).toBe(true);
      expect(businessRoleCanAdminister(role)).toBe(true);
    }
  });

  it("rejects viewers, unknown roles, and absent memberships", () => {
    for (const role of ["viewer", "member", "", null, undefined]) {
      expect(businessRoleCanManage(role)).toBe(false);
      expect(businessRoleCanAdminister(role)).toBe(false);
    }
  });
});
