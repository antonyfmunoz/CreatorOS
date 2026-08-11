import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Download, FileCheck2, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PrivacySummary = {
  accountStatus: string;
  exportSchemaVersion: string;
  deletionGraceDays: number;
  confirmation: string;
  blockers: Array<{ kind: string; id: string; name: string; otherMemberCount: number; resolution: string }>;
  pendingRequest: null | { id: string; status: string; scheduledFor: string | null; failureCode: string | null };
};

export default function PrivacySettings() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmation, setConfirmation] = useState("");
  const summary = useQuery<PrivacySummary>({ queryKey: ["/api/privacy/summary"] });

  const scheduleDeletion = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/privacy/deletion-requests", { confirmation })).json(),
    onSuccess: async () => {
      setConfirmation("");
      await queryClient.invalidateQueries({ queryKey: ["/api/privacy/summary"] });
      toast({ title: "Deletion scheduled", description: `You have ${summary.data?.deletionGraceDays ?? 7} days to cancel. CreativesOS will not erase the account before that date.` });
    },
    onError: (error: Error) => toast({ title: "Deletion was not scheduled", description: error.message, variant: "destructive" }),
  });

  const cancelDeletion = useMutation({
    mutationFn: async (requestId: string) => (await apiRequest("DELETE", `/api/privacy/deletion-requests/${requestId}`)).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/privacy/summary"] });
      toast({ title: "Deletion canceled", description: "Your account and content will remain active." });
    },
    onError: (error: Error) => toast({ title: "Unable to cancel", description: error.message, variant: "destructive" }),
  });

  const pending = summary.data?.pendingRequest;
  const canSchedule = Boolean(summary.data && !pending && summary.data.blockers.length === 0 && confirmation === summary.data.confirmation);

  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/profile")} aria-label="Back to profile"><ArrowLeft className="h-5 w-5" /></Button>
        <div><h1 className="text-lg font-bold">Data &amp; privacy</h1><p className="text-xs text-zinc-400">Control your CreativesOS account data</p></div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900"><Download className="h-5 w-5 text-[#1d9bf0]" /></span><div className="min-w-0 flex-1"><h2 className="font-bold">Download your information</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Export your profile, content, authored messages, purchases, communities, studio records, automations, relationship data you control, and privacy history. Credentials and private storage locations are excluded.</p></div></div>
          <a href="/api/privacy/export" download className="mt-4 flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-bold text-black hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"><Download className="mr-2 h-4 w-4" />Download JSON export</a>
          <p className="mt-2 text-center text-xs text-zinc-400">{summary.data?.exportSchemaVersion ?? "Preparing export contract..."}</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setLocation("/trust")} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"><ShieldCheck className="h-5 w-5 text-emerald-400" /><p className="mt-3 text-sm font-bold">Trust center</p><p className="mt-1 text-xs leading-5 text-zinc-400">Security, consent, AI, recording, and moderation commitments.</p></button>
          <button type="button" onClick={() => setLocation("/legal/data-deletion")} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left hover:border-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"><FileCheck2 className="h-5 w-5 text-violet-300" /><p className="mt-3 text-sm font-bold">Deletion policy</p><p className="mt-1 text-xs leading-5 text-zinc-400">What is erased, retained, and pseudonymized.</p></button>
        </section>

        <section className="rounded-2xl border border-red-950 bg-red-950/10 p-5">
          <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-950/50"><Trash2 className="h-5 w-5 text-red-400" /></span><div><h2 className="font-bold">Delete your account</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Deletion is scheduled with a {summary.data?.deletionGraceDays ?? 7}-day cancellation period. Personal content and private assets are erased. Financial, safety, and integrity records that must remain are pseudonymized.</p></div></div>
          {summary.isLoading && <p className="mt-5 text-sm text-zinc-400">Checking account ownership...</p>}
          {summary.data?.blockers.map((blocker) => <div key={`${blocker.kind}:${blocker.id}`} className="mt-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3"><p className="flex items-center gap-2 text-sm font-bold text-amber-300"><AlertTriangle className="h-4 w-4" />Ownership transfer required</p><p className="mt-2 text-xs leading-5 text-zinc-400">{blocker.name} has {blocker.otherMemberCount} other active member{blocker.otherMemberCount === 1 ? "" : "s"}. {blocker.resolution}</p></div>)}
          {pending ? <div className="mt-5 rounded-xl border border-red-900/60 bg-black p-4"><p className="text-sm font-bold capitalize">Deletion {pending.status.replaceAll("_", " ")}</p>{pending.scheduledFor && <p className="mt-2 text-xs leading-5 text-zinc-400">Scheduled for {new Date(pending.scheduledFor).toLocaleString()}. You can cancel until processing begins.</p>}{pending.failureCode && <p className="mt-2 text-xs text-red-300">{pending.failureCode}</p>}{["scheduled", "blocked", "failed"].includes(pending.status) && <Button variant="outline" className="mt-4 w-full border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" onClick={() => cancelDeletion.mutate(pending.id)} disabled={cancelDeletion.isPending}>Cancel deletion</Button>}</div> : <div className="mt-5"><label htmlFor="delete-confirmation" className="text-xs font-bold text-zinc-300">Type <span className="font-mono text-red-300">{summary.data?.confirmation ?? "DELETE username"}</span></label><Input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} className="mt-2 border-red-950 bg-black font-mono text-white" placeholder={summary.data?.confirmation ?? "DELETE username"} /><Button className="mt-3 w-full bg-red-600 font-bold text-white hover:bg-red-500" disabled={!canSchedule || scheduleDeletion.isPending} onClick={() => scheduleDeletion.mutate()}><Trash2 className="mr-2 h-4 w-4" />Schedule account deletion</Button></div>}
        </section>
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-5 text-zinc-400"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />Exports require your active session and are never cached. Deletion requests are rechecked for ownership conflicts immediately before execution.</div>
      </div>
    </main>
  );
}
