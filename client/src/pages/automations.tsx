import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, Check, CirclePause, Clock3, Download, MessageCircle, Play, Plus, RefreshCw, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Business = { id: string; name: string; isDefault?: boolean };
type AutomationTemplate = { id: string; name: string; description: string; steps: unknown[] };
type AutomationDefinition = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "paused" | "archived";
  triggerType: string;
  runCount: number;
  updatedAt: string;
};
type AutomationRun = { id: string; status: string; threadId?: string | null; currentStepKey?: string | null; createdAt: string; errorMessage?: string | null };
type AutomationDetail = AutomationDefinition & { runs: AutomationRun[]; steps: Array<{ id: string; name: string; actionType: string; approvalPolicy: string }> };
type AutomationMessage = { id: string; authorType: "user" | "automation" | "system"; kind: string; content: string; createdAt: string };
type AutomationRunDetail = AutomationRun & { thread: null | { id: string; messages: AutomationMessage[] } };
type Approval = { id: string; runId: string; reason: string; status: string; createdAt: string; evidence: { actionType?: string } };
type Health = { definitions: number; queued: number; running: number; waitingApproval: number; failed: number };

async function jsonRequest<T>(method: string, url: string, data?: unknown): Promise<T> {
  const response = await apiRequest(method, url, data);
  return response.json();
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  succeeded: "bg-emerald-500/15 text-emerald-300",
  running: "bg-blue-500/15 text-blue-300",
  queued: "bg-amber-500/15 text-amber-300",
  waiting_approval: "bg-violet-500/15 text-violet-300",
  draft: "bg-zinc-800 text-zinc-300",
  paused: "bg-zinc-800 text-zinc-400",
  failed: "bg-red-500/15 text-red-300",
  dead_letter: "bg-red-500/15 text-red-300",
  canceled: "bg-zinc-800 text-zinc-500",
};

