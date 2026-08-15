import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, DatabaseBackup, Download, FileCheck2, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Validation = { valid: boolean; counts?: Record<string, number>; errors?: Array<{ message?: string }> };
type ImportJob = { id: string; sourceSystem: string; status: string; summary: { totalImported?: number; totalSkipped?: number }; createdAt: string };

const starter = JSON.stringify({ schemaVersion: "creativesos.portability.v1", sourceSystem: "other-platform", products: [], courses: [], contacts: [], automations: [] }, null, 2);

export default function DataPortabilityPage() {
  const [, setLocation] = useLocation();
  const [raw, setRaw] = useState(starter);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `migration-${crypto.randomUUID()}`);
  const [validation, setValidation] = useState<Validation | null>(null);
  const parsed = useMemo(() => { try { return JSON.parse(raw); } catch { return null; } }, [raw]);
  const jobs = useQuery<ImportJob[]>({ queryKey: ["/api/portability/imports"] });
  const validate = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/portability/import/validate", { package: parsed })).json(),
    onSuccess: setValidation,
    onError: (error: Error) => setValidation({ valid: false, errors: [{ message: error.message }] }),
  });
  const runImport = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/portability/import", { idempotencyKey, package: parsed })).json(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/portability/imports"] });
      setIdempotencyKey(`migration-${crypto.randomUUID()}`);
    },
  });

  return <main className="min-h-dvh bg-black pb-24 text-white"><header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-zinc-800 bg-black/95 px-4"><Button size="icon" variant="ghost" aria-label="Back to business" onClick={() => setLocation("/business")}><ArrowLeft className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><h1 className="font-black">Data portability</h1><p className="truncate text-xs text-zinc-500">Move your operating data without surrendering custody</p></div><DatabaseBackup className="h-5 w-5 text-sky-400" /></header><div className="mx-auto grid max-w-6xl gap-5 p-4 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><h2 className="text-lg font-bold">Migration package</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Validate before writing. Imports are atomic, tenant-scoped and idempotent. Imported offers and automations stay private until you review them.</p><Textarea aria-label="Portability package JSON" className="mt-4 min-h-[28rem] border-zinc-800 bg-black font-mono text-xs text-zinc-200" value={raw} onChange={(event) => { setRaw(event.target.value); setValidation(null); }} /><label className="mt-4 block text-xs font-bold text-zinc-400">Idempotency key<Input className="mt-2 border-zinc-800 bg-black" value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} /></label>{validation && <div className={`mt-4 rounded-xl border p-3 text-xs ${validation.valid ? "border-emerald-900 bg-emerald-950/30 text-emerald-200" : "border-red-900 bg-red-950/30 text-red-200"}`}>{validation.valid ? `Valid package · ${validation.counts?.total ?? 0} records ready` : validation.errors?.map((error) => error.message ?? "Invalid package").join(" · ")}</div>}{runImport.isError && <p className="mt-3 text-xs text-red-300">{runImport.error.message}</p>}{runImport.isSuccess && <p className="mt-3 text-xs text-emerald-300">Import completed and its source mapping was recorded.</p>}<div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" className="border-zinc-700 bg-black" disabled={!parsed || validate.isPending} onClick={() => validate.mutate()}><FileCheck2 className="mr-2 h-4 w-4" />Validate</Button><Button disabled={!parsed || !validation?.valid || runImport.isPending || idempotencyKey.length < 8} onClick={() => runImport.mutate()}><Upload className="mr-2 h-4 w-4" />Import atomically</Button></div></section><aside className="space-y-5"><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><h2 className="font-bold">Export everything portable</h2><p className="mt-2 text-xs leading-5 text-zinc-500">Downloads versioned products, courses, contacts and automation definitions plus a governed media manifest. Private media URLs are never exposed.</p><Button className="mt-4 w-full" variant="outline" onClick={() => window.location.assign("/api/portability/export")}><Download className="mr-2 h-4 w-4" />Download package</Button></section><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><h2 className="font-bold">Specialized migrations</h2><div className="mt-3 grid gap-2">{[["Audience CSV", "/business/audience"], ["Podcast RSS", "/business/podcasts"], ["Media upload", "/library"]].map(([label, href]) => <Button key={label} variant="ghost" className="justify-start bg-black text-zinc-300" onClick={() => setLocation(href)}>{label}</Button>)}</div></section><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><h2 className="font-bold">Import history</h2><div className="mt-3 space-y-2">{jobs.isLoading && <p className="text-xs text-zinc-600">Loading evidence…</p>}{!jobs.isLoading && !jobs.data?.length && <p className="text-xs text-zinc-600">No migration jobs yet.</p>}{jobs.data?.map((job) => <article key={job.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-bold">{job.sourceSystem}</p><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div><p className="mt-1 text-[10px] text-zinc-600">{job.status} · {job.summary.totalImported ?? 0} imported · {job.summary.totalSkipped ?? 0} skipped</p></article>)}</div></section></aside></div></main>;
}
