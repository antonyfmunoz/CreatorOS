import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type AudienceMessage = { id: string; authorName: string; body: string; kind: "comment" | "cta"; actionUrl: string | null; featured: boolean; createdAt: string };
type AudiencePayload = { session: { id: string; state: string }; messages: AudienceMessage[] };

export default function BroadcastAudiencePage() {
  const { id = "" } = useParams<{ id: string }>();
  const [payload, setPayload] = useState<AudiencePayload | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const response = await apiRequest("GET", `/api/broadcast/sessions/${id}/audience`);
    setPayload(await response.json() as AudiencePayload);
  };
  useEffect(() => {
    void load().catch(() => setError("This audience room is unavailable or the broadcast has ended."));
    const timer = window.setInterval(() => void load().catch(() => undefined), 2_000);
    return () => window.clearInterval(timer);
  }, [id]);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true); setError("");
    try { await apiRequest("POST", `/api/broadcast/sessions/${id}/audience/messages`, { body: body.trim() }); setBody(""); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your message could not be sent."); }
    finally { setBusy(false); }
  };
  if (!payload) return <main className="flex min-h-screen items-center justify-center bg-black text-white">{error || <Loader2 className="h-6 w-6 animate-spin"/>}</main>;
  const featured = payload.messages.find((message) => message.featured);
  return <main className="min-h-screen bg-black px-4 py-8 text-white"><section className="mx-auto max-w-xl">
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600"><MessageCircle className="h-5 w-5"/></span><div><h1 className="font-bold">Live audience room</h1><p className="text-xs text-zinc-500">Join the CreativesOS broadcast conversation.</p></div><span className="ml-auto rounded-full bg-red-950 px-2 py-1 text-[10px] font-bold uppercase text-red-300">{payload.session.state}</span></div>
      {featured && <div className="mt-4 rounded-2xl border border-[#1d9bf0]/50 bg-[#1d9bf0]/10 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-[#1d9bf0]">On screen now</p><p className="mt-1 font-bold">{featured.body}</p>{featured.kind === "cta" && featured.actionUrl && <a className="mt-2 inline-block text-sm font-bold text-[#1d9bf0] underline" href={featured.actionUrl} target="_blank" rel="noreferrer">Open link</a>}</div>}
      <div className="mt-5 flex gap-2"><input aria-label="Audience message" value={body} maxLength={500} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void send(); }} placeholder="Add to the live conversation" className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#1d9bf0]"/><Button aria-label="Send audience message" disabled={busy || !body.trim()} onClick={() => void send()}>{busy ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}</Button></div>{error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
    <div className="mt-4 space-y-2">{payload.messages.filter((message) => message.kind === "comment").map((message) => <article key={message.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><strong className="text-sm">{message.authorName}</strong>{message.featured && <span className="rounded bg-[#1d9bf0]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#1d9bf0]">On screen</span>}</div><p className="mt-1 text-sm leading-6 text-zinc-300">{message.body}</p></article>)}</div>
  </section></main>;
}
