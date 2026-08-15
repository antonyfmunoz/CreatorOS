import { useEffect, useState } from "react";
import { CalendarDays, TicketCheck } from "lucide-react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type TicketType = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  capacity: number;
  maxPerBuyer: number;
  productId: number | null;
};
type Payload = {
  event: {
    id: string;
    name: string;
    description: string;
    dateTime: string;
    location: string;
  };
  settings: { timezone: string; capacity: number } | null;
  ticketTypes: TicketType[];
};
export default function EventTicketingPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [paymentProduct, setPaymentProduct] = useState<number | null>(null);
  useEffect(() => {
    void fetch(`/api/public/events/${id}/tickets`)
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw new Error(value.message);
        setData(value);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Event unavailable",
        ),
      );
  }, [id]);
  async function claim(ticket: TicketType) {
    const response = await fetch(
      `/api/event-operations/ticket-types/${ticket.id}/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, quantity: Number(quantity) }),
      },
    );
    const value = await response.json();
    if (!response.ok) {
      setMessage(value.message);
      return;
    }
    if (value.status === "waitlisted")
      setMessage("The event is full. You are on the waitlist.");
    else if (value.paymentStatus === "required") {
      setPaymentProduct(value.productId);
      setMessage("Ticket held. Complete payment to confirm access.");
    } else setMessage("Your ticket is confirmed.");
  }
  if (!data)
    return (
      <main className="grid min-h-dvh place-items-center bg-black text-zinc-500">
        {message || "Loading event…"}
      </main>
    );
  return (
    <main className="min-h-dvh bg-black p-4 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <CalendarDays className="mx-auto text-[#1d9bf0]" />
          <p className="mt-4 text-xs font-black uppercase text-[#1d9bf0]">
            CreativesOS event
          </p>
          <h1 className="mt-2 text-4xl font-black">{data.event.name}</h1>
          <p className="mx-auto mt-3 max-w-xl text-zinc-500">
            {data.event.description}
          </p>
          <p className="mt-4 font-bold">
            {new Date(data.event.dateTime).toLocaleString()} ·{" "}
            {data.event.location}
          </p>
        </header>
        <div className="mt-5 grid gap-5 md:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Attendee details</h2>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              aria-label="Ticket quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {message && (
              <p role="status" className="mt-3 text-xs text-zinc-400">
                {message}
              </p>
            )}
            {paymentProduct && (
              <Button
                className="mt-3 w-full bg-[#1d9bf0] text-black"
                onClick={() => {
                  location.href = `/marketplace/product/${paymentProduct}`;
                }}
              >
                Complete payment
              </Button>
            )}
          </section>
          <section className="space-y-3">
            {data.ticketTypes.map((ticket) => (
              <article
                key={ticket.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black">{ticket.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {ticket.description}
                    </p>
                    <p className="mt-3 text-xs text-zinc-600">
                      Capacity {ticket.capacity} · max {ticket.maxPerBuyer} per
                      buyer
                    </p>
                  </div>
                  <strong className="text-xl">
                    {ticket.priceCents
                      ? `$${(ticket.priceCents / 100).toFixed(2)}`
                      : "Free"}
                  </strong>
                </div>
                <Button
                  className="mt-4 w-full"
                  disabled={!name || !email}
                  onClick={() => void claim(ticket)}
                >
                  <TicketCheck className="mr-2 h-4 w-4" />
                  Claim ticket
                </Button>
              </article>
            ))}
            {!data.ticketTypes.length && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-500">
                Tickets have not opened yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
