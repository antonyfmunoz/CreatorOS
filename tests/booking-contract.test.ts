import { describe, expect, it } from "vitest";
import {
  availabilityRuleSchema,
  createAppointmentTypeSchema,
  ticketTypeSchema,
} from "../shared/booking";
import { recurringInstant } from "../server/booking-ticketing";

describe("booking and paid-event contract", () => {
  it("preserves the event wall-clock time across daylight-saving changes", () => {
    const beforeDst = new Date("2026-03-01T18:00:00.000Z"); // 10:00 PST
    const afterDst = recurringInstant(
      beforeDst,
      "America/Los_Angeles",
      "weekly",
      1,
      2,
    );
    expect(afterDst.toISOString()).toBe("2026-03-15T17:00:00.000Z"); // 10:00 PDT
  });

  it("requires valid availability boundaries and bounded appointment policy", () => {
    expect(
      availabilityRuleSchema.safeParse({
        dayOfWeek: 1,
        startMinute: 600,
        endMinute: 540,
      }).success,
    ).toBe(false);
    expect(
      createAppointmentTypeSchema.safeParse({
        calendarId: crypto.randomUUID(),
        name: "Strategy session",
        slug: "strategy-session",
        description: "",
        durationMinutes: 60,
        bufferBeforeMinutes: 10,
        bufferAfterMinutes: 10,
        capacity: 1,
        locationMode: "manual_link",
        location: "https://example.com/room",
        priceCents: 0,
        currency: "usd",
        minimumNoticeMinutes: 30,
        bookingHorizonDays: 90,
        cancellationNoticeMinutes: 1440,
        reminderMinutes: [1440, 60],
      }).success,
    ).toBe(true);
  });

  it("rejects inverted ticket sales windows", () => {
    const parsed = ticketTypeSchema.safeParse({
      name: "General admission",
      description: "",
      priceCents: 2500,
      currency: "usd",
      capacity: 100,
      salesStartAt: new Date("2026-08-02T00:00:00Z"),
      salesEndAt: new Date("2026-08-01T00:00:00Z"),
      maxPerBuyer: 4,
      replayAccessDays: 30,
    });
    expect(parsed.success).toBe(false);
  });
});
