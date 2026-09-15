import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarPlus,
  ExternalLink,
  FileText,
  Lightbulb,
  Send,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Source = { label: string; url: string };
type Competitor = {
  name: string;
  platform: string;
  url?: string;
  observation: string;
};
type Brief = {
  id: string;
  topic: string;
  audience: string;
  objective: string;
  angle: string;
  workingTitle: string;
  draftText: string;
  sources: Source[];
  competitors: Competitor[];
  updatedAt: string;
};

type Form = Omit<Brief, "id" | "updatedAt">;
const initialForm: Form = {
  topic: "",
  audience: "",
  objective: "",
  angle: "",
  workingTitle: "",
  draftText: "",
  sources: [],
  competitors: [],
};

function sourceLines(value: string): Source[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url] = line.split("|").map((part) => part.trim());
      return { label: url ? label : label, url: url || label };
    });
}

function competitorLines(value: string): Competitor[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = "", platform = "", url = "", observation = ""] = line
        .split("|")
        .map((part) => part.trim());
      return { name, platform, url, observation };
    });
}

function suggestedDraft(form: Form) {
  const title = form.workingTitle || form.topic;
  const angle = form.angle || form.objective;
  return [
    title && `${title}`,
    angle && `\n${angle}`,
    form.audience && `\nBuilt for ${form.audience}.`,
    "\nWhat is your experience with this?",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function ContentResearchPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(initialForm);
  const [sourceText, setSourceText] = useState("");
  const [competitorText, setCompetitorText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const research = useQuery<Brief[]>({
    queryKey: ["/api/content-research"],
    queryFn: async () => (await apiRequest("GET", "/api/content-research")).json(),
  });
  const selected = useMemo(
    () => research.data?.find((brief) => brief.id === selectedId) ?? null,
    [research.data, selectedId],
  );
  const save = useMutation({
    mutationFn: async (next: Form) =>
      (
        await apiRequest("POST", "/api/content-research", next)
      ).json() as Promise<Brief>,
    onSuccess: (brief) => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-research"] });
      setSelectedId(brief.id);
      setForm(initialForm);
      setSourceText("");
      setCompetitorText("");
      toast({ title: "Research brief saved", description: "It is ready to turn into a draft or a calendar item." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not save research", description: error.message, variant: "destructive" }),
  });
  const plan = useMutation({
    mutationFn: async (briefId: string) =>
      (await apiRequest("POST", `/api/content-research/${briefId}/plan`, {})).json(),
    onSuccess: () => {
      toast({ title: "Added to your content calendar", description: "The research brief now appears as an idea in the production planner." });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/calendar"] });
    },
    onError: (error: Error) =>
      toast({ title: "Could not add to calendar", description: error.message, variant: "destructive" }),
  });

  const update = (
    field: "topic" | "audience" | "objective" | "angle" | "workingTitle" | "draftText",
    value: string,
  ) =>
    setForm((current) => ({ ...current, [field]: value }));
  const openDraft = (brief: Brief) => {
    const draft = brief.draftText || suggestedDraft(brief);
    setLocation(`/distribution?content=${encodeURIComponent(draft)}&format=Text`);
  };
  const selectedSourceText = selected?.sources
    .map((source) => `${source.label} | ${source.url}`)
    .join("\n") ?? "";
  const selectedCompetitorText = selected?.competitors
    .map((competitor) => `${competitor.name} | ${competitor.platform} | ${competitor.url ?? ""} | ${competitor.observation}`)
    .join("\n") ?? "";

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/95">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/distribution")} aria-label="Back to distribution studio">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="font-black">Content research</h1>
            <p className="text-[10px] text-zinc-500">Evidence → angle → draft → calendar → distribution</p>
          </div>
          <Button size="sm" variant="outline" className="border-zinc-700 bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/business/benchmarks")}>
            Product benchmarks
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#1d9bf0]/10 p-2 text-[#1d9bf0]"><Lightbulb className="h-5 w-5" /></div>
            <div><h2 className="font-black">Research a content opportunity</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Capture source-backed observations and competitor patterns. This stays private until you intentionally create a draft or publishing job.</p></div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input aria-label="Research topic" value={form.topic} onChange={(event) => update("topic", event.target.value)} placeholder="Topic or opportunity" className="border-zinc-800 bg-black" />
            <Input aria-label="Audience" value={form.audience} onChange={(event) => update("audience", event.target.value)} placeholder="Audience" className="border-zinc-800 bg-black" />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Textarea aria-label="Objective" value={form.objective} onChange={(event) => update("objective", event.target.value)} placeholder="What should this content accomplish?" className="min-h-24 border-zinc-800 bg-black" />
            <Textarea aria-label="Distinctive angle" value={form.angle} onChange={(event) => update("angle", event.target.value)} placeholder="Your differentiated take, evidence, or hook" className="min-h-24 border-zinc-800 bg-black" />
          </div>
          <Input aria-label="Working title" value={form.workingTitle} onChange={(event) => update("workingTitle", event.target.value)} placeholder="Working title or hook" className="mt-3 border-zinc-800 bg-black" />
          <Textarea aria-label="Draft seed" value={form.draftText} onChange={(event) => update("draftText", event.target.value)} placeholder="Optional draft seed. Leave blank to start from your topic and angle in the composer." className="mt-3 min-h-32 border-zinc-800 bg-black" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-bold text-zinc-300">Evidence sources</label><p className="mt-1 text-[10px] text-zinc-600">One per line: Label | https://source.example</p><Textarea aria-label="Evidence sources" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="YouTube Trends | https://..." className="mt-2 min-h-28 border-zinc-800 bg-black text-xs" /></div>
            <div><label className="text-xs font-bold text-zinc-300">Competitor observations</label><p className="mt-1 text-[10px] text-zinc-600">One per line: Name | Platform | URL | observation</p><Textarea aria-label="Competitor observations" value={competitorText} onChange={(event) => setCompetitorText(event.target.value)} placeholder="Creator name | YouTube | https://... | Strong hook, weak CTA" className="mt-2 min-h-28 border-zinc-800 bg-black text-xs" /></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><Button className="bg-[#1d9bf0] text-black hover:bg-[#1a8cd8]" disabled={!form.topic.trim() || save.isPending} onClick={() => save.mutate({ ...form, sources: sourceLines(sourceText), competitors: competitorLines(competitorText) })}>{save.isPending ? "Saving…" : <><BookOpenCheck className="mr-2 h-4 w-4" />Save research brief</>}</Button><Button variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" disabled={!form.topic.trim()} onClick={() => setForm((current) => ({ ...current, draftText: current.draftText || suggestedDraft(current) }))}><Sparkles className="mr-2 h-4 w-4" />Build a draft seed</Button></div>
        </section>

        <aside className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-black">Your research board</h2>
          <p className="mt-1 text-xs text-zinc-500">{research.data?.length ?? 0} saved brief{(research.data?.length ?? 0) === 1 ? "" : "s"}</p>
          <div className="mt-4 space-y-2">{research.isLoading ? <p className="text-xs text-zinc-500">Loading research…</p> : research.data?.length ? research.data.map((brief) => <button key={brief.id} type="button" onClick={() => setSelectedId(brief.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === brief.id ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black hover:border-zinc-600"}`}><p className="line-clamp-2 text-sm font-bold">{brief.workingTitle || brief.topic}</p><p className="mt-1 text-[10px] text-zinc-500">{brief.sources.length} source{brief.sources.length === 1 ? "" : "s"} · {brief.competitors.length} competitor note{brief.competitors.length === 1 ? "" : "s"}</p></button>) : <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-xs leading-5 text-zinc-600">Your saved research will become the evidence layer for your distribution plan.</p>}</div>
        </aside>
      </div>

      {selected && <section className="mx-auto max-w-6xl px-4 pb-8"><div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#1d9bf0]">Selected brief</p><h2 className="mt-1 text-xl font-black">{selected.workingTitle || selected.topic}</h2><p className="mt-2 max-w-3xl text-sm text-zinc-400">{selected.angle || selected.objective || "No angle captured yet."}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" disabled={plan.isPending} onClick={() => plan.mutate(selected.id)}><CalendarPlus className="mr-2 h-4 w-4" />{plan.isPending ? "Adding…" : "Add to calendar"}</Button><Button className="bg-white text-black hover:bg-zinc-200" onClick={() => openDraft(selected)}><Send className="mr-2 h-4 w-4" />Open in composer</Button></div></div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div><h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Evidence</h3><div className="mt-2 space-y-2">{selected.sources.length ? selected.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black px-3 py-2 text-xs hover:border-zinc-600"><span className="truncate">{source.label}</span><ExternalLink className="h-3.5 w-3.5 text-zinc-500" /></a>) : <p className="text-xs text-zinc-600">No source links yet.</p>}</div></div><div><h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Competitor observations</h3><div className="mt-2 space-y-2">{selected.competitors.length ? selected.competitors.map((competitor, index) => <div key={`${competitor.name}-${index}`} className="rounded-lg border border-zinc-800 bg-black p-3"><p className="text-xs font-bold">{competitor.name}{competitor.platform ? ` · ${competitor.platform}` : ""}</p><p className="mt-1 text-xs text-zinc-500">{competitor.observation || "No observation added."}</p></div>) : <p className="text-xs text-zinc-600">No competitor observations yet.</p>}</div></div></div><details className="mt-5 rounded-xl border border-zinc-800 bg-black p-3"><summary className="cursor-pointer text-xs font-bold text-zinc-300">Research record</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><Textarea readOnly aria-label="Saved evidence sources" value={selectedSourceText} className="min-h-24 border-zinc-800 bg-zinc-950 text-xs text-zinc-400" /><Textarea readOnly aria-label="Saved competitor observations" value={selectedCompetitorText} className="min-h-24 border-zinc-800 bg-zinc-950 text-xs text-zinc-400" /></div></details><div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500"><FileText className="h-4 w-4" />Draft seed</div><p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{selected.draftText || suggestedDraft(selected)}</p></div></div></section>}
    </main>
  );
}
