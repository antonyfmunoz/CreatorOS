import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Columns3,
  History,
  Layers3,
  List,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Approval = { id: string; status: string };
type WorkEvent = { id: string; eventType: string; createdAt: string; fromStatus: string | null; toStatus: string | null };
type Item = {
  id: string;
  parentWorkItemId: string | null;
  title: string;
  description: string;
  kind: string;
  status: string;
  priority: number;
  channel: string | null;
  startsAt: string | null;
  dueAt: string | null;
  version: number;
  missed: boolean;
  sourceType: string | null;
  dependencies: Array<{ id: string }>;
  approvals: Approval[];
};
type ItemDetail = Item & { events: WorkEvent[]; children: Item[]; dependents: Array<{ id: string }> };
type PlannerView = "board" | "list" | "calendar";

const lanes = ["idea", "brief", "script", "production", "edit", "review", "scheduled", "published", "retrospective"];
const next: Record<string, string> = { idea: "brief", brief: "script", script: "production", production: "edit", edit: "review", review: "scheduled", scheduled: "published", published: "retrospective" };

function dueLabel(item: Item) {
  return item.dueAt ? new Date(item.dueAt).toLocaleString() : "No due date";
}

export default function ProductionPlannerPage() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("content");
  const [dueAt, setDueAt] = useState("");
  const [recurrence, setRecurrence] = useState("none");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<PlannerView>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery<Item[]>({
    queryKey: ["/api/planning/calendar"],
    queryFn: async () => (await apiRequest("GET", "/api/planning/calendar")).json(),
  });
  const detail = useQuery<ItemDetail>({
    queryKey: ["/api/planning/items", selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => (await apiRequest("GET", `/api/planning/items/${selectedId}`)).json(),
  });
  const items = query.data ?? [];
  const calendarGroups = useMemo(() => {
    const groups = new Map<string, Item[]>();
    for (const item of items) {
      const key = item.dueAt ? new Date(item.dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Unscheduled";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [items]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/planning/calendar"] });
    if (selectedId) await queryClient.invalidateQueries({ queryKey: ["/api/planning/items", selectedId] });
  };
  async function create() {
    if (!title.trim()) return;
    setBusy("create"); setMessage("");
    try {
      await apiRequest("POST", "/api/planning/items", { title: title.trim(), kind, status: "idea", dueAt: dueAt ? new Date(`${dueAt}T17:00:00`).toISOString() : null, recurrence: recurrence === "none" ? {} : { frequency: recurrence, interval: 1, occurrences: 4 } });
      setTitle(""); setDueAt(""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Work could not be created"); }
    finally { setBusy(""); }
  }
  async function advance(item: Item) {
    const status = next[item.status]; if (!status) return;
    setBusy(item.id); setMessage("");
    try { await apiRequest("POST", `/api/planning/items/${item.id}/status`, { status, version: item.version }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Work could not advance"); }
    finally { setBusy(""); }
  }
  async function recover(item: Item) {
    setBusy(item.id); setMessage("");
    try { const tomorrow = new Date(Date.now() + 86_400_000); tomorrow.setHours(17, 0, 0, 0); await apiRequest("POST", `/api/planning/items/${item.id}/recover`, { action: "reschedule", dueAt: tomorrow.toISOString(), note: "Rescheduled from the production planner" }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Missed work could not be recovered"); }
    finally { setBusy(""); }
  }
  async function requestApproval(item: Item) {
    setBusy(item.id); setMessage("");
    try { await apiRequest("POST", `/api/planning/items/${item.id}/approvals`, { note: "Requested from the production planner" }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Approval could not be requested"); }
    finally { setBusy(""); }
  }
  async function addVariant(item: Item) {
    const channel = window.prompt("Channel for this variant (for example YouTube, Instagram, Newsletter)")?.trim(); if (!channel) return;
    setBusy(item.id); setMessage("");
    try { await apiRequest("POST", `/api/planning/items/${item.id}/variants`, { variants: [{ channel }] }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Channel variant could not be created"); }
    finally { setBusy(""); }
  }

  function card(item: Item) {
    return <article key={item.id} className={`rounded-xl border p-3 ${item.missed ? "border-amber-700 bg-amber-950/20" : item.sourceType === "benchmark_remediation" ? "border-red-800 bg-red-950/20" : "border-zinc-800 bg-black"}`}>
      <button type="button" onClick={() => setSelectedId(item.id)} className="flex w-full items-start gap-2 text-left" aria-label={`Open ${item.title}`}>
        {item.missed || item.sourceType === "benchmark_remediation" ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400"/> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-zinc-700"/>}
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold">{item.title}</span><span className="mt-1 block text-[9px] uppercase text-zinc-600">{item.kind}{item.channel ? ` · ${item.channel}` : ""}{item.sourceType ? ` · synced ${item.sourceType}` : ""}</span></span>
      </button>
      <p className="mt-2 text-[10px] text-zinc-500">{dueLabel(item)}</p>
      {item.approvals[0] && <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400"><ShieldCheck className="h-3 w-3"/>Approval: {item.approvals[0].status}</p>}
      <div className="mt-3 grid grid-cols-2 gap-1">
        {item.missed && <Button size="sm" variant="outline" className="h-7 text-[9px]" disabled={busy === item.id} onClick={() => void recover(item)}><RefreshCw className="mr-1 h-3 w-3"/>Recover</Button>}
        <Button size="sm" variant="ghost" className="h-7 text-[9px]" disabled={busy === item.id} onClick={() => void addVariant(item)}><Layers3 className="mr-1 h-3 w-3"/>Variant</Button>
        {item.status === "review" && item.sourceType !== "benchmark_remediation" && !item.approvals.some((approval) => approval.status === "pending") && <Button size="sm" variant="ghost" className="h-7 text-[9px]" disabled={busy === item.id} onClick={() => void requestApproval(item)}><ShieldCheck className="mr-1 h-3 w-3"/>Approval</Button>}
      </div>
      {next[item.status] && !(item.sourceType === "benchmark_remediation" && item.status === "review") && <Button size="sm" variant="outline" className="mt-2 h-7 w-full text-[10px]" disabled={busy === item.id} onClick={() => void advance(item)}>Move to {next[item.status]}</Button>}
      {item.sourceType === "benchmark_remediation" && item.status === "review" && <p className="mt-2 text-[10px] text-amber-300">Waiting for a passing locked retest</p>}
    </article>;
  }

  return <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95"><div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4"><Button variant="ghost" size="icon" onClick={() => setLocation("/business")} aria-label="Back to business"><ArrowLeft className="h-5 w-5"/></Button><div className="flex-1"><h1 className="font-black">Production planner</h1><p className="text-[10px] text-zinc-500">One operating plan across every creative instrument</p></div><CalendarDays className="h-5 w-5 text-[#1d9bf0]"/></div></header>
    <div className="mx-auto max-w-7xl p-4">
      <section className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:grid-cols-[1fr_140px_140px_150px_auto]"><Input aria-label="Work title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to ship?" className="border-zinc-800 bg-black"/><select aria-label="Work type" value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-md border border-zinc-800 bg-black px-2 text-xs">{["content","campaign","broadcast","cut","ugc","distribution","event","podcast","design","newsletter","site","product_gap"].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="rounded-md border border-zinc-800 bg-black px-2 text-xs"><option value="none">One time</option><option value="daily">Daily ×4</option><option value="weekly">Weekly ×4</option><option value="monthly">Monthly ×4</option></select><Input aria-label="Due date" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="border-zinc-800 bg-black"/><Button onClick={() => void create()} disabled={!title.trim() || busy === "create"} className="bg-[#1d9bf0] text-black"><Plus className="mr-1 h-4 w-4"/>Add work</Button></section>
      <div className="mt-3 flex items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-1" role="group" aria-label="Planner view">{([{ id: "board", label: "Board", icon: Columns3 }, { id: "list", label: "List", icon: List }, { id: "calendar", label: "Calendar", icon: CalendarDays }] as const).map(({ id, label, icon: Icon }) => <Button key={id} size="sm" variant="ghost" aria-pressed={view === id} onClick={() => setView(id)} className={view === id ? "bg-zinc-800 text-white" : "text-zinc-500"}><Icon className="mr-1 h-3.5 w-3.5"/>{label}</Button>)}</div><p className="text-[10px] text-zinc-600">{items.length} work items</p></div>
      {message && <p role="alert" className="mt-3 rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200">{message}</p>}
      {query.isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin"/></div> : view === "board" ? <div className="mt-4 flex gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{lanes.map((lane) => <section key={lane} className="w-64 shrink-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{lane}</h2><div className="mt-3 space-y-2">{items.filter((item) => item.status === lane).map(card)}{!items.some((item) => item.status === lane) && <p className="py-6 text-center text-[10px] text-zinc-700">No work</p>}</div></section>)}</div> : view === "list" ? <section className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><div className="hidden grid-cols-[1fr_120px_140px_160px] gap-3 border-b border-zinc-800 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-600 sm:grid"><span>Work</span><span>Status</span><span>Type</span><span>Due</span></div>{items.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="grid w-full gap-1 border-b border-zinc-900 px-4 py-3 text-left last:border-0 sm:grid-cols-[1fr_120px_140px_160px] sm:items-center sm:gap-3"><span className="text-xs font-bold">{item.title}</span><span className="text-[10px] uppercase text-[#1d9bf0]">{item.status}</span><span className="text-[10px] uppercase text-zinc-500">{item.kind}</span><span className="text-[10px] text-zinc-500">{dueLabel(item)}</span></button>)}</section> : <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{calendarGroups.map(([date, group]) => <section key={date} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><h2 className="text-xs font-black">{date}</h2><div className="mt-3 space-y-2">{group.map(card)}</div></section>)}</div>}
    </div>
    {selectedId && <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-black p-5 shadow-2xl" aria-label="Work item details"><div className="flex items-center justify-between"><h2 className="font-black">Work details</h2><Button size="icon" variant="ghost" onClick={() => setSelectedId(null)} aria-label="Close work details"><X className="h-5 w-5"/></Button></div>{detail.isLoading ? <div className="grid min-h-48 place-items-center"><Loader2 className="animate-spin"/></div> : detail.data ? <div className="mt-5"><p className="text-lg font-black">{detail.data.title}</p><p className="mt-2 text-sm text-zinc-400">{detail.data.description || "No description yet."}</p><dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs"><div><dt className="text-zinc-600">Status</dt><dd className="mt-1 uppercase text-[#1d9bf0]">{detail.data.status}</dd></div><div><dt className="text-zinc-600">Version</dt><dd className="mt-1">{detail.data.version}</dd></div><div><dt className="text-zinc-600">Children</dt><dd className="mt-1">{detail.data.children.length}</dd></div><div><dt className="text-zinc-600">Dependencies</dt><dd className="mt-1">{detail.data.dependencies.length}</dd></div></dl><h3 className="mt-6 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500"><History className="h-4 w-4"/>History</h3><div className="mt-3 space-y-2">{detail.data.events.map((event) => <div key={event.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><p className="text-xs font-bold">{event.eventType.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] text-zinc-600">{new Date(event.createdAt).toLocaleString()}{event.fromStatus && event.toStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ""}</p></div>)}</div></div> : <p className="mt-6 text-sm text-zinc-500">Work details are unavailable.</p>}</aside>}
  </main>;
}
