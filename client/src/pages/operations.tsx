import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowLeft, Gauge, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Service = {
  service: string; name: string; targetAvailability: number; targetP95Ms: number;
  observed: { total: number; failed: number; p95Ms: number; availability: number | null; errorBudget: { state: string; remaining: number; consumedRatio: number } };
  usage: { quantity: number; estimatedCostMicros: number };
  budget: { softLimitMicros: number; hardLimitMicros: number; enabled: boolean } | null;
  budgetState: string;
};
const money = (micros: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(micros / 1_000_000);

export default function OperationsPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [soft, setSoft] = useState("");
  const [hard, setHard] = useState("");
  const { data, isLoading } = useQuery<{ windowDays: number; services: Service[] }>({ queryKey: ["/api/operations"], queryFn: async () => (await apiRequest("GET", "/api/operations")).json() });
  const saveBudget = useMutation({
    mutationFn: async (service: string) => apiRequest("PUT", `/api/operations/budgets/${service}`, { softLimitMicros: Math.round(Number(soft || 0) * 1_000_000), hardLimitMicros: Math.round(Number(hard || 0) * 1_000_000), enabled: true }),
    onSuccess: () => { setEditing(null); queryClient.invalidateQueries({ queryKey: ["/api/operations"] }); },
  });
  return <main className="min-h-screen bg-black pb-24 text-white">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-black/90 px-4 py-4 backdrop-blur-xl"><div className="mx-auto flex max-w-6xl items-center gap-3"><button aria-label="Back" onClick={() => setLocation("/business")} className="rounded-full p-2 hover:bg-white/10"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-lg font-black">Operations control plane</h1><p className="text-xs text-zinc-500">SLOs, error budgets and tenant cost boundaries</p></div></div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <div className="grid gap-3 sm:grid-cols-3"><Summary icon={ShieldCheck} label="Published objectives" value={String(data?.services.length ?? 7)} /><Summary icon={Activity} label="Measured services" value={String(data?.services.filter((item) => item.observed.total > 0).length ?? 0)} /><Summary icon={Gauge} label="Window" value={`${data?.windowDays ?? 30} days`} /></div>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Unmeasured services remain explicitly unmeasured. A green card means observed evidence met its objective; it never substitutes for provider or regional load tests.</p></div></div>
      {isLoading ? <p className="text-sm text-zinc-500">Loading operational evidence…</p> : <div className="grid gap-4 lg:grid-cols-2">{data?.services.map((service) => {
        const healthy = service.observed.errorBudget.state === "healthy"; const measured = service.observed.total > 0;
        return <article key={service.service} className="rounded-2xl border border-white/10 bg-zinc-950 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{service.name}</h2><p className="mt-1 text-xs text-zinc-500">{service.service}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${!measured ? "bg-zinc-800 text-zinc-400" : healthy ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{measured ? service.observed.errorBudget.state : "unmeasured"}</span></div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Metric label="Availability" value={service.observed.availability == null ? "—" : `${(service.observed.availability * 100).toFixed(3)}%`} target={`${(service.targetAvailability * 100).toFixed(2)}% target`} /><Metric label="p95 latency" value={measured ? `${service.observed.p95Ms} ms` : "—"} target={`≤ ${service.targetP95Ms} ms`} /><Metric label="Monthly usage" value={service.usage.quantity.toLocaleString()} target="metered operations" /><Metric label="Estimated cost" value={money(service.usage.estimatedCostMicros)} target={service.budgetState.replace("_", " ")} /></div>
          {editing === service.service ? <div className="mt-4 grid gap-2 rounded-xl border border-white/10 p-3 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Soft monthly cost limit" type="number" min="0" step="0.01" placeholder="Soft USD" value={soft} onChange={(event) => setSoft(event.target.value)} /><Input aria-label="Hard monthly cost limit" type="number" min="0" step="0.01" placeholder="Hard USD" value={hard} onChange={(event) => setHard(event.target.value)} /><Button onClick={() => saveBudget.mutate(service.service)} disabled={saveBudget.isPending}>Save</Button></div> : <button className="mt-4 text-xs font-bold text-sky-400 hover:text-sky-300" onClick={() => { setEditing(service.service); setSoft(service.budget ? String(service.budget.softLimitMicros / 1_000_000) : ""); setHard(service.budget ? String(service.budget.hardLimitMicros / 1_000_000) : ""); }}>Set tenant cost limits</button>}
        </article>;
      })}</div>}
    </section>
  </main>;
}
function Summary({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-zinc-950 p-4"><Icon className="h-5 w-5 text-sky-400" /><p className="mt-4 text-2xl font-black">{value}</p><p className="text-xs text-zinc-500">{label}</p></div>; }
function Metric({ label, value, target }: { label: string; value: string; target: string }) { return <div className="rounded-xl bg-white/[0.035] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p><p className="mt-1 font-bold">{value}</p><p className="mt-1 text-[10px] text-zinc-600">{target}</p></div>; }
