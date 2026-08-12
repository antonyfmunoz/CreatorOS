import { describe, expect, it } from "vitest";
import { buildRoomRecap } from "../client/src/lib/room-recap";

describe("room recap", () => {
  it("includes attributed notes and actionable follow-ups", () => {
    const recap = buildRoomRecap({
      title: "Creator launch room",
      description: "Finalize the launch handoff.",
      startsAt: "2026-08-12T17:00:00.000Z",
      notes: [
        {
          content: "Use the approved launch sequence.",
          authorDisplayName: "Antony",
        },
      ],
      actions: [
        {
          body: "Send the launch recap",
          dueAt: "2026-08-14T00:00:00.000Z",
          assigneeDisplayName: "Antony",
          completedAt: null,
        },
      ],
    });

    expect(recap).toContain("# Creator launch room");
    expect(recap).toContain("Use the approved launch sequence. — Antony");
    expect(recap).toContain("[ ] Send the launch recap");
    expect(recap).toContain("owner: Antony");
    expect(recap).toContain("due: Aug 14");
  });

  it("states when no meeting artifacts were captured", () => {
    const recap = buildRoomRecap({
      title: "Empty room",
      startsAt: "not scheduled",
      notes: [],
      actions: [],
    });

    expect(recap).toContain("No notes captured.");
    expect(recap).toContain("No action items captured.");
  });
});
