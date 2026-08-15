import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarRange,
  ExternalLink,
  Radio,
  TicketCheck,
  UserCheck,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
type TicketType = {
  id: string;
  name: string;
  priceCents: number;
  capacity: number;
  replayAccessDays: number;
};
type Ticket = {
  id: string;
  holderName: string;
  holderEmail: string;
  quantity: number;
  status: string;
  ticketCode: string;
};
type EventData = {
  event: { id: string; name: string; dateTime: string };
  settings: {
    capacity: number;
    roomId: string | null;
    replayAssetId: string | null;
  } | null;
  occurrences: Array<{ id: string; startsAt: string }>;
  ticketTypes: TicketType[];
  tickets: Ticket[];
  waitlist: Array<{
    id: string;
    name: string;
    quantity: number;
    position: number;
    status: string;
  }>;
};
export default function EventOperationsPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [name, setName] = useState("General admission");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("100");
  const [message, setMessage] = useState("");
  const data = useQuery<EventData>({
    queryKey: [`/api/event-operations/events/${id}`],
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: [`/api/event-operations/events/${id}`],
    });
  const action = useMutation({
    mutationFn: async ({ path, body }: { path: string; body?: unknown }) =>
      (await apiRequest("POST", path, body)).json(),
    onSuccess: async () => {
      setMessage("Saved.");
      await refresh();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Action failed"),
  });
  async function createTicketType() {
    await action.mutateAsync({
      path: `/api/event-operations/events/${id}/ticket-types`,
      body: {
        name,
        description:
          "Event access, community room, and governed replay entitlement.",
        priceCents: Math.round(Number(price) * 100),
        currency: "usd",
        capacity: Number(capacity),
        salesStartAt: null,
        salesEndAt: null,
        maxPerBuyer: 10,
        replayAccessDays: 30,
      },
    });
  }
  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/business/booking")}
          >
            <ArrowLeft />
          </Button>
          <TicketCheck className="text-[#1d9bf0]" />
          <div>
            <h1 className="font-black">
              {data.data?.event.name || "Event control"}
            </h1>
            <p className="text-[10px] text-zinc-500">
              Ticket inventory, recurring dates, live room, check-in, waitlist,
              and replay
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
              label: "Ticket tiers",
              value: data.data?.ticketTypes.length ?? 0,
              Icon: TicketCheck,
            },
            {
              label: "Issued tickets",
              value: data.data?.tickets.length ?? 0,
              Icon: UserCheck,
            },
            {
              label: "Waiting",
              value:
                data.data?.waitlist.filter((x) => x.status === "waiting")
                  .length ?? 0,
              Icon: CalendarRange,
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
            <h2 className="font-black">Ticket inventory</h2>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              aria-label="Ticket tier name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input
                className="border-zinc-800 bg-black"
                aria-label="Ticket price dollars"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <Input
                className="border-zinc-800 bg-black"
                aria-label="Ticket capacity"
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <Button
              className="mt-3 w-full bg-[#1d9bf0] text-black"
              disabled={!name || !Number(capacity)}
              onClick={() => void createTicketType()}
            >
              Create ticket tier
            </Button>
            {data.data?.ticketTypes.map((ticket) => (
              <article key={ticket.id} className="mt-3 rounded-xl bg-black p-3">
                <strong className="text-sm">{ticket.name}</strong>
                <p className="text-xs text-zinc-500">
                  {ticket.priceCents
                    ? `$${(ticket.priceCents / 100).toFixed(2)}`
                    : "Free"}{" "}
                  · {ticket.capacity} capacity · {ticket.replayAccessDays}{" "}
                  replay days
                </p>
              </article>
            ))}
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Event access</h2>
            <p className="mt-1 text-xs text-zinc-500">
              The room uses CreativesOS community conferencing; external join
              links remain an optional provider adapter.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() =>
                action.mutate({
                  path: `/api/event-operations/events/${id}/room`,
                  body: {
                    recordingEnabled: true,
                    transcriptionEnabled: true,
                    aiAssistanceEnabled: true,
                  },
                })
              }
            >
              <Radio className="mr-2 h-4 w-4" />
              {data.data?.settings?.roomId
                ? "Create replacement room"
                : "Create event room"}
            </Button>
            <Button
              className="mt-2 w-full"
              variant="outline"
              onClick={() => window.open(`/events/${id}/tickets`, "_blank")}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open ticket page
            </Button>
            <Button
              className="mt-2 w-full"
              variant="outline"
              onClick={() =>
                action.mutate({
                  path: `/api/event-operations/events/${id}/series`,
                  body: {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    frequency: "weekly",
                    intervalCount: 1,
                    occurrenceCount: 4,
                  },
                })
              }
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              Materialize four weekly dates
            </Button>
            <Button
              className="mt-2 w-full"
              variant="ghost"
              onClick={() =>
                action.mutate({ path: "/api/event-operations/dispatch-due" })
              }
            >
              Dispatch due reminders
            </Button>
          </section>
        </div>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-black">Attendee operations</h2>
          {!data.data?.tickets.length && (
            <p className="mt-2 text-sm text-zinc-600">No tickets issued.</p>
          )}
          {data.data?.tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-black p-3"
            >
              <div className="min-w-0 flex-1">
                <strong className="text-sm">{ticket.holderName}</strong>
                <p className="truncate text-xs text-zinc-500">
                  {ticket.holderEmail} · {ticket.quantity} · {ticket.status} ·{" "}
                  {ticket.ticketCode}
                </p>
              </div>
              <Button
                size="sm"
                disabled={!["confirmed", "checked_in"].includes(ticket.status)}
                onClick={() =>
                  action.mutate({
                    path: `/api/event-operations/tickets/${ticket.id}/check-in`,
                  })
                }
              >
                <UserCheck className="mr-1 h-3 w-3" />
                Check in
              </Button>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
