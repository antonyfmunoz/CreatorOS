import { useLocation } from "wouter";
import { ArrowLeft, Bot, Database, FileCheck2, LockKeyhole, Mic2, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const commitments = [
  { icon: LockKeyhole, title: "Account and tenant boundaries", body: "Authentication is handled by Clerk. CreativesOS enforces local user, business, community, and role authority before protected data or actions are returned." },
  { icon: Database, title: "Private data and assets", body: "Private assets use short-lived authorized links. Account exports exclude credentials and private storage locations. Retention and erasure workflows are durable and auditable." },
  { icon: Bot, title: "Governed AI", body: "AI suggestions remain evidence-linked and reviewable. Agent authority, allowed actions, channel policy, consent, quotas, and required approvals are checked again when an action executes." },
  { icon: Mic2, title: "Recording and synthetic voice", body: "Recording, transcription, relationship context, and synthetic voice require the applicable role, consent, disclosure, and retention controls. A provider connection alone never grants permission." },
  { icon: Users, title: "Community safety", body: "Membership gates, moderation roles, content reports, review decisions, and audit evidence are enforced locally. Private communities are not viewable before a person joins." },
  { icon: FileCheck2, title: "Provider separation", body: "Messaging, payments, models, and media providers are adapters. They do not become CreativesOS' canonical identity, entitlement, consent, relationship, or audit database." },
];

export default function TrustCenter() {
  const [, setLocation] = useLocation();
  return <main className="min-h-dvh bg-black text-white">
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-800 bg-black px-4"><Button variant="ghost" size="icon" className="-ml-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" onClick={() => history.length > 1 ? history.back() : setLocation("/")} aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button><div><h1 className="text-lg font-bold">CreativesOS Trust Center</h1><p className="text-xs text-zinc-400">How the product protects people and their work</p></div></header>
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-black p-6 sm:p-8"><ShieldCheck className="h-9 w-9 text-emerald-400" /><h2 className="mt-5 text-2xl font-bold">Human authority remains primary.</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-300">CreativesOS combines publishing, community, commerce, relationships, automation, and AI. The product is designed so convenience does not silently replace consent, ownership, or accountable human decisions.</p></div>
      <section className="mt-5 grid gap-3 sm:grid-cols-2">{commitments.map(({ icon: Icon, title, body }) => <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><Icon className="h-5 w-5 text-[#1d9bf0]" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p></article>)}</section>
      <nav aria-label="Trust policies" className="mt-5 grid gap-2 sm:grid-cols-3"><button onClick={() => setLocation("/legal/data-deletion")} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold hover:bg-zinc-950">Data deletion</button><button onClick={() => setLocation("/legal/community-guidelines")} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold hover:bg-zinc-950">Community rules</button><button onClick={() => setLocation("/legal/ai-recording")} className="rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm font-bold hover:bg-zinc-950">AI &amp; recording</button></nav>
    </div>
  </main>;
}
