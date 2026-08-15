import { z } from "zod";
export const availabilityRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .strict()
  .refine(
    (v) => v.endMinute > v.startMinute,
    "Availability must end after it starts",
  );
export const createAppointmentTypeSchema = z
  .object({
    calendarId: z.string().uuid(),
    name: z.string().trim().min(1).max(180),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().max(5000).default(""),
    durationMinutes: z.number().int().min(5).max(1440),
    bufferBeforeMinutes: z.number().int().min(0).max(480).default(0),
    bufferAfterMinutes: z.number().int().min(0).max(480).default(0),
    capacity: z.number().int().min(1).max(1000).default(1),
    locationMode: z.enum(["community_room", "manual_link", "in_person"]),
    location: z.string().trim().max(1000).nullable().default(null),
    priceCents: z.number().int().min(0).max(100_000_000).default(0),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/)
      .default("usd"),
    minimumNoticeMinutes: z.number().int().min(0).max(525600).default(60),
    bookingHorizonDays: z.number().int().min(1).max(730).default(90),
    cancellationNoticeMinutes: z
      .number()
      .int()
      .min(0)
      .max(525600)
      .default(1440),
    reminderMinutes: z
      .array(z.number().int().min(1).max(525600))
      .max(10)
      .default([1440, 60]),
  })
  .strict();
export const ticketTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).default(""),
    priceCents: z.number().int().min(0).max(100_000_000),
    currency: z
      .string()
      .regex(/^[a-z]{3}$/)
      .default("usd"),
    capacity: z.number().int().min(1).max(100000),
    salesStartAt: z.coerce.date().nullable().default(null),
    salesEndAt: z.coerce.date().nullable().default(null),
    maxPerBuyer: z.number().int().min(1).max(100).default(10),
    replayAccessDays: z.number().int().min(0).max(3650).default(30),
  })
  .strict()
  .refine(
    (value) =>
      !value.salesStartAt ||
      !value.salesEndAt ||
      value.salesEndAt > value.salesStartAt,
    { message: "Ticket sales must end after they start", path: ["salesEndAt"] },
  );