export default function AutomationsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [section, setSection] = useState<"workflows" | "approvals" | "activity">("workflows");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runInput, setRunInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [socialFlow, setSocialFlow] = useState<"comment" | "dm">("comment");
  const [socialKeywords, setSocialKeywords] = useState("");
  const [socialMatchMode, setSocialMatchMode] = useState<"exact" | "contains" | "starts_with">("exact");
  const [socialReply, setSocialReply] = useState("");
  const [socialPublicReply, setSocialPublicReply] = useState("I just sent it to you in a DM.");
  const [socialPostId, setSocialPostId] = useState("");
  const [socialCooldown, setSocialCooldown] = useState("0");

  const businessesQuery = useQuery<Business[]>({ queryKey: ["/api/businesses"] });
  const templatesQuery = useQuery<AutomationTemplate[]>({ queryKey: ["/api/automations/templates"] });
  const definitionsQuery = useQuery<AutomationDefinition[]>({ queryKey: ["/api/automations"], refetchInterval: 5_000 });
  const approvalsQuery = useQuery<Approval[]>({ queryKey: ["/api/automations/approvals/pending"], refetchInterval: 5_000 });
  const healthQuery = useQuery<Health>({ queryKey: ["/api/automations/health/summary"], refetchInterval: 5_000 });
  const effectiveSelectedId = selectedId ?? definitionsQuery.data?.[0]?.id ?? null;
  const detailQuery = useQuery<AutomationDetail>({
    queryKey: [`/api/automations/${effectiveSelectedId}`],
    enabled: Boolean(effectiveSelectedId),
    refetchInterval: 3_000,
  });
  const runDetailQuery = useQuery<AutomationRunDetail>({
    queryKey: [`/api/automations/runs/${selectedRunId}`],
    enabled: Boolean(selectedRunId),
    refetchInterval: 2_000,
  });

  const defaultBusiness = useMemo(
    () => businessesQuery.data?.find((business) => business.isDefault) ?? businessesQuery.data?.[0],
    [businessesQuery.data],
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/automations"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/automations/approvals/pending"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/automations/health/summary"] }),
      effectiveSelectedId ? queryClient.invalidateQueries({ queryKey: [`/api/automations/${effectiveSelectedId}`] }) : Promise.resolve(),
      selectedRunId ? queryClient.invalidateQueries({ queryKey: [`/api/automations/runs/${selectedRunId}`] }) : Promise.resolve(),
    ]);
  };

  const createTemplate = useMutation({
    mutationFn: (templateId: string) => jsonRequest<AutomationDefinition>("POST", `/api/automations/from-template/${templateId}`, { businessId: defaultBusiness?.id ?? null }),
    onSuccess: async (definition) => {
      setSelectedId(definition.id);
      await refresh();
      toast({ title: "Automation created", description: "Review it, then activate when you are ready." });
    },
    onError: (error: Error) => toast({ title: "Could not create automation", description: error.message, variant: "destructive" }),
  });

  const createSocialAutomation = useMutation({
    mutationFn: async () => {
      const keywords = socialKeywords.split(/[,\n]/).map((keyword) => keyword.trim()).filter(Boolean);
      if (keywords.length === 0) throw new Error("Add at least one keyword");
      if (!socialReply.trim()) throw new Error("Add the direct-message reply");
      const parsedPostId = socialPostId.trim() ? Number(socialPostId) : null;
      if (parsedPostId != null && (!Number.isInteger(parsedPostId) || parsedPostId <= 0)) throw new Error("Post ID must be a positive number");
      const cooldownMinutes = Number(socialCooldown);
      if (!Number.isInteger(cooldownMinutes) || cooldownMinutes < 0 || cooldownMinutes > 10_080) throw new Error("Cooldown must be between 0 and 10080 minutes");
      const steps = socialFlow === "comment" && socialPublicReply.trim()
        ? [
            { stepKey: "public_reply", name: "Reply to comment", actionType: "native.comment.reply", position: 0, approvalPolicy: "none", retryLimit: 2, timeoutMs: 30_000, config: { content: socialPublicReply.trim() } },
            { stepKey: "direct_message", name: "Send direct message", actionType: "native.dm.send", position: 1, approvalPolicy: "none", retryLimit: 2, timeoutMs: 30_000, config: { content: socialReply.trim(), cooldownMinutes } },
          ]
        : [{ stepKey: "direct_message", name: "Send direct message", actionType: "native.dm.send", position: 0, approvalPolicy: "none", retryLimit: 2, timeoutMs: 30_000, config: { content: socialReply.trim(), cooldownMinutes } }];
      return jsonRequest<AutomationDefinition>("POST", "/api/automations", {
        name: `${socialFlow === "comment" ? "Comment" : "DM"}: ${keywords[0]}`,
        description: `${socialFlow === "comment" ? "Comment" : "Direct-message"} keyword reply for ${keywords.join(", ")}.`,
        businessId: defaultBusiness?.id ?? null,
        triggerType: "event",
        triggerConfig: {
          eventType: socialFlow === "comment" ? "native.comment.created" : "native.dm.received",
          keywords,
          matchMode: socialMatchMode,
          caseSensitive: false,
          ...(socialFlow === "comment" ? { topLevelOnly: true, ...(parsedPostId ? { postId: parsedPostId } : {}) } : {}),
        },
        maxRunsPerHour: 100,
        maxStepsPerRun: 5,
        retentionDays: 90,
        steps,
      });
    },
    onSuccess: async (definition) => {
      setSelectedId(definition.id);
      setSocialKeywords("");
      setSocialReply("");
      await refresh();
      toast({ title: "Keyword automation created", description: "Review the workflow below, then activate it when ready." });
    },
    onError: (error: Error) => toast({ title: "Could not create keyword automation", description: error.message, variant: "destructive" }),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "paused" }) => jsonRequest("PATCH", `/api/automations/${id}`, { status }),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Could not update automation", description: error.message, variant: "destructive" }),
  });

  const runAutomation = useMutation({
    mutationFn: (definition: AutomationDefinition) => jsonRequest<AutomationRun>("POST", `/api/automations/${definition.id}/run`, {
      input: { brief: runInput || "Create a concise launch update.", name: runInput || definition.name, description: runInput },
      maxCostUnits: 100,
    }),
    onSuccess: async (run) => {
      setSelectedRunId(run.id);
      setRunInput("");
      setSection("activity");
      await refresh();
      toast({ title: "Automation started", description: "CreativesOS will keep working even if you leave this page." });
    },
    onError: (error: Error) => toast({ title: "Could not start automation", description: error.message, variant: "destructive" }),
  });

  const sendMessage = useMutation({
    mutationFn: ({ threadId, content }: { threadId: string; content: string }) => jsonRequest("POST", `/api/automations/threads/${threadId}/messages`, { content }),
    onSuccess: async () => {
      setChatInput("");
      if (selectedRunId) await queryClient.invalidateQueries({ queryKey: [`/api/automations/runs/${selectedRunId}`] });
      await refresh();
    },
    onError: (error: Error) => toast({ title: "Could not send message", description: error.message, variant: "destructive" }),
  });

  const controlRun = useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: "cancel" | "retry" }) => jsonRequest("POST", `/api/automations/runs/${runId}/${action}`),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Could not update run", description: error.message, variant: "destructive" }),
  });

  const decideApproval = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "declined" }) => jsonRequest("POST", `/api/automations/approvals/${id}/decision`, { decision }),
    onSuccess: refresh,
    onError: (error: Error) => toast({ title: "Could not record decision", description: error.message, variant: "destructive" }),
  });

  const selected = detailQuery.data;
  const pendingCount = approvalsQuery.data?.length ?? 0;

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/create")} aria-label="Back to Create">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1"><h1 className="truncate text-lg font-bold">Automations</h1><p className="truncate text-[11px] text-zinc-500">Native, governed creator operations</p></div>
          <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => void refresh()} aria-label="Refresh automations"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        <nav className="flex px-2" aria-label="Automation sections">
          {(["workflows", "approvals", "activity"] as const).map((item) => (
            <button key={item} onClick={() => setSection(item)} className={`relative flex-1 px-2 py-3 text-xs font-bold capitalize ${section === item ? "text-white" : "text-zinc-500"}`}>
              {item}{item === "approvals" && pendingCount > 0 ? ` (${pendingCount})` : ""}
              {section === item && <span className="absolute inset-x-4 bottom-0 h-0.5 rounded bg-[#1d9bf0]" />}
            </button>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-5 gap-2 border-b border-zinc-900 px-4 py-4">
        {[
          ["Workflows", healthQuery.data?.definitions ?? 0],
          ["Queued", healthQuery.data?.queued ?? 0],
          ["Running", healthQuery.data?.running ?? 0],
          ["Approval", healthQuery.data?.waitingApproval ?? 0],
          ["Needs help", healthQuery.data?.failed ?? 0],
        ].map(([label, value]) => <div key={label} className="min-w-0 text-center"><p className="text-base font-bold">{value}</p><p className="truncate text-[10px] text-zinc-600">{label}</p></div>)}
      </section>

      {section === "workflows" && (
        <>
          <section className="px-4 pt-6">
            <div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Start with a playbook</p><h2 className="mt-1 text-lg font-bold">Repeatable work, not one-off chat</h2></div><Sparkles className="h-5 w-5 text-[#1d9bf0]" /></div>
            <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {templatesQuery.data?.map((template) => (
                <article key={template.id} className="w-[82%] shrink-0 snap-start rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d9bf0]/15 text-[#1d9bf0]"><Bot className="h-5 w-5" /></div>
                  <h3 className="mt-4 text-sm font-bold">{template.name}</h3><p className="mt-1 min-h-12 text-xs leading-5 text-zinc-500">{template.description}</p>
                  <button onClick={() => createTemplate.mutate(template.id)} disabled={createTemplate.isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-black disabled:opacity-50"><Plus className="h-4 w-4" />Use playbook</button>
                </article>
              ))}
            </div>
          </section>

          <section className="px-4 pt-7">
            <div className="rounded-2xl border border-[#1d9bf0]/30 bg-[#1d9bf0]/5 p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d9bf0]/15 text-[#1d9bf0]"><MessageCircle className="h-5 w-5" /></span>
                <div><p className="text-xs font-bold uppercase tracking-wider text-[#1d9bf0]">Keyword replies</p><h2 className="mt-1 text-base font-bold">Turn comments and DMs into conversations</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Runs on native CreativesOS messages now. The same workflow can connect to social providers later.</p></div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["comment", "dm"] as const).map((flow) => <button key={flow} type="button" onClick={() => setSocialFlow(flow)} className={`rounded-xl border py-2.5 text-xs font-bold ${socialFlow === flow ? "border-[#1d9bf0] bg-[#1d9bf0] text-white" : "border-zinc-800 bg-black text-zinc-400"}`}>{flow === "comment" ? "Comment keyword" : "DM keyword"}</button>)}
              </div>
              <label className="mt-4 block text-[11px] font-bold text-zinc-400">Keywords</label>
              <input value={socialKeywords} onChange={(event) => setSocialKeywords(event.target.value)} placeholder="GUIDE, LINK, DETAILS" className="mt-1.5 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#1d9bf0]" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-bold text-zinc-400">Match
                  <select value={socialMatchMode} onChange={(event) => setSocialMatchMode(event.target.value as typeof socialMatchMode)} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-xs text-white outline-none focus:border-[#1d9bf0]"><option value="exact">Exact message</option><option value="contains">Contains keyword</option><option value="starts_with">Starts with</option></select>
                </label>
                <label className="text-[11px] font-bold text-zinc-400">Cooldown minutes
                  <input inputMode="numeric" value={socialCooldown} onChange={(event) => setSocialCooldown(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-xs text-white outline-none focus:border-[#1d9bf0]" />
                </label>
              </div>
              {socialFlow === "comment" && <>
                <label className="mt-3 block text-[11px] font-bold text-zinc-400">Public reply <span className="font-normal text-zinc-600">(optional)</span></label>
                <input value={socialPublicReply} onChange={(event) => setSocialPublicReply(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none focus:border-[#1d9bf0]" />
                <label className="mt-3 block text-[11px] font-bold text-zinc-400">Post ID <span className="font-normal text-zinc-600">(optional; blank means all your posts)</span></label>
                <input inputMode="numeric" value={socialPostId} onChange={(event) => setSocialPostId(event.target.value)} placeholder="All posts" className="mt-1.5 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#1d9bf0]" />
              </>}
              <label className="mt-3 block text-[11px] font-bold text-zinc-400">Direct-message reply</label>
              <textarea value={socialReply} onChange={(event) => setSocialReply(event.target.value)} placeholder="Thanks for reaching out—here is the link you requested…" className="mt-1.5 min-h-24 w-full resize-none rounded-xl border border-zinc-800 bg-black p-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#1d9bf0]" />
              <p className="mt-2 text-[10px] leading-4 text-zinc-600">STOP opts a person out. START opts them back in. Automated replies never trigger another automation.</p>
              <button type="button" onClick={() => createSocialAutomation.mutate()} disabled={createSocialAutomation.isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black disabled:opacity-50"><Plus className="h-4 w-4" />Create keyword automation</button>
            </div>
          </section>

          <section className="px-4 pt-7">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Your workflows</p>
            <div className="mt-3 space-y-2">
              {definitionsQuery.data?.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Choose a playbook to create your first automation.</div>}
              {definitionsQuery.data?.map((definition) => (
                <button key={definition.id} onClick={() => setSelectedId(definition.id)} className={`w-full rounded-2xl border p-4 text-left transition-colors ${effectiveSelectedId === definition.id ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/5" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900"}`}>
                  <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900"><Bot className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm">{definition.name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyles[definition.status]}`}>{definition.status}</span></span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-zinc-500">{definition.description}</span><span className="mt-2 block text-[11px] text-zinc-600">{definition.runCount} runs · {definition.triggerType}</span></span></div>
                </button>
              ))}
            </div>
          </section>

          {selected && <section className="mx-4 mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-white">{selected.name}</p><p className="mt-1 text-xs text-zinc-500">{selected.steps.length} governed steps</p></div>{selected.status === "active" ? <button onClick={() => setStatus.mutate({ id: selected.id, status: "paused" })} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300"><CirclePause className="h-3.5 w-3.5" />Pause</button> : <button onClick={() => setStatus.mutate({ id: selected.id, status: "active" })} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-bold text-black"><Check className="h-3.5 w-3.5" />Activate</button>}</div>
            <ol className="mt-4 space-y-2">{selected.steps.map((step, index) => <li key={step.id} className="flex items-center gap-3 rounded-xl bg-black p-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{step.name}</span><span className="block truncate text-[10px] text-zinc-600">{step.actionType}</span></span>{step.approvalPolicy !== "none" && <ShieldCheck className="h-4 w-4 text-violet-400" />}</li>)}</ol>
            <textarea value={runInput} onChange={(event) => setRunInput(event.target.value)} placeholder="Give this run a brief, campaign name, or meeting notes…" className="mt-4 min-h-24 w-full resize-none rounded-xl border border-zinc-800 bg-black p-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-[#1d9bf0]" />
            <button onClick={() => runAutomation.mutate(selected)} disabled={selected.status !== "active" || runAutomation.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d9bf0] px-4 py-3 text-sm font-bold text-white disabled:bg-zinc-800 disabled:text-zinc-500"><Play className="h-4 w-4" />{selected.status === "active" ? "Run automation" : "Activate to run"}</button>
          </section>}
        </>
      )}

      {section === "approvals" && <section className="px-4 pt-6"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Human control point</p><div className="mt-3 space-y-3">{pendingCount === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center"><ShieldCheck className="mx-auto h-7 w-7 text-zinc-700" /><p className="mt-3 text-sm font-bold">Nothing needs approval</p><p className="mt-1 text-xs text-zinc-600">Consequential actions pause here before they happen.</p></div>}{approvalsQuery.data?.map((approval) => <article key={approval.id} className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15"><ShieldCheck className="h-5 w-5 text-violet-300" /></span><div><h2 className="text-sm font-bold">Approval required</h2><p className="mt-1 text-xs leading-5 text-zinc-400">{approval.reason}</p><p className="mt-2 text-[10px] text-zinc-600">{approval.evidence?.actionType ?? "governed action"}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => decideApproval.mutate({ id: approval.id, decision: "declined" })} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-300"><X className="h-4 w-4" />Decline</button><button onClick={() => decideApproval.mutate({ id: approval.id, decision: "approved" })} className="flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-xs font-bold text-black"><Check className="h-4 w-4" />Approve</button></div></article>)}</div></section>}

      {section === "activity" && <section className="px-4 pt-6">
        <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Execution history</p><button onClick={() => window.location.assign("/api/automations/export")} className="flex items-center gap-1.5 text-xs font-bold text-zinc-400"><Download className="h-3.5 w-3.5" />Export</button></div>
        <div className="mt-3 space-y-2">
          {!selected && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Select a workflow to inspect its activity.</div>}
          {selected?.runs.map((run) => <button key={run.id} onClick={() => setSelectedRunId(run.id)} className={`w-full rounded-2xl border p-4 text-left ${selectedRunId === run.id ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/5" : "border-zinc-800 bg-zinc-950"}`}><span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900"><Clock3 className="h-4 w-4 text-zinc-400" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-xs">{selected.name}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyles[run.status] ?? statusStyles.draft}`}>{run.status.replace("_", " ")}</span></span><span className="mt-1 block text-[10px] text-zinc-600">{new Date(run.createdAt).toLocaleString()}{run.currentStepKey ? ` · ${run.currentStepKey}` : ""}</span>{run.errorMessage && <span className="mt-2 block text-xs text-red-300">{run.errorMessage}</span>}</span></span></button>)}
        </div>
        {runDetailQuery.data && <article className="mt-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-800 p-4"><div><p className="text-sm font-bold">Run conversation</p><p className="mt-1 text-[10px] text-zinc-600">Actions and decisions stay attached to this thread.</p></div><div className="flex gap-2">{["failed", "dead_letter"].includes(runDetailQuery.data.status) && <button onClick={() => controlRun.mutate({ runId: runDetailQuery.data.id, action: "retry" })} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-black">Retry</button>}{["queued", "running", "waiting_approval"].includes(runDetailQuery.data.status) && <button onClick={() => controlRun.mutate({ runId: runDetailQuery.data.id, action: "cancel" })} className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300">Cancel</button>}</div></div>
          <div className="max-h-80 space-y-3 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {runDetailQuery.data.thread?.messages.map((message) => <div key={message.id} className={`flex ${message.authorType === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-3 py-2.5 text-xs leading-5 ${message.authorType === "user" ? "bg-[#1d9bf0] text-white" : message.kind === "error" ? "bg-red-500/10 text-red-200" : "bg-zinc-900 text-zinc-300"}`}><p>{message.content}</p><p className={`mt-1 text-[9px] ${message.authorType === "user" ? "text-white/60" : "text-zinc-600"}`}>{new Date(message.createdAt).toLocaleTimeString()}</p></div></div>)}
          </div>
          {runDetailQuery.data.thread && <form onSubmit={(event) => { event.preventDefault(); const content = chatInput.trim(); if (content) sendMessage.mutate({ threadId: runDetailQuery.data!.thread!.id, content }); }} className="flex gap-2 border-t border-zinc-800 p-3"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Continue this workflow conversation…" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-3 text-xs text-white outline-none focus:border-[#1d9bf0]" /><button type="submit" disabled={!chatInput.trim() || sendMessage.isPending} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d9bf0] text-white disabled:bg-zinc-800"><Send className="h-4 w-4" /></button></form>}
        </article>}
      </section>}
    </main>
  );
}
