import { randomBytes } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  availabilityRuleSchema,
  createAppointmentTypeSchema,
  ticketTypeSchema,
} from "@shared/booking";
import {
  appointmentTypes,
  assets,
  bookingAvailabilityRules,
  bookingBlackouts,
  bookingCalendars,
  bookingReservations,
  bookingWaitlist,
  businesses,
  channels,
  communityMemberships,
  communityRooms,
  eventAttendance,
  eventAutomationJobs,
  eventCommercialSettings,
  eventOccurrences,
  eventReplayEntitlements,
  eventSeries,
  eventTickets,
  eventTicketTypes,
  eventWaitlist,
  events,
  notifications,
  orderItems,
  orders,
  products,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
type Handler = (req: Request, res: Response, next: NextFunction) => unknown;
const safe =
  (h: Handler): Handler =>
  (q, s, n) => {
    try {
      Promise.resolve(h(q, s, n)).catch(n);
    } catch (e) {
      n(e);
    }
  };
const validTimezone = (v: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
};
const parts = (date: Date, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
};
type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
const localDateTime = (date: Date, timezone: string): LocalDateTime => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as LocalDateTime;
};
const localAsUtcMilliseconds = (value: LocalDateTime) =>
  Date.UTC(
    value.year,
    value.month - 1,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
const localDateTimeToInstant = (value: LocalDateTime, timezone: string) => {
  const desired = localAsUtcMilliseconds(value);
  let candidate = desired;
  // Time-zone offsets can change between the initial UTC approximation and the
  // desired local wall time. Iteration converges across DST boundaries without
  // making the persisted recurrence dependent on the server's own timezone.
  for (let i = 0; i < 4; i += 1) {
    const observed = localDateTime(new Date(candidate), timezone);
    const correction = desired - localAsUtcMilliseconds(observed);
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
};
export const recurringInstant = (
  origin: Date,
  timezone: string,
  frequency: "daily" | "weekly" | "monthly",
  interval: number,
  sequenceOffset: number,
) => {
  const wall = localDateTime(origin, timezone);
  const calendar = new Date(localAsUtcMilliseconds(wall));
  if (frequency === "daily")
    calendar.setUTCDate(calendar.getUTCDate() + interval * sequenceOffset);
  else if (frequency === "weekly")
    calendar.setUTCDate(calendar.getUTCDate() + 7 * interval * sequenceOffset);
  else calendar.setUTCMonth(calendar.getUTCMonth() + interval * sequenceOffset);
  return localDateTimeToInstant(
    {
      year: calendar.getUTCFullYear(),
      month: calendar.getUTCMonth() + 1,
      day: calendar.getUTCDate(),
      hour: calendar.getUTCHours(),
      minute: calendar.getUTCMinutes(),
      second: calendar.getUTCSeconds(),
    },
    timezone,
  );
};
const activeStatuses = ["payment_required", "confirmed", "completed"];
async function ownerCalendar(userId: number, id: string) {
  const [r] = await db
    .select()
    .from(bookingCalendars)
    .where(eq(bookingCalendars.id, id))
    .limit(1);
  return r && (await userCanManageBusiness(userId, r.businessId)) ? r : null;
}
async function ownerAppointment(userId: number, id: string) {
  const [r] = await db
    .select()
    .from(appointmentTypes)
    .where(eq(appointmentTypes.id, id))
    .limit(1);
  return r && (await userCanManageBusiness(userId, r.businessId)) ? r : null;
}
async function manageEvent(userId: number, eventId: string) {
  const [e] = await db
    .select()
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!e) return null;
  const [m] = await db
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, e.communityId),
        eq(communityMemberships.userId, userId),
        inArray(communityMemberships.role, ["owner", "admin"]),
        ne(communityMemberships.status, "banned"),
      ),
    )
    .limit(1);
  return m ? e : null;
}
async function appointmentSlots(
  type: typeof appointmentTypes.$inferSelect,
  from: Date,
  to: Date,
) {
  const [calendar] = await db
    .select()
    .from(bookingCalendars)
    .where(eq(bookingCalendars.id, type.calendarId))
    .limit(1);
  if (!calendar) return [];
  const [rules, blackouts, reservations] = await Promise.all([
    db
      .select()
      .from(bookingAvailabilityRules)
      .where(eq(bookingAvailabilityRules.calendarId, calendar.id)),
    db
      .select()
      .from(bookingBlackouts)
      .where(
        and(
          eq(bookingBlackouts.calendarId, calendar.id),
          lt(bookingBlackouts.startsAt, to),
          gt(bookingBlackouts.endsAt, from),
        ),
      ),
    db
      .select()
      .from(bookingReservations)
      .where(
        and(
          eq(bookingReservations.appointmentTypeId, type.id),
          inArray(bookingReservations.status, activeStatuses),
          gt(bookingReservations.endsAt, from),
          lt(bookingReservations.startsAt, to),
        ),
      ),
  ]);
  const now = Date.now() + type.minimumNoticeMinutes * 60000;
  const horizon = Date.now() + type.bookingHorizonDays * 86400000;
  const out: Array<{ startsAt: string; endsAt: string; remaining: number }> =
    [];
  for (
    let ms = Math.max(from.getTime(), now);
    ms < Math.min(to.getTime(), horizon);
    ms += 15 * 60000
  ) {
    const start = new Date(Math.ceil(ms / (15 * 60000)) * 15 * 60000);
    const local = parts(start, calendar.timezone);
    const rule = rules.find(
      (r) =>
        r.dayOfWeek === local.day &&
        local.minute >= r.startMinute &&
        local.minute + type.durationMinutes <= r.endMinute,
    );
    if (!rule) continue;
    const end = new Date(start.getTime() + type.durationMinutes * 60000);
    if (blackouts.some((b) => b.startsAt < end && b.endsAt > start)) continue;
    const occupied = reservations.filter(
      (r) =>
        r.startsAt <
          new Date(end.getTime() + type.bufferAfterMinutes * 60000) &&
        r.endsAt > new Date(start.getTime() - type.bufferBeforeMinutes * 60000),
    ).length;
    if (occupied < type.capacity)
      out.push({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        remaining: type.capacity - occupied,
      });
  }
  return out;
}
async function scheduleJobs(input: {
  eventId?: string;
  reservationId?: string;
  ticketId?: string;
  userId: number | null;
  email: string;
  startsAt: Date;
  reminders: number[];
}) {
  const rows = input.reminders.map((minutes) => ({
    eventId: input.eventId ?? null,
    reservationId: input.reservationId ?? null,
    ticketId: input.ticketId ?? null,
    jobType: "reminder",
    recipientUserId: input.userId,
    recipientEmail: input.email,
    dueAt: new Date(input.startsAt.getTime() - minutes * 60000),
    payload: { startsAt: input.startsAt.toISOString(), minutes },
  }));
  if (rows.length) await db.insert(eventAutomationJobs).values(rows);
}
async function promoteBooking(
  type: typeof appointmentTypes.$inferSelect,
  startsAt: Date,
) {
  const [w] = await db
    .select()
    .from(bookingWaitlist)
    .where(
      and(
        eq(bookingWaitlist.appointmentTypeId, type.id),
        eq(bookingWaitlist.startsAt, startsAt),
        eq(bookingWaitlist.status, "waiting"),
      ),
    )
    .orderBy(bookingWaitlist.position)
    .limit(1);
  if (!w) return null;
  const endsAt = new Date(startsAt.getTime() + type.durationMinutes * 60000);
  const [reservation] = await db
    .insert(bookingReservations)
    .values({
      appointmentTypeId: type.id,
      bookerUserId: w.bookerUserId,
      guestName: w.guestName,
      guestEmail: w.guestEmail,
      guestTimezone: w.guestTimezone,
      startsAt,
      endsAt,
      status: type.priceCents > 0 ? "payment_required" : "confirmed",
      paymentStatus: type.priceCents > 0 ? "required" : "not_required",
    })
    .returning();
  await db
    .update(bookingWaitlist)
    .set({
      status: "promoted",
      promotedReservationId: reservation.id,
      promotedAt: new Date(),
    })
    .where(eq(bookingWaitlist.id, w.id));
  return reservation;
}
export async function finalizePaidEventAccess(orderId: string) {
  const [o] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o || o.status !== "paid") return;
  const ids = (
    await db
      .select({ productId: orderItems.productId })
      .from(orderItems)
      .where(eq(orderItems.orderId, o.id))
  ).map((x) => x.productId);
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    const types = await tx
      .select()
      .from(appointmentTypes)
      .where(inArray(appointmentTypes.productId, ids));
    if (types.length)
      await tx
        .update(bookingReservations)
        .set({
          status: "confirmed",
          paymentStatus: "paid",
          orderId: o.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookingReservations.bookerUserId, o.buyerId),
            eq(bookingReservations.status, "payment_required"),
            inArray(
              bookingReservations.appointmentTypeId,
              types.map((x) => x.id),
            ),
          ),
        );
    const ticketTypes = await tx
      .select()
      .from(eventTicketTypes)
      .where(inArray(eventTicketTypes.productId, ids));
    if (ticketTypes.length)
      await tx
        .update(eventTickets)
        .set({
          status: "confirmed",
          paymentStatus: "paid",
          orderId: o.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(eventTickets.holderUserId, o.buyerId),
            eq(eventTickets.status, "payment_required"),
            inArray(
              eventTickets.ticketTypeId,
              ticketTypes.map((x) => x.id),
            ),
          ),
        );
  });
}
export function registerBookingTicketingRoutes(base: Express) {
  const app = {
    get: (p: string, ...h: Handler[]) => base.get(p, ...h.map(safe)),
    post: (p: string, ...h: Handler[]) => base.post(p, ...h.map(safe)),
    patch: (p: string, ...h: Handler[]) => base.patch(p, ...h.map(safe)),
    delete: (p: string, ...h: Handler[]) => base.delete(p, ...h.map(safe)),
  };
  app.get("/api/booking", attachUser, async (q, s) => {
    const b = await ensureDefaultBusiness(q.dbUser!);
    const calendars = await db
      .select()
      .from(bookingCalendars)
      .where(eq(bookingCalendars.businessId, b.id));
    const types = await db
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.businessId, b.id));
    const reservations = types.length
      ? await db
          .select()
          .from(bookingReservations)
          .where(
            inArray(
              bookingReservations.appointmentTypeId,
              types.map((x) => x.id),
            ),
          )
          .orderBy(desc(bookingReservations.startsAt))
      : [];
    const ownedEvents = await db
      .select()
      .from(events)
      .where(eq(events.userId, q.dbUser!.id))
      .orderBy(desc(events.dateTime));
    return s.json({ calendars, types, reservations, events: ownedEvents });
  });
  app.post("/api/booking/calendars", attachUser, async (q, s) => {
    const name =
      typeof q.body?.name === "string" ? q.body.name.trim().slice(0, 160) : "";
    const timezone = String(q.body?.timezone ?? "");
    if (!name || !validTimezone(timezone))
      return s
        .status(400)
        .json({ message: "Valid name and IANA timezone required" });
    const b = await ensureDefaultBusiness(q.dbUser!);
    const [c] = await db
      .insert(bookingCalendars)
      .values({ businessId: b.id, ownerUserId: q.dbUser!.id, name, timezone })
      .returning();
    return s.status(201).json(c);
  });
  app.post("/api/booking/calendars/:id/rules", attachUser, async (q, s) => {
    const c = await ownerCalendar(q.dbUser!.id, q.params.id);
    const parsed = availabilityRuleSchema.safeParse(q.body);
    if (!c) return s.status(404).json({ message: "Calendar not found" });
    if (!parsed.success)
      return s.status(400).json({ message: parsed.error.issues[0]?.message });
    const [r] = await db
      .insert(bookingAvailabilityRules)
      .values({ calendarId: c.id, ...parsed.data })
      .returning();
    return s.status(201).json(r);
  });
  app.post("/api/booking/calendars/:id/blackouts", attachUser, async (q, s) => {
    const calendar = await ownerCalendar(q.dbUser!.id, q.params.id);
    const startsAt = new Date(q.body?.startsAt);
    const endsAt = new Date(q.body?.endsAt);
    if (!calendar) return s.status(404).json({ message: "Calendar not found" });
    if (Number.isNaN(+startsAt) || Number.isNaN(+endsAt) || endsAt <= startsAt)
      return s.status(400).json({ message: "Valid blackout range required" });
    const [blackout] = await db
      .insert(bookingBlackouts)
      .values({
        calendarId: calendar.id,
        startsAt,
        endsAt,
        reason:
          typeof q.body?.reason === "string"
            ? q.body.reason.trim().slice(0, 500)
            : "Unavailable",
      })
      .returning();
    return s.status(201).json(blackout);
  });
  app.post("/api/booking/appointment-types", attachUser, async (q, s) => {
    const parsed = createAppointmentTypeSchema.safeParse(q.body);
    if (!parsed.success)
      return s.status(400).json({ message: parsed.error.issues[0]?.message });
    const c = await ownerCalendar(q.dbUser!.id, parsed.data.calendarId);
    if (!c) return s.status(404).json({ message: "Calendar not found" });
    const b = await ensureDefaultBusiness(q.dbUser!);
    let productId: null | number = null;
    if (parsed.data.priceCents > 0) {
      const [p] = await db
        .insert(products)
        .values({
          userId: q.dbUser!.id,
          businessId: b.id,
          payoutMode: "creator",
          status: "published",
          productType: "appointment",
          billingModel: "one_time",
          title: parsed.data.name,
          description: parsed.data.description,
          price: parsed.data.priceCents / 100,
          category: "Appointment",
        })
        .returning();
      productId = p.id;
    }
    const [t] = await db
      .insert(appointmentTypes)
      .values({
        businessId: b.id,
        ownerUserId: q.dbUser!.id,
        ...parsed.data,
        productId,
      })
      .returning();
    return s.status(201).json(t);
  });
  app.get("/api/public/booking/:slug", async (q, s) => {
    const [t] = await db
      .select()
      .from(appointmentTypes)
      .where(
        and(
          eq(appointmentTypes.slug, q.params.slug),
          eq(appointmentTypes.status, "active"),
        ),
      )
      .limit(1);
    if (!t) return s.status(404).json({ message: "Appointment unavailable" });
    return s.json(t);
  });
  app.get("/api/public/booking/:slug/slots", async (q, s) => {
    const [t] = await db
      .select()
      .from(appointmentTypes)
      .where(
        and(
          eq(appointmentTypes.slug, q.params.slug),
          eq(appointmentTypes.status, "active"),
        ),
      )
      .limit(1);
    if (!t) return s.status(404).json({ message: "Appointment unavailable" });
    const from = new Date(String(q.query.from ?? Date.now()));
    const to = new Date(String(q.query.to ?? Date.now() + 7 * 86400000));
    if (
      Number.isNaN(+from) ||
      Number.isNaN(+to) ||
      to <= from ||
      +to - +from > 31 * 86400000
    )
      return s
        .status(400)
        .json({ message: "Choose a valid range up to 31 days" });
    return s.json(await appointmentSlots(t, from, to));
  });
  app.post("/api/booking/:slug/reservations", attachUser, async (q, s) => {
    const [t] = await db
      .select()
      .from(appointmentTypes)
      .where(
        and(
          eq(appointmentTypes.slug, q.params.slug),
          eq(appointmentTypes.status, "active"),
        ),
      )
      .limit(1);
    if (!t) return s.status(404).json({ message: "Appointment unavailable" });
    const startsAt = new Date(q.body?.startsAt);
    const name =
      typeof q.body?.name === "string" ? q.body.name.trim().slice(0, 160) : "";
    const email =
      typeof q.body?.email === "string"
        ? q.body.email.trim().toLowerCase()
        : "";
    const timezone = String(q.body?.timezone ?? "UTC");
    if (
      !name ||
      !/^[^@]+@[^@]+\.[^@]+$/.test(email) ||
      !validTimezone(timezone) ||
      Number.isNaN(+startsAt)
    )
      return s.status(400).json({ message: "Valid guest and time required" });
    const slots = await appointmentSlots(
      t,
      new Date(+startsAt - 1000),
      new Date(+startsAt + t.durationMinutes * 60000 + 1000),
    );
    if (!slots.some((x) => x.startsAt === startsAt.toISOString())) {
      const [position] = await db
        .select({ value: count() })
        .from(bookingWaitlist)
        .where(
          and(
            eq(bookingWaitlist.appointmentTypeId, t.id),
            eq(bookingWaitlist.startsAt, startsAt),
            eq(bookingWaitlist.status, "waiting"),
          ),
        );
      const [w] = await db
        .insert(bookingWaitlist)
        .values({
          appointmentTypeId: t.id,
          bookerUserId: q.dbUser!.id,
          guestName: name,
          guestEmail: email,
          guestTimezone: timezone,
          startsAt,
          position: Number(position.value) + 1,
        })
        .returning();
      return s.status(202).json({ status: "waitlisted", waitlist: w });
    }
    const endsAt = new Date(+startsAt + t.durationMinutes * 60000);
    const r = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${t.id}:${startsAt.toISOString()}`}))`,
      );
      const [used] = await tx
        .select({ value: count() })
        .from(bookingReservations)
        .where(
          and(
            eq(bookingReservations.appointmentTypeId, t.id),
            eq(bookingReservations.startsAt, startsAt),
            inArray(bookingReservations.status, activeStatuses),
          ),
        );
      if (Number(used.value) >= t.capacity) return null;
      const [row] = await tx
        .insert(bookingReservations)
        .values({
          appointmentTypeId: t.id,
          bookerUserId: q.dbUser!.id,
          guestName: name,
          guestEmail: email,
          guestTimezone: timezone,
          startsAt,
          endsAt,
          status: t.priceCents > 0 ? "payment_required" : "confirmed",
          paymentStatus: t.priceCents > 0 ? "required" : "not_required",
        })
        .returning();
      return row;
    });
    if (!r)
      return s
        .status(409)
        .json({ message: "Slot was just filled; join the waitlist" });
    await scheduleJobs({
      reservationId: r.id,
      userId: q.dbUser!.id,
      email,
      startsAt,
      reminders: t.reminderMinutes,
    });
    return s.status(201).json({ ...r, productId: t.productId });
  });
  app.delete("/api/booking/reservations/:id", attachUser, async (q, s) => {
    const [r] = await db
      .select()
      .from(bookingReservations)
      .where(
        and(
          eq(bookingReservations.id, q.params.id),
          eq(bookingReservations.bookerUserId, q.dbUser!.id),
        ),
      )
      .limit(1);
    if (!r) return s.status(404).json({ message: "Reservation not found" });
    const [t] = await db
      .select()
      .from(appointmentTypes)
      .where(eq(appointmentTypes.id, r.appointmentTypeId))
      .limit(1);
    const afterDeadline =
      Date.now() > r.startsAt.getTime() - t.cancellationNoticeMinutes * 60000;
    const status =
      r.paymentStatus === "paid"
        ? afterDeadline
          ? "cancelled"
          : "refund_required"
        : "cancelled";
    const [u] = await db
      .update(bookingReservations)
      .set({
        status,
        cancellationReason: String(q.body?.reason ?? "guest_cancelled").slice(
          0,
          500,
        ),
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bookingReservations.id, r.id))
      .returning();
    await promoteBooking(t, r.startsAt);
    return s.json(u);
  });
  app.delete(
    "/api/booking/operator/reservations/:id",
    attachUser,
    async (q, s) => {
      const [reservation] = await db
        .select()
        .from(bookingReservations)
        .where(eq(bookingReservations.id, q.params.id))
        .limit(1);
      const type = reservation
        ? await ownerAppointment(q.dbUser!.id, reservation.appointmentTypeId)
        : null;
      if (!reservation || !type)
        return s.status(404).json({ message: "Reservation not found" });
      if (["cancelled", "refund_required"].includes(reservation.status))
        return s.json(reservation);
      const [updated] = await db
        .update(bookingReservations)
        .set({
          status:
            reservation.paymentStatus === "paid"
              ? "refund_required"
              : "cancelled",
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(bookingReservations.id, reservation.id))
        .returning();
      await promoteBooking(type, reservation.startsAt);
      return s.json(updated);
    },
  );
  app.post(
    "/api/event-operations/events/:id/settings",
    attachUser,
    async (q, s) => {
      const e = await manageEvent(q.dbUser!.id, q.params.id);
      const timezone = String(q.body?.timezone ?? "UTC");
      const capacity = Number(q.body?.capacity);
      if (!e) return s.status(404).json({ message: "Event not found" });
      if (
        !validTimezone(timezone) ||
        !Number.isInteger(capacity) ||
        capacity < 1
      )
        return s
          .status(400)
          .json({ message: "Valid timezone and capacity required" });
      const b = await ensureDefaultBusiness(q.dbUser!);
      const [x] = await db
        .insert(eventCommercialSettings)
        .values({
          eventId: e.id,
          businessId: b.id,
          timezone,
          capacity,
          waitlistEnabled: q.body?.waitlistEnabled !== false,
          cancellationNoticeMinutes:
            Number(q.body?.cancellationNoticeMinutes) || 1440,
          refundPolicy: "refund_before_deadline",
        })
        .onConflictDoUpdate({
          target: eventCommercialSettings.eventId,
          set: {
            timezone,
            capacity,
            waitlistEnabled: q.body?.waitlistEnabled !== false,
            updatedAt: new Date(),
          },
        })
        .returning();
      return s.status(201).json(x);
    },
  );
  app.post(
    "/api/event-operations/events/:id/series",
    attachUser,
    async (q, s) => {
      const e = await manageEvent(q.dbUser!.id, q.params.id);
      const frequency = String(q.body?.frequency ?? "");
      const countValue = Number(q.body?.occurrenceCount);
      const interval = Number(q.body?.intervalCount) || 1;
      const timezone = String(q.body?.timezone ?? "UTC");
      if (!e) return s.status(404).json({ message: "Event not found" });
      if (
        !["daily", "weekly", "monthly"].includes(frequency) ||
        !Number.isInteger(countValue) ||
        countValue < 1 ||
        countValue > 100 ||
        !validTimezone(timezone)
      )
        return s.status(400).json({ message: "Valid recurrence required" });
      const [series] = await db
        .insert(eventSeries)
        .values({
          eventId: e.id,
          timezone,
          frequency,
          intervalCount: interval,
          occurrenceCount: countValue,
          createdByUserId: q.dbUser!.id,
        })
        .returning();
      const occurrences = await db
        .insert(eventOccurrences)
        .values(
          Array.from({ length: countValue }, (_, i) => ({
            seriesId: series.id,
            eventId: e.id,
            sequence: i + 1,
            startsAt: recurringInstant(
              e.dateTime,
              timezone,
              frequency as "daily" | "weekly" | "monthly",
              interval,
              i,
            ),
          })),
        )
        .returning();
      return s.status(201).json({ series, occurrences });
    },
  );
  app.post(
    "/api/event-operations/events/:id/ticket-types",
    attachUser,
    async (q, s) => {
      const e = await manageEvent(q.dbUser!.id, q.params.id);
      const parsed = ticketTypeSchema.safeParse(q.body);
      if (!e) return s.status(404).json({ message: "Event not found" });
      if (!parsed.success)
        return s.status(400).json({ message: parsed.error.issues[0]?.message });
      const b = await ensureDefaultBusiness(q.dbUser!);
      let productId: null | number = null;
      if (parsed.data.priceCents > 0) {
        const [p] = await db
          .insert(products)
          .values({
            userId: q.dbUser!.id,
            businessId: b.id,
            payoutMode: "creator",
            status: "published",
            productType: "event_ticket",
            billingModel: "one_time",
            title: `${e.name} — ${parsed.data.name}`,
            description: parsed.data.description,
            price: parsed.data.priceCents / 100,
            category: "Event",
          })
          .returning();
        productId = p.id;
      }
      const [t] = await db
        .insert(eventTicketTypes)
        .values({ eventId: e.id, ...parsed.data, productId })
        .returning();
      return s.status(201).json(t);
    },
  );
  app.get("/api/public/events/:id/tickets", async (q, s) => {
    if (!z.string().uuid().safeParse(q.params.id).success)
      return s.status(404).json({ message: "Event not found" });
    const [e] = await db
      .select()
      .from(events)
      .where(eq(events.id, q.params.id))
      .limit(1);
    if (!e) return s.status(404).json({ message: "Event not found" });
    const [settings, types] = await Promise.all([
      db
        .select()
        .from(eventCommercialSettings)
        .where(eq(eventCommercialSettings.eventId, e.id))
        .limit(1),
      db
        .select()
        .from(eventTicketTypes)
        .where(
          and(
            eq(eventTicketTypes.eventId, e.id),
            eq(eventTicketTypes.status, "active"),
          ),
        ),
    ]);
    return s.json({
      event: e,
      settings: settings[0] ?? null,
      ticketTypes: types,
    });
  });
  app.get("/api/event-operations/events/:id", attachUser, async (q, s) => {
    const event = await manageEvent(q.dbUser!.id, q.params.id);
    if (!event) return s.status(404).json({ message: "Event not found" });
    const [settings, series, occurrences, ticketTypes, tickets, waitlist] =
      await Promise.all([
        db
          .select()
          .from(eventCommercialSettings)
          .where(eq(eventCommercialSettings.eventId, event.id))
          .limit(1),
        db.select().from(eventSeries).where(eq(eventSeries.eventId, event.id)),
        db
          .select()
          .from(eventOccurrences)
          .where(eq(eventOccurrences.eventId, event.id)),
        db
          .select()
          .from(eventTicketTypes)
          .where(eq(eventTicketTypes.eventId, event.id)),
        db
          .select()
          .from(eventTickets)
          .where(eq(eventTickets.eventId, event.id))
          .orderBy(desc(eventTickets.createdAt)),
        db
          .select()
          .from(eventWaitlist)
          .where(eq(eventWaitlist.eventId, event.id))
          .orderBy(eventWaitlist.position),
      ]);
    return s.json({
      event,
      settings: settings[0] ?? null,
      series,
      occurrences,
      ticketTypes,
      tickets,
      waitlist,
    });
  });
  app.post(
    "/api/event-operations/ticket-types/:id/claim",
    attachUser,
    async (q, s) => {
      const [t] = await db
        .select()
        .from(eventTicketTypes)
        .where(
          and(
            eq(eventTicketTypes.id, q.params.id),
            eq(eventTicketTypes.status, "active"),
          ),
        )
        .limit(1);
      if (!t) return s.status(404).json({ message: "Ticket unavailable" });
      const [e] = await db
        .select()
        .from(events)
        .where(eq(events.id, t.eventId))
        .limit(1);
      const [settings] = await db
        .select()
        .from(eventCommercialSettings)
        .where(eq(eventCommercialSettings.eventId, t.eventId))
        .limit(1);
      const now = new Date();
      if (t.salesStartAt && now < t.salesStartAt)
        return s.status(409).json({ message: "Ticket sales have not opened" });
      if (t.salesEndAt && now > t.salesEndAt)
        return s.status(409).json({ message: "Ticket sales have ended" });
      const name =
        typeof q.body?.name === "string"
          ? q.body.name.trim().slice(0, 160)
          : q.dbUser!.displayName;
      const email =
        typeof q.body?.email === "string"
          ? q.body.email.trim().toLowerCase()
          : (q.dbUser!.authEmail ?? `${q.dbUser!.username}@creativesos.local`);
      const quantity = Math.max(
        1,
        Math.min(t.maxPerBuyer, Number(q.body?.quantity) || 1),
      );
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`ticket:${t.id}`}))`,
        );
        const [used] = await tx
          .select({
            value: sql<number>`coalesce(sum(${eventTickets.quantity}),0)::int`,
          })
          .from(eventTickets)
          .where(
            and(
              eq(eventTickets.ticketTypeId, t.id),
              inArray(eventTickets.status, activeStatuses),
            ),
          );
        const [eventUsed] = await tx
          .select({
            value: sql<number>`coalesce(sum(${eventTickets.quantity}),0)::int`,
          })
          .from(eventTickets)
          .where(
            and(
              eq(eventTickets.eventId, t.eventId),
              inArray(eventTickets.status, activeStatuses),
            ),
          );
        const [buyerUsed] = await tx
          .select({
            value: sql<number>`coalesce(sum(${eventTickets.quantity}),0)::int`,
          })
          .from(eventTickets)
          .where(
            and(
              eq(eventTickets.ticketTypeId, t.id),
              eq(eventTickets.holderUserId, q.dbUser!.id),
              inArray(eventTickets.status, activeStatuses),
            ),
          );
        if (Number(buyerUsed.value) + quantity > t.maxPerBuyer)
          return { unavailable: "buyer_limit" as const };
        const soldOut =
          Number(used.value) + quantity > t.capacity ||
          (settings && Number(eventUsed.value) + quantity > settings.capacity);
        if (soldOut) {
          if (settings?.waitlistEnabled === false)
            return { unavailable: "sold_out" as const };
          const [pos] = await tx
            .select({ value: count() })
            .from(eventWaitlist)
            .where(
              and(
                eq(eventWaitlist.ticketTypeId, t.id),
                eq(eventWaitlist.status, "waiting"),
              ),
            );
          const [w] = await tx
            .insert(eventWaitlist)
            .values({
              eventId: e.id,
              ticketTypeId: t.id,
              userId: q.dbUser!.id,
              name,
              email,
              quantity,
              position: Number(pos.value) + 1,
            })
            .returning();
          return { waitlist: w };
        }
        const [ticket] = await tx
          .insert(eventTickets)
          .values({
            eventId: e.id,
            ticketTypeId: t.id,
            holderUserId: q.dbUser!.id,
            holderName: name,
            holderEmail: email,
            quantity,
            status: t.priceCents > 0 ? "payment_required" : "confirmed",
            paymentStatus: t.priceCents > 0 ? "required" : "not_required",
            ticketCode: `COS-${randomBytes(8).toString("hex").toUpperCase()}`,
          })
          .returning();
        return { ticket };
      });
      if ("unavailable" in result)
        return s.status(409).json({
          message:
            result.unavailable === "buyer_limit"
              ? "Buyer ticket limit reached"
              : "Event is sold out",
        });
      if ("waitlist" in result)
        return s.status(202).json({ status: "waitlisted", ...result });
      await scheduleJobs({
        eventId: e.id,
        ticketId: result.ticket.id,
        userId: q.dbUser!.id,
        email,
        startsAt: e.dateTime,
        reminders: [1440, 60],
      });
      return s.status(201).json({ ...result.ticket, productId: t.productId });
    },
  );
  app.delete("/api/event-operations/tickets/:id", attachUser, async (q, s) => {
    const [ticket] = await db
      .select()
      .from(eventTickets)
      .where(
        and(
          eq(eventTickets.id, q.params.id),
          eq(eventTickets.holderUserId, q.dbUser!.id),
        ),
      )
      .limit(1);
    if (!ticket) return s.status(404).json({ message: "Ticket not found" });
    const [e] = await db
      .select()
      .from(events)
      .where(eq(events.id, ticket.eventId))
      .limit(1);
    const [settings] = await db
      .select()
      .from(eventCommercialSettings)
      .where(eq(eventCommercialSettings.eventId, e.id))
      .limit(1);
    const refundable =
      Date.now() <
      e.dateTime.getTime() -
        (settings?.cancellationNoticeMinutes ?? 1440) * 60000;
    const status =
      ticket.paymentStatus === "paid" && refundable
        ? "refund_required"
        : "cancelled";
    const [u] = await db
      .update(eventTickets)
      .set({ status, cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(eventTickets.id, ticket.id))
      .returning();
    const [w] = await db
      .select()
      .from(eventWaitlist)
      .where(
        and(
          eq(eventWaitlist.ticketTypeId, ticket.ticketTypeId),
          eq(eventWaitlist.status, "waiting"),
        ),
      )
      .orderBy(eventWaitlist.position)
      .limit(1);
    if (w) {
      const [ticketType] = await db
        .select()
        .from(eventTicketTypes)
        .where(eq(eventTicketTypes.id, w.ticketTypeId))
        .limit(1);
      if (!ticketType) return s.json(u);
      const [p] = await db
        .insert(eventTickets)
        .values({
          eventId: w.eventId,
          ticketTypeId: w.ticketTypeId,
          holderUserId: w.userId,
          holderName: w.name,
          holderEmail: w.email,
          quantity: w.quantity,
          status: ticketType.priceCents > 0 ? "payment_required" : "confirmed",
          paymentStatus:
            ticketType.priceCents > 0 ? "required" : "not_required",
          ticketCode: `COS-${randomBytes(8).toString("hex").toUpperCase()}`,
        })
        .returning();
      await db
        .update(eventWaitlist)
        .set({
          status: "promoted",
          promotedTicketId: p.id,
          promotedAt: new Date(),
        })
        .where(eq(eventWaitlist.id, w.id));
    }
    return s.json(u);
  });
  app.post(
    "/api/event-operations/events/:id/room",
    attachUser,
    async (q, s) => {
      const e = await manageEvent(q.dbUser!.id, q.params.id);
      if (!e) return s.status(404).json({ message: "Event not found" });
      const [r] = await db
        .insert(communityRooms)
        .values({
          communityId: e.communityId,
          channelId: e.channelId,
          hostUserId: q.dbUser!.id,
          title: e.name,
          description: e.description,
          startsAt: e.dateTime,
          status: "scheduled",
          provider: "manual_link",
          joinUrl: typeof q.body?.joinUrl === "string" ? q.body.joinUrl : null,
          recordingConsentRequired: true,
          recordingEnabled: q.body?.recordingEnabled === true,
          transcriptionEnabled: q.body?.transcriptionEnabled === true,
          aiAssistanceEnabled: q.body?.aiAssistanceEnabled === true,
        })
        .returning();
      await db
        .update(eventCommercialSettings)
        .set({ roomId: r.id, updatedAt: new Date() })
        .where(eq(eventCommercialSettings.eventId, e.id));
      return s.status(201).json(r);
    },
  );
  app.post(
    "/api/event-operations/tickets/:id/check-in",
    attachUser,
    async (q, s) => {
      const [t] = await db
        .select()
        .from(eventTickets)
        .where(eq(eventTickets.id, q.params.id))
        .limit(1);
      const e = t ? await manageEvent(q.dbUser!.id, t.eventId) : null;
      if (!t || !e) return s.status(404).json({ message: "Ticket not found" });
      if (!["confirmed", "checked_in"].includes(t.status))
        return s.status(409).json({ message: "Ticket is not active" });
      const [u] = await db
        .update(eventTickets)
        .set({
          status: "checked_in",
          checkedInAt: t.checkedInAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(eventTickets.id, t.id))
        .returning();
      await db.insert(eventAttendance).values({
        eventId: e.id,
        ticketId: t.id,
        userId: t.holderUserId,
        source: "ticket_checkin",
      });
      await db.insert(eventAutomationJobs).values({
        eventId: e.id,
        ticketId: t.id,
        jobType: "follow_up",
        recipientUserId: t.holderUserId,
        recipientEmail: t.holderEmail,
        dueAt: new Date(e.dateTime.getTime() + 60 * 60000),
        payload: { eventName: e.name },
      });
      return s.json(u);
    },
  );
  app.post(
    "/api/event-operations/events/:id/replay",
    attachUser,
    async (q, s) => {
      const e = await manageEvent(q.dbUser!.id, q.params.id);
      const assetId = String(q.body?.assetId ?? "");
      if (!e) return s.status(404).json({ message: "Event not found" });
      const [a] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, assetId),
            eq(assets.ownerUserId, q.dbUser!.id),
            eq(assets.status, "ready"),
          ),
        )
        .limit(1);
      if (!a) return s.status(404).json({ message: "Replay asset not found" });
      await db
        .update(eventCommercialSettings)
        .set({ replayAssetId: a.id, updatedAt: new Date() })
        .where(eq(eventCommercialSettings.eventId, e.id));
      const tickets = await db
        .select({ ticket: eventTickets, ticketType: eventTicketTypes })
        .from(eventTickets)
        .innerJoin(
          eventTicketTypes,
          eq(eventTicketTypes.id, eventTickets.ticketTypeId),
        )
        .where(
          and(
            eq(eventTickets.eventId, e.id),
            inArray(eventTickets.status, ["confirmed", "checked_in"]),
          ),
        );
      if (tickets.length)
        await db
          .insert(eventReplayEntitlements)
          .values(
            tickets
              .filter(({ ticket }) => ticket.holderUserId)
              .map(({ ticket, ticketType }) => ({
                eventId: e.id,
                assetId: a.id,
                userId: ticket.holderUserId!,
                ticketId: ticket.id,
                expiresAt:
                  ticketType.replayAccessDays === 0
                    ? null
                    : new Date(
                        Date.now() +
                          ticketType.replayAccessDays * 24 * 60 * 60 * 1000,
                      ),
              })),
          )
          .onConflictDoNothing();
      return s.json({
        granted: tickets.filter(({ ticket }) => ticket.holderUserId).length,
      });
    },
  );
  app.post("/api/event-operations/dispatch-due", attachUser, async (q, s) => {
    const b = await ensureDefaultBusiness(q.dbUser!);
    const owned = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.userId, q.dbUser!.id));
    const reservations = await db
      .select({ id: bookingReservations.id })
      .from(bookingReservations)
      .innerJoin(
        appointmentTypes,
        eq(bookingReservations.appointmentTypeId, appointmentTypes.id),
      )
      .where(eq(appointmentTypes.businessId, b.id));
    const due = await db
      .select()
      .from(eventAutomationJobs)
      .where(
        and(
          eq(eventAutomationJobs.status, "queued"),
          lt(eventAutomationJobs.dueAt, new Date()),
          or(
            owned.length
              ? inArray(
                  eventAutomationJobs.eventId,
                  owned.map((x) => x.id),
                )
              : sql`false`,
            reservations.length
              ? inArray(
                  eventAutomationJobs.reservationId,
                  reservations.map((x) => x.id),
                )
              : sql`false`,
          ),
        ),
      );
    for (const j of due) {
      if (j.recipientUserId)
        await db
          .insert(notifications)
          .values({
            userId: j.recipientUserId,
            type: `event_${j.jobType}`,
            message:
              j.jobType === "follow_up"
                ? "Your event follow-up is ready."
                : "Your event or appointment is coming up.",
            linkTo: j.eventId ? `/events/${j.eventId}` : "/business/booking",
            sourceType: "event_automation",
            sourceId: j.id,
          })
          .onConflictDoNothing();
      await db
        .update(eventAutomationJobs)
        .set({
          status: j.recipientUserId ? "sent" : "provider_pending",
          sentAt: j.recipientUserId ? new Date() : null,
          attemptCount: j.attemptCount + 1,
        })
        .where(eq(eventAutomationJobs.id, j.id));
    }
    return s.json({
      processed: due.length,
      providerPending: due.filter((x) => !x.recipientUserId).length,
    });
  });
  app.get("/api/booking/me", attachUser, async (q, s) => {
    const [reservations, tickets, replays] = await Promise.all([
      db
        .select()
        .from(bookingReservations)
        .where(eq(bookingReservations.bookerUserId, q.dbUser!.id))
        .orderBy(desc(bookingReservations.startsAt)),
      db
        .select()
        .from(eventTickets)
        .where(eq(eventTickets.holderUserId, q.dbUser!.id))
        .orderBy(desc(eventTickets.createdAt)),
      db
        .select()
        .from(eventReplayEntitlements)
        .where(eq(eventReplayEntitlements.userId, q.dbUser!.id)),
    ]);
    return s.json({ reservations, tickets, replays });
  });
}
