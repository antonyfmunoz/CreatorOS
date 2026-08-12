import { Check, Clock3, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

type PendingApproval = {
  approval: { id: string; reason: string; createdAt: string };
  command: { commandId: string; commandType: string; payload: Record<string, unknown>; createdAt: string };
};

function commandLabel(commandType: string) {
  return commandType === "creativesos.post.publish.v1" ? "Publish a post" : commandType.replaceAll(".", " ");
}

export default function UmhApprovalsPage() {
  const [, setLocation] = useLocation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const { data: approvals = [], isLoading } = useQuery<PendingApproval[]>({ queryKey: ["/api/umh/approvals"] });

  async function resolve(commandId: string, decision: "approved" | "rejected") {
    setResolvingId(commandId);
    try {
      const response = await fetch(`/api/umh/approvals/${commandId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error("Unable to resolve approval");
      await queryClient.invalidateQueries({ queryKey: ["/api/umh/approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/umh/operations"] });
    } finally {
      setResolvingId(null);
    }
  }

  return <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black px-4 py-4">
      <button className="text-xs font-bold text-zinc-400" onClick={() => setLocation("/business")}>Business</button>
      <div className="mt-2 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800"><ShieldCheck className="h-5 w-5" /></span><div><h1 className="text-xl font-bold">Operating approvals</h1><p className="mt-1 text-xs text-zinc-500">Review actions requested through your connected operating system.</p></div></div>
    </header>
    <section className="space-y-3 p-4">
      {isLoading && <div className="rounded-2xl border border-zinc-800 p-5 text-sm text-zinc-500">Loading approvals…</div>}
      {!isLoading && approvals.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-7 text-center"><Clock3 className="mx-auto h-6 w-6 text-zinc-600" /><p className="mt-3 text-sm font-bold">Nothing needs approval</p><p className="mt-1 text-xs leading-5 text-zinc-500">Drafts and planning may run automatically. Public or irreversible actions appear here first.</p></div>}
      {approvals.map(({ approval, command }) => {
        const content = typeof command.payload.content === "string" ? command.payload.content : null;
        const pending = resolvingId === command.commandId;
        return <article key={approval.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-800"><ShieldCheck className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-bold">{commandLabel(command.commandType)}</p><p className="mt-1 text-xs text-zinc-500">{approval.reason}</p>{content && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-black p-3 text-sm leading-6 text-zinc-200">{content}</p>}<p className="mt-3 text-[11px] text-zinc-600">Requested {new Date(command.createdAt).toLocaleString()}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" disabled={pending} className="rounded-xl border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" onClick={() => resolve(command.commandId, "rejected")}><X className="mr-2 h-4 w-4" />Decline</Button><Button disabled={pending} className="rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => resolve(command.commandId, "approved")}><Check className="mr-2 h-4 w-4" />Approve</Button></div></article>;
      })}
    </section>
  </main>;
}
