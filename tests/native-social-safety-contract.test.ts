import { describe, expect, it } from "vitest";
import {
  commentModerationActionSchema,
  userSafetyControlSchema,
} from "../shared/native-social-safety";

describe("native social safety contract", () => {
  it("requires explicit mute and restrict state", () => {
    expect(
      userSafetyControlSchema.safeParse({ muted: true, restricted: false })
        .success,
    ).toBe(true);
    expect(userSafetyControlSchema.safeParse({ muted: true }).success).toBe(
      false,
    );
    expect(
      userSafetyControlSchema.safeParse({
        muted: false,
        restricted: false,
        administrativeOverride: true,
      }).success,
    ).toBe(false);
  });

  it("limits held-comment moderation to auditable decisions", () => {
    expect(commentModerationActionSchema.parse({ action: "approve" })).toEqual({
      action: "approve",
    });
    expect(
      commentModerationActionSchema.safeParse({ action: "shadow_delete" })
        .success,
    ).toBe(false);
  });
});
