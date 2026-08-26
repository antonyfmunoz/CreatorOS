import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  Database,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FormInput,
  Landmark,
  Plus,
  Presentation,
  Save,
  Send,
} from "lucide-react";
import {
  createEmptyFoundationContent,
  foundationInstrumentKindSchema,
  type FoundationCommand,
  type FoundationInstrumentKind,
  type FoundationInstrumentStatus,
} from "@shared/foundation-instruments";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type InstrumentSummary = {
  id: string;
  kind: FoundationInstrumentKind;
  title: string;
  status: FoundationInstrumentStatus;
  currentRevision: number;
  updatedAt: string;
};
type InstrumentDetail = InstrumentSummary & {
  revision: { content: any };
  history: Array<{ id: string; revision: number; changeSummary: string; createdAt: string }>;
  events: Array<{ id: string; eventType: string; createdAt: string }>;
};

const tools: Record<FoundationInstrumentKind, { label: string; singular: string; icon: typeof FileText }> = {
  document: { label: "Docs", singular: "document", icon: FileText },
  spreadsheet: { label: "Sheets", singular: "spreadsheet", icon: FileSpreadsheet },
  presentation: { label: "Slides", singular: "presentation", icon: Presentation },
  database: { label: "Tables", singular: "database", icon: Database },
  form: { label: "Forms", singular: "form", icon: FormInput },
  calendar: { label: "Calendar", singular: "calendar", icon: CalendarDays },
  finance_ledger: { label: "Finance", singular: "ledger", icon: Landmark },
};

const pathKinds: Record<string, FoundationInstrumentKind> = {
  "/documents": "document",
  "/sheets": "spreadsheet",
  "/slides": "presentation",
  "/tables": "database",
  "/forms": "form",
  "/calendar": "calendar",
  "/finance": "finance_ledger",
};

function SpreadsheetEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const sheet = content.sheets.find((candidate: any) => candidate.id === content.activeSheetId) ?? content.sheets[0];
  const columns = Array.from({ length: Math.min(sheet.columnCount, 10) }, (_, index) => String.fromCharCode(65 + index));
  const update = (address: string, input: string) => onChange({
    ...content,
    sheets: content.sheets.map((candidate: any) => candidate.id === sheet.id ? {
      ...candidate,
      cells: { ...candidate.cells, [address]: { ...(candidate.cells[address] ?? {}), input } },
    } : candidate),
  });
  return <div className="overflow-x-auto rounded-2xl border border-zinc-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <table className="w-full min-w-[720px] border-collapse bg-black text-xs">
      <thead><tr><th className="w-10 border border-zinc-800 bg-zinc-950" />{columns.map((column) => <th key={column} className="border border-zinc-800 p-2 text-zinc-500">{column}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 16 }, (_, row) => <tr key={row}><th className="border border-zinc-800 bg-zinc-950 p-2 text-zinc-600">{row + 1}</th>{columns.map((column) => { const address = `${column}${row + 1}`; return <td key={address} className="border border-zinc-800"><input aria-label={`Cell ${address}`} value={sheet.cells[address]?.input ?? ""} onChange={(event) => update(address, event.target.value)} className="h-9 w-full min-w-20 bg-transparent px-2 text-white outline-none focus:bg-zinc-900" /></td>; })}</tr>)}</tbody>
    </table>
  </div>;
}

function PresentationEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const slide = content.slides.find((candidate: any) => candidate.id === content.activeSlideId) ?? content.slides[0];
  const updateSlide = (patch: Record<string, unknown>) => onChange({ ...content, slides: content.slides.map((candidate: any) => candidate.id === slide.id ? { ...candidate, ...patch } : candidate) });
  const addSlide = () => { const id = `slide_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`; onChange({ ...content, activeSlideId: id, slides: [...content.slides, { id, title: `Slide ${content.slides.length + 1}`, speakerNotes: "", background: "#ffffff", elements: [] }] }); };
  return <div className="grid gap-4 md:grid-cols-[150px_1fr]">
    <aside className="space-y-2">{content.slides.map((candidate: any, index: number) => <button key={candidate.id} onClick={() => onChange({ ...content, activeSlideId: candidate.id })} className={`w-full rounded-xl border p-3 text-left text-xs ${candidate.id === slide.id ? "border-white bg-white text-black" : "border-zinc-800 bg-black text-zinc-400"}`}>{index + 1}. {candidate.title}</button>)}<Button variant="outline" size="sm" className="w-full border-zinc-700" onClick={addSlide}><Plus className="mr-1 h-3 w-3" /> Slide</Button></aside>
    <div><div className="aspect-video rounded-2xl border border-zinc-700 p-8 text-black shadow-2xl" style={{ background: slide.background }}><input aria-label="Slide title" value={slide.title} onChange={(event) => updateSlide({ title: event.target.value })} className="w-full bg-transparent text-3xl font-bold outline-none" /></div><Textarea aria-label="Speaker notes" value={slide.speakerNotes} onChange={(event) => updateSlide({ speakerNotes: event.target.value })} placeholder="Speaker notes" className="mt-3 border-zinc-800 bg-black" /></div>
  </div>;
}

function DatabaseEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const editableFields = content.fields.filter((field: any) => !["formula", "rollup"].includes(field.type));
  const updateCell = (recordId: string, fieldId: string, value: string) => onChange({ ...content, records: content.records.map((record: any) => record.id === recordId ? { ...record, values: { ...record.values, [fieldId]: value }, updatedAt: new Date().toISOString() } : record) });
  const addRecord = () => { const now = new Date().toISOString(); onChange({ ...content, records: [...content.records, { id: `record_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, values: {}, createdAt: now, updatedAt: now }] }); };
  const addField = () => { const name = window.prompt("Field name"); if (!name?.trim()) return; const requestedType = window.prompt("Field type: text, rich_text, number, boolean, date, datetime, select, multi_select, person_ref, organization_ref, relation, file_ref, url, email, phone, formula, or rollup", "text")?.trim() ?? "text"; const allowed = ["text", "rich_text", "number", "boolean", "date", "datetime", "select", "multi_select", "person_ref", "organization_ref", "relation", "file_ref", "url", "email", "phone", "formula", "rollup"]; const type = allowed.includes(requestedType) ? requestedType : "text"; const id = `field_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`; onChange({ ...content, fields: [...content.fields, { id, name: name.trim(), type, required: false, ...(["formula", "rollup"].includes(type) ? { expression: "0" } : {}) }] }); };
  return <div><div className="mb-3 flex gap-2"><Button size="sm" variant="outline" className="border-zinc-700" onClick={addField}><Plus className="mr-1 h-3 w-3" /> Field</Button><Button size="sm" variant="outline" className="border-zinc-700" onClick={addRecord}><Plus className="mr-1 h-3 w-3" /> Record</Button></div><div className="overflow-x-auto rounded-2xl border border-zinc-800 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><table className="w-full min-w-[620px] border-collapse text-sm"><thead><tr>{editableFields.map((field: any) => <th key={field.id} className="border border-zinc-800 bg-zinc-950 p-3 text-left text-zinc-400">{field.name}<span className="ml-2 text-[10px] font-normal text-zinc-600">{field.type}</span></th>)}</tr></thead><tbody>{content.records.map((record: any) => <tr key={record.id}>{editableFields.map((field: any) => <td key={field.id} className="border border-zinc-800"><input aria-label={`${field.name} for ${record.id}`} value={String(record.values[field.id] ?? "")} onChange={(event) => updateCell(record.id, field.id, event.target.value)} className="h-10 w-full bg-black px-3 outline-none focus:bg-zinc-900" /></td>)}</tr>)}</tbody></table>{content.records.length === 0 && <p className="p-8 text-center text-sm text-zinc-600">Add the first record to this database.</p>}</div></div>;
}

function FormEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const database = useQuery<InstrumentDetail>({ queryKey: ["/api/foundation/instruments", content.databaseInstrumentId], queryFn: async () => (await apiRequest("GET", `/api/foundation/instruments/${content.databaseInstrumentId}`)).json() });
  const fields = database.data?.revision?.content?.fields ?? [];
  const selected = new Set(content.fields.map((field: any) => field.databaseFieldId));
  const toggle = (field: any) => onChange({ ...content, fields: selected.has(field.id) ? content.fields.filter((candidate: any) => candidate.databaseFieldId !== field.id) : [...content.fields, { id: `form_${field.id}`, databaseFieldId: field.id, label: field.name, required: field.required }] });
  return <div className="grid gap-5 md:grid-cols-2"><section><div className="flex items-center justify-between"><div><h3 className="font-bold">Form access</h3><p className="text-xs text-zinc-500">Public means submit-only. Database reads stay private.</p></div><button role="switch" aria-checked={content.public} onClick={() => onChange({ ...content, public: !content.public })} className={`rounded-full px-3 py-2 text-xs font-bold ${content.public ? "bg-emerald-400 text-black" : "bg-zinc-800 text-zinc-400"}`}>{content.public ? "Public" : "Private"}</button></div><div className="mt-5 space-y-2"><h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Database fields</h4>{fields.map((field: any) => <label key={field.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-800 bg-black p-3"><input type="checkbox" checked={selected.has(field.id)} onChange={() => toggle(field)} /><span className="flex-1 text-sm">{field.name}</span><span className="text-[10px] uppercase text-zinc-600">{field.type}</span></label>)}</div></section><section className="rounded-2xl border border-zinc-800 bg-black p-5"><h3 className="text-lg font-bold">{content.title ?? "Response details"}</h3><div className="mt-5 space-y-4">{content.fields.map((field: any) => <label key={field.id} className="block text-sm font-semibold">{field.label}{field.required && <span className="text-red-400"> *</span>}<Input disabled className="mt-2 border-zinc-800 bg-zinc-950" placeholder={field.label} /></label>)}{content.fields.length === 0 && <p className="text-sm text-zinc-600">Select at least one database field.</p>}<Button disabled className="w-full bg-white text-black">{content.submitLabel}</Button></div></section></div>;
}

function CalendarEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const addEvent = () => { const title = window.prompt("Event title"); if (!title?.trim()) return; const startsAt = new Date(Date.now() + 60 * 60_000); const endsAt = new Date(startsAt.getTime() + 60 * 60_000); onChange({ ...content, events: [...content.events, { id: `event_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, title: title.trim(), status: "confirmed", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), participantRefs: [], recurrenceRule: null, seriesId: null }] }); };
  const update = (id: string, patch: Record<string, unknown>) => onChange({ ...content, events: content.events.map((event: any) => event.id === id ? { ...event, ...patch } : event) });
  return <div><div className="mb-4 flex items-center gap-3"><label className="text-xs font-bold text-zinc-500">TIMEZONE <Input value={content.timezone} onChange={(event) => onChange({ ...content, timezone: event.target.value })} className="mt-1 w-56 border-zinc-800 bg-black" /></label><Button size="sm" className="ml-auto" onClick={addEvent}><Plus className="mr-1 h-4 w-4" /> Event</Button></div><div className="space-y-2">{content.events.map((event: any) => <div key={event.id} className="grid gap-2 rounded-2xl border border-zinc-800 bg-black p-4 md:grid-cols-[1fr_190px_190px_110px]"><Input value={event.title} onChange={(input) => update(event.id, { title: input.target.value })} className="border-zinc-800 bg-zinc-950" /><Input type="datetime-local" value={event.startsAt.slice(0, 16)} onChange={(input) => update(event.id, { startsAt: new Date(input.target.value).toISOString() })} className="border-zinc-800 bg-zinc-950" /><Input type="datetime-local" value={event.endsAt.slice(0, 16)} onChange={(input) => update(event.id, { endsAt: new Date(input.target.value).toISOString() })} className="border-zinc-800 bg-zinc-950" /><select value={event.status} onChange={(input) => update(event.id, { status: input.target.value })} className="rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs"><option value="tentative">Tentative</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="canceled">Canceled</option></select></div>)}{content.events.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">No events yet.</p>}</div></div>;
}

function FinanceEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const addAccount = () => { const name = window.prompt("Account name"); if (!name?.trim()) return; const requested = window.prompt("Account type: asset, liability, equity, revenue, or expense", "expense") ?? "expense"; const type = ["asset", "liability", "equity", "revenue", "expense"].includes(requested) ? requested : "expense"; onChange({ ...content, accounts: [...content.accounts, { id: `account_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, name: name.trim(), type, currency: "USD" }] }); };
  const addEntry = () => { if (content.accounts.length < 2) return window.alert("Create at least two accounts first."); const amount = Number(window.prompt("Amount in dollars", "100")); if (!Number.isFinite(amount) || amount <= 0) return; const memo = window.prompt("Entry memo", "Creator revenue") ?? "Journal entry"; const minorUnits = Math.round(amount * 100); onChange({ ...content, journalEntries: [...content.journalEntries, { id: `entry_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, status: "draft", occurredAt: new Date().toISOString(), memo, reversalOf: null, lines: [{ accountId: content.accounts[0].id, debit: { currency: "USD", minorUnits }, credit: { currency: "USD", minorUnits: 0 } }, { accountId: content.accounts[1].id, debit: { currency: "USD", minorUnits: 0 }, credit: { currency: "USD", minorUnits } }] }] }); };
  return <div className="grid gap-5 md:grid-cols-2"><section><div className="flex items-center justify-between"><h3 className="font-bold">Chart of accounts</h3><Button size="sm" variant="outline" className="border-zinc-700" onClick={addAccount}><Plus className="mr-1 h-3 w-3" /> Account</Button></div><div className="mt-3 space-y-2">{content.accounts.map((account: any) => <div key={account.id} className="rounded-xl border border-zinc-800 bg-black p-3"><span className="font-semibold">{account.name}</span><span className="ml-2 text-[10px] uppercase text-zinc-600">{account.type} · {account.currency}</span></div>)}</div></section><section><div className="flex items-center justify-between"><div><h3 className="font-bold">Journal</h3><p className="text-xs text-zinc-500">Every entry is double-entry balanced.</p></div><Button size="sm" variant="outline" className="border-zinc-700" onClick={addEntry}><Plus className="mr-1 h-3 w-3" /> Entry</Button></div><div className="mt-3 space-y-2">{content.journalEntries.map((entry: any) => <div key={entry.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex justify-between"><span className="font-semibold">{entry.memo}</span><span className="text-[10px] uppercase text-amber-400">{entry.status}</span></div><p className="mt-1 text-xs text-zinc-600">{entry.lines.length} balanced lines · {(entry.lines.reduce((sum: number, line: any) => sum + line.debit.minorUnits, 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</p></div>)}</div></section></div>;
}

function JsonInstrumentEditor({ content, onChange }: { content: any; onChange: (next: any) => void }) {
  const [text, setText] = useState(() => JSON.stringify(content, null, 2));
  useEffect(() => setText(JSON.stringify(content, null, 2)), [content]);
  return <div><Textarea aria-label="Structured instrument content" value={text} onChange={(event) => { setText(event.target.value); try { onChange(JSON.parse(event.target.value)); } catch { /* preserve draft text until valid */ } }} className="min-h-[420px] border-zinc-800 bg-black font-mono text-xs leading-6" /><p className="mt-2 text-xs text-zinc-600">Structured editor preview. Invalid JSON is never saved.</p></div>;
}

export default function FoundationStudioPage() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialKind = pathKinds[location] ?? "document";
  const [kind, setKind] = useState<FoundationInstrumentKind>(initialKind);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<any>(null);
  const [baseRevision, setBaseRevision] = useState(1);
  const listKey = ["/api/foundation/instruments", kind] as const;
  const list = useQuery<InstrumentSummary[]>({ queryKey: listKey, queryFn: async () => (await apiRequest("GET", `/api/foundation/instruments?kind=${kind}`)).json() });
  const detail = useQuery<InstrumentDetail>({ queryKey: ["/api/foundation/instruments", selectedId], enabled: Boolean(selectedId), queryFn: async () => (await apiRequest("GET", `/api/foundation/instruments/${selectedId}`)).json() });
  useEffect(() => { setKind(initialKind); setSelectedId(null); }, [initialKind]);
  useEffect(() => { if (!selectedId && list.data?.[0]) setSelectedId(list.data[0].id); }, [list.data, selectedId]);
  useEffect(() => { if (!detail.data?.revision) return; setTitle(detail.data.title); setContent(detail.data.revision.content); setBaseRevision(detail.data.currentRevision); }, [detail.data]);

  const create = useMutation({ mutationFn: async () => {
    if (kind === "form") {
      const databases = await (await apiRequest("GET", "/api/foundation/instruments?kind=database")).json() as InstrumentSummary[];
      if (!databases[0]) throw new Error("Create a database before creating a form.");
      return (await apiRequest("POST", "/api/foundation/instruments", { kind, title: "Untitled form", content: { version: 1, databaseInstrumentId: databases[0].id, public: false, submitLabel: "Submit", successMessage: "Your response was received.", fields: [{ id: "field_name", databaseFieldId: "name", label: "Name", required: true }] } })).json();
    }
    return (await apiRequest("POST", "/api/foundation/instruments", { kind, title: `Untitled ${tools[kind].singular}`, content: createEmptyFoundationContent(kind) })).json();
  }, onSuccess: (created: InstrumentSummary) => { queryClient.invalidateQueries({ queryKey: listKey }); setSelectedId(created.id); toast({ title: `${tools[kind].singular} created` }); }, onError: (error: Error) => toast({ title: "Could not create instrument", description: error.message, variant: "destructive" }) });
  const save = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/foundation/instruments/${selectedId}/revisions`, { title, content, changeSummary: "Saved from CreativesOS workspace", baseRevision })).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: listKey }); queryClient.invalidateQueries({ queryKey: ["/api/foundation/instruments", selectedId] }); toast({ title: "Revision saved", description: "A recoverable revision was added to history." }); }, onError: (error: Error) => toast({ title: "Revision was not saved", description: error.message, variant: "destructive" }) });
  const command = useMutation({ mutationFn: async (value: FoundationCommand) => (await apiRequest("POST", `/api/foundation/instruments/${selectedId}/commands`, { command: value, note: "Lifecycle command from workspace" })).json(), onSuccess: () => { queryClient.invalidateQueries({ queryKey: listKey }); queryClient.invalidateQueries({ queryKey: ["/api/foundation/instruments", selectedId] }); }, onError: (error: Error) => toast({ title: "Lifecycle command failed", description: error.message, variant: "destructive" }) });

  const activeTool = tools[kind];
  const Icon = activeTool.icon;
  const editor = useMemo(() => {
    if (!content) return null;
    if (kind === "document") return <Textarea aria-label="Document body" value={content.body} onChange={(event) => setContent({ ...content, body: event.target.value })} placeholder="Start writing…" className="min-h-[520px] border-zinc-800 bg-black text-base leading-8" />;
    if (kind === "spreadsheet") return <SpreadsheetEditor content={content} onChange={setContent} />;
    if (kind === "presentation") return <PresentationEditor content={content} onChange={setContent} />;
    if (kind === "database") return <DatabaseEditor content={content} onChange={setContent} />;
    if (kind === "form") return <FormEditor content={content} onChange={setContent} />;
    if (kind === "calendar") return <CalendarEditor content={content} onChange={setContent} />;
    if (kind === "finance_ledger") return <FinanceEditor content={content} onChange={setContent} />;
    return <JsonInstrumentEditor content={content} onChange={setContent} />;
  }, [content, kind]);

  return <main className="min-h-screen bg-black pb-28 text-white">
    <header className="sticky top-0 z-30 border-b border-zinc-900 bg-black/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3"><Button variant="ghost" size="icon" onClick={() => setLocation("/profile")} aria-label="Back to profile"><ChevronLeft className="h-5 w-5" /></Button><div className="min-w-0 flex-1"><h1 className="truncate font-bold">Creative workspace</h1><p className="text-xs text-zinc-500">Standalone tools with revision history and governed publishing</p></div><Button size="sm" className="bg-white text-black hover:bg-zinc-200" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="mr-1 h-4 w-4" /> New {activeTool.singular}</Button></div><nav aria-label="Workspace instruments" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{Object.entries(tools).map(([value, tool]) => { const ToolIcon = tool.icon; return <button key={value} onClick={() => setLocation(Object.entries(pathKinds).find(([, mapped]) => mapped === value)?.[0] ?? "/documents")} className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${kind === value ? "bg-white text-black" : "bg-zinc-950 text-zinc-400 hover:bg-zinc-900"}`}><ToolIcon className="h-4 w-4" /> {tool.label}</button>; })}</nav></header>
    <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[250px_1fr]">
      <aside className="space-y-2"><div className="mb-3 flex items-center gap-2 px-1"><Icon className="h-4 w-4" /><h2 className="text-sm font-bold">{activeTool.label}</h2></div>{list.isLoading && <p className="p-3 text-sm text-zinc-600">Loading…</p>}{list.data?.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedId === item.id ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-950"}`}><span className="block truncate text-sm font-bold">{item.title}</span><span className={`mt-1 block text-[10px] uppercase tracking-widest ${selectedId === item.id ? "text-black/50" : "text-zinc-600"}`}>{item.status} · r{item.currentRevision}</span></button>)}{list.data?.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-600">No {activeTool.label.toLowerCase()} yet.</div>}</aside>
      <section className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-950 p-4 md:p-6">{detail.data && content ? <><div className="mb-5 flex flex-wrap items-center gap-2"><Input aria-label="Instrument title" value={title} onChange={(event) => setTitle(event.target.value)} className="mr-auto h-auto min-w-[220px] flex-1 border-0 bg-transparent px-0 text-xl font-bold focus-visible:ring-0" /><span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{detail.data.status} · revision {detail.data.currentRevision}</span><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !title.trim()} className="bg-white text-black hover:bg-zinc-200"><Save className="mr-1 h-4 w-4" /> Save revision</Button></div>{editor}<div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-800 pt-4">{detail.data.status === "draft" && <Button size="sm" variant="outline" className="border-zinc-700" onClick={() => command.mutate("request_review")}><Send className="mr-1 h-4 w-4" /> Request review</Button>}{detail.data.status === "in_review" && <><Button size="sm" variant="outline" className="border-zinc-700" onClick={() => command.mutate("request_changes")}>Request changes</Button><Button size="sm" onClick={() => command.mutate("approve")}><FileCheck2 className="mr-1 h-4 w-4" /> Approve</Button></>}{detail.data.status === "approved" && <Button size="sm" onClick={() => command.mutate("publish")}>Publish</Button>}{detail.data.status !== "archived" ? <Button size="sm" variant="ghost" className="text-zinc-500" onClick={() => command.mutate("archive")}><Archive className="mr-1 h-4 w-4" /> Archive</Button> : <Button size="sm" variant="outline" onClick={() => command.mutate("restore")}>Restore</Button>}</div></> : <div className="flex min-h-[420px] flex-col items-center justify-center text-center"><Icon className="h-10 w-10 text-zinc-700" /><p className="mt-4 font-bold">Choose or create a {activeTool.singular}</p><p className="mt-1 max-w-sm text-sm text-zinc-600">Every save becomes an immutable revision. Publishing requires the explicit review lifecycle.</p></div>}</section>
    </div>
  </main>;
}
