import { describe, expect, it } from "vitest";
import { canRsvpToCommunityRoom, isCommunityRoomAttendanceStatus } from "../server/community-room-policy";

describe("community room attendance policy", () => {
  it("accepts only the explicit RSVP states", () => {
    expect(isCommunityRoomAttendanceStatus("going")).toBe(true);
    expect(isCommunityRoomAttendanceStatus("interested")).toBe(true);
    expect(isCommunityRoomAttendanceStatus("attended")).toBe(false);
  });

  it("closes RSVP when a room is no longer active", () => {
    expect(canRsvpToCommunityRoom("scheduled")).toBe(true);
    expect(canRsvpToCommunityRoom("live")).toBe(true);
    expect(canRsvpToCommunityRoom("ended")).toBe(false);
    expect(canRsvpToCommunityRoom("canceled")).toBe(false);
  });
});
