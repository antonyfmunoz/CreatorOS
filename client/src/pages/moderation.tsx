import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ChevronLeft, ShieldAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

type ContentReport = { id: string; targetType: string; targetId: string; reason: string; details: string; status: "open" | "reviewing" | "resolved" | "dismissed"; createdAt: string };
const filters: Array<ContentReport["status"]> = ["open", "reviewing", "resolved", "dismissed"];

export default function ModerationPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<ContentReport["status"]>("open");
  const reportsQuery = useQuery<ContentReport[]>({ queryKey: ["/api/moderation/reports", status], enabled: user?.role === "admin", queryFn: async () => (await apiRequest("GET", `/api/moderation/reports?status=${status}`)).json() });
  const updateReport = useMutation({
    mutationFn: async ({ id, nextStatus }: { id: string; nextStatus: ContentReport["status"] }) => (await apiRequest("PATCH", `/api/moderation/reports/${id}`, { status: nextStatus })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/moderation/reports"] }); toast({ title: "Report updated" }); },
    onError: (error: Error) => toast({ title: "Could not update report", description: error.message, variant: "destructive" }),
  });

  if (user?.role !== "admin") return <main className="min-h-dvh bg-black px-6 py-6 text-white"><Button variant="ghost" className="-ml-3 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/profile")}><ChevronLeft className="mr-1 h-4 w-4" />Profile</Button><section className="mx-auto mt-28 max-w-sm text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900"><ShieldAlert className="h-6 w-6 text-zinc-400" /></span><h1 className="mt-5 text-xl font-bold">Moderation access required</h1><p className="mt-2 text-sm leading-6 text-zinc-500">This queue is available only to designated CreativesOS administrators.</p></section></main>;

  return <main className="min-h-dvh bg-black pb-24 text-white"><header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4"><Button variant="ghost" size="icon" className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/profile")} aria-label="Back to profile"><ChevronLeft className="h-5 w-5" /></Button><div><h1 className="text-lg font-bold">Trust &amp; safety</h1><p className="text-xs text-zinc-500">Review reports and preserve an accountable decision trail.</p></div></header><div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-zinc-800 bg-black px-4 py-3 [scrollbar-width:none]">{filters.map((filter) => <button key={filter} type="button" className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors ${status === filter ? "bg-white text-black" : "bg-zinc-900 text-zinc-400 hover:text-white"}`} onClick={() => setStatus(filter)}>{filter}</button>)}</div><section className="mx-auto max-w-2xl space-y-3 p-4">{reportsQuery.isLoading && <><Skeleton className="h-40 bg-zinc-900" /><Skeleton className="h-40 bg-zinc-900" /></>}{!reportsQuery.isLoading && (reportsQuery.data?.length ?? 0) === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-12 text-center"><ShieldAlert className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-4 text-sm font-semibold">No {status} reports</p><p className="mt-2 text-xs leading-5 text-zinc-500">New reports will appear here for a recorded review decision.</p></div>}{reportsQuery.data?.map((report) => <article key={report.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold capitalize">{report.targetType} report</p><p className="mt-1 text-xs text-zinc-500">Target #{report.targetId} · {new Date(report.createdAt).toLocaleString()}</p></div><span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-300">{report.status}</span></div><div className="mt-4 rounded-xl bg-black p-3"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Reason</p><p className="mt-1 text-sm text-zinc-200">{report.reason.replaceAll("_", " ")}</p>{report.details && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{report.details}</p>}</div><div className="mt-4 grid grid-cols-2 gap-2">{report.status !== "reviewing" && <Button variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" disabled={updateReport.isPending} onClick={() => updateReport.mutate({ id: report.id, nextStatus: "reviewing" })}>Mark reviewing</Button>}{report.status !== "resolved" && <Button className="bg-white text-black hover:bg-zinc-200" disabled={updateReport.isPending} onClick={() => updateReport.mutate({ id: report.id, nextStatus: "resolved" })}><Check className="mr-2 h-4 w-4" />Resolve</Button>}{report.status !== "dismissed" && <Button variant="outline" className="col-span-2 border-zinc-700 bg-black text-zinc-300 hover:bg-zinc-900 hover:text-white" disabled={updateReport.isPending} onClick={() => updateReport.mutate({ id: report.id, nextStatus: "dismissed" })}><X className="mr-2 h-4 w-4" />Dismiss report</Button>}</div></article>)}</section></main>;
}
