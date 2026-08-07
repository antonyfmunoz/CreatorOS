import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, CheckCircle2, ChevronLeft, CircleDollarSign, Megaphone, Plus, Send, Target, Users } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Campaign = {
  id: string;
  name: string;
  objective: string;
  channel: string;
  status: string;
  description: string;
  budgetCents: number;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
};

type Deliverable = { id: string; title: string; channel: string; status: string; dueAt: string | null; notes: string; distributionJobId: string | null };
type Metric = { id: string; impressions: number; engagements: number; clicks: number; conversions: number; spendCents: number; attributedRevenueCents: number; capturedAt: string; source: string };
type CampaignDetail = Campaign & { deliverables: Deliverable[]; metrics: Metric[] };

const formatMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const dateValue = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "Unscheduled";
const editorDateValue = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-zinc-500">{detail}</p></article>;
}

export default function CampaignsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("awareness");
  const [channel, setChannel] = useState("organic");
  const [budget, setBudget] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [deliverableTitle, setDeliverableTitle] = useState("");
  const [metricValues, setMetricValues] = useState({ impressions: "", engagements: "", clicks: "", conversions: "", spend: "", revenue: "" });
  const [campaignEditorOpen, setCampaignEditorOpen] = useState(false);
  const [campaignEditor, setCampaignEditor] = useState({ name: "", description: "", budget: "0", startsAt: "", endsAt: "" });

  const campaignsQuery = useQuery<Campaign[]>({ queryKey: ["/api/campaigns"], queryFn: async () => (await apiRequest("GET", "/api/campaigns")).json() });
  const campaignId = selectedId ?? campaignsQuery.data?.[0]?.id ?? null;
  const detailQuery = useQuery<CampaignDetail>({ queryKey: ["/api/campaigns", campaignId], enabled: Boolean(campaignId), queryFn: async () => (await apiRequest("GET", `/api/campaigns/${campaignId}`)).json() });
  const detail = detailQuery.data;

  const createCampaign = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/campaigns", { name, description, objective, channel, budgetCents: Math.round(Math.max(0, Number(budget) || 0) * 100), startsAt: startsAt || null, endsAt: endsAt || null })).json() as Promise<Campaign>,
    onSuccess: (campaign) => { queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }); setSelectedId(campaign.id); setComposerOpen(false); setName(""); setDescription(""); setBudget("0"); setStartsAt(""); setEndsAt(""); toast({ title: "Campaign created", description: "Add the launch deliverables and track its outcome here." }); },
    onError: (error: Error) => toast({ title: "Campaign was not created", description: error.message, variant: "destructive" }),
  });
  const updateCampaign = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await apiRequest("PATCH", `/api/campaigns/${campaignId}`, payload)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] }); queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] }); },
    onError: (error: Error) => toast({ title: "Campaign was not updated", description: error.message, variant: "destructive" }),
  });
  const openCampaignEditor = () => {
    if (!detail) return;
    setCampaignEditor({
      name: detail.name,
      description: detail.description,
      budget: String(detail.budgetCents / 100),
      startsAt: editorDateValue(detail.startsAt),
      endsAt: editorDateValue(detail.endsAt),
    });
    setCampaignEditorOpen(true);
  };
  const saveCampaignDetails = () => updateCampaign.mutate({
    name: campaignEditor.name,
    description: campaignEditor.description,
    budgetCents: Math.round(Math.max(0, Number(campaignEditor.budget) || 0) * 100),
    startsAt: campaignEditor.startsAt || null,
    endsAt: campaignEditor.endsAt || null,
  }, {
    onSuccess: () => {
      setCampaignEditorOpen(false);
      toast({ title: "Campaign details saved" });
    },
  });
  const addDeliverable = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/campaigns/${campaignId}/deliverables`, { title: deliverableTitle, channel: "CreativesOS" })).json(),
    onSuccess: () => { setDeliverableTitle(""); queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] }); },
    onError: (error: Error) => toast({ title: "Deliverable was not added", description: error.message, variant: "destructive" }),
  });
  const updateDeliverable = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await apiRequest("PATCH", `/api/campaigns/${campaignId}/deliverables/${id}`, { status })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] }),
  });
  const logMetrics = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/campaigns/${campaignId}/metrics`, {
      impressions: Number(metricValues.impressions) || 0,
      engagements: Number(metricValues.engagements) || 0,
      clicks: Number(metricValues.clicks) || 0,
      conversions: Number(metricValues.conversions) || 0,
      spendCents: Math.round((Number(metricValues.spend) || 0) * 100),
      attributedRevenueCents: Math.round((Number(metricValues.revenue) || 0) * 100),
    })).json(),
    onSuccess: () => { setMetricValues({ impressions: "", engagements: "", clicks: "", conversions: "", spend: "", revenue: "" }); queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] }); toast({ title: "Campaign metrics logged" }); },
    onError: (error: Error) => toast({ title: "Metrics were not saved", description: error.message, variant: "destructive" }),
  });

  const summary = useMemo(() => (detail?.metrics ?? []).reduce((total, metric) => ({
    impressions: total.impressions + metric.impressions,
    engagements: total.engagements + metric.engagements,
    conversions: total.conversions + metric.conversions,
    spendCents: total.spendCents + metric.spendCents,
    revenueCents: total.revenueCents + metric.attributedRevenueCents,
  }), { impressions: 0, engagements: 0, conversions: 0, spendCents: 0, revenueCents: 0 }), [detail?.metrics]);
  const engagementRate = summary.impressions ? (summary.engagements / summary.impressions) * 100 : 0;

  return <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-800 bg-black px-4">
      <div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="-ml-2 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/business")} aria-label="Back to business dashboard"><ChevronLeft className="h-5 w-5" /></Button><div><h1 className="text-lg font-bold">Campaigns</h1><p className="text-[10px] text-zinc-500">Plan launches. Measure what compounds.</p></div></div>
      <Button size="sm" className="rounded-xl bg-white font-bold text-black hover:bg-zinc-200" onClick={() => setComposerOpen((open) => !open)}><Plus className="mr-1 h-4 w-4" /> New</Button>
    </header>

    {composerOpen && <section className="border-b border-zinc-800 bg-zinc-950 p-4"><div className="mx-auto max-w-xl"><div className="flex items-center gap-2"><Megaphone className="h-4 w-4" /><h2 className="text-sm font-bold">Build a campaign</h2></div><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Campaign name" className="mt-4 border-zinc-700 bg-black text-white placeholder:text-zinc-600" /><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is the launch or growth goal?" className="mt-3 min-h-20 border-zinc-700 bg-black text-white placeholder:text-zinc-600" /><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-zinc-400">Objective<select value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white"><option value="awareness">Awareness</option><option value="engagement">Engagement</option><option value="traffic">Traffic</option><option value="conversion">Conversion</option><option value="creator_seeding">Creator seeding</option><option value="community">Community</option></select></label><label className="text-xs font-semibold text-zinc-400">Channel<select value={channel} onChange={(event) => setChannel(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white"><option value="organic">Organic</option><option value="paid">Paid media plan</option><option value="creator_seeding">Creator seeding</option><option value="owned">Owned audience</option></select></label><label className="text-xs font-semibold text-zinc-400">Budget (USD)<Input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} className="mt-1 border-zinc-700 bg-black text-white" /></label><label className="text-xs font-semibold text-zinc-400">Launch date<input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} onInput={(event) => setStartsAt(event.currentTarget.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white [color-scheme:dark]" /></label><label className="col-span-2 text-xs font-semibold text-zinc-400">End date (optional)<input type="date" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} onInput={(event) => setEndsAt(event.currentTarget.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white [color-scheme:dark]" /></label></div><Button className="mt-4 w-full rounded-xl bg-white text-black hover:bg-zinc-200" disabled={!name.trim() || createCampaign.isPending} onClick={() => createCampaign.mutate()}>{createCampaign.isPending ? "Creating…" : "Create campaign"}</Button></div></section>}

    <section className="overflow-x-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex min-w-max gap-2">{campaignsQuery.isLoading && <p className="text-sm text-zinc-500">Loading campaigns…</p>}{!campaignsQuery.isLoading && (campaignsQuery.data?.length ?? 0) === 0 && <p className="text-sm text-zinc-500">Create your first campaign to organize a launch or growth sprint.</p>}{campaignsQuery.data?.map((campaign) => <button key={campaign.id} onClick={() => setSelectedId(campaign.id)} className={`w-44 rounded-2xl border p-3 text-left ${campaign.id === campaignId ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-950 text-white"}`}><span className={`text-[10px] font-bold uppercase tracking-wider ${campaign.id === campaignId ? "text-black/55" : "text-zinc-500"}`}>{campaign.channel.replace("_", " ")} · {campaign.status}</span><span className="mt-2 block line-clamp-2 text-sm font-bold">{campaign.name}</span><span className={`mt-2 block text-xs ${campaign.id === campaignId ? "text-black/65" : "text-zinc-500"}`}>{dateValue(campaign.startsAt)}</span></button>)}</div></section>

    {detail && <section className="px-4 pb-6"><div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{detail.objective.replace("_", " ")} campaign</p><h2 className="mt-1 text-xl font-bold">{detail.name}</h2>{detail.description && <p className="mt-2 text-sm leading-6 text-zinc-400">{detail.description}</p>}</div><div className="flex shrink-0 flex-col items-end gap-2"><select aria-label="Campaign status" value={detail.status} onChange={(event) => updateCampaign.mutate({ status: event.target.value })} className="rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-xs font-bold text-white"><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select><Button size="sm" variant="ghost" className="h-8 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={openCampaignEditor}>Edit details</Button></div></div><div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><CalendarDays className="h-4 w-4" /> {dateValue(detail.startsAt)} – {dateValue(detail.endsAt)}<span className="ml-auto">Budget {formatMoney(detail.budgetCents)}</span></div></div>

      {campaignEditorOpen && <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><h3 className="text-sm font-bold">Edit campaign details</h3><Input value={campaignEditor.name} onChange={(event) => setCampaignEditor((current) => ({ ...current, name: event.target.value }))} placeholder="Campaign name" className="mt-3 border-zinc-700 bg-black text-white" /><Textarea value={campaignEditor.description} onChange={(event) => setCampaignEditor((current) => ({ ...current, description: event.target.value }))} placeholder="Campaign goal" className="mt-3 min-h-20 border-zinc-700 bg-black text-white" /><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-zinc-400">Budget (USD)<Input inputMode="decimal" value={campaignEditor.budget} onChange={(event) => setCampaignEditor((current) => ({ ...current, budget: event.target.value }))} className="mt-1 border-zinc-700 bg-black text-white" /></label><span /><label className="text-xs font-semibold text-zinc-400">Launch date<input type="date" value={campaignEditor.startsAt} onChange={(event) => setCampaignEditor((current) => ({ ...current, startsAt: event.target.value }))} onInput={(event) => { const startsAt = event.currentTarget.value; setCampaignEditor((current) => ({ ...current, startsAt })); }} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white [color-scheme:dark]" /></label><label className="text-xs font-semibold text-zinc-400">End date<input type="date" value={campaignEditor.endsAt} onChange={(event) => setCampaignEditor((current) => ({ ...current, endsAt: event.target.value }))} onInput={(event) => { const endsAt = event.currentTarget.value; setCampaignEditor((current) => ({ ...current, endsAt })); }} className="mt-1 h-10 w-full rounded-lg border border-zinc-700 bg-black px-3 text-sm text-white [color-scheme:dark]" /></label></div><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setCampaignEditorOpen(false)}>Cancel</Button><Button className="bg-white text-black hover:bg-zinc-200" disabled={!campaignEditor.name.trim() || updateCampaign.isPending} onClick={saveCampaignDetails}>{updateCampaign.isPending ? "Saving…" : "Save details"}</Button></div></section>}

      <div className="mt-4 grid grid-cols-2 gap-3"><Stat label="Impressions" value={summary.impressions.toLocaleString()} detail="Logged campaign reach" /><Stat label="Engagement" value={`${engagementRate.toFixed(1)}%`} detail={`${summary.engagements.toLocaleString()} actions`} /><Stat label="Conversions" value={summary.conversions.toLocaleString()} detail="Tracked outcomes" /><Stat label="Return" value={summary.spendCents ? `${(summary.revenueCents / summary.spendCents).toFixed(1)}×` : "—"} detail={`${formatMoney(summary.revenueCents)} attributed`} /></div>

      <section className="mt-7"><div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /><h3 className="text-sm font-bold">Launch deliverables</h3><span className="ml-auto text-xs text-zinc-500">{detail.deliverables.filter((item) => item.status === "published").length}/{detail.deliverables.length} shipped</span></div><div className="mt-3 flex gap-2"><Input value={deliverableTitle} onChange={(event) => setDeliverableTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && deliverableTitle.trim()) addDeliverable.mutate(); }} placeholder="Add a deliverable: launch post, creator brief…" className="border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-600" /><Button size="icon" className="shrink-0 rounded-xl bg-white text-black hover:bg-zinc-200" aria-label="Add campaign deliverable" disabled={!deliverableTitle.trim() || addDeliverable.isPending} onClick={() => addDeliverable.mutate()}><Plus className="h-4 w-4" /></Button></div>{detail.deliverables.length === 0 ? <p className="py-5 text-center text-sm text-zinc-500">Turn the goal into the individual pieces you need to ship.</p> : <div className="mt-3 space-y-2">{detail.deliverables.map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"><Send className="h-4 w-4 text-zinc-500" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-[11px] text-zinc-500">{item.channel} · {item.dueAt ? dateValue(item.dueAt) : "No due date"}</p></div>{!item.distributionJobId && <Button size="sm" variant="outline" className="h-8 rounded-lg border-zinc-700 bg-black text-xs text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation(`/studio?campaign=${detail.id}&deliverable=${item.id}`)}>Compose</Button>}<select aria-label={`Status for ${item.title}`} value={item.status} onChange={(event) => updateDeliverable.mutate({ id: item.id, status: event.target.value })} className="rounded-lg border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="ready">Ready</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></article>)}</div>}</section>

      <section className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /><h3 className="text-sm font-bold">Log a performance snapshot</h3></div><p className="mt-1 text-xs leading-5 text-zinc-500">Use manual values until a connected channel reports into this campaign.</p><div className="mt-4 grid grid-cols-2 gap-3">{([['impressions', 'Impressions'], ['engagements', 'Engagements'], ['clicks', 'Clicks'], ['conversions', 'Conversions'], ['spend', 'Spend (USD)'], ['revenue', 'Revenue (USD)']] as const).map(([key, label]) => <label key={key} className="text-[11px] font-semibold text-zinc-500">{label}<Input inputMode="numeric" value={metricValues[key]} onChange={(event) => setMetricValues((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-9 border-zinc-700 bg-black text-sm text-white" /></label>)}</div><Button className="mt-4 w-full rounded-xl bg-white text-black hover:bg-zinc-200" disabled={logMetrics.isPending} onClick={() => logMetrics.mutate()}><CircleDollarSign className="mr-2 h-4 w-4" /> {logMetrics.isPending ? "Saving…" : "Save snapshot"}</Button></section>

      {detail.channel === "paid" && <section className="mt-5 flex gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-4"><Target className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" /><p className="text-xs leading-5 text-zinc-400">This paid-media plan is ready for creative, budget, and measurement. Buying media remains disabled until a verified advertising-provider connection is added.</p></section>}
      {detail.channel === "creator_seeding" && <section className="mt-5 flex gap-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-4"><Users className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" /><p className="text-xs leading-5 text-zinc-400">Use deliverables to prepare creator briefs and disclosure-ready assets. Creator outreach and external results will attach here when partner connections are configured.</p></section>}
    </section>}
  </main>;
}
