import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, ShieldCheck, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { providerActivationStages } from "@shared/provider-activation";

type Outcome = "passed" | "failed" | "blocked";
type Environment = "sandbox" | "staging" | "production";
type Evidence = { id: string; stage: string; outcome: Outcome; evidenceUrl: string | null; summary: string; createdAt: string; expiresAt: string | null };
type Qualification = { state: string; progressBps: number; qualifiable: boolean; passed: string[]; failed: string[]; blocked: string[]; expired: string[]; missing: string[] };
type Run = { id: string; provider: string; environment: Environment; status: "draft" | "qualified" | "abandoned"; summary: string; startedAt: string; completedAt: string | null; evidence: Evidence[]; qualification: Qualification };
type Definition = { id: string; group: string; label: string; description: string; requiredStages: readonly string[]; latestRuns: Run[] };
type ActivationResponse = { definitions: Definition[]; runs: Run[]; guarantees: Record<string, boolean> };

const title = (value: string) => value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
const stateClass = (state: string) => state === "qualified" ? "bg-emerald-500/15 text-emerald-300" : state === "failed" ? "bg-red-500/15 text-red-300" : state === "blocked" ? "bg-amber-500/15 text-amber-200" : "bg-zinc-800 text-zinc-400";

export default function ProviderActivationsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = useState("media_delivery");
  const [environment, setEnvironment] = useState<Environment>("production");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [stage, setStage] = useState<string>(providerActivationStages[0]);
  const [outcome, setOutcome] = useState<Outcome>("blocked");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const { data, isLoading } = useQuery<ActivationResponse>({ queryKey: ["/api/provider-activations"], queryFn: async () => (await apiRequest("GET", "/api/provider-activations")).json() });
  const providerRuns = useMemo(() => data?.runs.filter((run) => run.provider === providerId && run.environment === environment) ?? [], [data, providerId, environment]);
  const selectedRun = providerRuns.find((run) => run.id === selectedRunId) ?? providerRuns[0] ?? null;
  const selectedDefinition = data?.definitions.find((definition) => definition.id === providerId);
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ["/api/provider-activations"] }); };
  const startRun = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/provider-activations/${providerId}/runs`, { environment, summary: "" })).json() as Promise<Run>,
    onSuccess: async (run) => { setSelectedRunId(run.id); setMessage("Activation run started. Record durable evidence for each stage."); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to start run"),
  });
  const recordEvidence = useMutation({
    mutationFn: async () => {
      if (!selectedRun) throw new Error("Start or select an open run first");
      return apiRequest("POST", `/api/provider-activations/runs/${selectedRun.id}/evidence`, { stage, outcome, evidenceUrl: evidenceUrl.trim() || undefined, summary });
    },
    onSuccess: async () => { setEvidenceUrl(""); setSummary(""); setMessage(`${title(stage)} evidence recorded.`); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to record evidence"),
  });
  const completeRun = useMutation({
    mutationFn: async () => {
      if (!selectedRun) throw new Error("Select a run first");
      return apiRequest("POST", `/api/provider-activations/runs/${selectedRun.id}/complete`);
    },
    onSuccess: async () => { setMessage("Provider capability qualified against every required stage."); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to complete run"),
  });
  const abandonRun = useMutation({
    mutationFn: async () => {
      if (!selectedRun) throw new Error("Select a run first");
      return apiRequest("POST", `/api/provider-activations/runs/${selectedRun.id}/abandon`);
    },
    onSuccess: async () => { setMessage("Activation run closed as abandoned. Its evidence remains in the audit history."); await refresh(); },
    onError: (error) => setMessage(error instanceof Error ? error.message : "Unable to abandon run"),
  });

  const latestByStage = new Map<string, Evidence>();
  for (const item of selectedRun?.evidence ?? []) latestByStage.set(item.stage, item);

  return <main className="min-h-screen bg-black pb-24 text-white">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 px-4 py-4 backdrop-blur-xl"><div className="mx-auto flex max-w-7xl items-center gap-3"><button aria-label="Back" onClick={() => setLocation("/business")} className="rounded-full p-2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-lg font-black">Provider activation control plane</h1><p className="text-xs text-zinc-500">Evidence-led external capability qualification</p></div></div></header>
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="grid gap-3 md:grid-cols-3"><Guarantee icon={ShieldCheck} title="No credential theatre" body="A key existing never marks a provider ready." /><Guarantee icon={KeyRound} title="Secrets stay in custody" body="Never paste API keys or OAuth secrets into evidence." /><Guarantee icon={CheckCircle2} title="Every stage must pass" body="Qualification is derived, never manually asserted." /></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-black">Capability map</h2><span className="text-xs text-zinc-500">{data?.definitions.length ?? 22} providers</span></div>
          {isLoading ? <p className="text-sm text-zinc-500">Loading activation evidence…</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{data?.definitions.map((definition) => {
            const production = definition.latestRuns.find((run) => run.environment === "production");
            return <button key={definition.id} onClick={() => { setProviderId(definition.id); setEnvironment("production"); setSelectedRunId(null); setMessage(""); }} className={`rounded-2xl border p-4 text-left transition ${providerId === definition.id ? "border-sky-400/50 bg-sky-500/10" : "border-white/10 bg-zinc-950 hover:border-white/20"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600">{definition.group}</p><h3 className="mt-1 font-bold">{definition.label}</h3></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${stateClass(production?.qualification.state ?? "not_started")}`}>{production?.qualification.state.replace("_", " ") ?? "not started"}</span></div><p className="mt-2 text-xs leading-5 text-zinc-500">{definition.description}</p></button>;
          })}</div>}
        </div>
        <div className="space-y-4">
          <article className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-400">{selectedDefinition?.group}</p><h2 className="mt-1 text-xl font-black">{selectedDefinition?.label ?? "Provider"}</h2><p className="mt-2 max-w-2xl text-sm text-zinc-500">{selectedDefinition?.description}</p></div><div className="flex gap-2"><select aria-label="Activation environment" value={environment} onChange={(event) => { setEnvironment(event.target.value as Environment); setSelectedRunId(null); }} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm"><option value="sandbox">Sandbox</option><option value="staging">Staging</option><option value="production">Production</option></select><Button onClick={() => startRun.mutate()} disabled={startRun.isPending}>New run</Button></div></div>
            {providerRuns.length > 0 && <select aria-label="Activation run" value={selectedRun?.id ?? ""} onChange={(event) => setSelectedRunId(event.target.value)} className="mt-4 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm">{providerRuns.map((run) => <option key={run.id} value={run.id}>{new Date(run.startedAt).toLocaleString()} · {run.status} · {Math.round(run.qualification.progressBps / 100)}%</option>)}</select>}
            {!selectedRun ? <div className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">No {environment} run yet. Start one when the provider is ready to field-test.</div> : <><div className="mt-5 flex items-center justify-between"><div><p className="text-sm font-bold">{Math.round(selectedRun.qualification.progressBps / 100)}% current passing evidence</p><p className="text-xs text-zinc-500">Run is {selectedRun.status}; current evidence is {selectedRun.qualification.state.replace("_", " ")}.</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${stateClass(selectedRun.qualification.state)}`}>{selectedRun.qualification.state.replace("_", " ")}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900"><div className="h-full bg-sky-400 transition-all" style={{ width: `${selectedRun.qualification.progressBps / 100}%` }} /></div></>}
          </article>

          {selectedRun && <article className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><h3 className="font-black">Acceptance stages</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{providerActivationStages.map((requiredStage) => { const item = latestByStage.get(requiredStage); const expired = item?.expiresAt && new Date(item.expiresAt) <= new Date(); return <div key={requiredStage} className="rounded-xl border border-white/5 bg-black p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold">{title(requiredStage)}</p>{item?.outcome === "passed" && !expired ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : item?.outcome === "failed" ? <XCircle className="h-4 w-4 text-red-400" /> : <span className="text-[9px] font-black uppercase text-zinc-600">{expired ? "expired" : item?.outcome ?? "missing"}</span>}</div>{item && <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-zinc-600">{item.summary}</p>}</div>; })}</div></article>}

          {selectedRun?.status === "draft" && <article className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><h3 className="font-black">Append field-test evidence</h3><p className="mt-1 text-xs text-zinc-500">References must be durable HTTPS pages without tokens, query strings, or fragments.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><select aria-label="Evidence stage" value={stage} onChange={(event) => setStage(event.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm">{providerActivationStages.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select><select aria-label="Evidence outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as Outcome)} className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm"><option value="blocked">Blocked</option><option value="failed">Failed</option><option value="passed">Passed</option></select></div><Input className="mt-3" aria-label="Durable evidence URL" placeholder="https://evidence.example/run/stage" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} /><Textarea className="mt-3" aria-label="Evidence summary" placeholder="What was tested, under which conditions, and what the durable evidence proves" value={summary} onChange={(event) => setSummary(event.target.value)} /><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => recordEvidence.mutate()} disabled={recordEvidence.isPending || summary.trim().length < 10}>Record evidence</Button><Button variant="outline" onClick={() => completeRun.mutate()} disabled={completeRun.isPending || !selectedRun.qualification.qualifiable}>Qualify provider</Button><Button variant="ghost" className="text-zinc-500 hover:text-red-300" onClick={() => { if (window.confirm("Abandon this activation run? Its evidence will remain immutable.")) abandonRun.mutate(); }} disabled={abandonRun.isPending}>Abandon run</Button></div></article>}
          {message && <p role="status" className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-sm text-sky-100">{message}</p>}
        </div>
      </div>
      <a href="/trust" className="inline-flex items-center gap-2 text-xs font-bold text-sky-400">Privacy, security and evidence policy <ExternalLink className="h-3 w-3" /></a>
    </section>
  </main>;
}

function Guarantee({ icon: Icon, title: heading, body }: { icon: typeof ShieldCheck; title: string; body: string }) { return <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4"><Icon className="h-5 w-5 text-sky-400" /><p className="mt-3 text-sm font-black">{heading}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{body}</p></div>; }
