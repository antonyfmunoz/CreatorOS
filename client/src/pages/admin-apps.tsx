import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppWindow, Check, ChevronLeft, ShieldAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type PendingApp = {
  id: string;
  name: string;
  clientId: string;
  description: string;
  homepageUrl: string;
  privacyUrl: string;
  termsUrl: string;
  scopes: string[];
  reviewStatus: "pending";
  createdAt: string;
};

export default function AdminAppsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const apps = useQuery<PendingApp[]>({
    queryKey: ["/api/admin/developer/apps"],
    enabled: user?.role === "admin",
  });
  const review = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      apiRequest("POST", `/api/admin/developer/apps/${id}/review`, {
        decision,
        note: notes[id]?.trim() || (decision === "approved" ? "Platform review approved" : "Platform review rejected"),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/developer/apps"] });
      toast({ title: "App review recorded" });
    },
    onError: (error: Error) =>
      toast({ title: "Review failed", description: error.message, variant: "destructive" }),
  });

  if (user?.role !== "admin") {
    return <main className="min-h-dvh bg-black px-6 py-6 text-white"><Button variant="ghost" className="-ml-3 text-zinc-400" onClick={() => setLocation("/profile")}><ChevronLeft className="mr-1 h-4 w-4" />Profile</Button><section className="mx-auto mt-28 max-w-sm text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900"><ShieldAlert className="h-6 w-6 text-zinc-400" /></span><h1 className="mt-5 text-xl font-bold">Platform review access required</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Only designated CreativesOS administrators can approve public integrations.</p></section></main>;
  }

  return <main className="min-h-dvh bg-black pb-24 text-white"><header className="flex min-h-16 items-center gap-2 border-b border-zinc-800 px-4"><Button variant="ghost" size="icon" className="-ml-2 text-zinc-400" onClick={() => setLocation("/moderation")} aria-label="Back to trust and safety"><ChevronLeft className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><h1 className="text-lg font-bold">App review</h1><p className="truncate text-xs text-zinc-500">Scopes, disclosures and public marketplace governance</p></div><AppWindow className="h-5 w-5 text-sky-400" /></header><section className="mx-auto max-w-3xl space-y-4 p-4">{apps.isLoading && <><Skeleton className="h-72 bg-zinc-900" /><Skeleton className="h-72 bg-zinc-900" /></>}{apps.isError && <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-5 text-sm text-red-200">{apps.error.message}</div>}{!apps.isLoading && !apps.isError && !apps.data?.length && <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-16 text-center"><Check className="mx-auto h-7 w-7 text-emerald-500" /><p className="mt-4 font-bold">Review queue is clear</p><p className="mt-2 text-sm text-zinc-500">Submitted apps remain private until an administrator records a decision.</p></div>}{apps.data?.map((app) => <article key={app.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div className="min-w-0"><h2 className="text-lg font-bold">{app.name}</h2><p className="mt-1 truncate font-mono text-[11px] text-zinc-600">{app.clientId}</p></div><span className="self-start rounded-full border border-amber-800/60 bg-amber-950/30 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">Pending</span></div><p className="mt-4 text-sm leading-6 text-zinc-300">{app.description}</p><div className="mt-4 flex flex-wrap gap-2">{app.scopes.map((scope) => <span key={scope} className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold text-zinc-400">{scope}</span>)}</div><dl className="mt-5 grid gap-3 text-xs sm:grid-cols-3">{[["Homepage", app.homepageUrl], ["Privacy", app.privacyUrl], ["Terms", app.termsUrl]].map(([label, url]) => <div key={label} className="min-w-0 rounded-xl border border-zinc-800 bg-black p-3"><dt className="font-bold text-zinc-500">{label}</dt><dd className="mt-1 truncate"><a className="text-sky-400 hover:underline" href={url} target="_blank" rel="noreferrer">{url}</a></dd></div>)}</dl><label className="mt-5 block text-xs font-bold text-zinc-400">Decision note<Textarea className="mt-2 min-h-24 border-zinc-800 bg-black text-white" value={notes[app.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [app.id]: event.target.value }))} placeholder="Record scope, policy and disclosure findings" /></label><div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="border-red-900 bg-black text-red-300 hover:bg-red-950" disabled={review.isPending} onClick={() => review.mutate({ id: app.id, decision: "rejected" })}><X className="mr-2 h-4 w-4" />Reject</Button><Button className="bg-white text-black hover:bg-zinc-200" disabled={review.isPending} onClick={() => review.mutate({ id: app.id, decision: "approved" })}><Check className="mr-2 h-4 w-4" />Approve</Button></div></article>)}</section></main>;
}
