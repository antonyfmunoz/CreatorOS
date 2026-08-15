import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Appointment = {
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  locationMode: string;
  productId: number | null;
};
type Slot = { startsAt: string; endsAt: string; remaining: number };
export default function BookingPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const range = useMemo(
    () => ({
      from: new Date().toISOString(),
      to: new Date(Date.now() + 14 * 86400000).toISOString(),
    }),
    [],
  );
  useEffect(() => {
    void Promise.all([
      fetch(`/api/public/booking/${slug}`).then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.message);
        setAppointment(value);
      }),
      fetch(
        `/api/public/booking/${slug}/slots?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      )
        .then((r) => r.json())
        .then(setSlots),
    ]).catch((error) =>
      setMessage(
        error instanceof Error ? error.message : "Unable to load booking",
      ),
    );
  }, [range, slug]);
  async function book() {
    const response = await fetch(`/api/booking/${slug}/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt: selected,
        name,
        email,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const value = await response.json();
    if (!response.ok) {
      setMessage(value.message);
      return;
    }
    setMessage(
      value.status === "waitlisted"
        ? "That time filled, so you joined its waitlist."
        : value.paymentStatus === "required"
          ? "Time held. Complete payment to confirm it."
          : "Your booking is confirmed.",
    );
  }
  if (!appointment)
    return (
      <main className="grid min-h-dvh place-items-center bg-black text-zinc-500">
        {message || "Loading availability…"}
      </main>
    );
  return (
    <main className="min-h-dvh bg-black p-4 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <CalendarClock className="mx-auto text-[#1d9bf0]" />
          <p className="mt-4 text-xs font-black uppercase text-[#1d9bf0]">
            CreativesOS booking
          </p>
          <h1 className="mt-2 text-4xl font-black">{appointment.name}</h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-500">
            {appointment.description}
          </p>
          <p className="mt-4 font-bold">
            {appointment.durationMinutes} minutes ·{" "}
            {appointment.priceCents
              ? `$${(appointment.priceCents / 100).toFixed(2)}`
              : "Free"}
          </p>
        </header>
        <div className="mt-5 grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Choose a time</h2>
            <div className="mt-4 grid max-h-[420px] gap-2 overflow-y-auto sm:grid-cols-2">
              {slots.map((slot) => (
                <button
                  key={slot.startsAt}
                  className={`rounded-xl border p-3 text-left text-sm ${selected === slot.startsAt ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}
                  onClick={() => setSelected(slot.startsAt)}
                >
                  <strong>
                    {new Date(slot.startsAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </strong>
                  <p className="text-zinc-500">
                    {new Date(slot.startsAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {slot.remaining} left
                  </p>
                </button>
              ))}
            </div>
            {!slots.length && (
              <p className="mt-4 text-sm text-zinc-500">
                No available times in the next 14 days.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Your details</h2>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              placeholder="Name"
              aria-label="Guest name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              placeholder="Email"
              type="email"
              aria-label="Guest email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              className="mt-3 w-full bg-[#1d9bf0] text-black"
              disabled={!selected || !name || !email}
              onClick={() => void book()}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Reserve time
            </Button>
            {message && (
              <p role="status" className="mt-3 text-xs text-zinc-400">
                {message}
              </p>
            )}
            {appointment.priceCents > 0 &&
              appointment.productId &&
              message.includes("payment") && (
                <Button
                  className="mt-2 w-full"
                  onClick={() => {
                    location.href = `/marketplace/product/${appointment.productId}`;
                  }}
                >
                  Complete payment
                </Button>
              )}
          </section>
        </div>
      </div>
    </main>
  );
}
