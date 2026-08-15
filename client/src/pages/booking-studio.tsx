import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Copy,
  ExternalLink,
  TicketCheck,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Calendar = { id: string; name: string; timezone: string };
type AppointmentType = {
  id: string;
  name: string;
  slug: string;
  durationMinutes: number;
  capacity: number;
  priceCents: number;
};
type Reservation = {
  id: string;
  appointmentTypeId: string;
  guestName: string;
  guestEmail: string;
  startsAt: string;
  status: string;
};
type Event = { id: string; name: string; dateTime: string };
type Dashboard = {
  calendars: Calendar[];
  types: AppointmentType[];
  reservations: Reservation[];
  events: Event[];
};

const money = (cents: number) =>
  cents ? `$${(cents / 100).toFixed(2)}` : "Free";

export default function BookingStudioPage() {
  const [, navigate] = useLocation();
  const [calendarName, setCalendarName] = useState("Creator calendar");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [selectedCalendar, setSelectedCalendar] = useState("");
  const [typeName, setTypeName] = useState("");
  const [slug, setSlug] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("0");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [message, setMessage] = useState("");
  const dashboard = useQuery<Dashboard>({ queryKey: ["/api/booking"] });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/booking"] });
  const action = useMutation({
    mutationFn: async ({
      method = "POST",
      path,
      body,
    }: {
      method?: "POST" | "DELETE";
      path: string;
      body?: unknown;
    }) => (await apiRequest(method, path, body)).json(),
    onSuccess: async () => {
      setMessage("Saved.");
      await refresh();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Action failed"),
  });
  const activeCalendar =
    selectedCalendar || dashboard.data?.calendars[0]?.id || "";
  const upcoming = useMemo(
    () =>
      (dashboard.data?.reservations ?? []).filter((reservation) =>
        ["confirmed", "payment_required"].includes(reservation.status),
      ),
    [dashboard.data?.reservations],
  );

  async function createCalendar() {
    const response = await apiRequest("POST", "/api/booking/calendars", {
      name: calendarName,
      timezone,
    });
    const calendar = (await response.json()) as Calendar;
    setSelectedCalendar(calendar.id);
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1)
      await apiRequest("POST", `/api/booking/calendars/${calendar.id}/rules`, {
        dayOfWeek,
        startMinute: 540,
        endMinute: 1020,
      });
    setMessage("Calendar created with 9:00–17:00 daily availability.");
    await refresh();
  }
  async function createType() {
    await apiRequest("POST", "/api/booking/appointment-types", {
      calendarId: activeCalendar,
      name: typeName,
      slug,
      description: "Book time directly with this creator.",
      durationMinutes: Number(duration),
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
      capacity: 1,
      locationMode: "manual_link",
      location: null,
      priceCents: Math.round(Number(price) * 100),
      currency: "usd",
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 90,
      cancellationNoticeMinutes: 1440,
      reminderMinutes: [1440, 60],
    });
    setTypeName("");
    setSlug("");
    setMessage("Appointment page published.");
    await refresh();
  }
  async function configureEvent() {
    await apiRequest(
      "POST",
      `/api/event-operations/events/${selectedEvent}/settings`,
      {
        timezone,
        capacity: 100,
        waitlistEnabled: true,
        cancellationNoticeMinutes: 1440,
      },
    );
    setMessage("Event commerce, capacity, and waitlist are active.");
  }

  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/business")}
          >
            <ArrowLeft />
          </Button>
          <CalendarClock className="text-[#1d9bf0]" />
          <div>
            <h1 className="font-black">Booking & Event Operations</h1>
            <p className="text-[10px] text-zinc-500">
              Availability, appointments, ticketing, waitlists, rooms,
              attendance, and replay access
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-4">
        {message && (
          <p role="status" className="rounded-xl bg-[#1d9bf0]/10 p-3 text-xs">
            {message}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              label: "Booking pages",
              value: dashboard.data?.types.length ?? 0,
              Icon: CalendarPlus,
            },
            {
              label: "Active reservations",
              value: upcoming.length,
              Icon: Users,
            },
            {
              label: "Events",
              value: dashboard.data?.events.length ?? 0,
              Icon: TicketCheck,
            },
          ].map(({ label, value, Icon }) => (
            <article
              key={label}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <Icon className="h-5 w-5 text-[#1d9bf0]" />
              <p className="mt-3 text-[10px] font-black uppercase text-zinc-500">
                {label}
              </p>
              <strong className="text-2xl">{value}</strong>
            </article>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Availability calendar</h2>
            <p className="mt-1 text-xs text-zinc-500">
              IANA timezones keep booking hours stable across daylight-saving
              changes.
            </p>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              aria-label="Calendar name"
              value={calendarName}
              onChange={(e) => setCalendarName(e.target.value)}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              aria-label="Calendar timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <Button
              className="mt-3 bg-[#1d9bf0] text-black"
              onClick={() => void createCalendar()}
              disabled={!calendarName || !timezone}
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Create calendar
            </Button>
            <div className="mt-4 space-y-2">
              {dashboard.data?.calendars.map((calendar) => (
                <button
                  key={calendar.id}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${activeCalendar === calendar.id ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}
                  onClick={() => setSelectedCalendar(calendar.id)}
                >
                  <strong>{calendar.name}</strong>
                  <span className="ml-2 text-xs text-zinc-500">
                    {calendar.timezone}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Publish an appointment page</h2>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              placeholder="Strategy session"
              aria-label="Appointment name"
              value={typeName}
              onChange={(e) => {
                setTypeName(e.target.value);
                if (!slug)
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
              }}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              placeholder="strategy-session"
              aria-label="Appointment slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                className="border-zinc-800 bg-black"
                type="number"
                aria-label="Duration minutes"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
              <Input
                className="border-zinc-800 bg-black"
                type="number"
                min="0"
                step="0.01"
                aria-label="Price dollars"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <Button
              className="mt-3 w-full bg-[#1d9bf0] text-black"
              disabled={!activeCalendar || !typeName || !slug}
              onClick={() => void createType()}
            >
              Publish booking page
            </Button>
            {dashboard.data?.types.map((type) => (
              <article key={type.id} className="mt-3 rounded-xl bg-black p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-sm">{type.name}</strong>
                    <p className="text-xs text-zinc-500">
                      {type.durationMinutes} min · {money(type.priceCents)}
                    </p>
                  </div>
                  <div className="flex">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Copy ${type.name} link`}
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          `${location.origin}/book/${type.slug}`,
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Open ${type.name}`}
                      onClick={() =>
                        window.open(`/book/${type.slug}`, "_blank")
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-black">Paid event operations</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Activate ticket capacity and waitlisting on an event, then manage
            tiers and attendance from its control room.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Select event"
              className="h-10 flex-1 rounded-md border border-zinc-800 bg-black px-3 text-sm"
              value={selectedEvent}
              onChange={(e) => setSelectedEvent(e.target.value)}
            >
              <option value="">Choose an event</option>
              {dashboard.data?.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {new Date(event.dateTime).toLocaleString()}
                </option>
              ))}
            </select>
            <Button
              disabled={!selectedEvent}
              onClick={() => void configureEvent()}
            >
              Activate ticketing
            </Button>
            <Button
              variant="outline"
              disabled={!selectedEvent}
              onClick={() =>
                navigate(`/business/booking/events/${selectedEvent}`)
              }
            >
              Open event control
            </Button>
          </div>
        </section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-black">Reservation operations</h2>
          {!upcoming.length && (
            <p className="mt-2 text-sm text-zinc-600">
              No active reservations.
            </p>
          )}
          {upcoming.map((reservation) => (
            <div
              key={reservation.id}
              className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-black p-3"
            >
              <div className="min-w-0 flex-1">
                <strong className="text-sm">{reservation.guestName}</strong>
                <p className="truncate text-xs text-zinc-500">
                  {reservation.guestEmail} ·{" "}
                  {new Date(reservation.startsAt).toLocaleString()} ·{" "}
                  {reservation.status}
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  action.mutate({
                    method: "DELETE",
                    path: `/api/booking/operator/reservations/${reservation.id}`,
                  })
                }
              >
                Cancel
              </Button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
