import { describe, expect, it } from "vitest";
import { anonymousHomeRedirectPath } from "../server/auth";

describe("anonymous home redirect", () => {
  it("sends a signed-out production visitor directly to login", () => {
    expect(
      anonymousHomeRedirectPath({
        localIdentity: false,
        userId: null,
        hasClerkHandshake: false,
      }),
    ).toBe("/auth/login");
  });

  it("keeps signed-in, qualification, and Clerk handshake requests in the app", () => {
    expect(
      anonymousHomeRedirectPath({
        localIdentity: false,
        userId: "user_123",
        hasClerkHandshake: false,
      }),
    ).toBeNull();
    expect(
      anonymousHomeRedirectPath({
        localIdentity: true,
        userId: null,
        hasClerkHandshake: false,
      }),
    ).toBeNull();
    expect(
      anonymousHomeRedirectPath({
        localIdentity: false,
        userId: null,
        hasClerkHandshake: true,
      }),
    ).toBeNull();
  });
});
