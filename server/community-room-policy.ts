export const communityRoomAttendanceStatuses = new Set(["going", "interested", "declined"] as const);

export function isCommunityRoomAttendanceStatus(value: unknown): value is "going" | "interested" | "declined" {
  return typeof value === "string" && communityRoomAttendanceStatuses.has(value as "going" | "interested" | "declined");
}

export function canRsvpToCommunityRoom(status: string) {
  return status === "scheduled" || status === "live";
}
